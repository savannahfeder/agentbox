// A FINISHED RUN'S PROGRAM THAT KEEPS A CORE BUSY IS STOPPED.
//
// What broke, 2026-11-13 on the founder's 10-core, 16 GB Mac: a power test
// started headless browsers at 10:43pm, its run was stopped at 11:18pm, and at
// 1:36am five of the browsers' processes were still running at 85-100% of a
// core each, about 116 minutes of CPU apiece. Load average 204, the app
// "very slow", and an hour earlier the Mac had to be restarted. The leftovers
// sweep saw them, tagged with the thread, and stopped nothing: its rules stop a
// finished run's programs only when the thread is closed, or when memory is
// critical, and the thread was open waiting on the person while memory sat at
// 50% free. CPU counted for nothing.
//
// So CPU is a reason too: a program left by a run that ended 10 minutes ago or
// more, which used half a core or more over the last 5 minutes, has its task's
// programs stopped as a closed task's are, with every other rule unchanged.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseListings, readLinuxProcesses, LeftoverCleaner, type ProcessRecord } from '../main/leftovers.mts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = 1_791_200_000_000;
const sec = (ms: number) => Math.floor(ms / 1000);
const CHROME = '/Users/x/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const proc = (pid: number, ppid: number, extra: Partial<ProcessRecord> = {}): ProcessRecord => ({
  pid, ppid, mb: 200, start: sec(T0 - 3 * HOUR), exe: CHROME, cmd: 'Google Chrome for Testing --headless=new',
  item: 'w-power', product: 'demo', keep: false, cpu: 0, ...extra,
});

function harness({ closedAt = () => null as number | null, pressure = 'normal' as const, enabled = true } = {}) {
  let now = T0;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'busy-'));
  const signals: number[] = [];
  const live = new Set<string>();
  // The browser idles; its renderer burns `share` of a core.
  let share = 0.95;
  let used = 0;
  let extra: Partial<ProcessRecord> = {};
  const list = () => [proc(100, 1, { cpu: 3, ...extra }), proc(101, 100, { cpu: used, ...extra })];
  const cleaner = new LeftoverCleaner({
    list: async () => list(),
    kill: (pid) => { signals.push(pid); },
    clock: () => now,
    readPressure: async () => pressure,
    file: path.join(dir, 'leftovers.json'),
    enabledSince: T0 - 10 * HOUR,
    live: (item) => live.has(item),
    owns: () => true,
    closedAt,
    enabled,
  });
  return {
    cleaner, signals, live,
    setShare: (s: number) => { share = s; },
    setExtra: (e: Partial<ProcessRecord>) => { extra = e; },
    // The app's timer looks about every minute.
    minutes: async (n: number) => {
      for (let i = 0; i < n; i++) { now += MIN; used += share * 60; await cleaner.tick(); }
    },
  };
}

describe('a leftover that keeps a core busy', () => {
  it('is stopped with its task\'s other programs, though the thread is open and memory is fine', async () => {
    const h = harness();
    h.cleaner.ended('w-power');
    await h.minutes(16);
    expect(h.signals.sort()).toEqual([100, 101]);
  });

  it('is not stopped in the first ten minutes after the run ended', async () => {
    const h = harness();
    h.cleaner.ended('w-power');
    await h.minutes(9);
    expect(h.signals).toEqual([]);
  });

  it('a leftover using under half a core is left as before', async () => {
    const h = harness();
    h.setShare(0.4);
    h.cleaner.ended('w-power');
    await h.minutes(60);
    expect(h.signals).toEqual([]);
  });

  it('a thread with its agent still running is never touched, however busy', async () => {
    const h = harness();
    h.cleaner.ended('w-power');
    h.live.add('w-power');
    await h.minutes(60);
    expect(h.signals).toEqual([]);
  });

  it('a program marked to keep is never stopped, however busy', async () => {
    const h = harness();
    h.setExtra({ keep: true });
    h.cleaner.ended('w-power');
    await h.minutes(60);
    expect(h.signals).toEqual([]);
  });

  it('with the sweep switched off it is only reported', async () => {
    const h = harness({ enabled: false });
    h.cleaner.ended('w-power');
    await h.minutes(60);
    expect(h.signals).toEqual([]);
    expect(h.cleaner.status().leftovers.map((l) => l.item)).toEqual(['w-power']);
  });

  it('a program whose CPU time cannot be read is judged by the old rules alone', async () => {
    const h = harness();
    h.setExtra({ cpu: null });
    h.cleaner.ended('w-power');
    await h.minutes(60);
    expect(h.signals).toEqual([]);
  });
});

describe('reading CPU time', () => {
  const lstart = 'Thu Nov 12 22:43:11 2026';
  const argv = `60351 ${lstart} Google Chrome for Testing Helper (Renderer)`;
  const full = `${argv} ZERO_ITEM=w-d129192001`;

  it('reads macOS minutes and seconds, past sixty minutes', () => {
    const [p] = parseListings({ base: `60351 60310  86176 116:10.86 ${lstart}     ${CHROME}`, argv, full });
    expect(p.cpu).toBeCloseTo(116 * 60 + 10.86, 2);
    expect(p.item).toBe('w-d129192001');
    expect(p.exe).toBe(CHROME);
  });

  it('reads hours and days when ps gives them', () => {
    const [p] = parseListings({ base: `60351 60310  86176 1-02:03:04.50 ${lstart}     ${CHROME}`, argv, full });
    expect(p.cpu).toBeCloseTo(86400 + 2 * 3600 + 3 * 60 + 4.5, 2);
  });

  it('still reads a listing without the column, with no CPU time', () => {
    const [p] = parseListings({ base: `60351 60310  86176 ${lstart}     ${CHROME}`, argv, full });
    expect(p.cpu).toBeNull();
    expect(p.exe).toBe(CHROME);
    expect(p.start).not.toBeNull();
  });

  it('reads user and system time from /proc on Linux', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'proc-'));
    fs.writeFileSync(path.join(root, 'stat'), 'btime 1700000000\n');
    const dir = path.join(root, '4242');
    fs.mkdirSync(dir);
    // Fields after the name: state ppid pgrp session tty tpgid flags minflt cminflt majflt cmajflt utime stime ... starttime (20th).
    const after = ['R', '1', '1', '1', '0', '-1', '0', '0', '0', '0', '0', '12345', '655', '0', '0', '20', '0', '1', '0', '500'];
    fs.writeFileSync(path.join(dir, 'stat'), `4242 (chrome) ${after.join(' ')}\n`);
    fs.writeFileSync(path.join(dir, 'environ'), 'ZERO_ITEM=w-power\0');
    fs.writeFileSync(path.join(dir, 'cmdline'), 'chrome\0');
    fs.writeFileSync(path.join(dir, 'status'), 'VmRSS:\t1024 kB\n');
    const [p] = readLinuxProcesses({ root });
    expect(p.cpu).toBeCloseTo((12345 + 655) / 100, 2);
  });
});
