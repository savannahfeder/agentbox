// A CLICK ON A WORKER'S LINK NEVER RUNS A PROGRAM.
//
// A link or file chip the pane does not draw went to shell.openPath, which on
// macOS is a double-click. The 2026-11-10 security audit wrote notes.command
// (0755) in a thread's task folder, linked it, and the app handed it to
// openPath: Terminal would run it as the person, outside the worker's sandbox
// and its permission mode. Now a file that runs a program is shown in Finder
// instead, from every place the app opens a file for the person.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { opensAProgram, openForThePerson } from '../main/opens-a-program.mts';

let dir: string;
// Resolved, because a file is opened at its checked real path and a Mac's temp folder is behind a link.
beforeEach(() => { dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'launch-'))); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const file = (name: string, mode = 0o644) => { const p = path.join(dir, name); fs.writeFileSync(p, '#!/bin/sh\necho hi\n'); fs.chmodSync(p, mode); return p; };
const folder = (name: string) => { const p = path.join(dir, name); fs.mkdirSync(path.join(p, 'Contents'), { recursive: true }); return p; };

describe('a file that runs a program', () => {
  it('is any of the kinds macOS runs or launches on a double-click', () => {
    // .term is a Terminal session file Terminal.app claims (weekly audit, 2026-11-16).
    for (const name of ['notes.command', 'notes.tool', 'notes.terminal', 'x.term', 'X.TERM', 'x.fileloc', 'x.webloc', 'x.inetloc', 'x.scpt', 'x.applescript', 'x.pkg', 'x.jar', 'NOTES.COMMAND']) {
      expect(opensAProgram(file(name)), name).toBe(true);
    }
    for (const name of ['Tool.app', 'Flow.workflow', 'Thing.prefPane']) expect(opensAProgram(folder(name)), name).toBe(true);
  });

  it('is any file with an executable bit, whatever its name', () => {
    expect(opensAProgram(file('runme', 0o755))).toBe(true);
    expect(opensAProgram(file('report.pdf', 0o744))).toBe(true);
  });

  it('is a link to one', () => {
    const link = path.join(dir, 'harmless.pdf');
    fs.symlinkSync(file('real.command'), link);
    expect(opensAProgram(link)).toBe(true);
  });

  it('is not a picture, a document or an ordinary folder', () => {
    for (const name of ['shot.png', 'report.pdf', 'notes.md', 'deck.key', 'leads.csv', 'notes.sh']) expect(opensAProgram(file(name)), name).toBe(false);
    expect(opensAProgram(folder('designs'))).toBe(false);
    expect(opensAProgram(path.join(dir, 'missing.command'))).toBe(false);
  });
});

describe('opening a file for the person', () => {
  const fakeShell = () => {
    const calls: [string, string][] = [];
    return { calls, openPath: async (p: string) => { calls.push(['open', p]); return ''; }, showItemInFolder: (p: string) => { calls.push(['finder', p]); } };
  };

  it('shows a program in Finder and opens nothing', async () => {
    const shell = fakeShell();
    const p = file('notes.command', 0o755);
    expect(await openForThePerson(shell, p)).toBe('');
    expect(shell.calls).toEqual([['finder', p]]);
  });

  it('opens anything else as before', async () => {
    const shell = fakeShell();
    const p = file('report.pdf');
    expect(await openForThePerson(shell, p, { platform: 'linux' })).toBe('');
    expect(shell.calls).toEqual([['open', p]]);
  });

  it('shows a program in Finder on a Mac too, where files open another way', async () => {
    const shell = fakeShell();
    const ran: string[][] = [];
    const p = file('notes.command', 0o755);
    expect(await openForThePerson(shell, p, { platform: 'darwin', run: async (cmd, args) => { ran.push([cmd, ...args]); } })).toBe('');
    expect(ran).toEqual([]);
    expect(shell.calls).toEqual([['finder', p]]);
  });
});

// The check resolved a link and open resolved it again, so a worker's process
// swapping report.pdf to a link to its own Evil.app between the two had it
// launched: 26 clicks in 300 with a fake opener (security review, 2026-11-23).
// Now open gets the path that was checked and the app the Mac picked for it, so
// whatever the path is by then reaches that app as a document.
describe('a link swapped between the check and the open', () => {
  it('opens the checked file in the app the Mac picked for it, whatever the link became', async () => {
    const real = file('real.pdf');
    const evil = folder('Evil.app');
    const link = path.join(dir, 'report.pdf');
    fs.symlinkSync(real, link);
    const ran: string[][] = [];
    const asked: string[] = [];
    const defaultApp = async (p: string) => { asked.push(p); fs.unlinkSync(link); fs.symlinkSync(evil, link); return '/System/Applications/Preview.app'; };
    expect(await openForThePerson({ openPath: async () => '', showItemInFolder: () => {} }, link, { platform: 'darwin', defaultApp, run: async (cmd, args) => { ran.push([cmd, ...args]); } })).toBe('');
    expect(asked).toEqual([fs.realpathSync(real)]);
    expect(ran).toEqual([['/usr/bin/open', '-a', '/System/Applications/Preview.app', fs.realpathSync(real)]]);
  });

  it('opens the checked file as before when the Mac names no app, without failing', async () => {
    const real = file('real.pdf');
    const ran: string[][] = [];
    await openForThePerson({ openPath: async () => '', showItemInFolder: () => {} }, real, { platform: 'darwin', defaultApp: async () => null, run: async (cmd, args) => { ran.push([cmd, ...args]); } });
    expect(ran).toEqual([['/usr/bin/open', fs.realpathSync(real)]]);
  });
});

describe('every place the app opens a file', () => {
  it('goes through openForThePerson, never straight to shell.openPath', () => {
    for (const f of ['main/ipc.mts', 'main/main.mts']) {
      const text = fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      expect(text, f).not.toMatch(/shell\.openPath!?\(/);
      expect(text, f).toContain('openForThePerson(');
    }
  });
});
