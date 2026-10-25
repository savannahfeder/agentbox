// A FOLDER HOLDING ONLY A LEFTOVER MARKER DOES NOT WEDGE ITS THREAD.
//
// What broke (2026-10-19): "Update privacy policy for phone access" sat in
// In Progress and never ran. Its row said "its folder is in-the-way". The
// task folder held one file, `.keep-session` ("session working directory"),
// left on 2026-10-16 when an agent recreated its deleted folder to keep its
// shell alive. An empty leftover folder was already built over; one holding
// that file was refused for good. Finder's `.DS_Store` does the same.
//
// Now a folder holding nothing but those two is cleared and built over. One
// holding anything else is still refused and left untouched.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, taskFolderPath } from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
let dir;
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'leftover-marker-')));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'first');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const leftover = (id, files) => {
  const folder = taskFolderPath(dir, id);
  fs.mkdirSync(folder, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), body);
  return folder;
};

describe('a leftover task folder', () => {
  it('holding only the marker an agent left is built over', () => {
    const folder = leftover('w-keep', { '.keep-session': 'session working directory\n' });
    const made = ensureTaskFolder(dir, 'w-keep');
    expect(made.taken).toBe(true);
    expect(made.path).toBe(folder);
    expect(fs.existsSync(path.join(folder, 'app.txt'))).toBe(true);
    expect(fs.existsSync(path.join(folder, '.keep-session'))).toBe(false);
  });

  it('holding only Finder\'s file, or both, is built over', () => {
    leftover('w-finder', { '.DS_Store': 'x' });
    expect(ensureTaskFolder(dir, 'w-finder').taken).toBe(true);
    leftover('w-both', { '.DS_Store': 'x', '.keep-session': 'session working directory\n' });
    expect(ensureTaskFolder(dir, 'w-both').taken).toBe(true);
  });

  it('holding anything else as well is still refused, and left as it was', () => {
    const folder = leftover('w-mixed', { '.keep-session': 'session working directory\n', 'notes.txt': 'mine' });
    const asked = ensureTaskFolder(dir, 'w-mixed');
    expect(asked.taken).toBe(false);
    expect(asked.reason).toBe('in-the-way');
    expect(fs.readdirSync(folder).sort()).toEqual(['.keep-session', 'notes.txt']);
  });

  it('holding a folder of that name is refused too', () => {
    const folder = taskFolderPath(dir, 'w-dir');
    fs.mkdirSync(path.join(folder, '.keep-session'), { recursive: true });
    fs.writeFileSync(path.join(folder, '.keep-session', 'work.txt'), 'mine');
    expect(ensureTaskFolder(dir, 'w-dir').reason).toBe('in-the-way');
    expect(fs.existsSync(path.join(folder, '.keep-session', 'work.txt'))).toBe(true);
  });
});
