// Build the Mac app.
//
//   npm run pack       an .app and a .dmg, signed with whatever identity is on
//                      this Mac if there is one, never notarised. For looking
//                      at the thing. Gatekeeper will still warn a stranger.
//   npm run release    the real one: signed with the Developer ID certificate,
//                      hardened runtime, sent to Apple to be notarised, and the
//                      ticket stapled onto the .dmg so it opens with no warning
//                      on a machine that has never seen it.
//
// PACKAGE.JSON'S `build` BLOCK TAKES NO COMMENTS, SO THE ONE IT HAD LIVES HERE.
// A `"//"` key was added inside `build.mac` on 2026-08-27 to explain the usage
// strings, and electron-builder 26.15.3 validates that object against a schema
// that allows no unknown keys. Nothing else about the release had changed; it
// was the comment. Do not put one back.
//
// What it said is worth keeping, so here it is. `mac.extendInfo` carries the
// sentences macOS shows in ITS OWN permission panels. Without them the panel is
// the system's bare wording with no reason on it, which is what a tester walked
// into. They do NOT ask for anything by existing: macOS only shows a panel when
// something really reads that folder, and shared/project-folder-check.mjs is
// what stops that happening by accident. What they change is that a panel which
// does appear says who is asking and what for.
//
// NSAppleEventsUsageDescription is the newest of them: an agent that asks
// another app to do something sends an Apple event, so macOS asks once and
// shows that sentence when it does.
//
// THE THREE ENV VARS ARE APPLE'S NAMES, NOT OURS. electron-builder hands them
// straight to @electron/notarize, which is why the release line looks like
// every other Electron project's:
//
//   APPLE_ID="..." APPLE_TEAM_ID="..." APPLE_APP_SPECIFIC_PASSWORD="..." npm run release
//
// The password is the app-specific one from appleid.apple.com, never the Apple
// account password, and it is never written to a file in this repo.
//
// Nothing here publishes anything. There is no GH_TOKEN, and `--publish never`
// is passed explicitly: this writes files into release/ and stops. Putting them
// somewhere the world can download them is a separate, deliberate act.
//
// THAT FLAG BECAME LOAD-BEARING ON 2026-08-28. Adding `build.publish` to
// package.json, which the app needs in order to know where to look for its own
// updates, ALSO arms electron-builder's own uploader. Its default policy is
// `onTagOrDraft`, so a build made while a draft release existed would have
// uploaded itself, quietly, from a laptop. `never` is the only thing standing
// between that and this file's promise above.
//
// It costs nothing else: the branch that writes `latest-mac.yml` is guarded by
// `isWriteUpdateInfo`, not by the publish policy, so the update feed is still
// written to release/ and only the upload is skipped. Read out of
// node_modules/app-builder-lib/out/publish/PublishManager.js on 2026-08-28, and
// confirmed by running the build: see the three files it lists at the end.
//
// WHAT A RELEASE PRODUCES NOW, and all three go out together or updates break:
//   Agentbox-<v>-universal.dmg      what a stranger downloads from the website
//   Agentbox-<v>-universal-mac.zip  what an installed Agentbox updates itself with
//   latest-mac.yml                how it finds out there is one

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { envName, readEnv } from '../shared/product-name.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const noSign = process.argv.includes('--no-sign');

function die(lines) {
  console.error(`\n${lines.join('\n')}\n`);
  process.exit(1);
}

// The one Developer ID certificate on this machine, and the team it belongs to.
// Read rather than assumed, because a team id typed from memory produces a
// codesign failure whose message never mentions the team id.
function signingIdentity() {
  let out = '';
  try {
    out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
  } catch {
    return null;
  }
  const m = out.match(/"Developer ID Application: (.+) \(([A-Z0-9]{10})\)"/);
  return m ? { name: m[0].slice(1, -1), who: m[1], team: m[2] } : null;
}

const identity = signingIdentity();

