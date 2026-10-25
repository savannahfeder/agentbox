// A FOLDER'S GIT DIRECTORY IS FOUND WITHOUT STARTING GIT.
//
// What broke (2026-10-19): the cloud-run marker lives in a task folder's git
// directory, and finding that directory started `git rev-parse` and waited for
// it. The relay process every cloud run shares did that at each marker read
// and write, and the app's main process did it for every task folder on each
// sweep and ship check. On a loaded Mac one such call took 537 ms; the test
// `one-cloud-runs-git-and-tar-never-freeze-the-other-runs` measured the relay
// standing still for 405 to 666 ms, all of it busy, none of it in the slow
// git and tar it guards against.
//
// Now the directory is read off the folder's `.git`, checked here against what
// git itself answers, and nothing is started.
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const realExec = cp.execFileSync;
const git = (cwd, ...a) => realExec('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
let started = [];
let marker; let run;
beforeAll(async () => {
  for (const n of ['execFileSync', 'spawnSync', 'execSync']) {
    const o = cp[n];
    cp[n] = function (...a) { if (a[0] === 'git') started.push(a[1]); return o.apply(this, a); };
  }
  syncBuiltinESMExports();
  marker = await import('../main/cloud/marker.mjs');
  run = await import('../main/cloud/run.mjs');
});

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const world = () => {
  const top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-dir-')));
  dirs.push(top);
  const repo = path.join(top, 'app');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main', '.');
  git(repo, 'config', 'user.email', 't@example.com'); git(repo, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'a');
  const task = path.join(repo, '.claude', 'worktrees', 'w-1');
  git(repo, 'worktree', 'add', '-q', '-b', 'agentbox/w-1', task);
  fs.mkdirSync(path.join(task, 'deep', 'er'), { recursive: true });
  return { top, repo, task };
};
const askGit = (cwd) => fs.realpathSync(git(cwd, 'rev-parse', '--absolute-git-dir'));

describe('the git directory of a folder', () => {
  it('is the one git names, for a checkout, a linked worktree, and a folder inside one', () => {
    const { repo, task } = world();
    started = [];
    for (const f of [repo, task, path.join(task, 'deep', 'er')]) {
      expect(fs.realpathSync(marker.gitDirOf(f)), f).toBe(askGit(f));
    }
    expect(started).toEqual([]);
  });

  it('is none for a folder that is not in a repository, or not there', () => {
    const { top } = world();
    const loose = path.join(top, 'loose');
    fs.mkdirSync(loose);
    started = [];
    expect(marker.gitDirOf(loose)).toBeNull();
    expect(marker.gitDirOf(path.join(top, 'gone'))).toBeNull();
    expect(started).toEqual([]);
  });

  it('holds the marker, written and read and cleared with no git started', () => {
    const { task } = world();
    const where = path.join(askGit(task), 'agentbox-cloud.json');
    started = [];
    marker.writeMarker(task, { runId: 'r1' });
    expect(fs.existsSync(where)).toBe(true);
    expect(marker.readMarker(task).runId).toBe('r1');
    expect(marker.cloudWorkPending(task)).toBe(true);
    marker.clearMarker(task);
    expect(marker.cloudWorkPending(task)).toBe(false);
    expect(started).toEqual([]);
  });

  it('leads a worktree to its main checkout for the saved memories, with no git started', () => {
    const { repo, task, top } = world();
    const config = path.join(top, '.claude-2');
    const mem = path.join(config, 'projects', run.transcriptFolderName(repo), 'memory');
    fs.mkdirSync(mem, { recursive: true });
    fs.writeFileSync(path.join(mem, 'MEMORY.md'), '- a note\n');
    started = [];
    expect(run.memoryFolderFor(task, config)).toBe(mem);
    expect(run.memoryFolderFor(repo, config)).toBeNull();
    expect(started).toEqual([]);
  });
});
