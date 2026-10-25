// A HOOK A WORKER WROTE IN ITS TASK FOLDER MUST NOT RUN AS THE APP.
//
// install-hooks pointed core.hooksPath at the RELATIVE value 'scripts/hooks',
// shared by every worktree. Git resolves a relative hooksPath against the
// working tree it runs in, so inside a task folder at <repo>/.claude/worktrees/<id>
// the hooks are THAT folder's own scripts/hooks -- which a worker edits as
// ordinary work. parkTaskFolder commits in the task folder, and a commit runs
// post-commit and reference-transaction, so those worker-written hooks ran as
// the app, outside its sandbox, with its env (GH_TOKEN, AWS_*). The ship queue
// hit the same hooks from the branch's copy instead of the base checkout's.
//
// MEASURED here with git 2.39.5: a post-commit and a reference-transaction
// planted in a task folder's scripts/hooks both wrote their marker during
// parkTaskFolder's commit, and a commit the ship script ran in the task folder
// fired the branch copy rather than the base one. The fix makes every app-run
// git in a task folder hook-free and ships through the base checkout's hooks.

import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, parkTaskFolder } from '../main/task-folders.mjs';
import { runScript } from '../main/ship-queue.mjs';

const g = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const made = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hookrepo-')));
  made.push(dir);
  g(dir, 'init', '-q', '-b', 'main');
  g(dir, 'config', 'user.email', 't@e.com');
  g(dir, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  g(dir, 'add', '-A');
  g(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/** A hook that drops a marker where it ran, planted in a checkout's scripts/hooks. */
function plantHook(checkout, name, marker) {
  const hooks = path.join(checkout, 'scripts', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  const hook = path.join(hooks, name);
  fs.writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\n`);
  fs.chmodSync(hook, 0o755);
}

describe('a hook a worker writes in its task folder', () => {
  it('does not run as the app when the app parks the folder, even on a relative hooksPath', () => {
    const dir = makeRepo();
    g(dir, 'config', 'core.hooksPath', 'scripts/hooks'); // the shared, relative value install-hooks used to write
    const folder = ensureTaskFolder(dir, 'w-rel', { dependencies: false });
    expect(folder.taken).toBe(true);

    const post = path.join(dir, 'POST-COMMIT-RAN');
    const ref = path.join(dir, 'REF-TXN-RAN');
    plantHook(folder.path, 'post-commit', post);
    plantHook(folder.path, 'reference-transaction', ref);
    fs.writeFileSync(path.join(folder.path, 'work.txt'), 'wip\n'); // dirty, so park commits

    expect(parkTaskFolder(dir, 'w-rel')).toMatchObject({ parked: true, kept: 'work in progress' });
    expect(fs.existsSync(post), 'the task folder post-commit ran as the app').toBe(false);
    expect(fs.existsSync(ref), 'the task folder reference-transaction ran as the app').toBe(false);
  }, 30_000);

  it('never ran under an unset hooksPath, which git reads from the shared .git/hooks', () => {
    const dir = makeRepo(); // no core.hooksPath at all
    const folder = ensureTaskFolder(dir, 'w-unset', { dependencies: false });

    const post = path.join(dir, 'UNSET-RAN');
    plantHook(folder.path, 'post-commit', post);
    fs.writeFileSync(path.join(folder.path, 'work.txt'), 'wip\n');

    expect(parkTaskFolder(dir, 'w-unset')).toMatchObject({ parked: true });
    expect(fs.existsSync(post)).toBe(false);
  }, 30_000);

  it('is bypassed by the base checkout copy when the ship script commits in the task folder', async () => {
    const dir = makeRepo();
    g(dir, 'config', 'core.hooksPath', 'scripts/hooks'); // the relative value that resolves to the branch copy
    const folder = ensureTaskFolder(dir, 'w-ship', { dependencies: false });

    const base = path.join(dir, 'BASE-HOOK-RAN');
    const branch = path.join(dir, 'BRANCH-HOOK-RAN');
    plantHook(dir, 'post-commit', base); // the base checkout's committed gate
    plantHook(folder.path, 'post-commit', branch); // the branch's own copy, a worker's to edit

    const script = path.join(dir, 'ship-stub.mjs');
    fs.writeFileSync(script, "import { execFileSync } from 'node:child_process';\n"
      + "execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'ship', '--no-verify'], { stdio: 'inherit' });\n");

    const { code } = await runScript(script, folder.path, { timeout: 30_000 });
    expect(code).toBe(0);
    expect(fs.existsSync(base), 'the base checkout hook ran').toBe(true);
    expect(fs.existsSync(branch), 'the branch copy of the hook ran').toBe(false);
  }, 30_000);
});
