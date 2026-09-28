#!/usr/bin/env node
// PUT A BUILD ON THE WEBSITE, AND HAND IT TO EVERYONE WHO ALREADY HAS AGENTBOX.
//
// She was right and the log was fine. `npm run release` writes `release/*.dmg`
// on this Mac and stops, on purpose (its own header says so). The website's
// download button is a redirect in the website repo's `vercel.json` to
//
//   github.com/Astral-Agent/astral-releases/releases/latest/download/Astral-arm64.dmg
//
// and NOTHING in a build touches that asset. Measured 2026-08-23 04:5x: the
// asset the button served was 135,629,579 bytes, uploaded 2026-08-21T19:02:20Z,
// with an app.asar packed 2026-08-21 11:23, two days and every onboarding round
// old. So notarising three times in a row could not have changed what she
// downloaded, and there was no command in this repo that could.
//
// This is that command. It is SEPARATE FROM THE BUILD and it always will be:
// publishing is an outward-facing act and it is hers to say, so nothing calls
// this file for her.
//
//   node scripts/publish-download.mjs release/Astral-0.2.0-universal.dmg
//     what it would do, and what the website serves today. Uploads nothing.
//
//   node scripts/publish-download.mjs release/Astral-0.2.0-universal.dmg --publish
//     the real one.
//
// ---------------------------------------------------------------------------
// WHAT CHANGED ON 2026-08-28, AND IT IS THE WHOLE POINT OF THE FILE NOW.
//
// Until today a release was ONE FILE: a dmg, clobbered onto a single rolling
// v0.1.0 tag. Somebody who already had Agentbox had no way to learn a new one
// existed. The app now asks GitHub on its own (main/updater.mjs), and for that
// to answer anything a release has to carry THREE things, together:
//
//   Astral-arm64.dmg              what the website hands a stranger. Unchanged,
//                                 and still called this because the /download
//                                 redirect on the live site names it.
//   Agentbox-<v>-universal-mac.zip  what an installed Agentbox downloads. Squirrel
//                                 swaps an .app bundle and CANNOT read a disk
//                                 image, so a release carrying only a dmg fails
//                                 every updater with
//                                 ERR_UPDATER_ZIP_FILE_NOT_FOUND.
//   latest-mac.yml                the version and the zip's hash. Without it
//                                 the app cannot even tell that it is behind.
//
// AND EVERY RELEASE NOW GETS ITS OWN TAG, `v<version>` out of package.json.
// The old single rolling tag cannot work: the app compares the version in
// latest-mac.yml against its own, so shipping 0.2.0 under a tag that says
// v0.1.0 is a lie that only bites months later. The website is unaffected
// because its redirect follows `releases/latest`, not any one tag.
//
// THE RELEASE IS BUILT AS A DRAFT AND PUBLISHED LAST. `releases/latest` skips
// drafts, so for the several minutes the uploads take, the website and every
// running Agentbox go on seeing the OLD release, whole. The moment of change is
// the final undraft, which is one call. Without this the download button 404s
// for the length of a 250 MB upload.

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME } from '../shared/product-name.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'Astral-Agent/astral-releases';
const ASSET = 'Astral-arm64.dmg';
const FEED = 'latest-mac.yml';
const DOWNLOAD = 'https://astral.ac/download';

const argv = process.argv.slice(2);
const publish = argv.includes('--publish');
const target = argv.find((a) => !a.startsWith('--'));

function die(...lines) {
  console.error(`\n${lines.join('\n')}\n`);
  process.exit(1);
}

