// Weekly security audit, 2026-11-16. A project whose core.hooksPath is relative
// (husky v9 sets `.husky/_`) has git look for hooks inside whatever working tree
// it runs in. When a cloud run came home, the app's own git (reset --hard,
// update-ref, the folder-state reads) ran in the task folder the cloud agent had
// just filled, so executable hooks it committed ran on the Mac as the person:
// measured on dummy repos, post-index-change once and reference-transaction four
// times on the reset, three more on folderState. The change pane's
// `git status` and the next run's base bundle did the same.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { folderState } from '../main/cloud/run.mts';
import { pickBase } from '../main/cloud/reuse.mts';
import { whereTheWorkStands } from '../main/git-change.mts';

const HOOKS = ['post-index-change', 'reference-transaction', 'post-checkout', 'post-commit'];
let root = '', primary = '', task = '', marker = '';

const setup = (cwd: string, args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
  cwd, encoding: 'utf8',
  env: { ...process.env, GIT_AUTHOR_NAME: 'A', GIT_AUTHOR_EMAIL: 'a@b.c', GIT_COMMITTER_NAME: 'A', GIT_COMMITTER_EMAIL: 'a@b.c' },
}).trim();
const ran = () => { try { return fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean); } catch { return []; } };

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-hooks-'));
  marker = path.join(root, 'marker.log');
  primary = path.join(root, 'project');
  fs.mkdirSync(primary);
  setup(primary, ['init', '-q', '-b', 'main']);
  setup(primary, ['config', 'core.hooksPath', '.husky/_']);
  fs.writeFileSync(path.join(primary, 'a.txt'), 'a\n');
  setup(primary, ['add', '.']); setup(primary, ['commit', '-qm', 'seed']);
  task = path.join(primary, '.claude', 'worktrees', 'w-1');
  setup(primary, ['worktree', 'add', '-q', '-b', 'agentbox/w-1', task]);
  // What a cloud agent's commit lays into the task folder: executable hooks under the relative path.
  fs.mkdirSync(path.join(task, '.husky', '_'), { recursive: true });
  for (const h of HOOKS) {
    const f = path.join(task, '.husky', '_', h);
    fs.writeFileSync(f, `#!/bin/sh\necho "${h}" >> "${marker}"\n`);
    fs.chmodSync(f, 0o755);
  }
  setup(task, ['add', '-f', '.']); setup(task, ['commit', '-qm', 'cloud work']);
  fs.rmSync(marker, { force: true });
});

afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("a cloud agent's hook files never run on the Mac", () => {
  it('reading the folder state for the cloud runs none of them, and still reads the folder', async () => {
    fs.writeFileSync(path.join(task, 'a.txt'), 'changed\n');
    const state = await folderState(task);
    expect(ran()).toEqual([]);
    expect(state.tree).toMatch(/^[0-9a-f]{40,64}$/);
  });

  it("the change pane's read runs none of them, and still sees the change", () => {
    fs.writeFileSync(path.join(task, 'a.txt'), 'changed again\n');
    const stands = whereTheWorkStands(task);
    expect(ran()).toEqual([]);
    expect(stands).toMatchObject({ uncommitted: true });
  });

  it("making the next run's base bundle runs none of them, and still sends it", async () => {
    const put: string[] = [];
    const storage = { exists: async () => false, put: async (key: string) => { put.push(key); } };
    const base = await pickBase(task, storage as never, { runId: 'r-test' });
    expect(ran()).toEqual([]);
    expect(base.sent).toBe(true);
    expect(put).toHaveLength(1);
  });

  it('a hook the same git would run without the pin is real, so the checks above can fail', () => {
    // `git status` writes the index, and so runs the hook, only when it refreshes
    // an entry: a tracked file with the same content and a new time makes sure it does.
    const old = new Date('2001-01-01T00:00:00Z');
    fs.utimesSync(path.join(task, '.husky', '_', 'post-commit'), old, old);
    execFileSync('git', ['status', '--porcelain'], { cwd: task });
    expect(ran()).toContain('post-index-change');
  });
});
