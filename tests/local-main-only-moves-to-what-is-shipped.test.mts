// LOCAL main ONLY EVER MOVES TO SOMETHING THAT IS ON THE PUBLIC main.
//
// WHAT HAPPENED, 2026-10-01. The app folder was found one commit ahead of the
// public repository: e13b06b sat on its local main and nowhere else, so the app
// was running code that no push had ever carried and that nobody else could
// get. The two guards that already exist did not catch it, and could not:
// pre-commit refuses a COMMIT in the primary worktree, pre-merge-commit refuses
// a MERGE COMMIT there, and this was neither. A fast-forward moves a ref and
// writes no commit, so `git merge --ff-only <some branch>` in that folder walks
// past both hooks in silence. That is also exactly what the old instructions
// told agents to do.
//
// The rule that closes it is about the REF, not about which checkout you are
// standing in: refs/heads/main may only ever point at a commit that is already
// on refs/remotes/origin/main. Fast-forwarding to a fetched origin/main is the
// one way it moves. Shipping is `npm run ship`, which pushes and then lets the
// folder fast-forward to what came back.
//
// WHAT MUST NOT BREAK, and each one is a test below: a repository with no
// origin at all (a fresh clone, a fork, a tarball) has nothing to compare
// against and is left alone entirely; branches that are not main are nobody's
// business; a fetch writes refs/remotes/* and must never be refused; and there
// is a way through for a person who knows better, because a guard with no
// escape hatch gets turned off wholesale the first time it is wrong.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOOKS = ['reference-transaction', 'pre-commit', 'pre-merge-commit', 'post-checkout'];

let root;
const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tried = (cwd, env, ...args) => {
  try {
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    return { ok: true, err: '' };
  } catch (e) {
    return { ok: false, err: `${e.stderr ?? ''}${e.stdout ?? ''}` };
  }
};
const mainOf = (cwd) => git(cwd, 'rev-parse', 'refs/heads/main');

/** A repository with the real hooks installed, and a bare "public" one it fetches from. */
function build() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-guard-'));
  const hooks = path.join(dir, 'hooks');
  fs.mkdirSync(hooks);
  for (const h of HOOKS) {
    const from = path.join(REPO, 'scripts', 'hooks', h);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(hooks, h));
    if (fs.existsSync(path.join(hooks, h))) fs.chmodSync(path.join(hooks, h), 0o755);
  }
  const bare = path.join(dir, 'public.git');
  execFileSync('git', ['init', '--bare', '-b', 'main', bare], { stdio: 'ignore' });
  const work = path.join(dir, 'work');
  execFileSync('git', ['init', '-b', 'main', work], { stdio: 'ignore' });
  git(work, 'config', 'user.email', 'nobody@example.test');
  git(work, 'config', 'user.name', 'Nobody');
  git(work, 'config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(work, 'a.txt'), 'one\n');
  git(work, 'add', '-A');
  git(work, '-c', 'core.hooksPath=', 'commit', '-m', 'one');
  git(work, 'remote', 'add', 'origin', bare);
  git(work, 'push', 'origin', 'main');
  git(work, 'fetch', 'origin');
  // The hooks go on only now, so building the fixture is not itself a test of them.
  git(work, 'config', 'core.hooksPath', hooks);
  return { dir, work, bare, hooks };
}

/** A commit that exists only here, which is what an unshipped branch is. */
function commitOnABranch(work, name) {
  git(work, '-c', 'core.hooksPath=', 'checkout', '-q', '-b', name);
  fs.writeFileSync(path.join(work, `${name.replace(/[^a-z0-9]/gi, '-')}.txt`), 'work\n');
  git(work, 'add', '-A');
  git(work, '-c', 'core.hooksPath=', 'commit', '-m', `work on ${name}`);
  const sha = git(work, 'rev-parse', 'HEAD');
  git(work, '-c', 'core.hooksPath=', 'checkout', '-q', 'main');
  return sha;
}

