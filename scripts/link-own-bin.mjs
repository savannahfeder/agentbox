#!/usr/bin/env node
// `npx agentbox-app` IN A CHECKOUT HAS TO START THE BROWSER (2026-10-23).
//
// That command is the first line of the README and it did not work from a
// clone. npm exec matches the name against this project's own package.json,
// takes its one bin, and runs that bin's NAME through a shell whose PATH starts
// with `node_modules/.bin`. npm links the bins of DEPENDENCIES in there and
// never the project's own, so the shell fell through to the real PATH: on a
// machine with nothing there, `sh: 1: agentbox: not found`; on a Linux machine
// with the launcher installed, `~/.local/bin/agentbox`, which opens the DESKTOP
// app instead of the browser.
//
// Measured on npm 10.9.9 and npm 11.21.1 against a two-line fixture package: no
// link, both fail; with the link, both run the checkout's own bin.
//
// So the install makes the link itself, every time, which is the one thing npm
// will not do for a project's own bin.
//
// THIS MUST NEVER FAIL AN INSTALL, like everything else `scripts/after-install.mjs`
// does. A read-only folder or a package.json with no bin are reasons to say
// what happened and leave.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Link this project's own bins into its own node_modules/.bin.
 *
 *  Returns { linked, why }: the names now on that folder's PATH, and the reason
 *  there are none when there are none. Relative links, so a checkout that is
 *  moved or copied still resolves. Windows is left alone: npm writes .cmd and
 *  .ps1 shims there rather than a symlink, and the browser command is not the
 *  documented way in. */
export function linkOwnBin({ appDir = ROOT, platform = process.platform } = {}) {
  try {
    if (platform === 'win32') return { linked: [], why: null };
    // An install OF the published package runs its postinstall inside
    // node_modules, where npm has already made the link itself.
    if (appDir.split(path.sep).includes('node_modules')) {
      return { linked: [], why: 'this copy is installed under node_modules, where npm links the bin itself' };
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    const bins = typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : (pkg.bin ?? {});
    const names = Object.keys(bins);
    if (!names.length) return { linked: [], why: 'this package has no bin' };
    const dir = path.join(appDir, 'node_modules', '.bin');
    fs.mkdirSync(dir, { recursive: true });
    const linked = [];
    for (const name of names) {
      const target = path.join(appDir, bins[name]);
      if (!fs.existsSync(target)) continue;
      // The exec bit matters as much as the link: npm exec runs the name
      // through a shell, and a file without it answers "Permission denied".
      if ((fs.statSync(target).mode & 0o111) === 0) fs.chmodSync(target, 0o755);
      const link = path.join(dir, name);
      const want = path.relative(dir, target);
      if (fs.lstatSync(link, { throwIfNoEntry: false })) {
        if (fs.existsSync(link) && safeReadlink(link) === want) { linked.push(name); continue; }
        fs.rmSync(link, { force: true });
      }
      fs.symlinkSync(want, link);
      linked.push(name);
    }
    return { linked, why: linked.length ? null : 'none of the bins this package names is on disk' };
  } catch (err) {
    return { linked: [], why: `linking it failed: ${err?.message ?? err}` };
  }
}

function safeReadlink(at) {
  try {
    return fs.readlinkSync(at);
  } catch {
    return null;
  }
}
