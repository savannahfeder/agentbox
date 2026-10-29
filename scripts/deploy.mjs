#!/usr/bin/env node
// PUT OUT A RELEASE, ALL OF IT, WITH ONE COMMAND.
//
//   cd ~/Desktop/dev/agentbox-team && npm run deploy
//   npm run deploy -- --check     checks everything and changes nothing
//
// It brings this folder to the tip of main, picks a version nobody has used,
// signs you in to whatever has signed out, and then puts out every place
// people get Agentbox from, in this order:
//   1. the Mac app: built, signed and notarised (about 15 minutes)
//   2. npm, for `npx agentbox-app`
//   3. the download on agentbox.ac, and the feed installed copies update from
//   4. the cloud machine's image, then the cloud server
// and ends by reading each one back and saying which has the new version.
//
// The Mac build goes first because it is the slow step and the one most likely
// to fail, and until it is done nothing anybody can see has changed: a failure
// there is fixed by running this again.
//
// The Apple password never passes through here. The first run asks Apple's own
// tool to save it in the Keychain (`notarytool store-credentials`) and every
// build after uses that saved entry by name.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextVersion, serverConfig, whatIsLive } from './lib/deploy-rules.mjs';
import { RELEASE_REPO } from './lib/live-download.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const startedAt = Date.now();
const NOTARY_PROFILE = 'agentbox-notary';
const PACKAGE = 'agentbox-app';
const SERVER = 'agentbox-gateway';
const REGION = 'us-east-1';

const pkgPath = path.join(repo, 'package.json');
let packageWritten = false;

function restorePackageJson() {
  if (!packageWritten) return;
  spawnSync('git', ['checkout', '--', 'package.json'], { cwd: repo });
  packageWritten = false;
}

function stop(...lines) {
  restorePackageJson();
  console.error(`\nNot finished.\n\n${lines.join('\n')}\n`);
  process.exit(1);
}

function say(line) { console.log(`\n→ ${line}`); }

