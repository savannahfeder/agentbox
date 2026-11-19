// The thread's change figures counted only the latest round, not what Ship it lands.
//
// A tester filed a small task (+6 −1), then sent two follow-ups, each committed
// on the thread's own branch. The figures beside Ship it then read +5 −1 and
// then +1, while git showed 3 commits, 2 files, 11 insertions and 1 deletion
// against main. Each run's change was read against the commit that run started
// on. Measured by building that shape here: three rounds on `agentbox/w-1`.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotRepo, changeFromRepo } from '../main/git-change.mts';
import { taskBranch } from '../main/task-folders.mts';

const git = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

describe("a thread's change counts every round waiting to ship", () => {
  let dir: string;
  const write = (rel: string, text: string): void => { fs.writeFileSync(path.join(dir, rel), text); };
  const commit = (msg: string): void => { git(dir, 'add', '-A'); git(dir, 'commit', '-qm', msg); };

  const round = (fn: () => void, { commits = true } = {}) => {
    const photo = snapshotRepo(dir);
    fn();
    if (commits) commit('round');
    return changeFromRepo(photo);
  };

  const threeRounds = () => {
    round(() => write('words.js', 'export function reverseWords(s) {\n  return s.split(" ").reverse().join(" ");\n}\n'));
    round(() => {
      write('words.js', 'export function reverseWords(s) {\n  return s.trim().split(/\\s+/).reverse().join(" ");\n}\n');
      write('words.test.js', 'import { reverseWords } from "./words.js";\nreverseWords("a  b");\n');
    });
    return round(() => write('words.js', '/** Reverses the words. */\nexport function reverseWords(s) {\n  return s.trim().split(/\\s+/).reverse().join(" ");\n}\n'));
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whole-branch-'));
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'config', 'user.email', 't@t');
    git(dir, 'config', 'user.name', 't');
    write('README.md', 'hello\n');
    commit('start');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('on the thread\'s own branch, the last round shows every round against main', () => {
    git(dir, 'checkout', '-q', '-b', taskBranch('w-1'));
    const last = threeRounds();
    const files = last.files.map((f) => f.path).sort();
    expect(files).toEqual(['words.js', 'words.test.js']);
    const stat = git(dir, 'diff', '--numstat', 'main').trim().split('\n').map((l) => l.split('\t'));
    expect(last.plus).toBe(stat.reduce((n, [p]) => n + Number(p), 0));
    expect(last.minus).toBe(stat.reduce((n, [, m]) => n + Number(m), 0));
  });

  it('counts work left uncommitted on top of the committed rounds', () => {
    git(dir, 'checkout', '-q', '-b', taskBranch('w-1'));
    round(() => write('a.js', 'one\n'));
    round(() => write('a.js', 'one\ntwo\n'), { commits: false });
    const last = round(() => write('b.js', 'three\n'), { commits: false });
    expect(last.files.map((f) => f.path).sort()).toEqual(['a.js', 'b.js']);
    expect(last.plus).toBe(3);
  });

  it('a round on a branch someone made themselves still shows only that round', () => {
    git(dir, 'checkout', '-q', '-b', 'my-feature');
    const last = threeRounds();
    expect(last.files.map((f) => f.path)).toEqual(['words.js']);
    expect(last.plus).toBe(1);
    expect(last.minus).toBe(0);
  });

  it('a round on main itself still shows only that round', () => {
    const last = threeRounds();
    expect(last.files.map((f) => f.path)).toEqual(['words.js']);
    expect(last.plus).toBe(1);
  });
});
