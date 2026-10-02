// A COPY RUN FROM SOURCE OFFERS A RESTART WHEN MAIN MOVES (w-7a39dace23,
// 2026-10-01).
//
// Teammates run the team build from a git checkout (docs/team/PLAN.md), and
// main/updater.mjs does nothing at all from source: it reports `unsupported`,
// because electron-updater only reads published releases. Measured on this
// branch before the change: `createUpdater` on an unpackaged app returned
// phase `unsupported` for every check, so a teammate's copy never learned that
// main had moved, however many pushes landed. The ask was the opposite: the
// app notices there is newer code and asks whether to restart onto it.
//
// So main/source-updater.mjs fetches the branch's upstream, and when it is
// ahead offers the same "A new version is ready" row the installed app shows.
// Pressing Restart fast-forwards, reinstalls packages only when they changed,
// rebuilds the screens, and relaunches.
//
// These run real git against throwaway repositories, because every way this
// can go wrong is a fact about git: a folder with edits in it, a branch with
// commits of its own, a branch with no upstream. Packages and the relaunch are
// stand-ins, so nothing here installs anything or starts an app.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSourceUpdater } from '../main/source-updater.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { announcesUpdate, SAY } from '../renderer/src/update-row.ts';
import { SidebarUpdate } from '../renderer/src/components/SidebarUpdate.tsx';

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

function fakeNpm({ failBuild = false } = {}) {
  const calls = [];
  const npm = async (args) => {
    calls.push(args.join(' '));
    if (failBuild && args[0] === 'run') return { code: 1, out: '> agentbox-app build\nerror during build: vite: build failed\n    at stack line' };
    return { code: 0, out: '' };
  };
  return { npm, calls };
}

