// A Codex worker's sandbox protects its task folder's own .git and nothing
// below it, so the private checkout's .claude/skills/.git is writable from
// inside. The ship then ran plain git there, on the Mac and outside the
// sandbox: a `core.fsmonitor` the worker wrote into that config ran as the
// person when its branch shipped, with no click (reproduced 2026-11-19 by
// calling pushPrivateFolder on dummy repos). The ship now trusts that folder's
// git only when it is the app folder's copy as given.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pushPrivateFolder } from '../scripts/lib/private-folder.mjs';
import { plantedIn } from '../scripts/lib/private-folder-check.mjs';

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const env = { ...process.env, GIT_AUTHOR_NAME: 'Someone', GIT_AUTHOR_EMAIL: 'someone@example.com', GIT_COMMITTER_NAME: 'Someone', GIT_COMMITTER_EMAIL: 'someone@example.com' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (file: string, text: string) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const hook = (file: string, marker: string) => { put(file, `#!/bin/sh\ntouch '${marker}'\n`); fs.chmodSync(file, 0o755); };

// The app folder with its private checkout, and a task folder given a copy of it.
function world() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'private-planted-'));
  made.push(dir);
  const remote = path.join(dir, 'private.git');
  const seed = path.join(dir, 'seed');
  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'clone', '-q', remote, seed);
  put(path.join(seed, 'unslop/SKILL.md'), 'one\n');
  git(seed, 'add', '-A');
  git(seed, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first');
  git(seed, 'push', '-q', 'origin', 'HEAD:main');
  const named = JSON.stringify({ path: '.claude/skills', url: remote });
  const app = path.join(dir, 'app');
  put(path.join(app, '.agentbox/private.json'), named);
  fs.symlinkSync(path.resolve(import.meta.dirname, '..', 'scripts'), path.join(app, 'scripts'));
  git(dir, 'clone', '-q', remote, path.join(app, '.claude/skills'));
  git(path.join(app, '.claude/skills'), 'config', 'commit.gpgsign', 'false');
  const folder = path.join(dir, 'task');
  put(path.join(folder, '.agentbox/private.json'), named);
  fs.cpSync(path.join(app, '.claude/skills'), path.join(folder, '.claude/skills'), { recursive: true, verbatimSymlinks: true });
  const at = path.join(folder, '.claude/skills');
  put(path.join(at, 'unslop/SKILL.md'), 'two\n');
  return { dir, remote, app, folder, at, marker: path.join(dir, 'RAN') };
}

const ship = (w: ReturnType<typeof world>) => pushPrivateFolder(w.folder, { message: 'Changes from agentbox/w-1', env, trusted: w.app });
const pushedAnything = (w: ReturnType<typeof world>) => git(w.remote, 'log', '--format=%s', 'main') !== 'first';

