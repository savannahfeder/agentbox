// EVERY START ON THIS MAC ASKS MEMORY AT THE DOOR (w-9c7ca4b8a9).
//
// 2026-10-27, her 16 GB Mac stopped answering with nine agents running. Two
// fixes came first (tests/the-agent-count-means-the-whole-computer and
// tests/no-new-agent-starts-while-memory-is-short). Codex's review of them
// found three more doors, and this file is those doors, driven through the
// real `spawnWorker` up to the moment the run's files would be written:
//
//   1. A reply never asked memory. Her answer outranks the number of agents,
//      and it went past memory with it, however short memory was.
//   2. The queue asked memory when it picked a row, and the row's folder can
//      take a while; a row picked on a normal reading launched on a critical one.
//   3. Stopping a cloud run or a command she typed for an urgent row counted as
//      a swap, which starts whatever memory says, while freeing nothing here.
//
// And the shared ceiling needed one thing back: an urgent Codex row with room
// on Codex may stop a lesser Claude worker, since only the total is full.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const CRITICAL = { level: 4, freePct: 3 };
const TIGHT = { level: 2, freePct: 30 };
const NORMAL = { level: 1, freePct: 55 };

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-door-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

function fleet({ running = 2, items = [] } = {}) {
  const store = { listItems: () => items, listProducts: () => [{ slug: 'p', name: 'p', dir }], isDue: () => true, settleAnswer() {} };
  const sup = new Supervisor({ home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'], maxConcurrentSessions: 6, memoryGate: true }, store, dir);
  sup._saveState = () => {};
  sup.worksHere = () => true;
  sup._folderFirst = () => false;
  sup._photoFirst = () => false;
  sup.workFolderFor = () => dir;
  sup._engineFor = () => 'claude';
  for (let n = 0; n < running; n++) sup.sessions.set(`r-${n}`, { itemId: `r-${n}`, engine: 'claude', product: 'p' });
  const launched = [];
  const handedBack = [];
  // A reply that is a slash command is the plan's `command`, as `spawnPlan` reads it.
  sup.spawnPlan = (item, product, opts) => ({ args: [], command: opts.continuation && item.answer?.startsWith('/') ? item.answer : null });
  sup.prepareClaudePermissions = (plan) => { launched.push(plan); throw new Error('stop before the process'); };
  sup.redeliverAnswer = (item, answer) => handedBack.push(answer);
  const memory = (r) => { sup._memReading = { ...r, at: Date.now() }; sup._memRecent = []; };
  const go = (item, opts) => {
    try { sup.spawnWorker(item, opts); } catch (e) { if (e.message !== 'stop before the process') throw e; }
  };
  return { sup, launched, handedBack, memory, go };
}

const row = (id = 'w-1', extra = {}) => ({ id, product: 'p', status: 'open', kind: 'directive', labels: ['founder'], priority: 5, ...extra });

describe('a row picked on a normal reading', () => {
  it('does not launch if memory is very short by the time it gets to the door', () => {
    const { launched, memory, go } = fleet();
    memory(CRITICAL);
    go(row());
    expect(launched).toHaveLength(0);
    memory(NORMAL);
    go(row());
    expect(launched).toHaveLength(1);
  });

  it('the one the ten-minute rule let through still launches', () => {
    const { sup, launched, memory, go } = fleet();
    memory(CRITICAL);
    sup._memHeldSince = Date.now() - 11 * 60_000;
    sup._lastStartAt = 0;
    expect(sup._memoryLetsStart(row())).toBe(true);
    go(row());
    expect(launched).toHaveLength(1);
    // And only that one: the clock it restarted holds the next.
    go(row('w-2'));
    expect(launched).toHaveLength(1);
  });
});

describe('what was already let through upstream', () => {
  it('a row she resumed by name, with no reply on it, still starts while tight', () => {
    const { sup, launched, memory } = fleet();
    memory(TIGHT);
    try { sup._spawnResume(row()); } catch (e) { if (e.message !== 'stop before the process') throw e; }
    expect(launched).toHaveLength(1);
  });

  it('a digest the ten-minute rule let through launches, and one it did not waits', () => {
    const { sup, launched, memory, go } = fleet();
    memory(CRITICAL);
    go({ id: 'digest-abc', product: 'p' });
    expect(launched).toHaveLength(0);
    sup._memHeldSince = Date.now() - 11 * 60_000;
    sup._lastStartAt = 0;
    expect(sup._memoryLetsStart(null)).toBe(true);
    go({ id: 'digest-def', product: 'p' });
    expect(launched).toHaveLength(1);
  });

  it('a row she resumed by name keeps that through the wait for its leftovers', async () => {
    const { sup, launched, memory } = fleet();
    memory(TIGHT);
    sup._leftoverCleaner = { holdMs: (id) => (sup._heldOnce ? 0 : 50) };
    try { sup._spawnResume(row()); } catch (e) { if (e.message !== 'stop before the process') throw e; }
    expect(launched).toHaveLength(0);
    sup._heldOnce = true;
    await new Promise((r) => setTimeout(r, 400));
    expect(launched).toHaveLength(1);
  });

  it('a command she typed that was waiting for the cloud runs here whatever memory says', () => {
    const { sup, launched, memory, go } = fleet();
    memory(CRITICAL);
    sup._whereToRun = () => 'cloud-wait';
    go(row('w-1', { answer: '/compact' }), { continuation: true });
    expect(launched).toHaveLength(1);
  });
});

describe('her reply', () => {
  const reply = (id = 'w-1') => row(id, { answer: 'yes, do that' });

  it('still starts while memory is tight, past the number of agents', () => {
    const { launched, memory, go } = fleet({ running: 9 });
    memory(TIGHT);
    go(reply(), { continuation: true });
    expect(launched).toHaveLength(1);
  });

  it('waits while memory is very short, and is handed back rather than dropped', () => {
    const { launched, handedBack, memory, go } = fleet();
    memory(CRITICAL);
    go(reply(), { continuation: true });
    expect(launched).toHaveLength(0);
    expect(handedBack).toEqual(['yes, do that']);
  });

  it('starts while very short when nothing else is running', () => {
    const { launched, memory, go } = fleet({ running: 0 });
    memory(CRITICAL);
    go(reply(), { continuation: true });
    expect(launched).toHaveLength(1);
  });

  it('a command she typed never waits on memory', () => {
    const { launched, memory, go } = fleet();
    memory(CRITICAL);
    go(row('w-1', { answer: '/compact' }), { continuation: true });
    expect(launched).toHaveLength(1);
  });
});

describe('making room for an urgent row', () => {
  function urgentFleet(sessions) {
    const items = sessions.map((s) => row(s.itemId, { priority: 1 }));
    const urgent = row('w-urgent', { labels: ['founder', 'urgent'], priority: 9 });
    items.push(urgent);
    const f = fleet({ running: 0, items });
    for (const s of sessions) {
      f.sup.sessions.set(s.itemId, { product: 'p', engine: 'claude', ...s });
      f.sup._liveSessions[s.itemId] = { sessionId: `sess-${s.itemId}` };
    }
    f.sup.transcriptFile = () => path.join(dir, 'transcript.jsonl');
    f.sup._kill = () => {};
    f.sup._score = (item) => item.priority;
    return { ...f, items, urgent };
  }

  it('stopping a cloud run frees nothing here, so it is not a swap past memory', () => {
    // A local worker it may not stop keeps this Mac busy, so "nothing running" does not apply.
    const cloud = urgentFleet([{ itemId: 'w-cloud', cloud: true }, { itemId: 'w-keep' }]);
    cloud.memory(CRITICAL);
    expect(cloud.sup._takeSlotFor(cloud.urgent, cloud.items, 'claude', (v) => v.id !== 'w-keep')).toBe('w-cloud');
    expect(cloud.sup._memoryLetsStart(cloud.urgent)).toBe(false);

    const local = urgentFleet([{ itemId: 'w-local' }]);
    local.memory(CRITICAL);
    expect(local.sup._takeSlotFor(local.urgent, local.items, 'claude', () => true)).toBe('w-local');
    expect(local.sup._memoryLetsStart(local.urgent)).toBe(true);
  });

  it('a command she typed holds no slot, so it is never the one stopped', () => {
    const { sup, items, urgent } = urgentFleet([{ itemId: 'w-cmd', command: true }]);
    expect(sup._takeSlotFor(urgent, items, 'claude', () => true)).toBe(null);
  });

  it('an urgent Codex row may stop a lesser Claude worker when only the total is full', () => {
    const sessions = Array.from({ length: 6 }, (_, n) => ({ itemId: `w-c${n}` }));
    const { sup, items, urgent } = urgentFleet(sessions);
    sup._capacityFor = (engine) => 6;
    sup._capacity = () => 6;
    expect(sup._takeSlotFor(urgent, items, 'codex', () => true)).toMatch(/^w-c/);
    // With room in the total as well, nothing needs stopping at all.
    sup._preempted.clear();
    sup._capacity = () => 12;
    expect(sup._takeSlotFor(urgent, items, 'codex', () => true)).toBe(null);
    // With Codex's own share full, only a Codex worker frees anything for it.
    sup._preempted.clear();
    sup._capacityFor = (engine) => (engine === 'codex' ? 0 : 6);
    expect(sup._takeSlotFor(urgent, items, 'codex', () => true)).toBe(null);
  });
});
