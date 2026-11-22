// A CLOSED TASK'S FOLDER RUNS NOTHING FROM A REPOSITORY ITS WORKER NESTED IN IT.
//
// A Codex worker's sandbox protects only its folder's top-level .git, so a
// repository it makes inside the folder is its own, settings included. Parking
// a closed task ran `git add -A`, which made that repository a gitlink; git then
// would not remove the folder, and the removal check's `git status
// --ignore-submodules=none`, and every later sweep's `git status`, looked inside
// it and ran its clean filter on the Mac, outside the sandbox, every ten minutes.
// core.fsmonitor=false does not stop a filter. Reproduced with the real
// ensureTaskFolder, parkTaskFolder and listTaskFolders (security review,
// 2026-11-21).
import { afterEach, beforeEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, parkTaskFolder, listTaskFolders } from '../main/task-folders.mts';

const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let tmp: string; let proj: string; let marker: string; let planted: string;
const ID = 'w-f00d00';
const runs = () => (fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean).length : 0);

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'park-nested-'));
  proj = path.join(tmp, 'proj');
  marker = path.join(tmp, 'ran');
  planted = path.join(tmp, 'planted.sh');
  fs.writeFileSync(planted, `#!/bin/sh\necho ran >> '${marker}'\ncat\n`, { mode: 0o755 });
  fs.mkdirSync(proj);
  git(proj, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(proj, 'README.md'), 'hi\n');
  git(proj, 'add', '-A');
  git(proj, 'commit', '-q', '-m', 'first');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

// What a worker can do inside its sandbox: a repository of its own, with a filter.
function nestARepository(folder: string, at = 'bar') {
  const inner = path.join(folder, at);
  fs.mkdirSync(inner, { recursive: true });
  git(inner, 'init', '-q');
  fs.writeFileSync(path.join(inner, '.gitattributes'), '*.txt filter=x\n');
  git(inner, 'config', 'filter.x.clean', planted);
  git(inner, 'config', 'core.fsmonitor', planted);
  fs.writeFileSync(path.join(inner, 'payload.txt'), 'AAAAAAAAAA\n');
  git(inner, 'add', '-A');
  git(inner, '-c', 'core.fsmonitor=false', 'commit', '-q', '-m', 'b');
  fs.writeFileSync(path.join(inner, 'payload.txt'), 'BBBBBBBBBB\n');
  fs.writeFileSync(marker, '');
  return inner;
}

it('parks the folder without running the nested repository\'s filter, then or on later sweeps', () => {
  const folder = (ensureTaskFolder(proj, ID) as { path: string }).path;
  fs.writeFileSync(path.join(folder, 'notes.txt'), 'work\n');
  nestARepository(folder);
  parkTaskFolder(proj, ID, { path: folder });
  expect(runs()).toBe(0);
  listTaskFolders(proj);
  parkTaskFolder(proj, ID, { path: folder });
  expect(runs()).toBe(0);
});

it('keeps the worker\'s other work in the parked commit, and leaves the nested repository out of it', () => {
  const folder = (ensureTaskFolder(proj, ID) as { path: string }).path;
  fs.writeFileSync(path.join(folder, 'notes.txt'), 'work\n');
  nestARepository(folder, 'deep/bar');
  parkTaskFolder(proj, ID, { path: folder });
  const tree = git(proj, 'ls-tree', '-r', `agentbox/${ID}`);
  expect(tree).toContain('notes.txt');
  expect(tree).not.toMatch(/deep\/bar/);
  expect(runs()).toBe(0);
});

it('runs nothing from a submodule whose .git a worker pointed back inside the folder', () => {
  const lib = path.join(tmp, 'lib');
  fs.mkdirSync(lib);
  git(lib, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(lib, 'a.txt'), 'x\n');
  git(lib, 'add', '-A');
  git(lib, 'commit', '-q', '-m', 'lib');
  git(proj, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, 'lib');
  git(proj, 'commit', '-q', '-m', 'with lib');
  const folder = (ensureTaskFolder(proj, ID) as { path: string }).path;
  git(folder, '-c', 'protocol.file.allow=always', 'submodule', 'update', '-q', '--init');
  // The worker's own repository, and the submodule's .git file pointed at it.
  const evil = nestARepository(folder, 'evil');
  fs.writeFileSync(path.join(folder, 'lib', '.git'), `gitdir: ${path.join(evil, '.git')}\n`);
  fs.copyFileSync(path.join(evil, 'payload.txt'), path.join(folder, 'lib', 'payload.txt'));
  fs.copyFileSync(path.join(evil, '.gitattributes'), path.join(folder, 'lib', '.gitattributes'));
  fs.writeFileSync(marker, '');
  parkTaskFolder(proj, ID, { path: folder });
  listTaskFolders(proj);
  expect(runs()).toBe(0);
});
