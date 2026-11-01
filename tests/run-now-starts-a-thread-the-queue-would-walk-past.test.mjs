// RUN NOW STARTS A THREAD THE QUEUE WOULD OTHERWISE WALK PAST.
//
// What broke (w-d08dcbb6fc, 2026-10-28): accounts hit their usage limits, the
// person switched to another account, and some threads stayed stuck however
// many buttons they pressed. Two of those buttons said "Up next" and started
// nothing. Measured here on the real tick with only the agent start stubbed:
//
//   1. A run that dies at a limit leaves the app's own note on the thread and a
//      record that the note promised a retry (`_weSaidItRunsAgain`). Run now
//      deleted that record, so the queue read the note as an agent's finished
//      answer and never started the thread again: spawned [] after Run now,
//      where the same thread untouched was started on the first tick.
//   2. A thread an agent filed with the person's tag on it is never fresh work
//      (an agent cannot start its own work). Run now accepted the push and the
//      queue skipped the thread on every tick.
//
// In both, status().queued left the thread out, so the row read "Nothing
// running" under the toast saying it was next.

import { describe, it, expect, beforeEach } from 'vitest';
import { Supervisor } from '../main/supervisor.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const NOW = Date.now();
const HOUR = 3_600_000;

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

const hers = (id, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'], priority: 2,
  createdAt: NOW - 2 * HOUR, updatedAt: NOW - 2 * HOUR, claim: null, claimExpired: false,
  wrote: { title: { ts: NOW - 2 * HOUR, source: 'founder' }, labels: { ts: NOW - 2 * HOUR, source: 'system' } },
  ...extra,
});

// The thread as a usage limit leaves it: the app's note written as the run's
// result, after the person's last word, and the record that the note promised
// a retry. The run had used a tool, so no cause is kept (`sayTheRunDied`).
const LIMIT_NOTE = 'Claude Code hit its usage limit partway through, so this task is not finished.';
const stoppedByALimit = (id) => hers(id, {
  result: LIMIT_NOTE,
  updatedAt: NOW - 60_000,
  wrote: { title: { ts: NOW - 2 * HOUR, source: 'founder' }, labels: { ts: NOW - 2 * HOUR, source: 'system' }, result: { ts: NOW - 60_000, source: 'agent' } },
});
const rememberTheNote = (id) => {
  sup._fruitless[`agentbox:${id}`] = { runs: 1, endedAt: NOW - 60_000, founderAt: NOW - 2 * HOUR, account: 'default', saidAt: NOW - 60_000, saidTs: NOW - 60_000 };
};

// Filed by an agent, with the person's tag, under a thread of theirs.
const taggedByAnAgent = (id) => hers(id, {
  parent: 'w-parent',
  wrote: { title: { ts: NOW - 2 * HOUR, source: 'agent' }, labels: { ts: NOW - 2 * HOUR, source: 'agent' } },
});

let sup; let spawned;

const build = (items, slots = 2) => {
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  spawned = [];
  sup.spawnWorker = (item) => {
    spawned.push(item.id);
    sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW, tail: [] });
  };
  sup._kill = (session) => { session.stoppedByUs = true; sup.sessions.delete(session.itemId); return true; };
  sup.transcriptFile = (rec) => (rec?.sessionId ? `/transcripts/${rec.sessionId}.jsonl` : null);
  sup._saveState = () => {};
  return sup;
};

// A run with its session on disk, so a push may pause it and resume it later.
const running = (id) => {
  sup.sessions.set(id, { itemId: id, product: 'agentbox', startedAt: NOW, tail: [] });
  sup._liveSessions[id] = { sessionId: `s-${id}`, product: 'agentbox', cwd: '/tmp', profile: 'default' };
};

beforeEach(() => { build([]); });

describe('a thread a usage limit stopped', () => {
  it('starts on its own once the account is back, as before', async () => {
    build([stoppedByALimit('w-limit')]);
    rememberTheNote('w-limit');
    await sup.tick();
    expect(spawned).toEqual(['w-limit']);
  });

  it('starts when they press Run now on it', async () => {
    build([stoppedByALimit('w-limit')]);
    rememberTheNote('w-limit');
    expect(sup.runNow('agentbox', 'w-limit')).toEqual({ ok: true });
    await sup.tick();
    expect(spawned).toEqual(['w-limit']);
  });

  it('reads Up next, not Nothing running, while every agent is busy', () => {
    build([hers('w-busy', { priority: 9 }), stoppedByALimit('w-limit')], 1);
    running('w-busy');
    rememberTheNote('w-limit');
    sup.runNow('agentbox', 'w-limit');
    const status = sup.status();
    expect(status.queued).toContain('w-limit');
    expect(status.runNow).toContain('w-limit');
  });

  it('takes the slot it made once every agent was busy', async () => {
    build([hers('w-busy', { priority: 9 }), stoppedByALimit('w-limit')], 1);
    running('w-busy');
    rememberTheNote('w-limit');
    sup.runNow('agentbox', 'w-limit');
    await sup.tick();
    await sup.tick();
    expect(spawned).toEqual(['w-limit']);
  });

  it('still promises its retry if the push ends before a run starts', async () => {
    build([stoppedByALimit('w-limit')]);
    rememberTheNote('w-limit');
    sup.runNow('agentbox', 'w-limit');
    sup._runNow.clear();
    await sup.tick();
    expect(spawned).toEqual(['w-limit']);
  });
});

describe('a thread an agent filed with your tag on it', () => {
  // THE CASE THAT MUST NOT CHANGE: an agent cannot start its own work.
  it('is not started by the queue on its own', async () => {
    build([taggedByAnAgent('w-tagged')]);
    await sup.tick();
    expect(spawned).toEqual([]);
    expect(sup.status().queued).not.toContain('w-tagged');
  });

  it('starts when they press Run now on it', async () => {
    build([taggedByAnAgent('w-tagged')]);
    expect(sup.runNow('agentbox', 'w-tagged')).toEqual({ ok: true });
    expect(sup.status().queued).toContain('w-tagged');
    await sup.tick();
    expect(spawned).toEqual(['w-tagged']);
  });
});

describe('what Run now still turns away', () => {
  it('a thread nobody pushed that is resting after empty runs', async () => {
    build([hers('w-rest')]);
    sup._fruitless['agentbox:w-rest'] = { runs: 3, endedAt: NOW, founderAt: NOW - 2 * HOUR };
    await sup.tick();
    expect(spawned).toEqual([]);
  });

  it('every thread while agents are paused', () => {
    build([taggedByAnAgent('w-tagged')]);
    sup.paused = true;
    expect(sup.runNow('agentbox', 'w-tagged')).toEqual({ ok: false, reason: 'paused' });
  });
});
