// A MEMORY WARNING DOES NOT HOLD A MAC RUNNING FEW AGENTS.
//
// 2026-10-28, a 16 GB Mac with room for 6: threads sat on Up next and Queued
// for an hour while 1 or 2 agents ran. The minute log read `running 1,
// capacity 6, holding true` with 35 to 58% of memory free. macOS reports its
// "warn" pressure level (2) in short bursts all day on that Mac, and since
// e0962636 any warn in the last three minutes held every new start. During the
// freeze that hold was built for, the readings were the same warn at 26 to 38%
// free; the difference was 8 or 9 agents running, not the reading. So a warn
// alone holds only once the Mac runs the number it carries without the memory
// check (4 at 16 GB). Free memory under the line, or the kernel's critical,
// still holds at any count.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDecision } from '../main/start-hold.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const NOW = 1_800_000_000_000;
const read = (freePct, { level = 1, age = 0 } = {}) => ({ level, freePct, at: NOW - age });
const warn = (freePct = 40, age = 0) => read(freePct, { level: 2, age });
const base = { on: true, now: NOW, lastStartAt: NOW - 60_000, heldSince: null, roomy: 4 };

describe('the rule', () => {
  it('a warn now, or in the last three minutes, does not hold the second agent', () => {
    expect(startDecision({ ...base, running: 1, reading: warn() }).start).toBe(true);
    expect(startDecision({ ...base, running: 1, reading: read(55), recent: [warn(31, 60_000)] }).start).toBe(true);
  });

  it('holds from the Mac\'s own number up, and not one below it', () => {
    expect(startDecision({ ...base, running: 3, reading: warn() }).start).toBe(true);
    expect(startDecision({ ...base, running: 4, reading: warn() })).toEqual({ start: false, why: 'tight' });
    expect(startDecision({ ...base, running: 4, reading: read(55), recent: [warn(31, 60_000)] })).toEqual({ start: false, why: 'tight' });
  });

  it('memory that is really short still holds however few are running', () => {
    expect(startDecision({ ...base, running: 1, reading: warn(10) })).toEqual({ start: false, why: 'tight' });
    expect(startDecision({ ...base, running: 1, reading: read(3) })).toEqual({ start: false, why: 'critical' });
    expect(startDecision({ ...base, running: 1, reading: read(40, { level: 4 }) })).toEqual({ start: false, why: 'critical' });
    expect(startDecision({ ...base, running: 1, reading: read(55), recent: [read(40, { level: 4, age: 60_000 })] })).toEqual({ start: false, why: 'critical' });
  });

  it('only the kernel\'s warn is set aside, not a level macOS has never been seen to report', () => {
    expect(startDecision({ ...base, running: 1, reading: read(40, { level: 3 }) })).toEqual({ start: false, why: 'tight' });
  });

  it('without a number for the Mac, a warn holds as it did before', () => {
    expect(startDecision({ ...base, roomy: undefined, running: 1, reading: warn() })).toEqual({ start: false, why: 'tight' });
  });
});

describe('the fleet on a 16 GB Mac', () => {
  let dir, sup, started;
  const task = (id) => ({ id, product: 'sample', status: 'open', kind: 'directive', labels: ['founder'], priority: 5, createdAt: 1, updatedAt: 1 });

  function setup({ running, reading }) {
    const items = [task('q-0'), task('q-1'), task('q-2'), task('q-3'), task('q-4'), task('q-5')];
    sup = new Supervisor({
      home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'],
      agentsAuto: true, memoryGate: true,
    }, { listItems: () => items, listProducts: () => [], isDue: () => true, settleAnswer() {} }, dir);
    sup._machine = () => ({ memBytes: 16 * 1024 ** 3, cores: 10 });
    sup._engineFor = () => 'claude';
    sup._readPressure = async () => reading;
    sup._memReading = { ...reading, at: Date.now() };
    started = [];
    sup.spawnWorker = (item) => {
      started.push(item.id);
      sup.sessions.set(item.id, { itemId: item.id, engine: 'claude', product: 'sample', startedAt: Date.now() });
    };
    for (let n = 0; n < running; n++) sup.sessions.set(`r-${n}`, { itemId: `r-${n}`, engine: 'claude', product: 'sample' });
  }

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'warn-hold-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('with one agent running and a warn at 40% free, it starts up to the Mac\'s number and holds the rest', async () => {
    setup({ running: 1, reading: { level: 2, freePct: 40 } });
    await sup.tick();
    expect(sup._capacity()).toBe(6);
    expect(started).toEqual(['q-0', 'q-1', 'q-2']);
    expect(sup.startHoldStatus()).toMatchObject({ holding: true, pressure: 'tight' });
  });

  it('with one agent running and 10% free, it starts nothing', async () => {
    setup({ running: 1, reading: { level: 2, freePct: 10 } });
    await sup.tick();
    expect(started).toEqual([]);
  });
});
