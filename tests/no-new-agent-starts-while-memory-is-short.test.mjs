// NO NEW AGENT STARTS WHILE MEMORY IS SHORT, AND NOTHING IS STUCK BECAUSE OF IT.
//
// 2026-10-11, a 16 GB Mac: "Your system has run out of application memory",
// Agentbox at 22 GB, six agents running and the Running page reading Tight with
// three commands already waiting on memory. The memory check only ever held
// tests and builds back; nothing asked memory before starting another agent, so
// the fleet kept filling its slots into a Mac that was already short.
//
// The founder's condition for the fix: urgent work still takes priority, and
// nothing may sit stuck for long on a misread or a reading that stopped
// changing. So every way out of the hold is tested here beside the hold itself:
// nothing running, an urgent or asked-for row, a swap for an urgent row, a
// stale or missing reading, and ten minutes held.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDecision, STALE_MS, MAX_HOLD_MS, SETTLE_MS } from '../main/start-hold.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { memoryReading } from '../main/settings.mjs';

const NOW = 1_800_000_000_000;
const read = (freePct, { level = 1, age = 0 } = {}) => ({ level, freePct, at: NOW - age });
const base = { on: true, now: NOW, running: 3, lastStartAt: NOW - 60_000, heldSince: null };

describe('the rule', () => {
  it('holds a new agent while memory is tight, and while it is very short', () => {
    expect(startDecision({ ...base, reading: read(10) })).toEqual({ start: false, why: 'tight' });
    expect(startDecision({ ...base, reading: read(3) })).toEqual({ start: false, why: 'critical' });
    expect(startDecision({ ...base, reading: read(40, { level: 2 }) }).start).toBe(false);
  });

  it('starts as normal when memory is fine, including right at the line', () => {
    expect(startDecision({ ...base, reading: read(40) }).start).toBe(true);
    expect(startDecision({ ...base, reading: read(12) }).start).toBe(true);
    expect(startDecision({ ...base, reading: read(11) }).start).toBe(false);
  });

  it('does nothing at all with the memory switch off', () => {
    expect(startDecision({ ...base, on: false, reading: read(3) })).toEqual({ start: true, why: 'off' });
  });

  it('always lets one agent run, so the fleet is never stopped outright', () => {
    expect(startDecision({ ...base, running: 0, reading: read(3) }).start).toBe(true);
    expect(startDecision({ ...base, running: 1, reading: read(3) }).start).toBe(false);
  });

  it('an urgent or asked-for row starts while tight, and waits only while very short', () => {
    expect(startDecision({ ...base, urgent: true, reading: read(10) }).start).toBe(true);
    expect(startDecision({ ...base, asked: true, reading: read(10) }).start).toBe(true);
    expect(startDecision({ ...base, urgent: true, reading: read(3) }).start).toBe(false);
  });

  it('a row something was paused for always starts, because that is a swap and adds nothing', () => {
    expect(startDecision({ ...base, swap: true, reading: read(3) })).toEqual({ start: true, why: 'swap' });
  });

  it('a reading that is missing, unreadable or stale is not a reason to hold', () => {
    expect(startDecision({ ...base, reading: null }).start).toBe(true);
    expect(startDecision({ ...base, reading: { level: null, freePct: null, at: NOW } }).start).toBe(true);
    expect(startDecision({ ...base, reading: read(3, { age: STALE_MS + 1 }) })).toEqual({ start: true, why: 'no-reading' });
    expect(startDecision({ ...base, reading: read(3, { age: STALE_MS - 1 }) }).start).toBe(false);
    // A clock that jumped backwards is as untrustworthy as one that is old.
    expect(startDecision({ ...base, reading: read(3, { age: -(STALE_MS + 1) }) }).start).toBe(true);
  });

  it('after ten minutes held, one agent starts anyway, and the clock starts again from it', () => {
    const held = { ...base, reading: read(3), lastStartAt: NOW - 3_600_000 };
    expect(startDecision({ ...held, heldSince: NOW - MAX_HOLD_MS + 1 }).start).toBe(false);
    expect(startDecision({ ...held, heldSince: NOW - MAX_HOLD_MS })).toEqual({ start: true, why: 'overdue' });
    // The one it let through restarts the wait, so it is one every ten minutes, not a flood.
    expect(startDecision({ ...held, heldSince: NOW - MAX_HOLD_MS, lastStartAt: NOW - 1_000 }).start).toBe(false);
  });

  // 2026-10-27: tight or critical 16 minutes in 20, normal for a moment in
  // between, and every normal moment let more agents in, one to nine.
  it('one normal reading after a short one does not let an agent in for three minutes', () => {
    const short = read(40, { level: 2, age: 30_000 });
    expect(startDecision({ ...base, reading: read(56), recent: [short] })).toEqual({ start: false, why: 'tight' });
    expect(startDecision({ ...base, reading: read(56), recent: [read(3, { age: 60_000 })] })).toEqual({ start: false, why: 'critical' });
    expect(startDecision({ ...base, reading: read(56), recent: [read(40, { level: 2, age: SETTLE_MS + 1 })] })).toEqual({ start: true, why: 'normal' });
    // An urgent row still starts on a tight minute, as it does on a tight reading.
    expect(startDecision({ ...base, urgent: true, reading: read(56), recent: [short] }).start).toBe(true);
    // An unreadable reading in the window is not a short one.
    expect(startDecision({ ...base, reading: read(56), recent: [{ level: null, freePct: null, at: NOW }] }).start).toBe(true);
  });
});

