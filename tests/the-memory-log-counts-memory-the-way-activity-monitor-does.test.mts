// THE MEMORY LOG COUNTS MEMORY THE WAY ACTIVITY MONITOR DOES.
//
// 2026-11-09 the Mac swapped from 7 GB to 15 GB in four minutes and froze, and
// the memory log could not say what held it: its minute lines summed every
// program on the Mac to 7 GB. It counted resident memory (`ps` rss), which on
// a Mac leaves out everything compressed or swapped, so the harder the Mac
// swaps the less the log sees. Measured that evening on the same Mac at 47%
// free: rss summed to 11.2 GB, Activity Monitor's figure (`top`'s MEM, the
// footprint) to 20.7 GB; the app's own main process read 0.6 GB by rss and
// 2.0 GB by footprint.
//
// Now each program is counted by its footprint where `top` gives one, rss
// otherwise, and the line says which it used.

import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { footprintsFromTop, MemoryLog } from '../main/memory-log.mts';

const TOP = `Processes: 812 total, 4 running, 808 sleeping, 4120 threads
2026/11/09 21:30:01
Load Avg: 3.10, 3.40, 3.62
PhysMem: 22G used (3100M wired, 6100M compressor), 1300M unused.

PID    MEM
96382  2144M
95150  1965M+
410    678M-
3054   812K
77     1.5G
12     0B
abc    12M
`;

describe('reading top', () => {
  const fp = footprintsFromTop(TOP);

  it('reads megabytes, kilobytes, gigabytes and bytes, with or without a trend mark', () => {
    expect(fp.get(96382)).toBe(2144);
    expect(fp.get(95150)).toBe(1965);
    expect(fp.get(410)).toBe(678);
    expect(fp.get(3054)).toBeCloseTo(0.79, 2);
    expect(fp.get(77)).toBe(1536);
    expect(fp.get(12)).toBe(0);
  });

  it('skips the header and anything that is not a pid and a size', () => {
    expect([...fp.keys()].sort((a, b) => a - b)).toEqual([12, 77, 410, 3054, 95150, 96382]);
  });

  it('reads nothing out of nothing', () => {
    expect(footprintsFromTop('').size).toBe(0);
  });
});

describe('the minute line', () => {
  let dir: string;
  afterEach(() => { if (dir) fs.rmSync(dir, { recursive: true, force: true }); });
  const proc = (pid: number, ppid: number, mb: number, exe: string, item: string | null = null) => ({
    pid, ppid, mb, exe, cmd: exe, start: null, item, product: item ? 'team' : null, keep: false,
  });
  const procs = () => [
    proc(100, 1, 600, '/Apps/Agentbox.app/Contents/MacOS/Agentbox'),
    proc(200, 100, 250, '/u/.local/bin/claude', 'w-aaa'),
    proc(400, 1, 300, '/u/.nvm/bin/node'),
  ];
  const line = async (footprints: () => Map<number, number> | Promise<Map<number, number>>) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-footprint-'));
    const log = new MemoryLog({ dir, appPid: 100, list: procs, readPressure: () => ({}), footprints, now: () => Date.UTC(2026, 10, 9, 23) });
    await log.tick();
    const [file] = fs.readdirSync(dir);
    return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8').trim());
  };

  it('counts each program by its footprint', async () => {
    const l = await line(() => new Map([[100, 2000], [200, 260], [400, 2065]]));
    expect(l.measure).toBe('footprint');
    expect(l.app.mb).toBe(2000);
    expect(l.tasks[0]).toMatchObject({ item: 'w-aaa', mb: 260 });
    expect(l.others[0]).toEqual({ name: 'node', mb: 2065 });
    expect(l.totalMb).toBe(4325);
  });

  it('keeps rss for a program top did not list', async () => {
    const l = await line(() => new Map([[100, 2000]]));
    expect(l.measure).toBe('footprint');
    expect(l.tasks[0].mb).toBe(250);
    expect(l.others[0].mb).toBe(300);
  });

  it('falls back to rss, and says so, when top gives nothing', async () => {
    const empty = await line(() => new Map());
    expect(empty.measure).toBe('rss');
    expect(empty.app.mb).toBe(600);
    const broken = await line(() => { throw new Error('top is gone'); });
    expect(broken.measure).toBe('rss');
    expect(broken.totalMb).toBe(1150);
  });
});
