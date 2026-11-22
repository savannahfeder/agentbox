// THE MEMORY LOG NAMES THE TASK THAT WAS HOLDING THE MEMORY.
//
// 2026-10-11 the Mac ran out of memory with Agentbox at 22 GB, and by the time
// anyone looked it had calmed down to 1.9 GB across two tasks. The app kept no
// record of memory over time, so which task had held the rest could not be
// said, only guessed. Now a line a minute records the pressure and every
// task's programs with what they hold, so the next one points at a task.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { summarizeMemory, MemoryLog } from '../main/memory-log.mts';

const MB = (n) => n;
const proc = (pid, ppid, mb, exe, extra = {}) => ({ pid, ppid, mb: MB(mb), exe, item: null, product: null, ...extra });

// One app, two tasks, and the rest of the Mac.
const procs = () => [
  proc(1, 0, 10, '/sbin/launchd'),
  proc(100, 1, 400, '/Apps/Agentbox.app/Contents/MacOS/Agentbox'),
  proc(101, 100, 300, '/Apps/Agentbox.app/Contents/Frameworks/Helper (Renderer)'),
  // Task A: the agent, a dev server that renamed itself and hid its tags, and a browser under it.
  proc(200, 100, 320, '/u/.local/bin/claude', { item: 'w-aaa', product: 'video' }),
  proc(201, 200, 900, 'next-server (v16)'),
  proc(202, 201, 2500, '/u/Library/Caches/ms-playwright/chromium/Chromium'),
  // Task B: just the agent.
  proc(300, 100, 280, '/u/.local/bin/claude', { item: 'w-bbb', product: 'team' }),
  // Not ours.
  proc(400, 1, 5000, '/Applications/Docker.app/Contents/MacOS/com.docker.backend'),
  proc(401, 1, 50, '/usr/bin/top'),
];

describe('one minute, summed', () => {
  const at = Date.UTC(2026, 9, 11, 22, 15);
  const line = summarizeMemory(procs(), { appPid: 100, at, reading: { level: 2, freePct: 9 } });

  it('puts every program under the task that started it, the biggest task first', () => {
    expect(line.tasks.map((t) => [t.item, t.mb])).toEqual([['w-aaa', 3720], ['w-bbb', 280]]);
    expect(line.tasks[0]).toMatchObject({ product: 'video', procs: 3 });
    expect(line.tasks[0].top[0]).toEqual({ name: 'Chromium', mb: 2500 });
  });

  it('counts the app itself apart from its tasks', () => {
    expect(line.app).toMatchObject({ mb: 700, procs: 2 });
  });

  it('names the biggest programs that are not ours, so a crash caused elsewhere says so', () => {
    expect(line.others[0]).toEqual({ name: 'com.docker.backend', mb: 5000 });
    expect(line.others.map((o) => o.name)).not.toContain('claude');
  });

  it('carries the reading and the moment', () => {
    expect(line).toMatchObject({ at: new Date(at).toISOString(), pressure: 'tight', freePct: 9, level: 2 });
    expect(line.totalMb).toBe(Math.round(procs().reduce((n, p) => n + p.mb, 0)));
  });

  it('with no tasks running it says none rather than leaving the field out', () => {
    const quiet = summarizeMemory(procs().filter((p) => !p.item && ![201, 202].includes(p.pid)), { appPid: 100, at });
    expect(quiet.tasks).toEqual([]);
  });
});

describe('the file', () => {
  const dirs = [];
  afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });
  const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-log-')); dirs.push(d); return d; };
  const day = (d) => `memory-${d}.jsonl`;

  it('adds one line a minute to that day`s file', async () => {
    const dir = tmp();
    let now = new Date(2026, 9, 11, 15, 15).getTime();
    const log = new MemoryLog({ dir, appPid: 100, list: async () => procs(), readPressure: async () => ({ level: 1, freePct: 40 }), now: () => now, facts: () => ({ running: 2, capacity: 6, holding: false }) });
    await log.tick();
    now += 60_000;
    await log.tick();
    const lines = fs.readFileSync(path.join(dir, day('2026-10-11')), 'utf8').trim().split('\n').map(JSON.parse);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ running: 2, capacity: 6, holding: false, pressure: 'normal' });
  });

  it('keeps a week and removes what is older, and nothing that is not its own', async () => {
    const dir = tmp();
    for (const d of ['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-10']) fs.writeFileSync(path.join(dir, day(d)), '{}\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'hers');
    const now = new Date(2026, 9, 11, 12, 0).getTime();
    await new MemoryLog({ dir, appPid: 100, list: async () => [], readPressure: async () => ({}), now: () => now }).tick();
    expect(fs.readdirSync(dir).sort()).toEqual([day('2026-10-05'), day('2026-10-10'), day('2026-10-11'), 'notes.txt'].sort());
  });

  it('a listing that fails still writes the reading, and never throws', async () => {
    const dir = tmp();
    const now = new Date(2026, 9, 11, 12, 0).getTime();
    const log = new MemoryLog({ dir, appPid: 100, list: async () => { throw new Error('ps went away'); }, readPressure: async () => ({ level: 4, freePct: 3 }), now: () => now });
    await expect(log.tick()).resolves.not.toThrow();
    const [line] = fs.readFileSync(path.join(dir, day('2026-10-11')), 'utf8').trim().split('\n').map(JSON.parse);
    expect(line).toMatchObject({ pressure: 'critical', tasks: [] });
  });
});