function md5(file) {
  const h = crypto.createHash('md5');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

// The hash electron-builder writes into latest-mac.yml, in the form it writes
// it: sha512, base64, not hex. Checked here so a mismatched pair is caught on
// this Mac rather than by an app that has already downloaded 250 MB.
function sha512(file) {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
}

function mb(n) { return `${(n / 1e6).toFixed(1)} MB`; }

if (!target) {
  die(
    'Say which dmg to publish.',
    '',
    '  node scripts/publish-download.mjs release/Astral-0.2.0-universal.dmg',
    '',
    'Add --publish once it has told you what it would do.',
  );
}

const dmg = path.resolve(repo, target);
if (!fs.existsSync(dmg)) die(`There is no file at ${dmg}.`);

const version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
const tag = `v${version}`;
const releaseDir = path.join(repo, 'release');

// ---------------------------------------------------------------------------
// THE TWO FILES THE UPDATER NEEDS, beside the dmg. Both are written by the same
// electron-builder run; if either is missing this build predates the zip target
// or was made with `npm run pack`, and publishing it would put a release on the
// internet that no installed Agentbox can read.
const feedPath = path.join(releaseDir, FEED);
if (!fs.existsSync(feedPath)) {
  die(
    `release/${FEED} is missing, so nobody who already has ${NAME} would ever learn about this build.`,
    'It is written by electron-builder when `build.publish` is set and a zip target is built.',
    '',
    'Build it with: APPLE_ID=… APPLE_TEAM_ID=… APPLE_APP_SPECIFIC_PASSWORD=… npm run release',
  );
}

// A tiny, deliberate parser rather than a yaml dependency. This file is
// machine-written, four fields deep, and never touched by a human; taking a
// package for it would be the largest thing in this script.
const feedText = fs.readFileSync(feedPath, 'utf8');
const feedVersion = (feedText.match(/^version:\s*(.+)$/m) ?? [])[1]?.trim();
const zipName = (feedText.match(/url:\s*(\S+\.zip)/) ?? [])[1];
const zipSha = (feedText.match(/url:\s*\S+\.zip\s*\n\s*sha512:\s*(\S+)/) ?? [])[1];

if (!zipName) {
  die(
    `release/${FEED} names no .zip, so an installed Agentbox has nothing it can install.`,
    'That is what a build with only a dmg target looks like. Check package.json build.mac.target.',
  );
}
if (feedVersion !== version) {
  die(
    `package.json says ${version} and release/${FEED} says ${feedVersion}.`,
    'They come from the same build, so this release/ folder is stale. Rebuild before publishing.',
  );
}

const zip = path.join(releaseDir, zipName);
if (!fs.existsSync(zip)) {
  die(`release/${FEED} points at ${zipName} and that file is not in release/.`);
}
// THE HASH IS CHECKED HERE, not trusted. An updater that downloads 250 MB and
// then rejects it on a hash mismatch reports a checksum error to a person who
// did nothing wrong, and there is no way for them to act on it.
const zipHave = sha512(zip);
if (zipSha && zipHave !== zipSha) {
  die(
    `${zipName} does not match the hash in ${FEED}.`,
    `  ${FEED} says  ${zipSha}`,
    `  the file is   ${zipHave}`,
    'One of the two is from an older build. Rebuild, do not publish this.',
  );
}

// ---------------------------------------------------------------------------
// What the website serves today. Read first, so the comparison is against a
// fact rather than against what somebody remembers uploading.
function published() {
  const out = spawnSync('gh', [
    'release', 'view', '--repo', REPO, '--json', 'tagName,assets',
  ], { encoding: 'utf8' });
  if (out.status !== 0) return null;
  try {
    const j = JSON.parse(out.stdout);
    const asset = (j.assets ?? []).find((a) => a.name === ASSET);
    return asset ? { tag: j.tagName, ...asset } : null;
  } catch { return null; }
}

const live = published();
if (!live) {
  die(
    `Could not read the release on ${REPO}.`,
    'This needs the gh CLI logged in to an account with write access there.',
    'Check with: gh auth status',
  );
}

// THE REFUSAL THAT MATTERS MOST NOW, and it did not exist before today. An
// update is offered on a VERSION COMPARISON. Publishing 0.1.0 over 0.1.0 puts a
// new app on the website and updates precisely nobody, silently, which is the
// 2026-08-23 failure wearing a different hat.
if (live.tag === tag) {
  die(
    `${REPO} is already serving ${tag}, and this build is also ${version}.`,
    'Nobody who has Agentbox would be offered this, because the app compares version numbers.',
    '',
    'Bump it first, then rebuild and publish:',
    '',
    '  npm version patch --no-git-tag-version   (0.1.0 becomes 0.1.1)',
    '  APPLE_ID=… APPLE_TEAM_ID=… APPLE_APP_SPECIFIC_PASSWORD=… npm run release',
  );
}

const size = fs.statSync(dmg).size;
const mine = md5(dmg);

console.log(`\nThe website hands out ${DOWNLOAD} to ${REPO} latest, asset ${ASSET}`);
console.log(`  on the website now   ${live.tag}, ${mb(live.size)}, uploaded ${live.updatedAt}, ${live.downloadCount} downloads`);
console.log(`  about to go up       ${tag}, ${mb(size)}, built ${fs.statSync(dmg).mtime.toISOString()}`);
console.log(`  md5 of the new dmg   ${mine}`);
console.log(`\nAnd the two files that let an installed Agentbox update itself:`);
console.log(`  ${zipName}  ${mb(fs.statSync(zip).size)}`);
console.log(`  ${FEED}  says version ${feedVersion}`);

// ---------------------------------------------------------------------------
// The three refusals that were already here.
const others = fs.readdirSync(releaseDir)
  // Not the staged link this script makes on its way out, and not one left over
  // from a run that was interrupted mid-upload.
  .filter((f) => f.endsWith('.dmg') && f !== ASSET)
  .map((f) => ({ f, at: fs.statSync(path.join(releaseDir, f)).mtimeMs }))
  .sort((a, b) => b.at - a.at);
if (others.length && path.join(releaseDir, others[0].f) !== dmg) {
  die(
    `release/${others[0].f} is newer than the file you named.`,
    'Publishing the older one while a newer build sits beside it is the exact fault this script exists for.',
  );
}

if (size < live.size * 0.8) {
  die(
    `The new dmg is ${mb(size)} and the published one is ${mb(live.size)}.`,
    'A drop that big is what a bundle packed without its renderer looks like, so this stops rather than shipping it.',
  );
}

console.log(`\n→ checking the dmg the way a stranger’s Mac will`);
const gate = spawnSync('spctl', [
  '--assess', '--type', 'open', '--context', 'context:primary-signature', '-v', dmg,
], { encoding: 'utf8' });
const gateSays = `${gate.stdout ?? ''}${gate.stderr ?? ''}`.trim();
if (gate.status !== 0 || !/accepted/i.test(gateSays)) {
  die(
    'Gatekeeper would warn about this dmg, so it is not going on the website.',
    gateSays || 'spctl said nothing at all.',
    '',
    'Build it with: APPLE_ID=… APPLE_TEAM_ID=… APPLE_APP_SPECIFIC_PASSWORD=… npm run release',
  );
}
console.log(`  ${gateSays.split('\n').join('\n  ')}`);

// The zip carries the SAME .app, so Gatekeeper has to accept what comes out of
// it too. An app that updates itself into a build macOS refuses to launch is
// worse than one that never updates: the person is left with nothing that runs.
console.log(`\n→ checking the app inside the zip the same way`);
const unzipped = path.join(releaseDir, '.zipcheck');
fs.rmSync(unzipped, { recursive: true, force: true });
fs.mkdirSync(unzipped, { recursive: true });
const unzip = spawnSync('ditto', ['-xk', zip, unzipped], { encoding: 'utf8' });
if (unzip.status !== 0) {
  fs.rmSync(unzipped, { recursive: true, force: true });
  die(`Could not unpack ${zipName} to check it: ${unzip.stderr ?? ''}`);
}
const inner = fs.readdirSync(unzipped).find((f) => f.endsWith('.app'));
if (!inner) {
  fs.rmSync(unzipped, { recursive: true, force: true });
  die(`${zipName} has no .app in it. An updater would download it and have nothing to install.`);
}
const appGate = spawnSync('spctl', [
  '--assess', '--type', 'exec', '-v', path.join(unzipped, inner),
], { encoding: 'utf8' });
const appSays = `${appGate.stdout ?? ''}${appGate.stderr ?? ''}`.trim();
fs.rmSync(unzipped, { recursive: true, force: true });
if (appGate.status !== 0 || !/accepted/i.test(appSays)) {
  die(
    'The app inside the zip would be refused by Gatekeeper, so it is not going out as an update.',
    appSays || 'spctl said nothing at all.',
  );
}
console.log(`  ${appSays.split('\n').join('\n  ')}`);

if (!publish) {
  console.log(`\nNothing was uploaded. This was the dry run.`);
  console.log(`It would create ${tag} on ${REPO} as a draft, put those three files on it, and then publish it.`);
  console.log(`To really publish it:\n\n  node scripts/publish-download.mjs ${target} --publish\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// THE UPLOAD, into a DRAFT. Nothing anybody can reach changes until the undraft
// further down this file.
//
// THE ASSET'S NAME IS ITS FILENAME, AND NOTHING ELSE. Measured 2026-08-23 the
// hard way: `gh release upload TAG "file#Astral-arm64.dmg"` looks like it
// renames and does not. The part after the # is the asset's LABEL; the name
// comes from the file's basename. So that first run uploaded a brand new asset
// called Astral-0.1.0-arm64.dmg, left Astral-arm64.dmg exactly as it was, and
// reported success. The website went on handing out the 21 August app.
//
// The fix is to upload a file that is ALREADY CALLED the right thing, so
// hard-link it under that name first. A link, not a copy: 250 MB copied per
// publish is a minute of disk for no reason, and it is removed either way.
const staged = path.join(releaseDir, ASSET);
fs.rmSync(staged, { force: true });
try { fs.linkSync(dmg, staged); } catch { fs.copyFileSync(dmg, staged); }

const cleanup = () => fs.rmSync(staged, { force: true });

// Reuse a draft left by an interrupted run rather than failing on "tag exists".
const exists = spawnSync('gh', ['release', 'view', tag, '--repo', REPO], { encoding: 'utf8' }).status === 0;
if (!exists) {
  console.log(`\n→ creating ${tag} on ${REPO}, as a draft`);
  try {
    execFileSync('gh', [
      'release', 'create', tag, '--repo', REPO, '--draft',
      '--title', `Agentbox ${version}`,
      '--notes', `Agentbox ${version}`,
    ], { stdio: 'inherit' });
  } catch (err) {
    cleanup();
    die(`Could not create ${tag}: ${err?.message ?? err}`, 'Nothing changed. The old download still works.');
  }
} else {
  console.log(`\n→ ${tag} already exists on ${REPO}, reusing it`);
}

console.log(`\n→ uploading three files to ${tag} (this takes a few minutes)`);
try {
  execFileSync('gh', [
    'release', 'upload', tag, staged, zip, feedPath, '--clobber', '--repo', REPO,
  ], { stdio: 'inherit' });
} catch (err) {
  cleanup();
  die(`The upload failed: ${err?.message ?? err}`, 'The draft is incomplete and nothing public changed. The old download still works.');
}
cleanup();

// ---------------------------------------------------------------------------
// THE ONE MOMENT ANYTHING CHANGES for the website and for every running Agentbox.
console.log(`\n→ publishing ${tag}, which is what makes it the latest release`);
try {
  execFileSync('gh', ['release', 'edit', tag, '--repo', REPO, '--draft=false', '--latest'], { stdio: 'inherit' });
} catch (err) {
  die(
    `The files are up but ${tag} is still a draft: ${err?.message ?? err}`,
    `Finish it with: gh release edit ${tag} --repo ${REPO} --draft=false --latest`,
  );
}

// ---------------------------------------------------------------------------
// AND THE PART THAT MAKES IT TRUE. A green upload log is not a published file.
console.log(`\n→ downloading ${DOWNLOAD} the way a stranger does, and comparing it`);
const tmp = path.join(releaseDir, '.published-check.dmg');
let got = null;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  const r = spawnSync('curl', ['-sL', '-o', tmp, DOWNLOAD], { encoding: 'utf8' });
  if (r.status === 0 && fs.existsSync(tmp) && fs.statSync(tmp).size > 1e6) {
    got = md5(tmp);
    if (got === mine) break;
  }
  // The measured settling window after an upload is about forty seconds.
  console.log(`  not there yet (try ${attempt}), waiting 15s`);
  spawnSync('sleep', ['15']);
}
fs.rmSync(tmp, { force: true });

if (got !== mine) {
  die(
    'The upload reported success and the website is still not serving that file.',
    `  wanted ${mine}`,
    `  got    ${got ?? 'nothing downloadable'}`,
    'Check the release page by hand before telling anyone it shipped.',
  );
}

// AND THE SAME QUESTION ASKED THE WAY AN INSTALLED AGENTBOX ASKS IT. This is the
// check the website one cannot stand in for: the redirect can be perfect while
// the feed is missing, and then strangers get the new app and everybody who
// already has Agentbox gets nothing, forever, in silence.
console.log(`\n→ reading the update feed the way an installed Agentbox does`);
const feedUrl = `https://github.com/${REPO}/releases/latest/download/${FEED}`;
let served = null;
for (let attempt = 1; attempt <= 8; attempt += 1) {
  const r = spawnSync('curl', ['-sL', feedUrl], { encoding: 'utf8' });
  if (r.status === 0 && /^version:/m.test(r.stdout ?? '')) {
    served = (r.stdout.match(/^version:\s*(.+)$/m) ?? [])[1]?.trim();
    if (served === version) break;
  }
  console.log(`  not there yet (try ${attempt}), waiting 15s`);
  spawnSync('sleep', ['15']);
}

if (served !== version) {
  die(
    `The website is updated but the update feed is not, so nobody who already has ${NAME} will be offered this.`,
    `  wanted version ${version}`,
    `  ${feedUrl} says ${served ?? 'nothing readable'}`,
  );
}

console.log(`\nThe download on astral.ac is now this build. md5 ${mine}, checked by fetching it.`);
console.log(`Every Agentbox older than ${version} offers this on its next launch, and within six hours if it is left open.`);
