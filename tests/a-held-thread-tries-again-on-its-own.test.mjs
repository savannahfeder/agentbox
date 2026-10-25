// A HELD THREAD TRIES AGAIN ON ITS OWN, A FEW TIMES, AND SAYS WHEN.
//
// What broke (2026-10-23): four threads went to the cloud while it picked an
// account it could not run on. Each start died at once, and after six the app
// held them until the person wrote on them. The cause was fixed in the app 38
// minutes later, and the threads stayed held: the hold had no way to find out
// the cause was gone, so they would have waited for ever.
//
// Now a held thread tries once more on its own after 30 minutes, then after 2
// hours, then after 8, and its row says when the next try is. Each try is one
// start: if it dies at once the thread is held again straight away. After the
// third it waits for the person, as before. A hold saved by an older build is
// tried on the same clock, so the four threads try again once the app updates.
//
// Measured by holding a thread with six dead starts and walking the clock
// through a day, with every try dying, and with a try that works.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const T0 = Date.parse('2026-10-23T22:20:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const realNow = Date.now;
let now; let root; let items; let said; let started;

const row = (id, extra = {}) => ({
  id, product: 'p', title: id, kind: 'task', status: 'open', labels: ['founder'],
  answer: 'Try again with that context.', wrote: { answer: { ts: T0 - HOUR, source: 'founder' } }, ...extra,
});

function supervisor() {
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => items, listProducts: () => [], isDue: (i, at) => !(i.runAt > at),
      recordSessionResult: (product, id, patch) => {
        said.push({ id, ...patch });
        const it = items.find((i) => i.id === id);
        if (it && patch.status) { it.status = patch.status; it.wrote = { ...it.wrote, status: { ts: now, source: 'system' } }; }
      },
      answerItem: (product, id, patch) => {
        const it = items.find((i) => i.id === id);
        if (it && patch.status) { it.status = patch.status; it.wrote = { ...it.wrote, status: { ts: now, source: 'system' } }; }
        return it;
      },
    },
    root, root, root,
  );
  // Past the hold, the door's next question. Answering yes stops the run there,
  // so the test counts the starts without making one.
  sup._compactionJobs = { has: (key) => { started.push(JSON.parse(key)[1]); return true; } };
  sup.tick = async () => {};
  sup.wake = () => {};
  return sup;
}

const deadStart = (item) => ({
  itemId: item.id, product: 'p', startedAt: now - 800, sessionId: null, result: null,
  tail: ['stderr: agentbox cloud: no Claude account is signed in for the cloud yet (the cloud button)'],
});

function holdIt(sup, item) {
  for (let i = 0; i < 6; i += 1) { now += 15_000; sup._noteHowTheRunStarted(item, deadStart(item)); }
  expect(sup._heldFromStarting(item)).toBe(true);
}

// One tick's worth of what the supervisor does about held threads, as `_tick`
// runs it, and the start that follows when a thread is let through.
function tickAt(sup, at, { dies = true } = {}) {
  now = at;
  const before = started.length;
  sup.retryHeldThreads(items, now);
  sup._drainResumeQueue(items);
  const item = items[0];
  if (started.length > before) {
    now += 800;
    sup._noteHowTheRunStarted(item, dies ? deadStart(item) : { ...deadStart(item), sessionId: 'abc', startedAt: now - 60_000 });
  }
  return started.length - before;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'held-retry-'));
  now = T0;
  Date.now = () => now;
  items = [row('w-held')];
  said = [];
  started = [];
});
afterEach(() => { Date.now = realNow; });

describe('a held thread whose every try dies', () => {
  it('is tried three times in a day, at 30 minutes, 2 hours and 8 hours, one start each', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    const heldAt = now;
    const tries = [];
    for (let t = heldAt; t < heldAt + 24 * HOUR; t += MIN) {
      if (tickAt(sup, t)) tries.push(Math.round((t - heldAt) / MIN));
    }
    // Each wait counts from the try before it.
    expect(tries).toEqual([30, 30 + 120, 30 + 120 + 480]);
    expect(sup._heldFromStarting(items[0])).toBe(true);
  });

  it('says when it tries next, and after the last try only that a reply starts it', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    const heldAt = now;
    for (let t = heldAt; t < heldAt + 24 * HOUR; t += MIN) tickAt(sup, t);
    const words = said.map((s) => s.result);
    expect(words).toHaveLength(4);
    for (const w of words) {
      expect(w).toMatch(/^Agentbox stopped starting this thread\. /);
      expect(w).toContain('no Claude account is signed in for the cloud yet');
      // No colon in the app's own words; the quoted error keeps its own.
      expect(w.replace(/"[^"]*"/, '')).not.toMatch(/:(?!\d\d[ap]m)/);
    }
    for (const w of words.slice(0, 3)) expect(w).toMatch(/It tries again on its own at \d{1,2}:\d{2}[ap]m\. Reply here to try again now\.$/);
    expect(words[3]).toMatch(/Reply here to try again\.$/);
    expect(words[3]).not.toMatch(/tries again on its own/);
    expect(said.every((s) => s.status === 'blocked')).toBe(true);
  });

  it('sits in Needs you between tries, blocked, and is reopened only for a try', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    expect(items[0].status).toBe('blocked');
    tickAt(sup, now + 29 * MIN);
    expect(items[0].status).toBe('blocked');
    now += 2 * MIN;
    sup.retryHeldThreads(items, now);
    expect(items[0].status).toBe('open');
    expect(sup.status().queued).toContain('w-held');
  });
});

describe('a try that works', () => {
  it('lets the thread go, and a later run of dead starts is counted from zero', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    expect(tickAt(sup, now + 30 * MIN, { dies: false })).toBe(1);
    expect(sup._heldFromStarting(items[0])).toBe(false);
    for (let i = 0; i < 5; i += 1) { now += 15_000; sup._noteHowTheRunStarted(items[0], deadStart(items[0])); }
    expect(sup._heldFromStarting(items[0])).toBe(false);
  });
});

describe('what it never tries', () => {
  it('a thread the person stopped', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    items[0].wrote.status = { ts: now, source: 'founder' };
    expect(tickAt(sup, now + 31 * MIN)).toBe(0);
  });

  it('a thread the person closed', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    items[0].status = 'done';
    expect(tickAt(sup, now + 31 * MIN)).toBe(0);
  });

  it('a thread the person put off, until then', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    items[0].runAt = now + 3 * HOUR;
    expect(tickAt(sup, now + 31 * MIN)).toBe(0);
    expect(tickAt(sup, now + 3 * HOUR)).toBe(1);
  });

  it('a thread with a session on it already', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    sup.sessions.set('w-held', { itemId: 'w-held' });
    now += 31 * MIN;
    sup.retryHeldThreads(items, now);
    expect(sup._resumeQueue.has('w-held')).toBe(false);
  });
});

describe('a hold saved by an older build', () => {
  it('is tried 30 minutes after it was held, after a restart', () => {
    const first = supervisor();
    holdIt(first, items[0]);
    first._heldStarts['p:w-held'] = { since: first._heldStarts['p:w-held'].since, said: 'agentbox cloud: no Claude account is signed in for the cloud yet (the cloud button)' };
    first._saveState();
    const sup = supervisor();
    expect(sup._heldFromStarting(items[0])).toBe(true);
    expect(tickAt(sup, now + 2 * HOUR)).toBe(1);
  });
});