function quiet(cmd, args, timeout = 30_000) {
  const r = spawnSync(cmd, args, { cwd: repo, encoding: 'utf8', timeout, env: { ...process.env, AWS_PAGER: '' } });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

function live(cmd, args, env = {}) {
  return spawnSync(cmd, args, { cwd: repo, stdio: 'inherit', env: { ...process.env, ...env } }).status === 0;
}

// ---------------------------------------------------------------------------
// 1. THIS FOLDER, AT THE TIP OF MAIN.
say('bringing this folder to the tip of main');
const dirty = quiet('git', ['status', '--porcelain', '--untracked-files=no']).out;
if (dirty) {
  stop('These files have changes that are not on main:', dirty, '', 'Deploy from a folder with none, normally ~/Desktop/dev/agentbox-team.');
}
if (!quiet('git', ['fetch', 'origin', '--quiet'], 60_000).ok) stop('Could not reach GitHub to read main. Check the internet connection.');
if (!quiet('git', ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main']).ok) {
  stop('This folder has commits that are not on main, so it would put out something nobody shipped.',
    'Deploy from ~/Desktop/dev/agentbox-team, which only ever follows main.');
}
const behind = Number(quiet('git', ['rev-list', '--count', 'HEAD..refs/remotes/origin/main']).out) || 0;
if (!checkOnly && behind > 0 && !quiet('git', ['merge', '--ff-only', '--quiet', 'refs/remotes/origin/main']).ok) {
  stop('Could not bring this folder up to main. Run: git merge --ff-only refs/remotes/origin/main');
}
const commit = checkOnly ? quiet('git', ['rev-parse', 'refs/remotes/origin/main']).out : quiet('git', ['rev-parse', 'HEAD']).out;
console.log(`  main is at ${commit.slice(0, 8)}${checkOnly && behind ? ` (this folder is ${behind} behind; a real run catches it up)` : ''}`);

// ---------------------------------------------------------------------------
// 2. A VERSION NOBODY HAS USED. Both lists have to be readable: a guess here
// is how the same number went out twice.
say('picking the version');
const tags = quiet('git', ['ls-remote', '--tags', `https://github.com/${RELEASE_REPO}.git`], 30_000);
// --prefer-online on every `npm view`: npm's cache of the package can be
// minutes old, and on 0.1.20 it called a finished release unfinished.
const onNpm = quiet('npm', ['view', PACKAGE, 'versions', '--json', '--prefer-online', '--fetch-timeout=20000'], 40_000);
if (!tags.ok || !onNpm.ok) stop('Could not read which versions are already out, from GitHub and npm. Check the internet connection.');
const taken = [
  ...tags.out.split('\n').flatMap((l) => l.match(/refs\/tags\/v([\d.]+)$/)?.[1] ?? []),
  ...[JSON.parse(onNpm.out || '[]')].flat(),
];
const mainVersion = JSON.parse(execFileSync('git', ['show', 'refs/remotes/origin/main:package.json'], { cwd: repo, encoding: 'utf8' })).version;
const version = nextVersion(mainVersion, taken);
console.log(`  ${version}${version === mainVersion ? '' : ` (main says ${mainVersion}, which is already out)`}`);

// ---------------------------------------------------------------------------
// 3. WHAT THIS MAC NEEDS. Everything that cannot be fixed from here is listed
// at once, so one run says all of it.
say('checking this Mac has what a release needs');
const missing = [];
const identity = quiet('security', ['find-identity', '-v', '-p', 'codesigning']).out.match(/"Developer ID Application: .+ \(([A-Z0-9]{10})\)"/);
if (!identity) missing.push('No Developer ID certificate in the Keychain, so nothing can be signed (Xcode → Settings → Accounts → Manage Certificates).');
const team = identity?.[1];

// The environment first, as scripts/release.mjs reads it for the Mac build.
let posthog = process.env.AGENTBOX_POSTHOG_KEY?.trim() || null;
try { posthog ||= JSON.parse(fs.readFileSync(path.join(repo, 'zero.config.json'), 'utf8')).posthogKey?.trim() || null; } catch {}
if (!posthog) missing.push('No "posthogKey" in zero.config.json in this folder, so the app would count nobody.');

const home = path.join(os.homedir(), '.agentbox');
if (![path.join(repo, 'cloud', 'team.config.json'), path.join(home, 'team.config.json')].some((f) => fs.existsSync(f))) {
  missing.push('No team.config.json in cloud/ or ~/.agentbox, which the build and the cloud server both need.');
}
const configs = {};
for (const name of ['cloud.json', 'cloud.own-aws.json']) {
  try { configs[path.join(home, name)] = JSON.parse(fs.readFileSync(path.join(home, name), 'utf8')); } catch {}
}
const serverFile = serverConfig(configs);
if (!serverFile) missing.push('No file in ~/.agentbox names the cloud server\'s AWS bucket (cloud.json or cloud.own-aws.json). Copy it from the Mac that set the cloud up.');
if (!fs.existsSync(path.join(repo, 'build', 'icon.icns'))) missing.push('build/icon.icns is missing from this folder.');
if (missing.length) stop(...missing.flatMap((m) => [`- ${m}`]));
console.log('  certificate, analytics key, team and cloud settings: all here');

// The sign-ins, each fixed on the spot when it has run out.
const signIns = [
  {
    name: 'GitHub, to upload the download',
    ok: () => quiet('gh', ['api', `repos/${RELEASE_REPO}`, '--jq', '.permissions.push']).out === 'true',
    fix: () => live('gh', ['auth', 'login', '--web']),
  },
  {
    name: 'AWS, to update the cloud server',
    ok: () => quiet('aws', ['sts', 'get-caller-identity', '--cli-connect-timeout', '10', '--cli-read-timeout', '20']).ok,
    fix: () => live('aws', ['login', '--region', REGION]),
  },
  {
    name: 'Apple, to notarise the app',
    ok: () => quiet('xcrun', ['notarytool', 'history', '--keychain-profile', NOTARY_PROFILE], 60_000).ok,
    fix: () => {
      console.log('\n  Apple\'s own tool asks for your Apple ID and an app-specific password, once,');
      console.log('  and keeps them in your Keychain. Make the password at appleid.apple.com,');
      console.log('  under Sign-In and Security → App-Specific Passwords.\n');
      return live('xcrun', ['notarytool', 'store-credentials', NOTARY_PROFILE, '--team-id', team]);
    },
  },
];
const npmSignIn = {
  name: 'npm, to publish the package',
  ok: () => quiet('npm', ['whoami', '--fetch-timeout=20000'], 30_000).ok,
  fix: () => live('npm', ['login']),
};
const signedOut = [];
function signIn(s) {
  if (s.ok()) { console.log(`  ✓ ${s.name}`); return; }
  if (checkOnly) { console.log(`  ✗ ${s.name}: signed out; a real run signs you in here`); signedOut.push(s.name); return; }
  say(`signing in to ${s.name}`);
  if (!s.fix() || !s.ok()) stop(`Still not signed in to ${s.name}. Run npm run deploy again to retry.`);
  console.log(`  ✓ ${s.name}`);
}
signIns.forEach(signIn);

if (checkOnly) {
  signIn(npmSignIn);
  console.log(`\nA real run would put out ${version} from ${commit.slice(0, 8)}${signedOut.length ? `, after signing in to ${signedOut.length === 1 ? 'one thing' : `${signedOut.length} things`}` : ''}.`);
  console.log('Nothing was changed. Run npm run deploy to do it.');
  process.exit(0);
}

// The version and the counting key go into package.json for this run only,
// because every step below reads the version from there and `npm publish` packs
// the file as it stands: the key is what lets `npx agentbox-app` count, as
// electron-builder's extraMetadata does for the Mac app. It is put back at the
// end, so main's file never carries either.
fs.writeFileSync(pkgPath, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(pkgPath, 'utf8')), version, bakedPosthogKey: posthog }, null, 2)}\n`);
packageWritten = true;
process.on('exit', restorePackageJson);
process.on('SIGINT', () => { restorePackageJson(); process.exit(130); });

// ---------------------------------------------------------------------------
// 4. THE MAC APP. Nothing public changes until it is done.
say(`building, signing and notarising Agentbox ${version} (about 15 minutes; nothing public changes yet)`);
const appleEnv = { ...process.env, APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE, APPLE_TEAM_ID: team, AGENTBOX_RELEASE_COMMIT: commit, AGENTBOX_DEPLOY: '1' };
// electron-builder prefers an Apple ID over a Keychain profile when both are set.
delete appleEnv.APPLE_ID;
delete appleEnv.APPLE_APP_SPECIFIC_PASSWORD;
if (spawnSync('node', ['scripts/release.mjs'], { cwd: repo, stdio: 'inherit', env: appleEnv }).status !== 0) {
  stop('The Mac build stopped, so nothing was put out. The reason is just above.', 'Fix that and run npm run deploy again.');
}

// ---------------------------------------------------------------------------
// 5. NPM. The checks before-publish.mjs makes were made at step 1, against
// the commit this run pinned; main has moved on since, which is not a reason
// to publish something else.
// npm sessions expire, and publishing can require its own approval after login.
signIn(npmSignIn);
say(`publishing ${PACKAGE}@${version} to npm (it may ask for a one-time code)`);
if (!live('npm', ['publish'], { AGENTBOX_PUBLISH_ANYWAY: '1' })) {
  stop('npm did not publish, so nothing was put out yet: the Mac app is built but not uploaded.', 'Run npm run deploy again; it builds the Mac app again first.');
}

// ---------------------------------------------------------------------------
// 6. THE DOWNLOAD AND THE UPDATE FEED. publish-download.mjs checks the file
// the website hands out against this build before it says it is done.
say('putting the Mac app on agentbox.ac and in the update feed');
if (!live('node', ['scripts/publish-download.mjs', `release/Agentbox-${version}-universal.dmg`, '--publish'],
  { AGENTBOX_RELEASE_COMMIT: commit })) {
  stop(`npm has ${version} and the website does not yet. The reason is just above.`,
    `To finish, run: node scripts/publish-download.mjs release/Agentbox-${version}-universal.dmg --publish`);
}
restorePackageJson();

// ---------------------------------------------------------------------------
// 7. THE CLOUD MACHINE'S IMAGE, which every cloud run starts from. Built only
// when cloud/sandbox/ or this Mac's Claude Code or Codex version changed.
say('updating the cloud machine (a few minutes when it changed)');
const imageOk = live('node', ['scripts/cloud-setup.mjs'], { AGENTBOX_CLOUD_CONFIG: serverFile });

// The cloud server, from the same commit.
say('updating the cloud server');
const serverOk = live('node', ['scripts/cloud-gateway-setup.mjs'], { AGENTBOX_CLOUD_CONFIG: serverFile });

// ---------------------------------------------------------------------------
// 8. EACH PLACE, READ BACK.
say('reading back what is live');
const npmNow = quiet('npm', ['view', PACKAGE, 'version', '--prefer-online', '--fetch-timeout=20000'], 30_000);
const tagNow = quiet('gh', ['release', 'view', '--repo', RELEASE_REPO, '--json', 'tagName', '--jq', '.tagName']);
const feedNow = quiet('curl', ['-sL', '-m', '20', `https://github.com/${RELEASE_REPO}/releases/latest/download/latest-mac.yml`]);
const serverNow = quiet('aws', ['lambda', 'get-function-configuration', '--region', REGION, '--function-name', SERVER,
  '--query', 'LastModified', '--output', 'text', '--cli-connect-timeout', '10', '--cli-read-timeout', '20']);
