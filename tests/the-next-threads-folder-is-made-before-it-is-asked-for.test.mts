// THE NEXT THREAD'S FOLDER IS MADE BEFORE IT IS ASKED FOR.
//
// What broke (w-9993530556, 2026-11-21): a new user's first thread waited
// 19.7 s between being written and Claude Code starting, with no reason on the
// row, and they asked whether Agentbox was connected at all. Across new
// installs over 40 days, 15 of 76 first threads waited 10 to 177 s, and 11 of
// those 15 never started a second. Every wait the app knows a reason for is
// counted, and none was; making the thread's own copy of the project is the
// step that says nothing for its first two minutes. Timed on a copy of this
// repository with its node_modules: 4.8 s before Claude Code could start.
//
// So one folder per repository is made ahead, as a detached copy at the commit
// a new thread starts from, and the next new thread takes it in one move. It
// is taken only while it is still exactly what a folder made then would be:
// the same commit, the same local files, nothing changed in it, ours.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  dropSpareFolder, ensureTaskFolder, listTaskFolders, makeSpareFolder, spareFolderPath, strayWorktrees, taskBranch, taskFolderPath,
} from '../main/task-folders.mts';
import { FolderLanes } from '../main/task-folders-offthread.mts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const DEAD = 2 ** 22 - 7;

let dir: string;
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'spare-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'index.js'), 'console.log(1)\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  fs.mkdirSync(path.join(dir, 'node_modules', 'left-pad'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'left-pad', 'index.js'), 'module.exports = 1\n');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const files = (at: string) => execFileSync('find', ['.', '-path', './.git', '-prune', '-o', '-type', 'f', '-print'], { cwd: at, encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => f !== './.git').sort();
const lockOf = (folder: string) => git(dir, 'worktree', 'list', '--porcelain').split('\n\n').find((b) => b.includes(`worktree ${folder}`))?.match(/locked (.*)/)?.[1] ?? null;

describe('a folder made ahead', () => {
  it('is taken by the next new thread, in place of making one', () => {
    expect(makeSpareFolder(dir)).toMatchObject({ made: true });
    const got = ensureTaskFolder(dir, 'w-1');
    expect(got).toMatchObject({ taken: true, how: 'spare', created: true, path: taskFolderPath(dir, 'w-1'), branch: taskBranch('w-1') });
    const folder = taskFolderPath(dir, 'w-1');
    expect(git(folder, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(taskBranch('w-1'));
    expect(git(folder, 'rev-parse', 'HEAD')).toBe(git(dir, 'rev-parse', 'main'));
    expect(git(folder, 'status', '--porcelain')).toBe('');
    expect(lockOf(folder)).toContain(`pid=${process.pid}`);
    expect(fs.existsSync(spareFolderPath(dir))).toBe(false);
  });

  it('holds what a folder made on the spot holds', () => {
    makeSpareFolder(dir);
    const fromSpare = ensureTaskFolder(dir, 'w-1');
    const onTheSpot = ensureTaskFolder(dir, 'w-2');
    expect(fromSpare && fromSpare.taken && fromSpare.how).toBe('spare');
    expect(onTheSpot && onTheSpot.taken && onTheSpot.how).not.toBe('spare');
    expect(files(taskFolderPath(dir, 'w-1'))).toEqual(files(taskFolderPath(dir, 'w-2')));
    expect(files(taskFolderPath(dir, 'w-1'))).toContain('./node_modules/left-pad/index.js');
  });

  it('is made once, and asked again it is left as it is', () => {
    makeSpareFolder(dir);
    const before = fs.statSync(spareFolderPath(dir)).ino;
    expect(makeSpareFolder(dir)).toMatchObject({ made: false, why: 'ready' });
    expect(fs.statSync(spareFolderPath(dir)).ino).toBe(before);
  });

  it('is never listed as a thread\'s folder or as a copy somebody else made', () => {
    makeSpareFolder(dir);
    expect(listTaskFolders(dir)).toEqual([]);
    expect(strayWorktrees(dir)).toEqual([]);
  });

  it('is taken back from an app that has quit', () => {
    makeSpareFolder(dir, { pid: DEAD });
    const got = ensureTaskFolder(dir, 'w-1');
    expect(got && got.taken && got.how).toBe('spare');
    expect(lockOf(taskFolderPath(dir, 'w-1'))).toContain(`pid=${process.pid}`);
  });
});

describe('a folder made ahead is not taken', () => {
  const madeOnTheSpot = (id = 'w-1') => {
    const got = ensureTaskFolder(dir, id);
    expect(got).toMatchObject({ taken: true });
    expect(got && got.taken && got.how).not.toBe('spare');
    return taskFolderPath(dir, id);
  };

  it('once main has moved on, and the next one made is on the new commit', () => {
    makeSpareFolder(dir);
    fs.writeFileSync(path.join(dir, 'app.txt'), 'two\n');
    git(dir, 'commit', '-qam', 'second');
    const folder = madeOnTheSpot();
    expect(fs.readFileSync(path.join(folder, 'app.txt'), 'utf8')).toBe('two\n');
    expect(makeSpareFolder(dir)).toMatchObject({ made: true });
    expect(git(spareFolderPath(dir), 'rev-parse', 'HEAD')).toBe(git(dir, 'rev-parse', 'main'));
  });

  it('once the local files it carries have changed', () => {
    makeSpareFolder(dir);
    fs.mkdirSync(path.join(dir, 'node_modules', 'is-even'));
    fs.writeFileSync(path.join(dir, 'node_modules', 'is-even', 'index.js'), 'module.exports = 2\n');
    const folder = madeOnTheSpot();
    expect(fs.existsSync(path.join(folder, 'node_modules', 'is-even', 'index.js'))).toBe(true);
  });

  it('when something in it was changed', () => {
    makeSpareFolder(dir);
    fs.writeFileSync(path.join(spareFolderPath(dir), 'app.txt'), 'edited\n');
    const folder = madeOnTheSpot();
    expect(fs.readFileSync(path.join(folder, 'app.txt'), 'utf8')).toBe('one\n');
  });

  it('by a thread that already has a branch of its own', () => {
    git(dir, 'branch', taskBranch('w-1'));
    makeSpareFolder(dir);
    madeOnTheSpot('w-1');
    expect(fs.existsSync(spareFolderPath(dir))).toBe(true);
  });

  it('when another app that is still running made it', () => {
    makeSpareFolder(dir, { pid: process.ppid });
    madeOnTheSpot();
    expect(lockOf(spareFolderPath(dir))).toContain(`pid=${process.ppid}`);
    expect(makeSpareFolder(dir)).toMatchObject({ made: false });
    expect(lockOf(spareFolderPath(dir))).toContain(`pid=${process.ppid}`);
  });

  it('when it was never finished', () => {
    makeSpareFolder(dir);
    const stamp = path.join(git(spareFolderPath(dir), 'rev-parse', '--absolute-git-dir'), 'agentbox-spare.json');
    fs.rmSync(stamp);
    madeOnTheSpot();
  });
});

describe('nothing is made ahead', () => {
  it('in a folder that is not a repository yet, which stays as it was', () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-'));
    fs.writeFileSync(path.join(plain, 'notes.txt'), 'x\n');
    try {
      expect(makeSpareFolder(plain)).toMatchObject({ made: false, why: 'not a repository' });
      expect(fs.existsSync(path.join(plain, '.git'))).toBe(false);
    } finally { fs.rmSync(plain, { recursive: true, force: true }); }
  });

  it('in a repository with no commit yet', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));
    git(empty, 'init', '-q');
    try {
      expect(makeSpareFolder(empty)).toMatchObject({ made: false, why: 'no commit yet' });
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }
  });
});

