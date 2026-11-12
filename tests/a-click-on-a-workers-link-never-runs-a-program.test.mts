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
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const file = (name: string, mode = 0o644) => { const p = path.join(dir, name); fs.writeFileSync(p, '#!/bin/sh\necho hi\n'); fs.chmodSync(p, mode); return p; };
const folder = (name: string) => { const p = path.join(dir, name); fs.mkdirSync(path.join(p, 'Contents'), { recursive: true }); return p; };

describe('a file that runs a program', () => {
  it('is any of the kinds macOS runs or launches on a double-click', () => {
    for (const name of ['notes.command', 'notes.tool', 'notes.terminal', 'x.fileloc', 'x.webloc', 'x.inetloc', 'x.scpt', 'x.applescript', 'x.pkg', 'x.jar', 'NOTES.COMMAND']) {
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
    expect(await openForThePerson(shell, p)).toBe('');
    expect(shell.calls).toEqual([['open', p]]);
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
