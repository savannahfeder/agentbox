#!/usr/bin/env node
// THE ONE THING AN NPM INSTALL GETS WRONG, AND IT IS A PERMISSION BIT.
//
// node-pty is how this app opens a terminal. On a Mac it does not spawn the
// shell itself: it runs a tiny bundled executable called `spawn-helper` that
// sets the terminal up and then becomes the shell. The prebuilt binaries ship
// inside the npm tarball, and a tarball does not reliably carry the executable
// bit through `npm install`.
//
// So the file arrives as `-rw-r--r--`, node-pty loads perfectly, and the first
// terminal anybody opens fails with `posix_spawnp failed`. Nothing else in the
// app is affected, which is what makes it hard to find: the inbox works, the
// agents run, and one button is broken.
//
// Measured on 2026-09-25 by installing the packed tarball into an empty folder:
// both prebuilds came out 644, against 755 in the working checkout.
//
// THIS MUST NEVER FAIL AN INSTALL. A missing node-pty, a read-only folder or a
// platform with no prebuilds are all ordinary, and none of them is a reason to
// make `npm install` exit non-zero. It says what it did and leaves quietly.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

// A checkout has scripts/linux-launcher.mjs and scripts/link-own-bin.mjs next
// to this file. The published package carries neither, so an npm install of
// that package, including npx, leaves both alone. A missing file is the
// ordinary case here, not an error.
const here = path.dirname(fileURLToPath(import.meta.url));

async function fromCheckout(file) {
  const at = path.join(here, file);
  if (!fs.existsSync(at)) return null;
  try {
    return await import(pathToFileURL(at).href);
  } catch {
    // Nothing here is worth stopping an install for.
    return null;
  }
}

const launcher = await fromCheckout('linux-launcher.mjs');
if (launcher) {
  const { changed, why } = launcher.installLinuxLauncher({ env: process.env });
  if (changed) console.log('agentbox: this checkout is in the app launcher.');
  // A launcher that did not happen says so. Before this, a fresh clone whose
  // Electron binary was not downloaded yet got no launcher and no word about
  // it, and `which agentbox` answered nothing.
  else if (why) console.log(`agentbox: no app launcher was written: ${why}.`);
}

// And the checkout's own command, so `npx agentbox-app` from here starts the
// browser rather than looking for `agentbox` on PATH.
const own = await fromCheckout('link-own-bin.mjs');
if (own) {
  const { why } = own.linkOwnBin();
  if (why) console.log(`agentbox: \`npx agentbox-app\` will not work from this checkout: ${why}.`);
}

function prebuildsDir() {
  // Resolve the package rather than guessing at ../node-pty: npm may have
  // hoisted it, nested it, or put it in a workspace root.
  const entry = require.resolve('node-pty');
  let at = path.dirname(entry);
  for (let up = 0; up < 6; up += 1) {
    const here = path.join(at, 'prebuilds');
    if (fs.existsSync(here)) return here;
    const next = path.dirname(at);
    if (next === at) break;
    at = next;
  }
  return null;
}

try {
  const dir = prebuildsDir();
  if (!dir) process.exit(0);
  let fixed = 0;
  for (const platform of fs.readdirSync(dir)) {
    const helper = path.join(dir, platform, 'spawn-helper');
    if (!fs.existsSync(helper)) continue;
    // Only touch it when it is actually wrong, so a correct install prints
    // nothing and a re-install is not noise.
    if (fs.statSync(helper).mode & 0o111) continue;
    fs.chmodSync(helper, 0o755);
    fixed += 1;
  }
  if (fixed) console.log(`agentbox: made ${fixed} node-pty spawn-helper binar${fixed === 1 ? 'y' : 'ies'} executable, so the terminal works.`);
} catch {
  // Nothing here is worth stopping an install for.
}
