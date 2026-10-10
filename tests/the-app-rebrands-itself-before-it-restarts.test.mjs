// THE APP UPDATES ITSELF, AND SKIPPED THE ONE STEP THAT MAKES IT AGENTBOX.
//
// `npm start` runs scripts/brand-electron.mjs before Electron, which is what
// gives a from-source run Agentbox's name, icon and bundle id. The app's own
// updater never did: it pulls, runs `npm run build`, and calls app.relaunch(),
// which re-executes the same binary directly. npm is not in that path, so the
// branding step has not run on a self-restart, ever.
//
// Measured 2026-10-09, which is how this was found. The bundle id fix shipped,
// she restarted, and nothing changed: the Electron.app Info.plist on her Mac
// was last written on 2026-10-05, days before. The fix was on disk in
// scripts/ and could not reach the bundle, because the only thing that runs
// that script is a hand-typed `npm start`. "I feel like I'm still not getting
// notifications though even after restarting" is what that looks like.
//
// So the update brands before it relaunches. It is the right seam: the build
// has just succeeded, the process is about to quit, and macOS reads the
// Info.plist fresh on the launch that follows.
//
// AND IT NEVER STOPS A RESTART. brand-electron.mjs opens by saying so about
// itself, for the same reason: an app that will not come back up is worse than
// one wearing the wrong icon.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSourceUpdater } from '../main/source-updater.mjs';

const git = (cwd, ...args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
}).trim();

let tmp;
let origin;
let mine;
let theirs;

function commit(cwd, file, text, message) {
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rebrand-before-restart-'));
  origin = path.join(tmp, 'origin.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(tmp, 'seed');
  git(tmp, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, 'package-lock.json', '{"v":1}\n', 'First');
  git(seed, 'push', '-q', 'origin', 'main');
  mine = path.join(tmp, 'mine');
  theirs = path.join(tmp, 'theirs');
  git(tmp, 'clone', '-q', origin, mine);
  git(tmp, 'clone', '-q', origin, theirs);
});

afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** An update is waiting, and `install()` has run it to the end. */
async function update({ failBuild = false, brand } = {}) {
  commit(theirs, 'a.txt', 'a\n', 'New');
  git(theirs, 'push', '-q', 'origin', 'main');

  const order = [];
  const u = createSourceUpdater({
    appDir: mine,
    log: { info() {}, warn() {}, error() {} },
    npm: async (args) => {
      if (failBuild && args[0] === 'run') return { code: 1, out: 'error: vite: build failed' };
      return { code: 0, out: '' };
    },
    brand: () => { order.push('brand'); return brand?.(); },
    relaunch: () => { order.push('relaunch'); },
  });
  await u.check();
  u.install();
  await u.settled?.();
  u.stop?.();
  return order;
}

describe('the restart the app does for itself', () => {
  it('brands the bundle, and does it before the relaunch', async () => {
    // Order is the whole point. Branding after the relaunch call would write
    // the Info.plist for a process that has already asked to be replaced.
    expect(await update()).toEqual(['brand', 'relaunch']);
  });

  it('does neither when the build failed', async () => {
    // The case that must NOT match: there is no new version to wear.
    expect(await update({ failBuild: true })).toEqual([]);
  });

  it('still restarts when the branding throws', async () => {
    const order = await update({ brand: () => { throw new Error('codesign said no'); } });
    expect(order).toEqual(['brand', 'relaunch']);
  });
});
