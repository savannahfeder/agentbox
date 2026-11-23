// Daily security review, 2026-11-17. A cloud run that ends on "merging into
// main" is merged and pushed by the app itself (main/cloud/merge-home.mts). In a
// project whose core.hooksPath is relative (husky v9 sets `.husky/_`), git looks
// for hooks in the tree it runs in, and after the merge the project's own
// checkout holds the cloud agent's tree. Measured on dummy repos with the real
// mergeHome: post-index-change, reference-transaction and post-merge ran on the
// merge, pre-merge-commit, prepare-commit-msg and commit-msg on a real merge,
// pre-push on the push, all from files the agent committed, and the push landed.
// The 2026-11-16 audit fix took hooks off the app's other git in task folders but
// missed this file.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeHome } from '../main/cloud/merge-home.mts';

const HOOKS = ['post-index-change', 'reference-transaction', 'post-merge', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg', 'post-checkout', 'pre-push'];
const ENV = { GIT_AUTHOR_NAME: 'A', GIT_AUTHOR_EMAIL: 'a@b.c', GIT_COMMITTER_NAME: 'A', GIT_COMMITTER_EMAIL: 'a@b.c' };
Object.assign(process.env, ENV);

let root = '';
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); root = ''; });

const g = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, env: { ...process.env, ...ENV }, encoding: 'utf8' }).trim();
const writeHook = (file: string, name: string, marker: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/sh\necho "${name}" >> "${marker}"\n`, { mode: 0o755 });
};

/** A project published to a bare remote, a thread folder whose branch carries `agentHooks`, and main moved on when `diverged`. */
function project({ hooksPath, agentHooks, diverged = false }: { hooksPath: string | null; agentHooks: string; diverged?: boolean }) {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-home-hooks-'));
  const marker = path.join(root, 'marker.log');
  const remote = path.join(root, 'remote.git');
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  const base = path.join(root, 'project');
  g(root, 'clone', '-q', remote, base);
  g(base, 'checkout', '-q', '-b', 'main');
  if (hooksPath) g(base, 'config', 'core.hooksPath', hooksPath.replace('<base>', base));
  fs.writeFileSync(path.join(base, 'a.txt'), 'a\n');
  g(base, 'add', '.'); g(base, 'commit', '-qm', 'seed'); g(base, 'push', '-q', '-u', 'origin', 'main');
  fs.appendFileSync(path.join(base, '.git', 'info', 'exclude'), '.claude/worktrees/\n');
  const task = path.join(base, '.claude', 'worktrees', 'w-1');
  g(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-1', task);
  for (const h of HOOKS) writeHook(path.join(task, agentHooks, h), h, marker);
  g(task, 'add', '-f', agentHooks);
  fs.writeFileSync(path.join(task, 'b.txt'), 'cloud work\n'); g(task, 'add', 'b.txt');
  g(task, 'commit', '-qm', 'cloud work');
  if (diverged) { fs.writeFileSync(path.join(base, 'c.txt'), 'c\n'); g(base, 'add', 'c.txt'); g(base, 'commit', '-qm', 'main moved'); g(base, 'push', '-q'); }
  // A stale index makes git status rewrite it, which is what fires post-index-change.
  const old = new Date('2001-01-01T00:00:00Z');
  fs.utimesSync(path.join(task, 'a.txt'), old, old);
  return { base, task, remote, marker };
}
const ran = (marker: string) => (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean) : []);
const onRemote = (remote: string) => g(remote, 'ls-tree', '--name-only', 'main').split('\n');

describe("a cloud merge into main runs no hook the agent committed", () => {
  it('a fast-forward merge and its push run none of the hooks under a relative hooks path, and the push lands', async () => {
    const p = project({ hooksPath: '.husky/_', agentHooks: '.husky/_' });
    const r = await mergeHome(p.task);
    expect(r).toMatchObject({ ok: true, commits: 1, pushedTo: 'origin' });
    expect(ran(p.marker)).toEqual([]);
    expect(onRemote(p.remote)).toContain('b.txt');
  });

  it('a real merge commit runs none of them either', async () => {
    const p = project({ hooksPath: '.husky/_', agentHooks: '.husky/_', diverged: true });
    const r = await mergeHome(p.task);
    expect(r).toMatchObject({ ok: true, pushedTo: 'origin' });
    expect(ran(p.marker)).toEqual([]);
    expect(onRemote(p.remote)).toEqual(expect.arrayContaining(['b.txt', 'c.txt']));
  });

  it('an absolute hooks path that points inside the working tree is the tree, so its hooks do not run', async () => {
    const p = project({ hooksPath: '<base>/scripts/hooks', agentHooks: 'scripts/hooks' });
    const r = await mergeHome(p.task);
    expect(r).toMatchObject({ ok: true, pushedTo: 'origin' });
    expect(ran(p.marker)).toEqual([]);
  });

  it("the project's own pre-push hook in .git/hooks, which no branch can write, still gates the push", async () => {
    const p = project({ hooksPath: null, agentHooks: '.husky/_' });
    const own = path.join(p.base, '.git', 'hooks', 'pre-push');
    fs.writeFileSync(own, `#!/bin/sh\necho "own pre-push" >> "${p.marker}"\nexit 1\n`, { mode: 0o755 });
    const r = await mergeHome(p.task);
    expect(ran(p.marker)).toEqual(['own pre-push']);
    expect(r).toMatchObject({ ok: false, merged: true });
    expect(onRemote(p.remote)).not.toContain('b.txt');
  });
});
