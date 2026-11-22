// THE MEMORY LOG DID NOT SAY WHAT THE APP ITSELF WAS USING, MINUTE BY MINUTE.
//
// The person sees the app at up to 3 GB, and the Performance lead's daily
// check reads the memory log to find out why. The minute line named the app's
// memory only from a whole process listing, which an idle app now takes once
// every ten minutes (tests/an-idle-app-lists-every-process-once-every-ten-minutes),
// and it never said how much CPU the app used or how often it woke the Mac.
// Measured on Linux before this: no line carried either.
//
// Electron counts both for each of its own processes, so every minute's line
// now carries `own`: memory, CPU and idle wake-ups for the main process, the
// windows, the GPU process and the other helpers, read without starting a
// program.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ownUseReader } from '../main/own-use.mts';
import type { MetricLike } from '../main/own-use.mts';
import { MemoryLog } from '../main/memory-log.mts';

const T0 = Date.UTC(2026, 10, 22, 12);
const MIN = 60_000;
const metric = (pid: number, type: string, kb: number, cpuSec: number, wakeups = 0, creationTime = T0 - 3_600_000): MetricLike => ({
  pid, type, creationTime, cpu: { cumulativeCPUUsage: cpuSec, percentCPUUsage: 0, idleWakeupsPerSecond: wakeups }, memory: { workingSetSize: kb },
});

describe("the app's own use", () => {
  it('sums memory by kind of process, and gives no CPU until it has two readings', () => {
    const clock = { now: T0 };
    const read = ownUseReader(() => [
      metric(1, 'Browser', 200 * 1024, 100, 80),
      metric(2, 'Tab', 100 * 1024, 50, 5),
      metric(3, 'Tab', 50 * 1024, 5, 1),
      metric(4, 'GPU', 64 * 1024, 20),
      metric(5, 'Utility', 20 * 1024, 1),
      metric(6, 'Zygote', 12 * 1024, 0),
    ], () => clock.now);
    const use = read();
    expect(use).toMatchObject({ mb: 446, cpu: null, wakeups: 86 });
    expect(use.main).toEqual({ mb: 200, cpu: null, wakeups: 80 });
    expect(use.windows).toEqual({ mb: 150, cpu: null, wakeups: 6 });
    expect(use.gpu.mb).toBe(64);
    expect(use.helpers.mb).toBe(32);
  });

  it('gives CPU as a share of one core over the time since the last reading', () => {
    const clock = { now: T0 };
    let main = 100;
    let list = () => [metric(1, 'Browser', 200 * 1024, main), metric(2, 'Tab', 100 * 1024, 50)];
    const read = ownUseReader(() => list(), () => clock.now);
    read();
    clock.now += MIN;
    main += 0.6;
    const use = read();
    expect(use.main.cpu).toBe(1);
    expect(use.windows.cpu).toBe(0);
    expect(use.cpu).toBe(1);
    // A window opened since the last reading counts all of its time; one that closed counts none.
    list = () => [metric(1, 'Browser', 200 * 1024, main), metric(7, 'Tab', 90 * 1024, 1.2, 0, clock.now - 1000)];
    clock.now += MIN;
    expect(read().windows.cpu).toBe(2);
  });

  it('is on every minute line, the quiet ones included', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-use-'));
    try {
      const clock = { now: T0 };
      let n = 0;
      const log = new MemoryLog({
        dir,
        now: () => clock.now,
        list: () => [],
        footprints: () => new Map(),
        readPressure: () => ({ level: 1, freePct: 50, swapInMbps: 0 }),
        facts: () => ({ running: 0 }),
        own: () => ({ mb: 400 + n, cpu: 0.5, wakeups: 90 }),
      });
      for (n = 0; n < 3; n += 1) { clock.now = T0 + n * MIN; await log.tick(); }
      const lines = fs.readdirSync(dir).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
      expect(lines.map((l) => l.own?.mb)).toEqual([400, 401, 402]);
      expect(lines.filter((l) => l.app)).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still writes the line when the app cannot be read', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-use-'));
    try {
      const log = new MemoryLog({ dir, list: () => [], footprints: () => new Map(), readPressure: () => ({}), own: () => { throw new Error('no app'); } });
      await log.tick();
      const [line] = fs.readdirSync(dir).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
      expect(line.at).toBeTruthy();
      expect(line.own).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
