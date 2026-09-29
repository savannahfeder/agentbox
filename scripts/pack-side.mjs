#!/usr/bin/env node
// A SECOND AGENTBOX, BUILT OFF A BRANCH, TO LIVE BESIDE THE REAL ONE.
//
// So: `npm run pack` writes Astral.app, which is the one she installs and the
// one a fresh main build overwrites. This writes "the app Rest.app" instead, its
// own bundle with its own identifier, which nothing else on this Mac touches.
// She can rebuild main as often as she likes and the branch build stays where
// it is until she deletes it.
//
// THE ONE THING THAT IS DELIBERATELY *NOT* SEPARATE, and the reason main.mjs
// has a setName line at the top of it: THE DATA FOLDER. Two Astrals with two
// data folders is two supervisors, and two supervisors spawn twin workers for
// every answered item (main.mjs says so where the single-instance lock is, and
// it was measured on 2026-08-04: nine items double-spawned a second apart).
// The lock lives inside the data folder, so sharing the folder is what makes it
// impossible to run both at once. Measured on this Mac 2026-08-27: the running
// Agentbox holds SingletonLock in ~/Library/Application Support/Astral.
//
// Which means the side build IS her Agentbox: same store, same settings, same
// theme, same everything, plus the branch. To use it she quits Agentbox and opens
// Agentbox Rest. Opening it while Agentbox is running does nothing but focus the
// Agentbox she already had, which is the correct and safe outcome.
//
// Usage:
//   node scripts/pack-side.mjs                 build it into release/side
//   node scripts/pack-side.mjs --install       and copy it to ~/Applications
//   node scripts/pack-side.mjs --name "the app Frame"     a different second app
//
// Nothing here notarises anything and nothing here publishes anything. It is
// signed with the Developer ID on this Mac if there is one, because a stable
// signature is what stops macOS asking for the same permissions again after
// every rebuild, and left unsigned if there is not.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REAL_NAME, isNewUserBuild, isSideBuild } from '../shared/side-build.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const install = argv.includes('--install');

// The name has to keep starting with the app's own name, because main.mjs
// recognises a side build by exactly that and puts its data folder back to the
// real one's. A name that does not is a second supervisor waiting to happen, so
// it stops here rather than at the end of a ten minute build.
//
// IT READS THE NAME NOW RATHER THAN SPELLING IT. These three lines still said
// "the app" two renames after the app stopped being called that, so the default
// name failed its own check and `npm run pack:side` refused to start, with a
// message naming a word that is nowhere in the app.
const nameArg = argv.indexOf('--name');
const productName = nameArg >= 0 ? argv[nameArg + 1] : `${REAL_NAME} Rest`;
if (!isSideBuild(productName)) {
  console.error(`\nThe name has to be "${REAL_NAME} something", and it is "${productName}".`);
  console.error(`main.mjs shares the data folder with the real ${REAL_NAME} by matching on that,`);
  console.error('and without the match this build gets its own supervisor beside hers.\n');
  process.exit(1);
}
const appId = `ac.agentbox.${productName.slice(REAL_NAME.length + 1).toLowerCase().replace(/[^a-z0-9]+/g, '')}`;

function signingIdentity() {
  try {
    const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
    const m = out.match(/"Developer ID Application: (.+) \(([A-Z0-9]{10})\)"/);
    return m ? m[0].slice(1, -1) : null;
  } catch {
    return null;
  }
}

const branch = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();

console.log(`\n→ ${productName} (${appId}), off ${branch}`);
console.log('→ building the renderer');
const built = spawnSync('npm', ['run', 'build'], { cwd: repo, stdio: 'inherit', env: { ...process.env, ASTRAL_SHIPPING: '1' } });
if (built.status !== 0) process.exit(built.status ?? 1);

if (!fs.existsSync(path.join(repo, 'build', 'icon.icns'))) {
  console.error('build/icon.icns is missing. Run: npm run icon');
  process.exit(1);
}

const identity = signingIdentity();
const out = path.join(repo, 'release', 'side');
const args = [
  'electron-builder', '--mac',
  `-c.productName=${productName}`,
  // ALSO into the packaged package.json, because `app.getName` reads THAT and
  // everything in main.mjs that tells a side build apart keys off it. The
  // new-user build hands itself over only if it can see its own name.
  `-c.extraMetadata.productName=${productName}`,
  `-c.appId=${appId}`,
  // The .app and nothing else. A disk image is for handing a build to somebody
  // over the internet, and this one never leaves the Mac that built it.
  '-c.mac.target=dir',
  `-c.directories.output=${out}`,
  '-c.mac.notarize=false',
];
const env = { ...process.env };
if (identity) {
  console.log(`→ signing as ${identity}, not notarising`);
} else {
  console.log('→ no Developer ID on this Mac, so this build is unsigned');
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
}

const packed = spawnSync('npx', args, { cwd: repo, stdio: 'inherit', env });
if (packed.status !== 0) process.exit(packed.status ?? 1);

const appPath = path.join(out, 'mac-arm64', `${productName}.app`);
if (!fs.existsSync(appPath)) {
  console.error(`\nelectron-builder finished and ${appPath} is not there.`);
  process.exit(1);
}

let landed = appPath;
if (install) {
  const dest = path.join(os.homedir(), 'Applications', `${productName}.app`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  // ditto rather than fs.cpSync, because a .app is a bundle with symlinks and
  // extended attributes in it and ditto is the copy that keeps them.
  const copied = spawnSync('/usr/bin/ditto', [appPath, dest], { stdio: 'inherit' });
  if (copied.status !== 0) process.exit(copied.status ?? 1);
  landed = dest;
}

console.log(`\n${landed}`);
if (isNewUserBuild(productName)) {
  console.log(`\nEvery time it opens it is somebody who has never opened Agentbox, off ${branch}.`);
  console.log('It runs beside your real Agentbox and touches nothing of yours. Quit it and open');
  console.log('it again to start over from zero. Its permission history is its own; to make');
  console.log(`macOS forget its answers: tccutil reset All ${appId}`);
} else {
  console.log(`\nIt is the same inbox, the same store and the same settings as Agentbox, off ${branch}.`);
  console.log('Quit Agentbox before opening it. While Agentbox is running this one cannot start;');
  console.log('it will just bring the Agentbox you already had to the front, which is on purpose.');
}
