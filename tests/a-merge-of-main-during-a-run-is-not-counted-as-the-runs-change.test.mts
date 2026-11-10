// A MERGE OF MAIN DURING A RUN IS NOT COUNTED AS THE RUN'S CHANGE (w-bb45118b10).
//
// The change card on this thread read +375 −171,138. The branch itself changes
// 22 files, +764 −13 against main (`git diff --shortstat $(git merge-base HEAD
// origin/main) HEAD`). The run had merged main into the branch, and main had
// just moved the back end to TypeScript, so diffing against the commit the run
// started on counted every file main renamed and trimmed as this run's work.
// When main has been merged in since the run began, the card now measures from
// where the branch leaves main.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotRepo, changeFromRepo } from '../main/git-change.mts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const lines = (n: number, word: string) => Array.from({ length: n }, (_, i) => `${word} ${i + 1}`).join('\n') + '\n';

describe('the change a run made, when main moved under it', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'merge-run-')));
    git(dir, 'init', '-q', '-b', 'main', '.');
    git(dir, 'config', 'user.email', 'agent@agentbox.local');
    git(dir, 'config', 'user.name', 'Agentbox');
    fs.writeFileSync(path.join(dir, 'big.txt'), lines(500, 'old'));
    fs.writeFileSync(path.join(dir, 'mine.txt'), lines(5, 'mine'));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'base');
    git(dir, 'checkout', '-qb', 'agentbox/w-1');
    fs.appendFileSync(path.join(dir, 'mine.txt'), 'an earlier round\n');
    git(dir, 'commit', '-qam', 'earlier round');
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  /** Main rewrites big.txt, as main's own work does while a thread runs. */
  const mainMoves = () => {
    git(dir, 'checkout', '-q', 'main');
    fs.writeFileSync(path.join(dir, 'big.txt'), lines(20, 'new'));
    git(dir, 'commit', '-qam', 'main rewrites big.txt');
    git(dir, 'checkout', '-q', 'agentbox/w-1');
  };

  it('leaves main\'s work out once main is merged into the branch during the run', () => {
    const before = snapshotRepo(dir);
    mainMoves();
    git(dir, 'merge', '-q', '--no-edit', 'main');
    fs.appendFileSync(path.join(dir, 'mine.txt'), 'this round\n');
    git(dir, 'commit', '-qam', 'this round');
    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['mine.txt']);
    expect([change.plus, change.minus]).toEqual([2, 0]);
  });

  it('counts only this run when nothing was merged, as before', () => {
    const before = snapshotRepo(dir);
    fs.appendFileSync(path.join(dir, 'mine.txt'), 'this round\n');
    git(dir, 'commit', '-qam', 'this round');
    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['mine.txt']);
    expect([change.plus, change.minus]).toEqual([1, 0]);
  });

  it('and when main moved but was not merged in, main\'s work is not counted either way', () => {
    const before = snapshotRepo(dir);
    mainMoves();
    fs.appendFileSync(path.join(dir, 'mine.txt'), 'this round\n');
    git(dir, 'commit', '-qam', 'this round');
    const change = changeFromRepo(before);
    expect(change.files.map((f) => f.path)).toEqual(['mine.txt']);
    expect([change.plus, change.minus]).toEqual([1, 0]);
  });
});