describe('the folder threads', () => {
  function lanesWithFakeThreads() {
    const threads: { posted: { id: number; name: string; args: unknown[] }[]; answer: (id: number) => void }[] = [];
    const lanes = new FolderLanes({
      makeThread: () => {
        const listeners: ((a: unknown) => void)[] = [];
        const t = {
          posted: [] as { id: number; name: string; args: unknown[] }[],
          postMessage(m: { id: number; name: string; args: unknown[] }) { t.posted.push(m); },
          on(event: string, fn: (a: unknown) => void) { if (event === 'message') listeners.push(fn); return t; },
          ref() {}, unref() {}, terminate() {},
          answer(id: number) { for (const fn of listeners) fn({ id, ok: true, value: id }); },
        };
        threads.push(t);
        return t;
      },
      runHere: () => null,
    });
    return { lanes, threads };
  }

  it('make a new thread\'s folder only once the one ahead in that project is finished', async () => {
    const { lanes, threads } = lanesWithFakeThreads();
    void lanes.run('makeSpareFolder', ['/repo']);
    const start = lanes.run('restoreTaskFolder', ['/repo', 'w-1']);
    const [tidy] = threads;
    expect(tidy.posted.map((m) => m.name)).toEqual(['makeSpareFolder']);
    expect(threads).toHaveLength(1);
    tidy.answer(tidy.posted[0].id);
    const startThread = threads[1];
    expect(startThread.posted.map((m) => m.name)).toEqual(['restoreTaskFolder']);
    startThread.answer(startThread.posted[0].id);
    await expect(start).resolves.toBeTruthy();
  });

  it('make one in another project without waiting', () => {
    const { lanes, threads } = lanesWithFakeThreads();
    void lanes.run('makeSpareFolder', ['/repo']);
    void lanes.run('restoreTaskFolder', ['/other', 'w-1']);
    expect(threads.flatMap((t) => t.posted.map((m) => m.name)).sort()).toEqual(['makeSpareFolder', 'restoreTaskFolder']);
  });
});

describe('putting it away', () => {
  it('removes our own', () => {
    makeSpareFolder(dir);
    expect(dropSpareFolder(dir)).toMatchObject({ dropped: true });
    expect(fs.existsSync(spareFolderPath(dir))).toBe(false);
    expect(git(dir, 'worktree', 'list', '--porcelain')).not.toContain('.spare');
  });

  it('leaves one another running app made', () => {
    makeSpareFolder(dir, { pid: process.ppid });
    expect(dropSpareFolder(dir)).toMatchObject({ dropped: false });
    expect(fs.existsSync(spareFolderPath(dir))).toBe(true);
  });
});