function make(over = {}) {
  const relaunched = [];
  const u = createSourceUpdater({
    appDir: mine,
    log: { info() {}, warn() {}, error() {} },
    relaunch: () => relaunched.push(true),
    ...over,
  });
  return { u, relaunched };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-updater-'));
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

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('noticing newer code', () => {
  it('offers a restart when the branch on GitHub has moved ahead', async () => {
    commit(theirs, 'a.txt', 'a\n', 'The inbox reads faster');
    git(theirs, 'push', '-q', 'origin', 'main');
    const { u } = make();
    const s = await u.check();
    expect(s.phase).toBe('ready');
    expect(s.ready).toBe(true);
    expect(s.source).toBe(true);
    expect(s.newVersion).toBe(git(theirs, 'rev-parse', '--short', 'HEAD'));
    expect(s.currentVersion).toBe(git(mine, 'rev-parse', '--short', 'HEAD'));
    expect(s.changes).toEqual(['The inbox reads faster']);
    expect(s.readyAt).toEqual(expect.any(Number));
  });

  it('says it is current when nothing new was pushed', async () => {
    const { u } = make();
    const s = await u.check();
    expect(s.phase).toBe('current');
    expect(s.ready).toBe(false);
  });

  it('lists the newest changes first, leaves merges out, and stops at five', async () => {
    for (let n = 1; n <= 7; n += 1) commit(theirs, `f${n}.txt`, `${n}\n`, `Change ${n}`);
    git(theirs, 'push', '-q', 'origin', 'main');
    const { u } = make();
    const s = await u.check();
    expect(s.changes).toEqual(['Change 7', 'Change 6', 'Change 5', 'Change 4', 'Change 3']);
    expect(s.behind).toBe(7);
  });

  it('offers a restart when the folder was brought up to date by hand but the app was not restarted', async () => {
    const { u } = make();
    commit(theirs, 'a.txt', 'a\n', 'Pulled by hand');
    git(theirs, 'push', '-q', 'origin', 'main');
    git(mine, 'pull', '-q', '--ff-only');
    const s = await u.check();
    expect(s.phase).toBe('ready');
    expect(s.changes).toEqual(['Pulled by hand']);
  });
});

describe('never offering what it cannot do safely', () => {
  it('does not offer to update a folder with edits in it, because a pull could tangle them', async () => {
    commit(theirs, 'a.txt', 'a\n', 'New');
    git(theirs, 'push', '-q', 'origin', 'main');
    fs.writeFileSync(path.join(mine, 'package-lock.json'), '{"edited":true}\n');
    const { u } = make();
    const s = await u.check();
    expect(s.phase).toBe('unsupported');
    expect(s.ready).toBe(false);
    expect(s.error).toMatch(/changes of your own/);
  });

  it('still offers it when the only new files are ones git is not tracking', async () => {
    commit(theirs, 'a.txt', 'a\n', 'New');
    git(theirs, 'push', '-q', 'origin', 'main');
    fs.writeFileSync(path.join(mine, 'zero.config.json'), '{}\n');
    const { u } = make();
    expect((await u.check()).phase).toBe('ready');
  });

  it('does not offer to update a branch with commits of its own', async () => {
    commit(theirs, 'a.txt', 'a\n', 'Theirs');
    git(theirs, 'push', '-q', 'origin', 'main');
    commit(mine, 'b.txt', 'b\n', 'Mine only');
    const { u } = make();
    const s = await u.check();
    expect(s.phase).toBe('unsupported');
    expect(s.error).toMatch(/commits of its own/);
  });

  it('does nothing on a branch that follows nothing on GitHub', async () => {
    git(mine, 'checkout', '-q', '-b', 'local-only');
    const { u } = make();
    const s = await u.check();
    expect(s.phase).toBe('unsupported');
    expect(s.error).toMatch(/does not follow a branch/);
  });

  it('does nothing in a folder that is not a git checkout', async () => {
    const bare = path.join(tmp, 'not-a-repo');
    fs.mkdirSync(bare);
    const { u } = make({ appDir: bare });
    const s = await u.check();
    expect(s.phase).toBe('unsupported');
  });

  it('is silent when GitHub cannot be reached: an error, never a row', async () => {
    git(mine, 'remote', 'set-url', 'origin', path.join(tmp, 'gone.git'));
    const { u } = make();
    const s = await u.check();
    expect(s.phase).toBe('error');
    expect(s.ready).toBe(false);
  });
});

describe('the restart', () => {
  it('fast-forwards, rebuilds the screens and relaunches, without reinstalling packages that did not change', async () => {
    commit(theirs, 'a.txt', 'a\n', 'New');
    git(theirs, 'push', '-q', 'origin', 'main');
    const { npm, calls } = fakeNpm();
    const { u, relaunched } = make({ npm });
    await u.check();
    expect(u.install()).toBe(true);
    expect(u.state().phase).toBe('installing');
    await u.settled();
    expect(git(mine, 'rev-parse', 'HEAD')).toBe(git(theirs, 'rev-parse', 'HEAD'));
    expect(calls).toEqual(['run build']);
    expect(relaunched).toHaveLength(1);
  });

  it('reinstalls packages first when the lockfile changed', async () => {
    commit(theirs, 'package-lock.json', '{"v":2}\n', 'Bump a package');
    git(theirs, 'push', '-q', 'origin', 'main');
    const { npm, calls } = fakeNpm();
    const { u, relaunched } = make({ npm });
    await u.check();
    u.install();
    await u.settled();
    expect(calls).toEqual(['install --no-audit --no-fund', 'run build']);
    expect(relaunched).toHaveLength(1);
  });

  it('does not restart when the build fails, says why, and pressing again retries', async () => {
    commit(theirs, 'a.txt', 'a\n', 'New');
    git(theirs, 'push', '-q', 'origin', 'main');
    const failing = fakeNpm({ failBuild: true });
    let npm = failing.npm;
    const { u, relaunched } = make({ npm: (args) => npm(args) });
    await u.check();
    u.install();
    await u.settled();
    expect(relaunched).toHaveLength(0);
    const s = u.state();
    expect(s.phase).toBe('ready');
    expect(s.error).toMatch(/would not build: error during build: vite: build failed$/);

    const working = fakeNpm();
    npm = working.npm;
    expect(u.install()).toBe(true);
    await u.settled();
    expect(working.calls).toEqual(['run build']);
    expect(relaunched).toHaveLength(1);
  });

  it('refuses to start when nothing is ready', async () => {
    const { npm, calls } = fakeNpm();
    const { u, relaunched } = make({ npm });
    await u.check();
    expect(u.install()).toBe(false);
    await u.settled();
    expect(calls).toEqual([]);
    expect(relaunched).toHaveLength(0);
  });

  it('refuses to pull over edits made after the row appeared', async () => {
    commit(theirs, 'a.txt', 'a\n', 'New');
    git(theirs, 'push', '-q', 'origin', 'main');
    const { npm, calls } = fakeNpm();
    const { u, relaunched } = make({ npm });
    await u.check();
    fs.writeFileSync(path.join(mine, 'package-lock.json'), '{"edited":true}\n');
    u.install();
    await u.settled();
    expect(calls).toEqual([]);
    expect(relaunched).toHaveLength(0);
    expect(fs.readFileSync(path.join(mine, 'package-lock.json'), 'utf8')).toBe('{"edited":true}\n');
    expect(u.state().ready).toBe(false);
  });
});

describe('what the sidebar is told for a copy run from source', () => {
  const ready = {
    phase: 'ready', ready: true, source: true, currentVersion: 'abc1234', newVersion: 'def5678',
    changes: ['The inbox reads faster', 'Fix the sign-in page'], behind: 2, readyAt: 1, error: null,
  };

  it('keeps the card up while it rebuilds, so pressing Restart does not look like nothing happened', () => {
    const installing = { ...ready, phase: 'installing', ready: false, installing: true };
    expect(announcesUpdate(installing, { walking: false, closed: '' })).toBe(true);
    expect(SAY.installing).toMatch(/Updating/);
  });

  it('carries a failed restart back to the card, which says it and offers the button again', () => {
    const html = renderToStaticMarkup(createElement(SidebarUpdate, {
      collapsed: false, installing: false, error: 'The new code would not build: boom', onRestart() {},
    }));
    expect(html).toContain('would not build: boom');
    expect(html).toContain('Restart to update');
  });

  it('still shows nothing when there is nothing to install', () => {
    expect(announcesUpdate({ phase: 'current', ready: false }, { walking: false, closed: '' })).toBe(false);
    expect(announcesUpdate({ phase: 'error', ready: false, error: 'x' }, { walking: false, closed: '' })).toBe(false);
  });
});

describe('the app picks it', () => {
  it('uses the source updater when it is not an installed app', () => {
    const main = fs.readFileSync(path.join(import.meta.dirname, '..', 'main', 'main.mjs'), 'utf8');
    expect(main).toMatch(/app\.isPackaged\s*\?\s*createUpdater\(/);
    expect(main).toContain('createSourceUpdater(');
  });
});
