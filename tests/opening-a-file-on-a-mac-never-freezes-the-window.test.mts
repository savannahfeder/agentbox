// OPENING A FILE ON A MAC NEVER FREEZES THE WINDOW.
//
// What broke (2026-11-22): the open mark over a table handed the csv to
// shell.openPath, and the whole app stopped answering for about ten seconds
// until Codex, the Mac's app for .csv, had started. Electron 43.8.4's OpenPath
// (shell/common/platform_util_mac.mm) calls the blocking
// `[[NSWorkspace sharedWorkspace] openURL:]` on the main thread, so the window
// waits for the other app's launch. shell.openExternal uses the asynchronous
// call and never froze. Now a Mac opens a file with /usr/bin/open in a child
// process, with a deadline, and the window carries on while the app starts.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openForThePerson, OPEN_MS } from '../main/opens-a-program.mts';

type Call = [string, string[], { timeout: number }];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opens-'));
const file = (name: string, mode = 0o644) => { const p = path.join(dir, name); fs.writeFileSync(p, 'a,b\n1,2\n'); fs.chmodSync(p, mode); return p; };

const electronShell = () => {
  const calls: string[][] = [];
  return { calls, openPath: async (p: string) => { calls.push(['openPath', p]); return ''; }, showItemInFolder: (p: string) => { calls.push(['finder', p]); } };
};
const opener = (answer: () => Promise<unknown> = async () => {}) => {
  const calls: Call[] = [];
  return { calls, run: (cmd: string, args: string[], opts: { timeout: number }) => { calls.push([cmd, args, opts]); return answer(); } };
};

describe('a file opened on a Mac', () => {
  it('goes to /usr/bin/open in its own process, never to shell.openPath', async () => {
    const shell = electronShell();
    const open = opener();
    const p = file('leads.csv');
    expect(await openForThePerson(shell, p, { platform: 'darwin', run: open.run })).toBe('');
    expect(open.calls).toEqual([['/usr/bin/open', [p], { timeout: OPEN_MS }]]);
    expect(shell.calls).toEqual([]);
  });

  it('leaves the window free while the app it opens is still starting', async () => {
    let started!: () => void;
    const open = opener(() => new Promise<void>((resolve) => { started = resolve; }));
    let done = false;
    const opening = openForThePerson(electronShell(), file('slow.csv'), { platform: 'darwin', run: open.run }).then(() => { done = true; });
    await new Promise((r) => setImmediate(r));
    expect(open.calls).toHaveLength(1);
    expect(done).toBe(false);
    started();
    await opening;
    expect(done).toBe(true);
  });

  it('has a deadline, and one that lets a slow app start', () => {
    expect(OPEN_MS).toBeGreaterThanOrEqual(30_000);
    expect(OPEN_MS).toBeLessThanOrEqual(120_000);
  });

  it('says it failed when open refuses or runs out of time, as shell.openPath did', async () => {
    const refused = opener(async () => { throw new Error('No application knows how to open URL'); });
    expect(await openForThePerson(electronShell(), file('x.unknownkind'), { platform: 'darwin', run: refused.run })).toBe('Failed to open path');
    const late = opener(async () => { throw Object.assign(new Error('timed out'), { killed: true, signal: 'SIGTERM' }); });
    expect(await openForThePerson(electronShell(), file('late.csv'), { platform: 'darwin', run: late.run })).toBe('Failed to open path');
  });

  it('hands open a full path, so a name starting with a dash is never read as a flag', async () => {
    const open = opener();
    const p = file('-a');
    await openForThePerson(electronShell(), path.relative(process.cwd(), p), { platform: 'darwin', run: open.run });
    expect(open.calls[0][1]).toEqual([p]);
    expect(open.calls[0][1][0].startsWith('/')).toBe(true);
  });

  it('still shows a program in Finder and opens nothing', async () => {
    const shell = electronShell();
    const open = opener();
    const p = file('notes.command', 0o755);
    expect(await openForThePerson(shell, p, { platform: 'darwin', run: open.run })).toBe('');
    expect(open.calls).toEqual([]);
    expect(shell.calls).toEqual([['finder', p]]);
  });

  it('opens nothing from a copy whose shell cannot open files, as before', async () => {
    const open = opener();
    expect(await openForThePerson({ showItemInFolder: () => {} }, file('quiet.csv'), { platform: 'darwin', run: open.run })).toBe('');
    expect(open.calls).toEqual([]);
  });
});

describe('a file opened anywhere else', () => {
  it('still goes to shell.openPath, which does not wait on the window there', async () => {
    for (const platform of ['linux', 'win32'] as const) {
      const shell = electronShell();
      const open = opener();
      const p = file(`${platform}.csv`);
      expect(await openForThePerson(shell, p, { platform, run: open.run })).toBe('');
      expect(shell.calls).toEqual([['openPath', p]]);
      expect(open.calls).toEqual([]);
    }
  });
});
