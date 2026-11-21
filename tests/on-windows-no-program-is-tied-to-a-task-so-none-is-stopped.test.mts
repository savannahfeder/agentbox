// ON WINDOWS THE LEFTOVER SWEEP READ /proc, WHICH WINDOWS DOES NOT HAVE.
// listProcesses sent every platform but darwin to the Linux reader, so on
// Windows 11 with Node 24.11 it read <drive>:\proc and threw ENOENT, and the
// sweep logged "could not list processes" every one to five minutes.
//
// A program is tied to its task only by ZERO_ITEM in its ENVIRONMENT; a tag in
// its command line counts for nothing (main/leftovers.mts). Windows lets no
// process read another's environment, so nothing can be tied to a task there,
// and guessing from command lines could stop the person's own programs. On
// Windows the listing is now empty: nothing is attributed and nothing is
// stopped. Every listing and kill here is a fake.

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { LeftoverCleaner, listProcesses, seesTaskTags } from '../main/leftovers.mts';
import type { ProcessRecord } from '../main/leftovers.mts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_791_200_000_000;
const sec = (ms: number) => Math.floor(ms / 1000);

afterEach(() => { vi.restoreAllMocks(); });

function cleaner(list: () => Promise<ProcessRecord[]>) {
  let now = T0;
  const signals: [number, string][] = [];
  const c = new LeftoverCleaner({
    list, kill: (pid, sig) => { signals.push([pid, sig]); }, clock: () => now,
    readPressure: async () => 'critical', enabledSince: 0, owns: () => true,
    closedAt: () => T0,
  });
  return { c, signals, advance: (ms: number) => { now += ms; } };
}

describe('telling a program\'s task on Windows', () => {
  it('is possible on a Mac and on Linux and not on Windows', () => {
    expect(seesTaskTags('darwin')).toBe(true);
    expect(seesTaskTags('linux')).toBe(true);
    expect(seesTaskTags('win32')).toBe(false);
  });

  it('lists nothing on Windows and never looks for /proc', async () => {
    const readdir = vi.spyOn(fs, 'readdirSync');
    const read = vi.spyOn(fs, 'readFileSync');
    await expect(listProcesses('win32')).resolves.toEqual([]);
    expect(readdir).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  // Guards the rule; this passed before the change too. The two tests above
  // are the ones that prove the fix.
  it('stops nothing on Windows, with the switch on, the task closed and memory critical', async () => {
    const h = cleaner(() => listProcesses('win32'));
    h.c.ended('w-0123abcd');
    for (let i = 0; i < 48; i++) { h.advance(HOUR); await h.c.tick(); }
    expect(h.signals).toEqual([]);
    expect(h.c.status().leftovers).toEqual([]);
  });
});

describe('the person\'s own programs', () => {
  // What a Windows listing could at most say: command lines, some carrying a
  // task id in their words, none read from an environment.
  const win = (pid: number, ppid: number, exe: string, cmd: string): ProcessRecord => ({
    pid, ppid, mb: 300, start: sec(T0 - HOUR), exe, cmd, item: null, product: null, keep: false, cpu: 9_999,
  });
  const decoys = [
    win(process.pid, 1, 'C:\\agentbox\\node.exe', 'node main.mts ZERO_ITEM=w-0123abcd'),
    win(4100, 1, 'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT\\ChatGPT.exe', 'ChatGPT.exe'),
    win(4101, 4100, 'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT\\codex.exe', 'codex.exe app-server ZERO_ITEM=w-0123abcd'),
    win(4102, 4100, 'C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT\\codex-windows-sandbox-service.exe', 'codex-windows-sandbox-service.exe'),
    win(4103, 4100, 'C:\\Program Files\\nodejs\\node.exe', 'node node_repl'),
    win(4200, 1, 'C:\\Users\\x\\.local\\bin\\claude.exe', 'claude.exe --resume ZERO_ITEM=w-0123abcd'),
    win(4300, 1, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'chrome.exe'),
    win(4301, 1, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'msedge.exe'),
    win(4400, 4200, 'C:\\Program Files\\nodejs\\node.exe', 'node next dev ZERO_ITEM=w-0123abcd'),
  ];

  // Guards the rule; this passed before the change too.
  it('are never taken for a task\'s, even with a task id in their command line', async () => {
    const h = cleaner(async () => decoys.map((d) => ({ ...d })));
    h.c.ended('w-0123abcd');
    for (let i = 0; i < 48; i++) { h.advance(HOUR); await h.c.tick(); }
    expect(h.signals).toEqual([]);
    expect(h.c.status().leftovers).toEqual([]);
    expect(h.c.hasPrograms('w-0123abcd')).toBe(false);
  });
});