describe('a ship and a private folder a worker could write', () => {
  it('pushes the edit from a copy left as it was given', () => {
    const w = world();
    expect(ship(w)).toMatchObject({ pushed: true, commits: 1 });
    expect(git(w.remote, 'show', 'main:unslop/SKILL.md')).toBe('two');
  });

  it('pushes when the app folder has the same hook as the copy', () => {
    const w = world();
    hook(path.join(w.app, '.claude/skills/.git/hooks/pre-commit'), path.join(w.dir, 'own-hook'));
    hook(path.join(w.at, '.git/hooks/pre-commit'), path.join(w.dir, 'own-hook'));
    expect(ship(w)).toMatchObject({ pushed: true });
  });

  it('runs no command a worker wrote into its git settings', () => {
    const w = world();
    git(w.at, 'config', 'core.fsmonitor', `touch '${w.marker}'; false`);
    const r = ship(w);
    expect(fs.existsSync(w.marker)).toBe(false);
    expect(r.pushed).toBe(false);
    expect(r.why).toMatch(/git settings/);
    expect(pushedAnything(w)).toBe(false);
  });

  it('runs no hook a worker added', () => {
    const w = world();
    hook(path.join(w.at, '.git/hooks/pre-commit'), w.marker);
    expect(ship(w).pushed).toBe(false);
    expect(fs.existsSync(w.marker)).toBe(false);
  });

  it('runs no hook a worker put in place of one the app folder has', () => {
    const w = world();
    hook(path.join(w.app, '.claude/skills/.git/hooks/pre-commit'), path.join(w.dir, 'own-hook'));
    hook(path.join(w.at, '.git/hooks/pre-commit'), w.marker);
    expect(ship(w).pushed).toBe(false);
    expect(fs.existsSync(w.marker)).toBe(false);
  });

  it('runs nothing from a repository a worker nested inside it', () => {
    const w = world();
    const inner = path.join(w.at, 'inner');
    git(w.at, 'init', '-q', inner);
    put(path.join(inner, 'x.md'), 'x\n');
    git(inner, 'add', '-A');
    git(inner, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'x');
    git(w.at, 'add', 'inner');
    git(inner, 'config', 'core.fsmonitor', `touch '${w.marker}'; false`);
    put(path.join(inner, 'x.md'), 'changed\n');
    expect(ship(w).pushed).toBe(false);
    expect(fs.existsSync(w.marker)).toBe(false);
  });

  // A Mac's and a Windows disk open `.GIT` when git asks for `.git`, so a nested
  // repository under any spelling of the name is still one (security review, 2026-11-21).
  it('sees a nested repository whatever case its .git is spelt in', () => {
    for (const name of ['.GIT', '.Git', 'GIT~1', '.git.']) {
      const w = world();
      fs.mkdirSync(path.join(w.at, 'inner', name), { recursive: true });
      expect(plantedIn(w.at, path.join(w.app, '.claude/skills')), name).toMatch(/repository of its own at inner/);
    }
    const w = world();
    fs.mkdirSync(path.join(w.at, 'inner', 'git'), { recursive: true });
    expect(plantedIn(w.at, path.join(w.app, '.claude/skills'))).toBeNull();
  });

  it('follows no .git file a worker pointed somewhere else', () => {
    const w = world();
    const elsewhere = path.join(w.dir, 'elsewhere.git');
    fs.renameSync(path.join(w.at, '.git'), elsewhere);
    git(w.dir, '--git-dir', elsewhere, 'config', 'core.fsmonitor', `touch '${w.marker}'; false`);
    fs.writeFileSync(path.join(w.at, '.git'), `gitdir: ${elsewhere}\n`);
    expect(ship(w).pushed).toBe(false);
    expect(fs.existsSync(w.marker)).toBe(false);
  });

  it('reads no settings from a common folder a worker named', () => {
    const w = world();
    const common = path.join(w.dir, 'common');
    fs.cpSync(path.join(w.at, '.git'), common, { recursive: true });
    git(w.dir, '--git-dir', common, 'config', 'core.fsmonitor', `touch '${w.marker}'; false`);
    fs.writeFileSync(path.join(w.at, '.git/commondir'), `${common}\n`);
    expect(ship(w).pushed).toBe(false);
    expect(fs.existsSync(w.marker)).toBe(false);
  });

  // A sparse checkout in the app folder's copy writes config.worktree there, so the worker's may hold anything.
  it('reads no worktree settings that differ from the app folder\'s', () => {
    const w = world();
    for (const at of [path.join(w.app, '.claude/skills'), w.at]) git(at, 'config', 'extensions.worktreeConfig', 'true');
    put(path.join(w.app, '.claude/skills/.git/config.worktree'), '[core]\n\tsparseCheckout = false\n');
    put(path.join(w.at, '.git/config.worktree'), `[core]\n\tfsmonitor = touch '${w.marker}'; false\n`);
    expect(ship(w).pushed).toBe(false);
    expect(fs.existsSync(w.marker)).toBe(false);
  });

  it('pushes nothing when the app folder has no private checkout to compare with', () => {
    const w = world();
    fs.rmSync(path.join(w.app, '.claude/skills'), { recursive: true, force: true });
    const r = ship(w);
    expect(r.pushed).toBe(false);
    expect(pushedAnything(w)).toBe(false);
  });
});

describe('the ship script', () => {
  it('compares the private folder with the checkout it runs from', () => {
    const text = fs.readFileSync(path.join(import.meta.dirname, '../scripts/ship.mjs'), 'utf8');
    expect(text).toMatch(/pushPrivateFolder\(root, \{.*\btrusted: path\.resolve\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\), '\.\.'\)/);
  });
});
