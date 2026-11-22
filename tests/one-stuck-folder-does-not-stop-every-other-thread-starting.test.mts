// ONE STUCK FOLDER DOES NOT STOP EVERY OTHER THREAD STARTING.
//
// Seen 2026-11-15 (w-7054e8638d): thread after thread, in more than one
// project, sat on "Making this thread's own copy of the project is taking much
// longer than it should, so the agent has not started." Every thread's folder
// is made on one background thread, one job at a time, and nothing in a job had
// a deadline: not the job, and not the git or cp it runs. So one git that never
// came back (here a post-checkout hook that never ends, as a git-lfs download
// on a dead network does) left every later thread in every project without a
// folder until the app restarted.
//
// Measured before the fix: the stuck job never answered, and the second
// project's folder, asked for right after it, never came either (both tests
// timed out at 30 seconds).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restoreTaskFolder } from '../main/task-folders.mts';
import { folderJob } from '../main/task-folders-offthread.mts';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

let root: string;
let stuck: string;
let fine: string;
const before = { job: process.env.AGENTBOX_FOLDER_JOB_MS, git: process.env.AGENTBOX_FOLDER_GIT_MS };

function repo(name: string) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

const hook = (body: string) => fs.writeFileSync(path.join(root, 'hooks', 'post-checkout'), `#!/bin/sh\n${body}\n`, { mode: 0o755 });

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'stuck-folder-')));
  stuck = repo('stuck');
  fine = repo('fine');
  fs.mkdirSync(path.join(root, 'hooks'));
  hook('exec sleep 45');
  git(stuck, 'config', 'core.hooksPath', path.join(root, 'hooks'));
  // A dirty checkout skips the block-clone path, so the folder is a real checkout and runs the hook.
  fs.writeFileSync(path.join(stuck, 'app.txt'), 'edited\n');
});

afterAll(() => {
  for (const [key, value] of [['AGENTBOX_FOLDER_JOB_MS', before.job], ['AGENTBOX_FOLDER_GIT_MS', before.git]] as const) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { execFileSync('pkill', ['-f', '^sleep 45$']); } catch { /* none left */ }
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a git under a folder job that never returns', () => {
  it('is ended at its deadline, and the folder it had already laid down is used', () => {
    process.env.AGENTBOX_FOLDER_GIT_MS = '1500';
    try {
      const started = Date.now();
      const made = restoreTaskFolder(stuck, 'w-direct');
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(made).toMatchObject({ taken: true });
    } finally { delete process.env.AGENTBOX_FOLDER_GIT_MS; }
  }, 30_000);
});

describe('a folder job that never finishes', () => {
  it('is given up on, and the thread queued behind it still gets its folder', async () => {
    // The git deadline is set past the job's, so it is the job's own that has to answer.
    process.env.AGENTBOX_FOLDER_GIT_MS = '30000';
    process.env.AGENTBOX_FOLDER_JOB_MS = '2000';
    const started = Date.now();
    const first = folderJob('restoreTaskFolder', stuck, 'w-stuck').then(() => null, (error: Error) => error);
    const second = folderJob('restoreTaskFolder', fine, 'w-next');

    const next = await second;
    expect(next).toMatchObject({ taken: true });
    expect(fs.existsSync(path.join((next as { path: string }).path, 'app.txt'))).toBe(true);
    expect(Date.now() - started).toBeLessThan(15_000);

    const error = await first;
    expect(error).toMatchObject({ timedOut: true });
    expect(error?.message).toMatch(/took more than/);
  }, 30_000);

  it('a job that is only waiting in line is not timed out for the wait', async () => {
    // Each takes about a second, inside the job's deadline; five in a row take longer than it.
    process.env.AGENTBOX_FOLDER_JOB_MS = '3000';
    hook('sleep 1');
    const made = await Promise.all(['w-a', 'w-b', 'w-c', 'w-d', 'w-e'].map((id) => folderJob('restoreTaskFolder', stuck, id)));
    for (const m of made) expect(m).toMatchObject({ taken: true });
  }, 30_000);
});