describe('the fleet', () => {
  let dir, sup, items, started;
  const task = (id, priority = 5) => ({
    id, product: 'sample', status: 'open', kind: 'directive', labels: ['founder'],
    priority, createdAt: 1, updatedAt: 1,
  });

  function setup({ running = 2, freePct = 40, gate = true, queued = [task('q-0'), task('q-1')] } = {}) {
    items = queued;
    sup = new Supervisor({
      home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'],
      maxConcurrentSessions: 6, memoryGate: gate,
    }, { listItems: () => items, listProducts: () => [], isDue: () => true, settleAnswer() {} }, dir);
    sup._engineFor = () => 'claude';
    sup._readPressure = async () => ({ level: 1, freePct: sup._fakeFree });
    sup._fakeFree = freePct;
    sup._memReading = { level: 1, freePct, at: Date.now() };
    started = [];
    sup.spawnWorker = (item) => {
      started.push(item.id);
      sup.sessions.set(item.id, { itemId: item.id, engine: 'claude', product: 'sample', startedAt: Date.now() });
    };
    for (let n = 0; n < running; n++) {
      sup.sessions.set(`r-${n}`, { itemId: `r-${n}`, engine: 'claude', product: 'sample', child: { kill: vi.fn() } });
    }
  }
  const setFree = (freePct) => { sup._fakeFree = freePct; sup._memReading = { level: 1, freePct, at: Date.now() }; };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'start-hold-'));
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts nothing new while memory is tight, then starts the queue once it frees up', async () => {
    setup({ freePct: 8 });
    await sup.tick();
    expect(started).toEqual([]);
    setFree(40);
    await sup.tick();
    expect(started).toEqual(['q-0', 'q-1']);
  });

  it('a reading that flips back to normal for a moment does not start the queue', async () => {
    setup({ freePct: 8 });
    sup._memReading = null;
    // Through the real reading path, so the history is kept the way the app keeps it.
    sup._refreshMemoryReading();
    await vi.advanceTimersByTimeAsync(0);
    await sup.tick();
    expect(started).toEqual([]);
    sup._fakeFree = 40;
    await vi.advanceTimersByTimeAsync(10_000);
    sup._refreshMemoryReading();
    await vi.advanceTimersByTimeAsync(0);
    expect(sup._memReading.freePct).toBe(40);
    await sup.tick();
    expect(started).toEqual([]);
    // Normal for three minutes running, and the queue moves.
    for (let s = 0; s < SETTLE_MS / 10_000; s++) {
      await vi.advanceTimersByTimeAsync(10_000);
      sup._refreshMemoryReading();
      await vi.advanceTimersByTimeAsync(0);
    }
    await sup.tick();
    expect(started).toEqual(['q-0', 'q-1']);
  });

  it('with the memory switch off it starts as it always did', async () => {
    setup({ freePct: 3, gate: false });
    await sup.tick();
    expect(started).toEqual(['q-0', 'q-1']);
  });

  it('with nothing running it starts one, and only one, while memory is very short', async () => {
    setup({ running: 0, freePct: 3 });
    await sup.tick();
    expect(started).toEqual(['q-0']);
  });

  it('an urgent row still starts while memory is tight', async () => {
    setup({ freePct: 8, queued: [task('low', 5), task('urgent', 9)] });
    await sup.tick();
    expect(started).toEqual(['urgent']);
  });

  it('a reading that stops arriving lets the queue run rather than freezing it', async () => {
    setup({ freePct: 3 });
    sup._readPressure = () => new Promise(() => {}); // sysctl hangs for good
    await sup.tick();
    expect(started).toEqual([]);
    await vi.advanceTimersByTimeAsync(STALE_MS + 1_000);
    await sup.tick();
    expect(started).toEqual(['q-0', 'q-1']);
  });

  it('a reading stuck on very short still lets one through every ten minutes', async () => {
    setup({ freePct: 3, queued: [task('q-0'), task('q-1'), task('q-2')] });
    const keepReading = () => { sup._memReading = { level: 4, freePct: 3, at: Date.now() }; };
    keepReading();
    await sup.tick();
    expect(started).toEqual([]);
    await vi.advanceTimersByTimeAsync(MAX_HOLD_MS - 30_000);
    keepReading();
    await sup.tick();
    expect(started).toEqual([]);
    await vi.advanceTimersByTimeAsync(30_000);
    keepReading();
    await sup.tick();
    expect(started).toEqual(['q-0']);
    keepReading();
    await sup.tick();
    expect(started).toEqual(['q-0']);
  });

  it('the Running page is told new agents are being held, and stops being told once they are not', async () => {
    setup({ freePct: 8 });
    await sup.tick();
    expect(sup.startHoldStatus()).toMatchObject({ holding: true, pressure: 'tight' });
    setFree(40);
    await sup.tick();
    expect(sup.startHoldStatus()).toMatchObject({ holding: false });
  });
});

describe('the Running page', () => {
  it('reads the hold off the supervisor, and only with the memory switch on', () => {
    const supervisor = { startHoldStatus: () => ({ holding: true }), memoryGateStatus: () => null };
    expect(memoryReading({ config: { memoryGate: true }, supervisor }).holding).toBe(true);
    expect(memoryReading({ config: { memoryGate: false }, supervisor }).holding).toBeUndefined();
  });

  it('says so in a sentence, and the switch no longer promises everything else runs as normal', () => {
    const pane = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
    expect(pane).toContain('New agents wait until memory frees up. Urgent tasks still start.');
    expect(pane).not.toContain('Everything else runs as normal');
  });
});