// THE ANALYTICS KEY THE BUILD CARRIES, and the reason this is here rather than
// in a source file. Until 2026-08-21 the key came only from the operator's own
// zero.config.json, which is gitignored and is in no download, so every copy of
// Agentbox but hers sent nothing and a new user could not be counted at all.
//
// It is a PostHog PROJECT key: write-only, it can add an event and cannot read
// one back, which is why it is allowed to sit inside a file a stranger can
// unzip. It is baked into the packaged package.json rather than committed, so
// the repo stays clean and a copy run from source still has nowhere to send.
//
// THE VARIABLE IS NAMED FROM THE ONE PLACE THE APP IS NAMED, and it was not.
// This read `ASTRAL_POSTHOG_KEY` by hand while main/analytics.mjs had moved to
// `readEnv`, so the name you have to type to cut a release was two renames out
// of date and matched nothing the app itself reads. `readEnv` answers to the
// current name and to every older one, so an old note or an old shell profile
// still works and nobody has to know which rename they are on.
function posthogKey() {
  const fromEnv = readEnv('POSTHOG_KEY');
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(repo, 'zero.config.json'), 'utf8'));
    const key = cfg?.posthogKey;
    if (typeof key === 'string' && key.trim()) return key.trim();
  } catch {}
  return null;
}

const analyticsKey = posthogKey();


if (!noSign) {
  // A SIGNED RELEASE IS THE ONE STRANGERS DOWNLOAD, so a missing key stops it
  // here instead of shipping another blind build. `npm run pack` still runs
  // without one on purpose: nobody installs an unsigned build.
  if (!analyticsKey) {
    die([
      'No PostHog key, so this build would send nothing and a new user would be invisible.',
      '',
      'Either put "posthogKey": "phc_…" in zero.config.json beside this repo,',
      'or pass it in for one build:',
      '',
      `  ${envName('POSTHOG_KEY')}="phc_…" APPLE_ID="…" APPLE_TEAM_ID="…" APPLE_APP_SPECIFIC_PASSWORD="…" npm run release`,
      '',
      'A worktree under /tmp has no zero.config.json, which is the usual reason this fires.',
      'To build without analytics anyway, run: npm run pack',
    ]);
  }

  const missing = ['APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_SPECIFIC_PASSWORD'].filter((k) => !process.env[k]);
  if (missing.length) {
    die([
      `Missing ${missing.join(', ')}.`,
      '',
      'The release line is:',
      '',
      `  APPLE_ID="you@example.com" APPLE_TEAM_ID="${identity?.team ?? 'YOURTEAMID'}" APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop" npm run release`,
      '',
      'The password is an app-specific password made at appleid.apple.com,',
      'under Sign-In and Security. It is not your Apple account password.',
      '',
      'To build without signing or notarising, run: npm run pack',
    ]);
  }
  if (!identity) {
    die([
      'No Developer ID Application certificate in this Mac’s keychain, so nothing can be signed.',
      'Xcode → Settings → Accounts → Manage Certificates → + → Developer ID Application.',
      '',
      'To build without signing, run: npm run pack',
    ]);
  }
  if (process.env.APPLE_TEAM_ID !== identity.team) {
    die([
      `APPLE_TEAM_ID is "${process.env.APPLE_TEAM_ID}" and the certificate on this Mac belongs to "${identity.team}".`,
      `The certificate is ${identity.name}.`,
      'Apple would reject the notarisation with a message that never says this, so it is checked here instead.',
    ]);
  }
  if (process.env.GH_TOKEN) {
    console.log('note: GH_TOKEN is set and is not used. This build publishes nothing; it writes release/*.dmg and stops.');
  }
}

console.log(`\n→ building the renderer`);
// ASTRAL_SHIPPING used to switch the theme lab off for anything anyone
// installs. The lab was deleted on 2026-08-21, so the variable no longer
// gates anything; it is still set because it costs nothing and the next
// build-only switch will want it.
const built = spawnSync('npm', ['run', 'build'], {
  cwd: repo, stdio: 'inherit', env: { ...process.env, ASTRAL_SHIPPING: '1' },
});
if (built.status !== 0) process.exit(built.status ?? 1);

