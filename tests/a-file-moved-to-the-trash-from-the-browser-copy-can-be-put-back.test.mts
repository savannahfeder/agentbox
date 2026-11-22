// A FILE MOVED TO THE TRASH FROM THE BROWSER COPY CAN BE PUT BACK.
//
// Files' Move to the Trash called Electron's shell.trashItem, and the browser
// copy of the app (bin/agentbox.mjs) has no Electron: driving it on Linux, the
// move said "this computer has no Trash" (w-439393243c). It now moves the file
// into the desktop's Trash as the freedesktop.org spec lays it out, with the
// line a file manager reads to put it back. Measured on a real folder.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { trashFile } from '../main/trash-file.mts';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'trash-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('on Linux', () => {
  it('moves the file into the Trash with where it came from, so it can be put back', async () => {
    const file = path.join(root, 'work', 'launch film.mp4');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'film');
    await trashFile(file, { platform: 'linux', home: root, env: {}, now: new Date('2026-11-10T21:00:00Z') });
    expect(fs.existsSync(file)).toBe(false);
    const trash = path.join(root, '.local', 'share', 'Trash');
    expect(fs.readFileSync(path.join(trash, 'files', 'launch film.mp4'), 'utf8')).toBe('film');
    expect(fs.readFileSync(path.join(trash, 'info', 'launch film.mp4.trashinfo'), 'utf8')).toBe(`[Trash Info]\nPath=${encodeURI(file)}\nDeletionDate=2026-11-10T21:00:00\n`);
  });

  it('a second file of the same name does not replace the first in the Trash', async () => {
    for (const n of ['one', 'two']) {
      const file = path.join(root, n, 'hero.png');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, n);
      await trashFile(file, { platform: 'linux', home: root, env: {} });
    }
    const files = path.join(root, '.local', 'share', 'Trash', 'files');
    expect(fs.readdirSync(files).sort()).toEqual(['hero.2.png', 'hero.png']);
    expect(fs.readFileSync(path.join(files, 'hero.png'), 'utf8')).toBe('one');
  });

  it('uses XDG_DATA_HOME when it is set', async () => {
    const file = path.join(root, 'a.png');
    fs.writeFileSync(file, 'a');
    await trashFile(file, { platform: 'linux', home: root, env: { XDG_DATA_HOME: path.join(root, 'data') } });
    expect(fs.existsSync(path.join(root, 'data', 'Trash', 'files', 'a.png'))).toBe(true);
  });

  it('a file that is not there is refused and nothing is written', async () => {
    await expect(trashFile(path.join(root, 'gone.png'), { platform: 'linux', home: root, env: {} })).rejects.toThrow(/not there/);
    expect(fs.existsSync(path.join(root, '.local', 'share', 'Trash'))).toBe(false);
  });
});

// A power test's copies, each with a HOME of its own, sent their seeded films
// through Finder into the person's own Trash: 18 files there after one run (2026-11-13).
describe('on a Mac, a copy of the app with a home of its own', () => {
  it('keeps its own Trash in that home and says where the file went', async () => {
    const file = path.join(root, 'work', 'launch-film.mp4');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'film');
    const landed = await trashFile(file, { platform: 'darwin', home: root, realHome: '/Users/someone' });
    expect(landed).toBe(path.join(root, '.Trash', 'launch-film.mp4'));
    expect(fs.readFileSync(landed as string, 'utf8')).toBe('film');
    expect(fs.existsSync(file)).toBe(false);
  });

  it('a second file of the same name does not replace the first', async () => {
    for (const n of ['one', 'two']) {
      const file = path.join(root, n, 'hero.png');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, n);
      await trashFile(file, { platform: 'darwin', home: root, realHome: '/Users/someone' });
    }
    expect(fs.readdirSync(path.join(root, '.Trash')).sort()).toEqual(['hero 2.png', 'hero.png']);
  });

  it('the person\'s own copy, whose home is theirs, still goes through Finder and never into a folder of ours', async () => {
    const file = path.join(root, 'hero.png');
    fs.writeFileSync(file, 'x');
    const asked: string[] = [];
    await trashFile(file, { platform: 'darwin', home: root, realHome: root, finder: async (f) => { asked.push(f); } });
    expect(asked).toEqual([file]);
    expect(fs.existsSync(path.join(root, '.Trash'))).toBe(false);
  });

  it('a test copy never asks Finder', async () => {
    const file = path.join(root, 'hero.png');
    fs.writeFileSync(file, 'x');
    const asked: string[] = [];
    await trashFile(file, { platform: 'darwin', home: root, realHome: '/Users/someone', finder: async (f) => { asked.push(f); } });
    expect(asked).toEqual([]);
  });
});
