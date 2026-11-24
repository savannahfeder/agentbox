// Daily security review, 2026-11-24. A click on a worker's file link checks
// the file, asks the Mac which app opens it (osascript, a few hundred
// milliseconds) and then runs /usr/bin/open. A path with nothing at it skipped
// the check altogether and, with no app named for it, went to a plain `open`:
// a worker process that put Evil.app there during the lookup had it launched as
// the person. Measured with a stand-in lookup that creates the bundle: the open
// ran on it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openForThePerson, opensAProgram } from '../main/opens-a-program.mts';

let dir = '';
beforeEach(() => { dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'swapped-open-'))); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const shell = () => { const shown: string[] = []; return { shown, openPath: async () => '', showItemInFolder: (p: string) => { shown.push(p); } }; };
const ran = () => { const calls: string[][] = []; return { calls, run: async (cmd: string, args: string[]) => { calls.push([cmd, ...args]); } }; };
const app = (at: string) => { fs.mkdirSync(path.join(at, 'Contents', 'MacOS'), { recursive: true }); fs.writeFileSync(path.join(at, 'Contents', 'MacOS', 'x'), '#!/bin/sh\n', { mode: 0o755 }); };

describe('a click on a file link', () => {
  it('opens nothing at a path that held nothing when it was checked', async () => {
    const p = path.join(dir, 'report.pdf');
    const r = ran();
    const said = await openForThePerson(shell(), p, { platform: 'darwin', run: r.run, defaultApp: async () => { app(p); return null; } });
    expect(r.calls).toEqual([]);
    expect(said).toBe('Failed to open path');
    expect(opensAProgram(path.join(dir, 'nothing-here'))).toBe(false);
  });

  it('opens nothing when the file was swapped for another while the Mac looked up its app', async () => {
    const p = path.join(dir, 'notes.txt');
    fs.writeFileSync(p, 'notes');
    const r = ran();
    await openForThePerson(shell(), p, { platform: 'darwin', run: r.run, defaultApp: async () => {
      fs.rmSync(p); app(path.join(dir, 'Evil.app')); fs.symlinkSync(path.join(dir, 'Evil.app'), p); return '/System/Applications/TextEdit.app';
    } });
    expect(r.calls).toEqual([]);
  });

  it('opens nothing when the file was replaced in place by a program', async () => {
    const p = path.join(dir, 'run-me');
    fs.writeFileSync(p, 'plain');
    const r = ran();
    await openForThePerson(shell(), p, { platform: 'darwin', run: r.run, defaultApp: async () => {
      const other = path.join(dir, 'other'); fs.writeFileSync(other, '#!/bin/sh\n', { mode: 0o755 }); fs.renameSync(other, p); return null;
    } });
    expect(r.calls).toEqual([]);
  });

  it('still opens a file that stayed as it was, with the app the Mac named', async () => {
    const p = path.join(dir, 'notes.txt');
    fs.writeFileSync(p, 'notes');
    const r = ran();
    expect(await openForThePerson(shell(), p, { platform: 'darwin', run: r.run, defaultApp: async () => '/System/Applications/TextEdit.app' })).toBe('');
    expect(r.calls).toEqual([['/usr/bin/open', '-a', '/System/Applications/TextEdit.app', p]]);
  });

  it('and a folder that stayed a folder', async () => {
    const p = path.join(dir, 'Designs');
    fs.mkdirSync(p);
    const r = ran();
    await openForThePerson(shell(), p, { platform: 'darwin', run: r.run, defaultApp: async () => '/System/Library/CoreServices/Finder.app' });
    expect(r.calls).toEqual([['/usr/bin/open', '-a', '/System/Library/CoreServices/Finder.app', p]]);
  });
});
