// THE FOLDER CHOOSER OPENS WHERE THE PROJECTS ARE (F-148, w-b54c790f9a).
//
// What broke: on the first run, "Which project is it for?" with nothing to
// offer opened the system's folder window on the home folder. A tester on a
// fresh Debian box saw one folder listed, the Agentbox clone they had just
// made, and had to press Ctrl+L to type a real path. The home folder is also
// the one folder the check below refuses outright, so the window opened on a
// place nothing in it could be chosen.
//
// How it was measured: screenshots b008-07 to b008-09 of the README desktop
// flow on main 5bf0ec64, Debian 13, Oct 28 2026.
//
// The rule: the window opens at the first of these that exists on the disk —
// where the screen asked for, then beside the projects already connected,
// then the folder people keep code in, then home as the last resort. Main
// walks the list; this is the list.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooserStartsIn } from '../shared/project-folder-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const home = '/home/box';

describe('where the folder chooser opens', () => {
  it('opens where the screen asked, first of all', () => {
    const order = chooserStartsIn('/home/box/work/app', { known: ['/home/box/code/one'], home });
    expect(order[0]).toBe('/home/box/work/app');
  });

  it('opens beside the projects already connected, newest of nothing asked for', () => {
    const order = chooserStartsIn(null, { known: ['/home/box/code/one', '/home/box/code/two'], home });
    expect(order[0]).toBe('/home/box/code');
  });

  it('prefers the parent that holds the most projects', () => {
    const order = chooserStartsIn(null, { known: ['/home/box/odd/one', '/home/box/code/a', '/home/box/code/b'], home });
    expect(order[0]).toBe('/home/box/code');
    expect(order).toContain('/home/box/odd');
  });

  // The folder a project sits in can be one the check refuses whole.
  it('never offers the home folder before anything else', () => {
    const order = chooserStartsIn(null, { known: ['/home/box/app'], home });
    expect(order[0]).not.toBe(home);
    expect(order[order.length - 1]).toBe(home);
  });

  it('falls back to the folders people keep code in when nothing is connected', () => {
    const order = chooserStartsIn(null, { known: [], home });
    expect(order).toEqual([
      '/home/box/dev', '/home/box/code', '/home/box/src', '/home/box/Projects',
      '/home/box/projects', '/home/box/Developer', '/home/box/repos', '/home/box/workspace',
      home,
    ]);
  });

  it('ends on home, so there is always somewhere to open', () => {
    expect(chooserStartsIn(null, { known: [], home: '' })).toEqual([]);
    expect(chooserStartsIn(null, { known: [], home }).at(-1)).toBe(home);
  });

  it('names each folder once', () => {
    const order = chooserStartsIn('/home/box/dev', { known: ['/home/box/dev/a', '/home/box/dev/b'], home });
    expect(order.filter((f) => f === '/home/box/dev')).toHaveLength(1);
  });
});

describe('the handler that opens the window', () => {
  const ipc = fs.readFileSync(path.join(root, 'main', 'ipc.mjs'), 'utf8');
  const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:choose-folder'"), ipc.indexOf('zero:list-folders'));

  it('builds its list from the projects already connected', () => {
    expect(handler).toMatch(/chooserStartsIn\(startIn, \{ known: connected, home: os\.homedir\(\) \}\)/);
    expect(handler).toContain('store.listProducts()');
  });

  // The candidates are guesses, and a defaultPath that is not there leaves the
  // chooser wherever the system felt like.
  it('opens on the first candidate that is a folder on this disk', () => {
    expect(handler).toMatch(/\.find\(isDir\)/);
    expect(handler).toContain('defaultPath: openAt');
    expect(handler).not.toContain('defaultPath: startIn');
  });
});
