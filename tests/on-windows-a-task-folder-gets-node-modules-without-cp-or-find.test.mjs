// ON WINDOWS A TASK FOLDER GETS node_modules WITHOUT `cp` OR `find`.
//
// A new task folder is given the checkout's ignored `/node_modules` by
// default. It was copied with `cp`, and the links inside it were listed with
// `find -type l -print0`. Windows has neither. Measured on Windows 11 from a
// PowerShell started the ordinary way.
//
//   cp      not on PATH                      spawnSync cp ENOENT
//   find    C:\Windows\System32\find.exe     "FIND: Parameter format not correct"
//
// Through `ensureTaskFolder` on a repository with an ignored node_modules,
// every task folder was refused with
//
//   node_modules: it could not be copied: spawnSync cp ENOENT
//
// On win32 the copy is now `fs.cpSync`, and the walk is Node's own, which like
// `find` never goes through a link. `fs.cpSync` alone copies a junction as the
// folder it points at, measured with a junction to a folder outside the repo,
// so the link checks after the copy found no link at all. Each link is made
// again as a link, an absolute one as a junction, which needs no Developer
// Mode. A Mac and Linux keep `cp` and `find`.
//
// The clone of the whole checkout is skipped on Windows. On NTFS the copy
// shares no blocks, so it writes everything the checkout would and more.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyTree, linksUnder } from '../main/worktree-include.mts';
import { ensureTaskFolder } from '../main/task-folders.mts';

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-cp-or-find-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const write = (rel, text = 'x') => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};

/** Making a link needs Developer Mode on Windows, so a machine without it skips those cases. */
const canLink = (() => {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'can-link-'));
  try { fs.symlinkSync('a', path.join(probe, 'b')); return true; } catch { return false; }
  finally { fs.rmSync(probe, { recursive: true, force: true }); }
})();

describe('the copy on Windows', () => {
  it('copies a directory to a path that is not there yet', () => {
    write('src/node_modules/left-pad/lib/index.js', 'module.exports = 1');
    copyTree(path.join(dir, 'src', 'node_modules'), path.join(dir, 'to', 'node_modules'), 'win32');
    expect(fs.readFileSync(path.join(dir, 'to', 'node_modules', 'left-pad', 'lib', 'index.js'), 'utf8')).toBe('module.exports = 1');
  });

  it('copies into a directory that is there, as cp does', () => {
    write('src/shots/a.png', 'png');
    fs.mkdirSync(path.join(dir, 'to'));
    copyTree(path.join(dir, 'src', 'shots'), path.join(dir, 'to'), 'win32');
    expect(fs.readFileSync(path.join(dir, 'to', 'shots', 'a.png'), 'utf8')).toBe('png');
  });

  it('makes a junction again as a junction, never as a copy of what it points at', () => {
    write('outside/secret.txt', 'not for the folder');
    fs.mkdirSync(path.join(dir, 'src', 'node_modules'), { recursive: true });
    fs.symlinkSync(path.join(dir, 'outside'), path.join(dir, 'src', 'node_modules', 'thing'), 'junction');
    copyTree(path.join(dir, 'src', 'node_modules'), path.join(dir, 'to', 'node_modules'), 'win32');
    const copied = path.join(dir, 'to', 'node_modules', 'thing');
    expect(fs.lstatSync(copied).isSymbolicLink()).toBe(true);
    expect(path.resolve(fs.readlinkSync(copied))).toBe(path.join(dir, 'outside'));
    expect(linksUnder(path.join(dir, 'to', 'node_modules'), 'win32')).toEqual([copied]);
  });

  it.runIf(canLink)('keeps a relative link pointing where it pointed, rather than at the original', () => {
    write('src/packages/thing/index.js');
    fs.mkdirSync(path.join(dir, 'src', 'node_modules'));
    fs.symlinkSync(path.join('..', 'packages', 'thing'), path.join(dir, 'src', 'node_modules', 'thing'), 'dir');
    copyTree(path.join(dir, 'src', 'node_modules'), path.join(dir, 'to', 'node_modules'), 'win32');
    expect(fs.readlinkSync(path.join(dir, 'to', 'node_modules', 'thing'))).toBe(path.join('..', 'packages', 'thing'));
  });
});

describe('the links under a carried entry on Windows', () => {
  it('are none in a tree of plain files', () => {
    write('node_modules/a/index.js');
    expect(linksUnder(path.join(dir, 'node_modules'), 'win32')).toEqual([]);
  });

  // A junction, which Windows lets anyone make, and a plain link elsewhere.
  it('are found a level down, and the walk does not go through them', () => {
    write('outside/secret/deep.js');
    fs.mkdirSync(path.join(dir, 'node_modules', '@scope'), { recursive: true });
    const link = path.join(dir, 'node_modules', '@scope', 'pkg');
    fs.symlinkSync(path.join(dir, 'outside'), link, 'junction');
    expect(linksUnder(path.join(dir, 'node_modules'), 'win32')).toEqual([link]);
  });

  it('include the entry itself when it is a link', () => {
    write('real/index.js');
    const link = path.join(dir, 'node_modules');
    fs.symlinkSync(path.join(dir, 'real'), link, 'junction');
    expect(linksUnder(link, 'win32')).toEqual([link]);
  });
});

describe('a task folder in a repository with node_modules', () => {
  it('is made, and has the dependencies in it', () => {
    const git = (...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'ignore' });
    write('.gitignore', 'node_modules\n');
    write('a.txt', 'a');
    git('init', '-q');
    git('add', '.');
    git('commit', '-qm', 'a');
    write('node_modules/left-pad/lib/index.js', 'module.exports = 1');

    const made = ensureTaskFolder(dir, 'w-0123456789');

    expect(made).toMatchObject({ taken: true, created: true });
    expect(fs.readFileSync(path.join(made.path, 'node_modules', 'left-pad', 'lib', 'index.js'), 'utf8')).toBe('module.exports = 1');
  });
});