if (!fs.existsSync(path.join(repo, 'build', 'icon.icns'))) {
  die(['build/icon.icns is missing. Run: npm run icon']);
}

// `--publish never` is not optional. See the note at the head of this file:
// package.json now carries a publish config so the APP can find its updates,
// and that same config is what electron-builder would upload through.
const args = ['--mac', '--publish', 'never'];
// Baked into the packaged package.json, which main/analytics.mjs reads. Only
// the key travels; nothing else about this machine does.
if (analyticsKey) {
  args.push(`-c.extraMetadata.bakedPosthogKey=${analyticsKey}`);
  console.log(`→ baking the analytics key into the build (${analyticsKey.slice(0, 8)}…, ${analyticsKey.length} chars)`);
} else {
  console.log('→ no analytics key, so this build will send nothing');
}
if (noSign) {
  console.log('→ packaging, unsigned');
} else {
  console.log(`→ packaging, signing as ${identity.name}, then notarising with Apple (this takes a few minutes)`);
  args.push('-c.mac.notarize=true');
}

const env = { ...process.env };
if (noSign) {
  // Tell electron-builder not to go looking for a certificate at all. Without
  // this it finds the Developer ID on this Mac, signs with the hardened
  // runtime, and produces a build that behaves differently from the unsigned
  // one somebody asked for.
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
}

const buildStarted = Date.now();
const out = spawnSync('npx', ['electron-builder', ...args], { cwd: repo, stdio: 'inherit', env });
if (out.status !== 0) process.exit(out.status ?? 1);

const dir = path.join(repo, 'release');
const dmgs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.dmg')) : [];
console.log(`\n${dmgs.length ? dmgs.map((f) => `  release/${f}`).join('\n') : '  no .dmg was written'}`);

// THE .dmg IS A SECOND THING TO NOTARISE, AND electron-builder DOES NOT DO IT.
// It sends the .app to Apple and builds the disk image afterwards, so at the
// moment of notarisation there is no disk image to staple a ticket onto. The
// .app comes out perfect and the file a stranger actually downloads fails
// Apple's own check with two fatal errors. Measured on 0.1.0. So the disk
// image is signed, sent to Apple and stapled here, with the same three env
// vars electron-builder already used for the .app.
function run(label, file, argv) {
  const r = spawnSync(file, argv, { cwd: repo, stdio: 'inherit' });
  if (r.status !== 0) {
    die([
      `${label} failed for the disk image.`,
      'The .app inside it is fine; the disk image is not, and Gatekeeper will refuse it.',
      `To pick up from here: ${file} ${argv.join(' ')}`,
    ]);
  }
}

