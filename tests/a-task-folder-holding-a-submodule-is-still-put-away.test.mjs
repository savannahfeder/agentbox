// A TASK FOLDER HOLDING A SUBMODULE IS STILL PUT AWAY, WHEN THAT LOSES NOTHING.
//
// FOUND 2026-10-15 going through how people's git setups differ. A repository
// with submodules gives a task folder empty submodule directories, so the first
// thing an agent does there is `git submodule update --init`. From then on git
// refuses to remove that folder at all, clean or not:
//
//   park {"parked":false,"reason":"refused","detail":"fatal: working trees
//   containing submodules cannot be moved or removed"}
//
// MEASURED with the real git 2.39.5: park and release both refused, and the
// folder stayed on the disk, asked about and refused again on every sweep, so
// no folder in such a repository was ever reclaimed once an agent had used it.
// After `git submodule deinit` git still refuses, because the submodule's own
// repository lives on under `.git/worktrees/<name>/modules`.
//
// git's refusal is about one real danger. That inner repository is the only
// copy of anything committed in the submodule and not pushed, and a forced
// removal deletes it. So the folder goes only when that is provably nothing:
// every submodule clean, and every commit in every submodule's repository on
// one of its remotes. Anything else is kept and reported, as before.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureTaskFolder, parkTaskFolder, releaseTaskFolder, restoreTaskFolder,
} from '../main/task-folders.mjs';

// `protocol.file.allow` because the submodule here is a local folder, which git
// refuses to clone from by default since 2.38.1. The identity because the
// commits made inside a submodule are made in a repository nothing here
// configures, so without it they fall back to whatever the machine knows about
// whoever is running the suite, which on a build machine is nobody.
const git = (cwd, ...args) => execFileSync('git', [
  '-c', 'protocol.file.allow=always',
  '-c', 'user.name=Test', '-c', 'user.email=test@example.com',
  ...args,
], {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();

let top;
let dir;
let lib;

function repository(at) {
  fs.mkdirSync(at);
  git(at, 'init', '-q', '-b', 'main');
  git(at, 'config', 'user.email', 'test@example.com');
  git(at, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(at, 'file.txt'), `${path.basename(at)}\n`);
  git(at, 'add', '.');
  git(at, 'commit', '-q', '-m', 'first');
  return at;
}

beforeEach(() => {
  top = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'submodules-')));
  lib = repository(path.join(top, 'lib'));
  dir = repository(path.join(top, 'project'));
  git(dir, 'submodule', 'add', '-q', lib, 'vendor/lib');
  git(dir, 'commit', '-q', '-m', 'the library');
});
afterEach(() => { fs.rmSync(top, { recursive: true, force: true }); });

/** A task folder with the submodule filled in, as an agent would leave it. */
function folderWithTheSubmodule(id) {
  const made = ensureTaskFolder(dir, id, { dependencies: false });
  git(made.path, 'submodule', 'update', '--init', '-q');
  expect(fs.readFileSync(path.join(made.path, 'vendor/lib/file.txt'), 'utf8')).toBe('lib\n');
  return made;
}

describe('a task folder with a submodule filled in', () => {
  it('parks, and comes back with its work', () => {
    const made = folderWithTheSubmodule('w-sub');
    fs.writeFileSync(path.join(made.path, 'work.txt'), 'half done\n');

    expect(parkTaskFolder(dir, 'w-sub')).toMatchObject({ parked: true, kept: 'work in progress' });
    expect(fs.existsSync(made.path)).toBe(false);

    const back = restoreTaskFolder(dir, 'w-sub');
    expect(fs.readFileSync(path.join(back.path, 'work.txt'), 'utf8')).toBe('half done\n');
  }, 30_000);

  it('is released once its branch is in main', () => {
    const made = folderWithTheSubmodule('w-merged');

    expect(releaseTaskFolder(dir, 'w-merged')).toMatchObject({ removed: true });
    expect(fs.existsSync(made.path)).toBe(false);
  }, 30_000);

  it('is kept when the submodule holds a commit that is on none of its remotes', () => {
    const made = folderWithTheSubmodule('w-local');
    git(path.join(made.path, 'vendor/lib'), 'commit', '-q', '--allow-empty', '-m', 'only here');

    const parked = parkTaskFolder(dir, 'w-local');

    expect(parked).toMatchObject({ parked: false, reason: 'refused' });
    expect(git(path.join(made.path, 'vendor/lib'), 'log', '-1', '--format=%s')).toBe('only here');
  }, 30_000);

  it('is kept when the submodule has a file nobody committed', () => {
    const made = folderWithTheSubmodule('w-loose');
    fs.writeFileSync(path.join(made.path, 'vendor/lib/notes.txt'), 'mine\n');

    expect(parkTaskFolder(dir, 'w-loose')).toMatchObject({ parked: false, reason: 'refused' });
    expect(fs.readFileSync(path.join(made.path, 'vendor/lib/notes.txt'), 'utf8')).toBe('mine\n');
  }, 30_000);

  it('is kept when a submodule keeps its repository in its own directory', () => {
    const made = ensureTaskFolder(dir, 'w-inplace', { dependencies: false });
    git(made.path, 'clone', '-q', lib, 'vendor/inplace');
    git(path.join(made.path, 'vendor/inplace'), 'commit', '-q', '--allow-empty', '-m', 'only here');
    git(made.path, 'submodule', 'add', '-q', lib, 'vendor/inplace');
    git(made.path, 'commit', '-q', '-m', 'a library that was already there');
    expect(fs.statSync(path.join(made.path, 'vendor/inplace/.git')).isDirectory()).toBe(true);

    expect(parkTaskFolder(dir, 'w-inplace')).toMatchObject({ parked: false, reason: 'refused' });
    expect(git(path.join(made.path, 'vendor/inplace'), 'log', '-1', '--format=%s')).toBe('only here');
  }, 30_000);

  it('is kept when the submodule was emptied but its repository holds a commit of its own', () => {
    const made = folderWithTheSubmodule('w-deinit');
    git(path.join(made.path, 'vendor/lib'), 'commit', '-q', '--allow-empty', '-m', 'only here');
    // `-f` because deinit counts a new commit as a change; it never deletes the
    // submodule's repository, which is where that commit now lives alone.
    git(made.path, 'submodule', 'deinit', '-q', '-f', '--all');

    expect(parkTaskFolder(dir, 'w-deinit')).toMatchObject({ parked: false, reason: 'refused' });
    expect(fs.existsSync(made.path)).toBe(true);
  }, 30_000);
});
