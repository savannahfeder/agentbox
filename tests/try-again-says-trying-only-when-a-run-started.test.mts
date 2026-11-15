// Try again said "Trying again now." over a thread nothing had started.
// A run died in the cloud (the server said 502), the thread read "Claude Code
// was cut off in the middle", and Try again toasted "Trying again now." while
// the thread went on reading "Nothing running" with Try again still under it.
// The run only began a minute later, on its own. Measured here: resumeItems
// counted every start that did not throw as resumed, but spawnWorker turns a
// start away without throwing (the cloud bringing the last run's work home,
// a dark wake, memory), and a turned-away row was in no queue, so nothing
// said it was coming and the resume queue dropped it after one refusal.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { tryAgainWords } from '../renderer/src/try-again.ts';

const T0 = Date.parse('2026-11-05T08:03:10Z');
const realNow = Date.now;
let now; let root; let items; let started;

const row = (id, extra = {}) => ({
  id, product: 'p', title: id, kind: 'directive', status: 'open', labels: ['founder'],
  result: 'Claude Code was cut off in the middle, so nothing has been done on this task.',
  wrote: { title: { ts: T0 - 60_000, source: 'founder' }, result: { ts: T0 - 7_000, source: 'agent' } },
  ...extra,
});

function supervisor() {
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => items, listProducts: () => [], isDue: () => true,
      recordSessionResult: () => {},
      answerItem: (product, id, patch) => { const it = items.find((i) => i.id === id); if (it && patch.status) it.status = patch.status; return it; },
    },
    root, root, root,
  );
  sup.tick = async () => {};
  sup.wake = () => {};
  return sup;
}

// A start that goes: the session is on the row when spawnWorker returns.
const starts = (sup) => { sup.spawnWorker = (item) => { started.push(item.id); sup.sessions.set(item.id, { itemId: item.id }); }; };
// A start turned away, the way spawnWorker does it: a reason noted, no session, no throw.
const turnsAway = (sup, why) => { sup.spawnWorker = (item) => { sup._noteNotStarting(item, why, 'claude'); }; };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'try-again-turned-away-'));
  now = T0;
  Date.now = () => now;
  started = [];
  items = [row('w-cut')];
});
afterEach(() => { Date.now = realNow; });

describe('Try again on a thread whose start is turned away', () => {
  it('says Queued, not Trying again now', () => {
    const sup = supervisor();
    turnsAway(sup, 'cloud');
    const r = sup.resumeItems(['w-cut']);
    expect(r).toMatchObject({ resumed: 0, queued: 1 });
    expect(tryAgainWords(r)).toBe('Queued.');
  });

  it('keeps it in line, so the thread reads Queued and Try again goes away', () => {
    const sup = supervisor();
    turnsAway(sup, 'cloud');
    sup.resumeItems(['w-cut']);
    expect(sup.status().queued).toContain('w-cut');
  });

  it('a dark wake, through the real spawnWorker, is turned away the same way', () => {
    const sup = supervisor();
    sup.asleep = () => true;
    sup._roomFor = () => true;
    const r = sup.resumeItems(['w-cut']);
    expect(r).toMatchObject({ resumed: 0, queued: 1 });
    expect(sup.status().queued).toContain('w-cut');
  });

  it('stays in line while it is still turned away, and starts once it is not', () => {
    const sup = supervisor();
    sup._roomFor = () => true;
    turnsAway(sup, 'cloud');
    sup.resumeItems(['w-cut']);
    sup._drainResumeQueue(items);
    expect(sup.status().queued).toContain('w-cut');
    starts(sup);
    sup._drainResumeQueue(items);
    expect(started).toEqual(['w-cut']);
    expect(sup._resumeQueue.has('w-cut')).toBe(false);
  });

  it('a start that goes still says Trying again now', () => {
    const sup = supervisor();
    starts(sup);
    const r = sup.resumeItems(['w-cut']);
    expect(r).toMatchObject({ resumed: 1, queued: 0 });
    expect(tryAgainWords(r)).toBe('Trying again now.');
  });

  it('a start that is getting its folder ready counts as started', () => {
    const sup = supervisor();
    sup.spawnWorker = (item) => { (sup._preparing ??= new Map()).set(item.id, { item, opts: {}, engine: 'claude' }); };
    expect(sup.resumeItems(['w-cut'])).toMatchObject({ resumed: 1, queued: 0 });
  });

  it('a refusal that never clears on its own is said, not queued for ever', () => {
    for (const why of ['model', 'project', 'practice', 'folder']) {
      const sup = supervisor();
      turnsAway(sup, why);
      const r = sup.resumeItems(['w-cut']);
      expect(r, why).toMatchObject({ resumed: 0, queued: 0, failed: 1 });
      expect(sup._resumeQueue.has('w-cut'), why).toBe(false);
    }
  });

  it('the queue lets go of a row whose refusal never clears', () => {
    const sup = supervisor();
    sup._roomFor = () => true;
    sup._resumeQueue.add('w-cut');
    turnsAway(sup, 'model');
    sup._drainResumeQueue(items);
    expect(sup._resumeQueue.has('w-cut')).toBe(false);
  });
});
