// A THREAD NOTHING WILL START IS IN NEEDS YOU, NOT IN PROGRESS.
//
// What broke (2026-10-23): four threads the app had stopped starting sat in In
// progress reading Stopped for two hours, and the person found them only by
// opening In progress to look. Needs you is the one list they read; anything
// outside it is assumed seen to.
//
// Read off the store: each row was open, carried the person's reply, and its
// last word was the app's "stopped starting this thread". In progress takes
// every open row with a reply as "spawn pending", and Needs you only takes one
// back when its last word is a sentence `saysARunGotNowhere` knows, which that
// one was not. The supervisor's own list of stopped rows (`stalled`) never
// reached either rule. A held row whose reply had not been handed over yet
// would have read Queued instead, because `queued` never asked the hold.
//
// Measured here on the list rules with those rows as the store had them, and on
// the supervisor's status with a thread held by six dead starts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { belongsInInbox, belongsInProgress, belongsOnTheRail, stoppable, gaveUpOnTheAnswer } from '../renderer/src/list-rules.ts';
import { Supervisor } from '../main/supervisor.mjs';

const ANSWERED = Date.parse('2026-10-23T21:55:03Z');
const HELD = Date.parse('2026-10-23T22:24:03Z');
const NOW = Date.parse('2026-10-24T00:53:00Z');

// One of the four rows, as the store had it after the Resume.
const row = (extra = {}) => ({
  id: 'w-71923d522e', product: 'p', title: 'Routines', kind: 'task', status: 'open', labels: ['stickiness'],
  parent: 'w-13147e8f68', answer: 'Try again with that context.',
  result: 'Agentbox stopped starting this thread: it was started 6 times in 10 minutes, and every run ended before its agent began. The last one said: "agentbox cloud: no Claude account is signed in for the cloud yet (the cloud button)". Reply here to try again.',
  wrote: {
    answer: { ts: ANSWERED, source: 'founder' },
    result: { ts: HELD, source: 'agent' },
    status: { ts: HELD + 1_400_000, source: 'system' },
  },
  ...extra,
});
const hers = (extra = {}) => row({ id: 'w-4008458eae', labels: ['founder'], parent: undefined, ...extra });
// A reply on its way: nothing has run on it since.
const waiting = (extra = {}) => row({ result: undefined, wrote: { answer: { ts: ANSWERED, source: 'founder' } }, ...extra });

describe('the four rows as they were', () => {
  for (const [who, make] of [['an agent filed', row], ['the person wrote', hers]]) {
    it(`are in Needs you and not In progress, on a thread ${who}`, () => {
      expect(belongsInInbox(make(), { now: NOW })).toBe(true);
      expect(belongsInProgress(make(), { now: NOW })).toBe(false);
    });
  }

  it('the hold sentence reads as a run that got nowhere, in its old words and its new ones', () => {
    expect(gaveUpOnTheAnswer(row())).toBe(true);
    const newer = 'Agentbox stopped starting this thread. It was started 6 times in 10 minutes, and each run ended before its agent began. Reply here to try again.';
    expect(gaveUpOnTheAnswer(row({ result: newer }))).toBe(true);
  });
});

describe('a row the supervisor says nothing will start', () => {
  it('is in Needs you whatever its last word, and out of In progress', () => {
    for (const r of [waiting(), hers({ result: undefined, wrote: { answer: { ts: ANSWERED, source: 'founder' } } })]) {
      expect(belongsInInbox(r, { now: NOW, stopped: true })).toBe(true);
      expect(belongsInProgress(r, { now: NOW, stopped: true })).toBe(false);
      expect(belongsOnTheRail(r, { now: NOW, stopped: true })).toBe(true);
    }
  });

  it('is not offered Stop, so Resume This Agent is', () => {
    expect(stoppable(waiting(), { now: NOW, stopped: true })).toBe(false);
  });

  it('stays in In progress while a session is on it', () => {
    expect(belongsInInbox(waiting(), { now: NOW, stopped: true, live: true })).toBe(false);
    expect(belongsInProgress(waiting(), { now: NOW, stopped: true, live: true })).toBe(true);
  });

  it('stays out of Needs you while the person has put it off', () => {
    expect(belongsInInbox(waiting(), { now: NOW, stopped: true, hiddenUntil: NOW + 3_600_000 })).toBe(false);
  });
});

describe('a row waiting its turn', () => {
  it('stays in In progress and out of Needs you', () => {
    expect(belongsInInbox(waiting(), { now: NOW })).toBe(false);
    expect(belongsInProgress(waiting(), { now: NOW })).toBe(true);
  });

  it('whatever other sentence an agent left on it', () => {
    const r = row({ result: 'Here are six options for the routines screen.' });
    expect(belongsInProgress(r, { now: NOW })).toBe(true);
  });
});

describe('the window hands every list the stopped rows', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  for (const rule of ['belongsInInbox', 'belongsInProgress', 'belongsOnTheRail', 'stoppable']) {
    it(`${rule}`, () => {
      const calls = [...app.matchAll(new RegExp(`${rule}\\((\\w+), \\{([^}]*)\\}`, 'g'))];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) expect(call[2]).toMatch(/stopped: stalledIds\.has\(/);
    });
  }
});

describe("the supervisor's own lists", () => {
  const realNow = Date.now;
  let now; let root; let items;

  function supervisor() {
    const sup = new Supervisor(
      { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
      {
        listItems: () => items, listProducts: () => [], isDue: () => true,
        recordSessionResult: (product, id, patch) => {
          const it = items.find((i) => i.id === id);
          if (it && patch.status) it.status = patch.status;
          if (it && patch.result) { it.result = patch.result; it.wrote = { ...it.wrote, result: { ts: now, source: 'agent' } }; }
        },
      },
      root, root, root,
    );
    sup.tick = async () => {};
    sup.wake = () => {};
    return sup;
  }
  function holdIt(sup, item) {
    for (let i = 0; i < 6; i += 1) {
      now += 15_000;
      sup._noteHowTheRunStarted(item, { itemId: item.id, product: 'p', startedAt: now - 800, sessionId: null, result: null, tail: ['stderr: agentbox cloud: no Claude account is signed in for the cloud yet (the cloud button)'] });
    }
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nothing-will-start-'));
    now = HELD - 120_000;
    Date.now = () => now;
    items = [waiting({ id: 'w-held', labels: ['founder'], parent: undefined })];
  });
  afterEach(() => { Date.now = realNow; });

  it('a held row reopened with its reply already handed over is stopped, not queued', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    items[0].status = 'open';
    sup._handledAnswers.add(sup._answerKey(items[0], items[0].answer));
    const s = sup.status();
    expect(s.stalled).toContain('w-held');
    expect(s.queued).not.toContain('w-held');
  });

  it('a held row reopened with its reply not yet handed over is stopped, not queued', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    items[0].status = 'open';
    const s = sup.status();
    expect(s.stalled).toContain('w-held');
    expect(s.queued).not.toContain('w-held');
  });

  it('a held row the person has written on since is queued, because it will start', () => {
    const sup = supervisor();
    holdIt(sup, items[0]);
    now += 60_000;
    items[0] = { ...items[0], status: 'open', answer: 'go on', wrote: { ...items[0].wrote, answer: { ts: now, source: 'founder' } } };
    const s = sup.status();
    expect(s.stalled).not.toContain('w-held');
    expect(s.queued).toContain('w-held');
  });

  it('a row nobody held is queued as before', () => {
    const sup = supervisor();
    const s = sup.status();
    expect(s.queued).toContain('w-held');
    expect(s.stalled).not.toContain('w-held');
  });
});