const fresh = dmgs.filter((f) => fs.statSync(path.join(dir, f)).mtimeMs >= buildStarted);
if (!noSign) {
  for (const f of fresh) {
    const dmg = `release/${f}`;
    console.log(`\n→ signing ${dmg}`);
    run('codesign', 'codesign', ['--sign', identity.name, '--timestamp', dmg]);

    console.log(`→ sending ${dmg} to Apple (a few minutes)`);
    run('notarytool', 'xcrun', [
      'notarytool', 'submit', dmg,
      '--apple-id', process.env.APPLE_ID,
      '--team-id', process.env.APPLE_TEAM_ID,
      '--password', process.env.APPLE_APP_SPECIFIC_PASSWORD,
      '--wait',
    ]);

    console.log(`→ stapling the ticket onto ${dmg}`);
    run('stapler', 'xcrun', ['stapler', 'staple', dmg]);

    // The same check a stranger's Mac makes. It has to pass here or the build
    // is not finished, whatever the notarisation said about the .app.
    console.log(`→ checking ${dmg} the way a stranger’s Mac will`);
    run('spctl', 'spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '-v', dmg]);
    console.log(`\n${dmg} is signed, notarised and stapled. It opens with no warning on a Mac that has never seen it.`);
  }
  for (const f of dmgs.filter((x) => !fresh.includes(x))) {
    console.log(`\nnote: release/${f} is older than this build and was left alone. It is not notarised by this run.`);
  }
}

// ---------------------------------------------------------------------------
// AND THE LINE THAT WAS MISSING, which is the whole of why this file ends with
// a sentence about a stranger's Mac and she still downloaded a two-day-old app.
//
// Everything above had said "signed, notarised and stapled", which reads like a
// shipment, and the website hands out a different file that nothing above ever
// touches. The header of this file has always said so. A header is not where
// anybody looks at the end of a ten-minute build.
//
// So the last thing a release says is what the website is actually serving,
// read live, and the one command that changes it. Best effort and quiet about
// its own failure: a release must not be reported as broken because a laptop
// was off the network for four seconds.
if (!noSign && fresh.length) {
  const shipped = fresh.map((f) => `release/${f}`).join(' ');
  let serving = null;
  // The tag comes back with the assets because the version comparison below
  // needs it: the tag is the only place the PUBLISHED version number is written.
  try {
    const out = spawnSync('gh', [
      'release', 'view', '--repo', 'Astral-Agent/astral-releases', '--json', 'tagName,assets',
    ], { encoding: 'utf8', timeout: 15000 });
    if (out.status === 0) {
      const json = JSON.parse(out.stdout);
      const asset = (json.assets ?? []).find((a) => a.name === 'Astral-arm64.dmg');
      if (asset) serving = { tag: json.tagName, ...asset };
    }
  } catch { /* the sentence below is still worth saying without it */ }

  // This build's own number, for the same comparison.
  let version = null;
  try {
    version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
  } catch {}

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('THE WEBSITE IS NOT UPDATED. This build wrote files on this Mac and stopped.');
  if (serving) {
    const days = Math.floor((Date.now() - Date.parse(serving.updatedAt)) / 86400000);
    console.log(`astral.ac/download is still handing out ${(serving.size / 1e6).toFixed(1)} MB, uploaded ${serving.updatedAt}${days > 0 ? `, ${days} day${days === 1 ? '' : 's'} ago` : ''}.`);
  } else {
    console.log('astral.ac/download is handing out whatever was last uploaded to Astral-Agent/astral-releases.');
  }

  // THE TWO FILES WITHOUT WHICH NOBODY WHO ALREADY HAS AGENTBOX EVER HEARS ABOUT
  // THIS BUILD. Said here, at the end, for exactly the reason the block above
  // exists: a header is not where anybody looks after ten minutes.
  const zipHere = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('-mac.zip'));
  const feedHere = fs.existsSync(path.join(dir, 'latest-mac.yml'));
  if (zipHere && feedHere) {
    console.log('\nThe update files are here too, so installed copies can be offered this:');
    console.log('  release/latest-mac.yml, and the -mac.zip beside it. Publishing sends all three.');
  } else {
    console.log('\nWARNING: this build has no update files in it.');
    console.log(`  ${zipHere ? 'found' : 'MISSING'}  a -mac.zip     what an installed Agentbox installs`);
    console.log(`  ${feedHere ? 'found' : 'MISSING'}  latest-mac.yml  how it finds out there is one`);
    console.log('  Anyone who already has Agentbox would never be offered this build.');
    console.log('  Check that package.json still has build.publish and a zip in build.mac.target.');
  }

  // AND THE TRAP THAT IS INVISIBLE UNTIL MONTHS LATER: an app decides whether to
  // update by comparing version numbers, so republishing the same number ships a
  // new app to strangers and nothing at all to the people who already have it.
  if (serving && version && String(serving.tag ?? '').replace(/^v/, '') === version) {
    console.log(`\nWARNING: astral.ac is already serving ${version} and this build is also ${version}.`);
    console.log('  Publishing it would update nobody. Bump the version first:');
    console.log('    npm version patch --no-git-tag-version');
  }

  console.log('\nTo put this build there:');
  console.log(`\n  node scripts/publish-download.mjs ${shipped.split(' ')[0]} --publish\n`);
  console.log('Without --publish it tells you what it would do and uploads nothing.');
  console.log('──────────────────────────────────────────────────────────────');
}
