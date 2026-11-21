// AN IDLE APP LISTED EVERY PROCESS ON THE MAC TWICE A MINUTE.
//
// Two checks ran once a minute for as long as the app was open: the memory
// log (main/memory-log.mts) and the leftovers sweep (main/leftovers.mts). On a
// Mac each listing is three `ps` runs, one of them every process's whole
// environment, plus `lsof` for renamed programs, and the memory log adds
// `top -l 1` for footprints: eleven programs a minute with nothing running.
// On Linux they read all of /proc instead.
//
// With no run live and memory normal there is nothing for either to find: a
// task's programs come only from its runs, and the sweep has just seen none.
// So then the memory log's minute line is the pressure reading alone, the
// sweep does not look, and each still makes a full look every ten minutes.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MemoryLog } from '../main/memory-log.mts';
import { LeftoverCleaner } from '../main/leftovers.mts';
import { memoryWords } from '../main/freeze-watch.mts';
import type { ProcessRecord } from '../main/leftovers.mts';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-list-')); dirs.push(d); return d; };
const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 21, 12);

const proc = (pid: number, extra: Partial<ProcessRecord> = {}): ProcessRecord => ({
  pid, ppid: 1, mb: 50, start: T0 - 1000, exe: '/usr/bin/thing', cmd: 'thing', item: null, product: null, keep: false, cpu: 0, ...extra,
});

function memoryLog({ running = () => 0, free = () => 50 }: { running?: () => number; free?: () => number } = {}) {
  const dir = tmp();
  const clock = { now: T0 };
  const calls = { list: 0, footprints: 0, pressure: 0 };
  const log = new MemoryLog({
    dir,
    appPid: 10,
    now: () => clock.now,
    list: () => { calls.list += 1; return [proc(10), proc(11, { ppid: 10 }), proc(20)]; },
    footprints: () => { calls.footprints += 1; return new Map(); },
    readPressure: () => { calls.pressure += 1; return { level: 1, freePct: free(), swapInMbps: 0 }; },
    facts: () => ({ running: running(), longestStallMs: 3 }),
  });
  const lines = () => fs.readdirSync(dir).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  return { log, clock, calls, lines };
}

describe('the memory log while nothing runs', () => {
  it('writes the reading every minute and the whole listing every ten', async () => {
    const m = memoryLog();
    for (let i = 0; i <= 10; i += 1) { m.clock.now = T0 + i * MIN; await m.log.tick(); }
    expect(m.calls.list).toBe(2);
    expect(m.calls.footprints).toBe(2);
    expect(m.calls.pressure).toBe(11);
    const lines = m.lines();
    expect(lines).toHaveLength(11);
    expect(lines.every((l) => l.pressure === 'normal' && l.longestStallMs === 3)).toBe(true);
    expect(lines.filter((l) => l.app).map((l) => l.at)).toEqual([new Date(T0).toISOString(), new Date(T0 + 10 * MIN).toISOString()]);
    expect(lines[1]).not.toHaveProperty('others');
  });

  it('lists every minute while a run is live', async () => {
    let running = 0;
    const m = memoryLog({ running: () => running });
    await m.log.tick();
    running = 1;
    for (let i = 1; i <= 3; i += 1) { m.clock.now = T0 + i * MIN; await m.log.tick(); }
    expect(m.calls.list).toBe(4);
  });

  it('lists every minute while memory is tight', async () => {
    let free = 50;
    const m = memoryLog({ free: () => free });
    await m.log.tick();
    free = 8;
    for (let i = 1; i <= 3; i += 1) { m.clock.now = T0 + i * MIN; await m.log.tick(); }
    expect(m.calls.list).toBe(4);
    expect(m.lines().slice(1).every((l) => l.pressure === 'tight' && l.app)).toBe(true);
  });

  it('says what held memory only from a minute that listed it', () => {
    const words = memoryWords([
      { at: T0, pressure: 'normal', swapInMbps: 1, app: { mb: 400 }, tasks: [], others: [{ name: 'backup', mb: 900 }] },
      { at: T0 + MIN, pressure: 'normal', swapInMbps: 5 },
    ]);
    expect(words.join(' ')).not.toMatch(/the app 0 MB/);
    expect(words.join(' ')).toMatch(/swapped hardest/);
  });
});

function cleaner(procs: () => ProcessRecord[], pressure: () => 'normal' | 'tight' | 'critical' = () => 'normal') {
  const clock = { now: T0 };
  const calls = { list: 0 };
  const c = new LeftoverCleaner({
    list: () => { calls.list += 1; return procs(); },
    clock: () => clock.now,
    readPressure: pressure,
    enabledSince: T0 - 60 * MIN,
  });
  return { c, clock, calls };
}

describe('the leftovers sweep while nothing runs', () => {
  it('looks at start, then not again for ten minutes', async () => {
    const s = cleaner(() => [proc(20)]);
    for (let i = 0; i <= 10; i += 1) { s.clock.now = T0 + i * MIN; await s.c.tick(); }
    expect(s.calls.list).toBe(2);
  });

  it('looks at the next tick once a run starts, and while it runs', async () => {
    const s = cleaner(() => [proc(20)]);
    await s.c.tick();
    s.c.starting('w-abc123');
    for (let i = 1; i <= 3; i += 1) { s.clock.now = T0 + i * MIN; await s.c.tick(); }
    expect(s.calls.list).toBe(4);
  });

  it('keeps looking every minute while a task still has programs', async () => {
    let procs = [proc(20), proc(30, { item: 'w-abc123', product: 'p' })];
    const s = cleaner(() => procs);
    await s.c.tick();
    s.clock.now = T0 + MIN; await s.c.tick();
    expect(s.calls.list).toBe(2);
    procs = [proc(20)];
    s.clock.now = T0 + 2 * MIN; await s.c.tick();
    s.clock.now = T0 + 3 * MIN; await s.c.tick();
    expect(s.calls.list).toBe(3);
  });

  it('looks every minute while memory is short', async () => {
    let p: 'normal' | 'critical' = 'normal';
    const s = cleaner(() => [proc(20)], () => p);
    await s.c.tick();
    p = 'critical';
    for (let i = 1; i <= 3; i += 1) { s.clock.now = T0 + i * MIN; await s.c.tick(); }
    expect(s.calls.list).toBe(4);
    expect(s.c.status().pressure).toBe('critical');
  });
});
