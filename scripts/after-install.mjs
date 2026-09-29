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

const require = createRequire(import.meta.url);

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
  if (fixed) console.log(`agentbox: made ${fixed} node-pty spawn-helper binary${fixed === 1 ? '' : 'ies'} executable, so the terminal works.`);
} catch {
  // Nothing here is worth stopping an install for.
}
