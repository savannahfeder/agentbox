// A SHIP WHOSE PUSH WENT THROUGH IS SHIPPED, WHATEVER CAME AFTER IT.
//
// What broke (w-40a35411e8, 2026-11-23): a thread's branch was pushed to main,
// and after the push the ship put the web app up, which printed a Cloudflare
// error. The ship then ended non-zero, so the app told the person "It did not
// ship" with that error, took the ship label off, and told the agent "Nothing
// was pushed". The work was on main the whole time.
//
// The app now reads the ship's own "shipped <sha>" line and asks git whether
// that commit is on main before it believes the exit code. Both are needed: a
// test run inside the push can print anything, so the line alone is not proof.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SHIP_LABEL, ShipQueue, pushedToMain } from '../main/ship-queue.mts';

const PUSHED_THEN_DEPLOY_FAILED = [
  'ship: pushing to origin main (attempt 1 of 3). The hook runs the tests and the public check now.',
  ' Test Files  12 passed (12)',
  'ship: shipped abc1234.',
  'ship: the web app changed with this ship. Building it and putting it up.',
  '✘ [ERROR] A request to the Cloudflare API (/accounts/0000/pages/projects) failed.',
].join('\n');
const RED = [
  'ship: pushing to origin main (attempt 1 of 3). The hook runs the tests and the public check now.',
  '❯ tests/one-thing-works.test.mts (3 tests | 1 failed) 40ms',
  "   → expected 'ship: shipped abc1234.' to be 'x'",
  'ship: that push was refused rather than raced, so nothing was retried. The reason is above.',
].join('\n');

let tmp: string; let repo: string; let userDir: string; let folders: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-pushed-'));
  repo = path.join(tmp, 'repo');
  userDir = path.join(tmp, 'user');
  folders = path.join(tmp, 'folders');
  fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ team: { script: 'scripts/ship.mjs' } }));
  fs.mkdirSync(path.join(folders, 'w-a'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const products = () => [{ slug: 'team', repoPath: repo }];
const row = () => ({ id: 'w-a', product: 'team', status: 'open', labels: [SHIP_LABEL], updatedAt: 1000, wrote: { labels: { ts: 1000 } } });

function queue(out: string, code: number, onMain: (sha: string) => boolean) {
  const calls: unknown[][] = [];
  const handed: string[] = [];
  const asked: string[] = [];
  const q = new ShipQueue({
    store: { shipped: (...a: unknown[]) => calls.push(['shipped', ...a]), shipFailed: (...a: unknown[]) => calls.push(['shipFailed', ...a]) },
    userDir,
    folderFor: (item) => path.join(folders, item.id),
    isLive: () => false,
    handBack: (_i, reply) => handed.push(reply),
    run: async () => ({ code, out }),
    pushed: async (_cwd, sha) => { asked.push(sha); return onMain(sha); },
  });
  return { calls, handed, asked, tick: () => q.tick([row()], products()) };
}

describe('a ship that pushed and then ended non-zero', () => {
  it('is recorded as shipped with its commit, and nobody is told it failed', async () => {
    const s = queue(PUSHED_THEN_DEPLOY_FAILED, 1, () => true);
    await s.tick();
    expect(s.asked).toEqual(['abc1234']);
    expect(s.calls.map((c) => c[0])).toEqual(['shipped']);
    expect(s.calls[0][3]).toMatchObject({ sha: 'abc1234' });
    expect(s.handed).toEqual([]);
  });

  it('still fails when git does not have that commit on main', async () => {
    const s = queue(PUSHED_THEN_DEPLOY_FAILED, 1, () => false);
    await s.tick();
    expect(s.calls.map((c) => c[0])).toEqual(['shipFailed']);
    expect(s.handed).toHaveLength(1);
  });
});

describe('a ship that went red', () => {
  it('fails as before, even when a test quotes a shipped line, and git is not asked', async () => {
    const s = queue(RED, 1, () => true);
    await s.tick();
    expect(s.asked).toEqual([]);
    expect(s.calls.map((c) => c[0])).toEqual(['shipFailed']);
  });
});

describe('asking git whether a commit is on main', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let clone: string; let pushed: string; let local: string;
  beforeEach(() => {
    const origin = path.join(tmp, 'origin.git');
    git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
    clone = path.join(tmp, 'clone');
    git(tmp, 'clone', '-q', origin, clone);
    const commit = (msg: string) => git(clone, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', msg);
    commit('one');
    git(clone, 'push', '-q', 'origin', 'HEAD:main');
    pushed = git(clone, 'rev-parse', '--short', 'HEAD');
    commit('two');
    local = git(clone, 'rev-parse', '--short', 'HEAD');
  });

  it('says yes for a commit the push put on main', async () => {
    expect(await pushedToMain(clone, pushed)).toBe(true);
  });

  it('says no for a commit only this branch has', async () => {
    expect(await pushedToMain(clone, local)).toBe(false);
  });

  it('says no for a folder that is not a checkout', async () => {
    expect(await pushedToMain(path.join(folders, 'w-a'), pushed)).toBe(false);
  });
});