let fixture;
beforeEach(() => { fixture = build(); root = fixture.dir; });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('moving local main', () => {
  it('refuses a fast-forward to a commit that was never pushed, which is how the app folder got ahead', () => {
    const was = mainOf(fixture.work);
    const unshipped = commitOnABranch(fixture.work, 'agentbox/w-1');
    const out = tried(fixture.work, {}, 'merge', '--ff-only', 'agentbox/w-1');
    expect(out.ok).toBe(false);
    expect(mainOf(fixture.work)).toBe(was);
    expect(out.err).toMatch(/npm run ship/);
    expect(unshipped).not.toBe(mainOf(fixture.work));
  });

  it('allows the fast-forward once that very commit is on the public main', () => {
    const unshipped = commitOnABranch(fixture.work, 'agentbox/w-2');
    git(fixture.work, 'push', 'origin', 'agentbox/w-2:main');
    git(fixture.work, 'fetch', 'origin');
    const out = tried(fixture.work, {}, 'merge', '--ff-only', 'agentbox/w-2');
    expect(out.ok).toBe(true);
    expect(mainOf(fixture.work)).toBe(unshipped);
  });

  it('refuses a commit made straight onto main in a worktree, not only a fast-forward', () => {
    const work2 = path.join(fixture.dir, 'wt');
    // -f because main is checked out in the primary too, which is the real shape:
    // a worktree standing on the same branch the app folder is standing on.
    git(fixture.work, '-c', 'core.hooksPath=', 'worktree', 'add', '-q', '-f', work2, 'main');
    fs.writeFileSync(path.join(work2, 'b.txt'), 'two\n');
    git(work2, 'add', '-A');
    const out = tried(work2, {}, 'commit', '-m', 'straight onto main');
    expect(out.ok).toBe(false);
  });

  it('lets a person through who says so, because a guard with no way past it gets deleted', () => {
    const unshipped = commitOnABranch(fixture.work, 'agentbox/w-3');
    const out = tried(fixture.work, { AGENTBOX_MOVE_MAIN: '1' }, 'merge', '--ff-only', 'agentbox/w-3');
    expect(out.ok).toBe(true);
    expect(mainOf(fixture.work)).toBe(unshipped);
  });
});

describe('what the guard must never touch', () => {
  it('leaves every branch that is not main alone', () => {
    const sha = commitOnABranch(fixture.work, 'agentbox/w-4');
    const out = tried(fixture.work, {}, 'branch', '-f', 'some-other-branch', sha);
    expect(out.ok).toBe(true);
    expect(git(fixture.work, 'rev-parse', 'refs/heads/some-other-branch')).toBe(sha);
  });

  it('never refuses a fetch, which writes refs/remotes and nothing else', () => {
    commitOnABranch(fixture.work, 'agentbox/w-5');
    git(fixture.work, 'push', 'origin', 'agentbox/w-5');
    expect(tried(fixture.work, {}, 'fetch', 'origin').ok).toBe(true);
    expect(tried(fixture.work, {}, 'fetch', '--prune', 'origin').ok).toBe(true);
  });

  it('leaves a repository with no origin/main completely alone, so a fresh clone or a fork still works', () => {
    const lone = path.join(fixture.dir, 'lone');
    execFileSync('git', ['init', '-b', 'main', lone], { stdio: 'ignore' });
    git(lone, 'config', 'user.email', 'nobody@example.test');
    git(lone, 'config', 'user.name', 'Nobody');
    git(lone, 'config', 'commit.gpgsign', 'false');
    git(lone, 'config', 'core.hooksPath', fixture.hooks);
    fs.writeFileSync(path.join(lone, 'a.txt'), 'one\n');
    git(lone, 'add', '-A');
    // --no-verify because pre-commit guards a primary worktree whatever the
    // remote is; this is about the ref guard, which has no way past it.
    const out = tried(lone, {}, 'commit', '--no-verify', '-m', 'the first commit anywhere');
    expect(out.ok).toBe(true);
  });
});
