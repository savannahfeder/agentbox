// A run that merged main in was credited with everything main brought.
//
// The change card diffed the checkout against the commit the run started on.
// A run that ran `npm run ship` (or merged main by hand) mid-way then showed
// main's whole history since its branch was cut as its own work: one thread
// read "2836 files +197,648 -195,852" for a run that changed a handful of lines,
// because main had renamed the back end from .mjs to .mts in the meantime.
// Measured by building that shape here: a branch, main moving underneath, the
// run merging it in.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotRepo, changeFromRepo } from '../main/git-change.mts';

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });
const lines = (n: number, word = 'line'): string => Array.from({ length: n }, (_, i) => `${word} ${i + 1}`).join('\n') + '\n';

describe('a run that merges main in shows only its own change', () => {
  let dir: string;
  const write = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  const edit = (rel: string, from: string, to: string): void => {
    const file = path.join(dir, rel);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(from, to));
  };
  const commit = (msg: string): void => { git(dir, 'add', '-A'); git(dir, 'commit', '-qm', msg); };

  // Main moves on: a big rename and a line in the file the run also works in.
  const mainMoves = (): void => {
    git(dir, 'checkout', '-q', 'main');
    for (let i = 0; i < 40; i++) { git(dir, 'mv', `lib/f${i}.mjs`, `lib/f${i}.mts`); edit(`lib/f${i}.mts`, 'line 1\n', 'typed 1\n'); }
    edit('app.mts', 'line 20\n', 'main changed 20\n');
    write('main-only.mts', lines(300, 'main'));
    commit('main moves on');
    git(dir, 'checkout', '-q', 'agentbox/w-1');
  };

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-merge-')));
    git(dir, 'init', '-q', '-b', 'main', '.');
    git(dir, 'config', 'user.email', 'agent@agentbox.local');
    git(dir, 'config', 'user.name', 'Agentbox');
    write('app.mts', lines(30));
    for (let i = 0; i < 40; i++) write(`lib/f${i}.mjs`, lines(10));
    commit('base');
    git(dir, 'checkout', '-q', '-b', 'agentbox/w-1');
  });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

  const added = (change: ReturnType<typeof changeFromRepo>, rel: string): string[] =>
    (change.files.find((f) => f.path === rel)?.hunks ?? []).flatMap((h) => h.rows).filter((r) => r[0] === '+').map((r) => r[1]);

  it('leaves out what a merge of main brought, and keeps what the run wrote', () => {
    const before = snapshotRepo(dir);
    edit('app.mts', 'line 3\n', 'mine 3\n');
    commit('my change');
    mainMoves();
    git(dir, 'merge', '-q', '--no-edit', 'main');
    edit('app.mts', 'line 28\n', 'mine 28\n');

    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['app.mts']);
    expect(added(change, 'app.mts')).toEqual(['mine 3', 'mine 28']);
    expect(change.plus).toBe(2);
    expect(change.minus).toBe(2);
  });

  it('leaves out main even when the merge had a conflict the run resolved', () => {
    const before = snapshotRepo(dir);
    edit('app.mts', 'line 20\n', 'mine 20\n');
    edit('app.mts', 'line 5\n', 'mine 5\n');
    commit('my change');
    mainMoves();
    try { git(dir, 'merge', '-q', '--no-edit', 'main'); } catch { /* the conflict is the point */ }
    const conflicted = fs.readFileSync(path.join(dir, 'app.mts'), 'utf8');
    expect(conflicted).toContain('<<<<<<<');
    fs.writeFileSync(path.join(dir, 'app.mts'), conflicted.replace(/<<<<<<< HEAD\nmine 20\n=======\nmain changed 20\n>>>>>>> main\n/, 'mine 20\n'));
    commit('merge main');

    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['app.mts']);
    expect(added(change, 'app.mts')).toContain('mine 5');
    expect(added(change, 'app.mts')).toContain('mine 20');
    expect(added(change, 'app.mts')).not.toContain('typed 1');
  });

  it('leaves out main after the run rebased onto it', () => {
    edit('app.mts', 'line 3\n', 'earlier round 3\n');
    commit('an earlier round');
    const before = snapshotRepo(dir);
    edit('app.mts', 'line 8\n', 'mine 8\n');
    commit('my change');
    mainMoves();
    git(dir, 'rebase', '-q', 'main');

    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['app.mts']);
    expect(added(change, 'app.mts')).toEqual(['mine 8']);
  });

  it('still shows everything once the run has shipped and main points at its own commit', () => {
    const before = snapshotRepo(dir);
    edit('app.mts', 'line 3\n', 'mine 3\n');
    commit('my change');
    mainMoves();
    git(dir, 'merge', '-q', '--no-edit', 'main');
    // The ship pushes the branch, so main now is this run's last commit.
    git(dir, 'branch', '-f', 'main', 'HEAD');

    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['app.mts']);
    expect(added(change, 'app.mts')).toEqual(['mine 3']);
  });

  it('a run on main itself, committing as it goes, is all its own work', () => {
    git(dir, 'checkout', '-q', 'main');
    const before = snapshotRepo(dir);
    edit('app.mts', 'line 3\n', 'mine 3\n');
    commit('one');
    write('new.mts', 'export const x = 1;\n');
    commit('two');

    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path).sort()).toEqual(['app.mts', 'new.mts']);
    expect(change.plus).toBe(2);
  });
});
