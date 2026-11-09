// TRY AGAIN MOVES THE THREAD TO IN PROGRESS, AND THE THREAD STOPS OFFERING IT.
//
// What broke (w-dc754fa6f1): pressing Try again on a thread in Needs you did
// nothing you could see. The thread stayed in Needs you and its line kept
// reading "Nothing running · Try again". A thread with its own folder (or a
// cloud run) is first set up (`_preparing`), and one with no free agent waits
// in `_resumeQueue`; neither is a session, so `running` did not name it and
// the lists only move a thread on a session. Measured here before the fix:
// status() had no field naming the thread, and `offersTryAgain` answered true
// for a thread `queued` already named.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Supervisor } from '../main/supervisor.mts';
import { agentOnOrComing, belongsInInbox, belongsInProgress } from '../renderer/src/list-rules.ts';
import { offersTryAgain } from '../renderer/src/try-again.ts';

const NOW = Date.now();
const HOUR = 3_600_000;

const cutOff = (id, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'], priority: 2, title: 'A thread', body: '',
  createdAt: NOW - 2 * HOUR, updatedAt: NOW - 60_000, claim: null, claimExpired: false,
  result: 'Claude Code was cut off partway through, so this task is not finished.',
  wrote: { title: { ts: NOW - 2 * HOUR, source: 'founder' }, result: { ts: NOW - 60_000, source: 'agent' } },
  ...extra,
});

let items;
const build = (rows, { slots = 2, start = 'session' } = {}) => {
  items = rows;
  const sup = new Supervisor(
    { home: '/nonexistent-home', storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] },
    {
      listItems: () => items, listProducts: () => [], isDue: () => true, settleAnswer() {},
      answerItem: (product, id, patch) => { const it = items.find((i) => i.id === id); if (it && patch.status) it.status = patch.status; return it; },
    },
    '/nonexistent-app',
  );
  sup.spawnWorker = (item) => {
    if (start === 'folder') sup._preparing.set(item.id, { item, opts: {}, engine: 'claude', folderSince: NOW });
    else sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW, tail: [] });
  };
  sup._saveState = () => {};
  return sup;
};

describe('the app names a thread Try again is starting', () => {
  it('while its folder is still being made', () => {
    const sup = build([cutOff('w-cut')], { start: 'folder' });
    expect(sup.resumeItems(['w-cut'])).toMatchObject({ resumed: 1 });
    expect(sup.status().starting).toEqual(['w-cut']);
  });

  it('while it waits for a free agent', () => {
    const sup = build([cutOff('w-busy', { result: undefined, wrote: {} }), cutOff('w-cut')], { slots: 1 });
    sup.sessions.set('w-busy', { itemId: 'w-busy', product: 'agentbox', startedAt: NOW, tail: [] });
    expect(sup.resumeItems(['w-cut'])).toMatchObject({ queued: 1 });
    expect(sup.status().starting).toEqual(['w-cut']);
  });

  it('not once its run has started, which `running` names', () => {
    const sup = build([cutOff('w-cut')]);
    sup.resumeItems(['w-cut']);
    expect(sup.status().starting).toEqual([]);
    expect(sup.status().running.map((r) => r.itemId)).toEqual(['w-cut']);
  });

  it('not a thread closed while it waited', () => {
    const sup = build([cutOff('w-busy', { result: undefined, wrote: {} }), cutOff('w-cut')], { slots: 1 });
    sup.sessions.set('w-busy', { itemId: 'w-busy', product: 'agentbox', startedAt: NOW, tail: [] });
    sup.resumeItems(['w-cut']);
    items[1].status = 'done';
    expect(sup.status().starting).toEqual([]);
  });
});

describe('the lists move it', () => {
  const thread = cutOff('w-cut');

  it('a thread being started is on the list of threads an agent is on or coming to', () => {
    expect([...agentOnOrComing({ running: [], starting: ['w-cut'] })]).toEqual(['w-cut']);
    expect([...agentOnOrComing({ running: [{ itemId: 'w-run' }], starting: ['w-cut'] })].sort()).toEqual(['w-cut', 'w-run']);
    expect([...agentOnOrComing(undefined)]).toEqual([]);
  });

  it('out of Needs you and into In progress', () => {
    expect(belongsInInbox(thread, { now: NOW })).toBe(true);
    expect(belongsInInbox(thread, { now: NOW, live: true })).toBe(false);
    expect(belongsInProgress(thread, { now: NOW, live: true })).toBe(true);
  });

  it('the window reads it from the app for both lists, and keeps the running mark to real runs', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/const liveIds = useMemo\(\(\) => agentOnOrComing\(\{ running: runningRows, starting: snap\?\.supervisor\.starting \}\)/);
    expect(app).toMatch(/<LiveContext\.Provider value=\{runningIds\}>/);
    expect(app).toMatch(/whyItCannotMove\(target as never, \{ live: runningIds\.has\(target\.id\) \}\)/);
  });
});

describe('the thread stops offering Try again once a start is queued', () => {
  const fleet = (over = {}) => ({ queued: [], runNow: [], signInNeeded: {}, atLimit: {}, now: NOW, ...over });

  it('queued, even before the lists have moved it', () => {
    expect(offersTryAgain(cutOff('w-cut'), fleet({ queued: ['w-cut'] }))).toBe(false);
  });

  it('still offered while nothing is queued for it', () => {
    expect(offersTryAgain(cutOff('w-cut'), fleet())).toBe(true);
    expect(offersTryAgain(cutOff('w-cut'), fleet({ queued: ['w-other'] }))).toBe(true);
  });
});
