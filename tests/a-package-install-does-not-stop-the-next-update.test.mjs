// A PACKAGE INSTALL DOES NOT STOP THE NEXT UPDATE.
//
// Reported 2026-10-07: lots of changes had landed on main and the sidebar
// never offered "New version ready, Restart". Measured on the team app folder:
// the updater's own restart fast-forwarded at 20:46:04, then ran
// `npm install` because package.json had moved, and at 20:46:05 that install
// rewrote package-lock.json (this npm drops the `libc` lines). `git status`
// showed it changed, so every check after read the folder as "changes of your
// own" and offered nothing, 21 commits behind and counting. The same trap the
// generated files were (a-build-does-not-stop-the-next-update.test.mjs), one
// file over.
//
// The lockfile is npm's to rewrite, not an edit of hers. It does not block an
// update, it is put back before the fast-forward, and it is put back after the
// updater's own install so the folder is left clean. An edit to package.json,
// or to any other tracked file, still blocks.

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
let mine;
let theirs;

function commit(cwd, file, text, message) {
  fs.mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
}

const push = () => git(theirs, 'push', '-q', 'origin', 'main');
const LOCK = 'package-lock.json';
const REWRITTEN = '{"v":1,"libc":"dropped by this npm"}\n';

// An install that does what the real one did: rewrites the lockfile.
function rewritingNpm() {
  const calls = [];
  const npm = async (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'install') fs.writeFileSync(path.join(mine, LOCK), REWRITTEN);
    return { code: 0, out: '' };
  };
  return { npm, calls };
}

function make(npm) {
  const relaunched = [];
  const u = createSourceUpdater({
    appDir: mine,
    log: { info() {}, warn() {}, error() {} },
    npm,
    relaunch: () => relaunched.push(true),
  });
  return { u, relaunched };
}

async function restarted(relaunched) {
  // Waits for the restart rather than a fixed time: real git, on a busy Mac.
  for (let i = 0; i < 100 && !relaunched.length; i += 1) await new Promise((r) => setTimeout(r, 100));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-updater-lock-'));
  const origin = path.join(tmp, 'origin.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(tmp, 'seed');
  git(tmp, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, 'package.json', '{"name":"a","v":1}\n', 'First');
  commit(seed, LOCK, '{"v":1}\n', 'Lock');
  git(seed, 'push', '-q', 'origin', 'main');
  mine = path.join(tmp, 'mine');
  theirs = path.join(tmp, 'theirs');
  git(tmp, 'clone', '-q', origin, mine);
  git(tmp, 'clone', '-q', origin, theirs);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('a lockfile npm rewrote', () => {
  it('does not stop an update being offered (the reported case)', async () => {
    commit(theirs, 'a.txt', 'a\n', 'New');
    push();
    fs.writeFileSync(path.join(mine, LOCK), REWRITTEN);
    const { u } = make(rewritingNpm().npm);
    const s = await u.check();
    expect(s.phase).toBe('ready');
    expect(s.error ?? null).toBe(null);
  });

  it('is put back and the update goes through, even when the new code changes the lockfile too', async () => {
    commit(theirs, LOCK, '{"v":2}\n', 'Newer lock upstream');
    push();
    fs.writeFileSync(path.join(mine, LOCK), REWRITTEN);
    const { u, relaunched } = make(rewritingNpm().npm);
    await u.check();
    u.install();
    await restarted(relaunched);
    expect(git(mine, 'rev-parse', 'HEAD')).toBe(git(theirs, 'rev-parse', 'HEAD'));
    expect(relaunched).toEqual([true]);
  });

  it('is left clean after the updater\'s own install, so the next update is offered too', async () => {
    commit(theirs, 'package.json', '{"name":"a","v":2}\n', 'New dependency');
    push();
    const { npm, calls } = rewritingNpm();
    const { u, relaunched } = make(npm);
    await u.check();
    u.install();
    await restarted(relaunched);
    expect(calls).toContain('install --no-audit --no-fund');
    expect(git(mine, 'status', '--porcelain', '--untracked-files=no')).toBe('');
  });
});

describe('what still blocks', () => {
  it('an edit to package.json', async () => {
    commit(theirs, 'a.txt', 'a\n', 'New');
    push();
    fs.writeFileSync(path.join(mine, 'package.json'), '{"name":"a","v":1,"mine":true}\n');
    fs.writeFileSync(path.join(mine, LOCK), REWRITTEN);
    const { u } = make(rewritingNpm().npm);
    expect((await u.check()).phase).toBe('unsupported');
  });

  it('a lockfile anywhere but the top of the folder', async () => {
    commit(theirs, 'tools/package-lock.json', '{"v":1}\n', 'A lock of its own');
    push();
    git(mine, 'pull', '-q', '--ff-only');
    commit(theirs, 'a.txt', 'a\n', 'New');
    push();
    fs.writeFileSync(path.join(mine, 'tools', 'package-lock.json'), '{"edited":true}\n');
    const { u } = make(rewritingNpm().npm);
    expect((await u.check()).phase).toBe('unsupported');
  });
});