const lines = whatIsLive({
  version,
  startedAt,
  npm: npmNow.ok ? npmNow.out : null,
  download: tagNow.ok ? tagNow.out : null,
  feed: feedNow.ok ? (feedNow.out.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? null) : null,
  server: serverOk && serverNow.ok ? serverNow.out : null,
});
console.log('');
for (const l of lines) console.log(`  ${l.ok ? '✓' : '✗'} ${l.part.padEnd(17)} ${l.ok ? version : `still ${l.saw}`}`);
console.log(`  ${imageOk ? '✓' : '✗'} ${'cloud machine'.padEnd(17)} ${imageOk ? 'up to date' : 'not rebuilt'}`);
if (lines.every((l) => l.ok) && imageOk) {
  console.log(`\nAgentbox ${version} is out everywhere. Restart Agentbox to run it yourself.`);
  // MAIN'S OWN NUMBER DOES NOT FOLLOW A RELEASE, and nothing said so (F-147).
  // The version is written into package.json for this run and taken back out
  // at step 6, because this folder may not commit (scripts/hooks/pre-commit).
  // Main went two releases behind in silence, so a clone built from the README
  // called itself a version that was out before it.
  if (version !== mainVersion) {
    console.log(`\nmain still says ${mainVersion}, so anyone who clones it builds a copy calling itself that.`);
    console.log(`Ship a branch setting "version": "${version}" in package.json and package-lock.json to catch it up.`);
  }
  console.log('');
} else {
  stop('Not every place has the new version yet; the ✗ lines above say which.',
    imageOk ? '' : `For the cloud machine, run: AGENTBOX_CLOUD_CONFIG=${serverFile} node scripts/cloud-setup.mjs`,
    lines.find((l) => l.part === 'cloud server' && !l.ok) ? `For the cloud server, run: AGENTBOX_CLOUD_CONFIG=${serverFile} node scripts/cloud-gateway-setup.mjs` : '');
}
