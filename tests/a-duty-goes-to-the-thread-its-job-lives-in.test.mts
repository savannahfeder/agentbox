// A DUTY'S TIME GOES TO THE THREAD ITS JOB LIVES IN.
//
// A tester teammate's first-job thread was doing its 8am and 4pm loop and sat
// waiting on a question. Every duty slot after that still opened a new thread
// for the same job: three spent a run finding the other thread and closing,
// the fourth ran a 90-minute loop of its own and started four fixers. Measured
// in planWakes: a slot passing with the first-job run open produced a new run.
// Now code finds the job's one thread (the first-job run while open, else the
// duty's newest run) and the slot is brought there for that thread to decide;
// a thread at work or waiting on your question is left alone. A new thread
// starts only when the job has none, or you closed it.
import { describe, it, expect } from 'vitest';
import { planWakes, teammateLabel, runIdFor, DEFAULT_LIMIT } from '../shared/teammates.mts';

const NOW = new Date(2026, 10, 21, 8, 5).getTime();
const HOUR = 3_600_000;
const t = {
  id: 't-tester', name: 'Collaboration tester', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [],
  duties: [{ id: 'd-loop', what: 'Run the tester loop', every: 'day', at: ['08:00', '16:00'] }], dutyServed: { 'd-loop': '2026-11-20T16:00' },
};
const chat = { messages: [], seen: new Set(), into: new Map() };
const run = (id, over = {}) => ({
  id, product: 'kestrel', title: 'Run', status: 'open', createdAt: NOW - 40 * HOUR,
  labels: ['founder', teammateLabel(t.id), 'hop:0'], ...over,
});
const FIRST = runIdFor(`${t.id}#first`);
const first = (over = {}) => run(FIRST, { title: 'Start on its first job', ...over });
const duty = (id, over = {}) => run(id, { labels: ['founder', teammateLabel(t.id), 'hop:0', 'duty:d-loop'], ...over });
const asking = { result: 'Should I file these as bugs?', wrote: { result: { ts: NOW - 30 * HOUR, source: 'agent' } } };
const reported = { result: 'Ran the loop, all green.', wrote: { result: { ts: NOW - 15 * HOUR, source: 'agent' } } };
const closedBy = (source) => ({ status: 'done', result: 'Ran the loop.', wrote: { result: { ts: NOW - 15 * HOUR, source: 'agent' }, status: { ts: NOW - 15 * HOUR, source } } });
const plan = (items, who = t) => planWakes({ teammates: [who], chat, items, now: NOW });
const runs = (acts) => acts.filter((a) => a.type === 'run');
const dues = (acts) => acts.filter((a) => a.type === 'due');
const served = { type: 'dutyServed', teammate: t.id, duty: 'd-loop', key: '2026-11-21T08:00' };

describe('a duty slot while its job already has a thread', () => {
  it('leaves a first-job thread that waits on your question waiting, and starts nothing', () => {
    const acts = plan([first(asking)]);
    expect(runs(acts)).toEqual([]);
    expect(dues(acts)).toEqual([]);
    expect(acts).toContainEqual(served);
  });

  it('leaves a thread already at work, queued, asking or blocked alone', () => {
    for (const items of [[first({ status: 'claimed' })], [duty('w-a', { status: 'claimed' })], [duty('w-a', { start: 'later' })], [duty('w-a', asking)], [duty('w-a', { status: 'blocked' })]]) {
      const acts = plan(items);
      expect(runs(acts)).toEqual([]);
      expect(dues(acts)).toEqual([]);
      expect(acts).toContainEqual(served);
    }
  });

  it('brings the slot to the open first-job thread when it has finished talking', () => {
    const acts = plan([first(reported), duty('w-old', closedBy('agent'))]);
    expect(runs(acts)).toEqual([]);
    expect(dues(acts)).toEqual([expect.objectContaining({ item: FIRST, product: 'kestrel', duty: 'd-loop', key: '2026-11-21T08:00' })]);
    expect(dues(acts)[0].text).toMatch(/Run the tester loop/);
    expect(acts).toContainEqual(served);
  });

  it('brings the slot to the newest run of the duty, even one its agent closed', () => {
    const acts = plan([duty('w-old', { ...closedBy('agent'), createdAt: NOW - 60 * HOUR }), duty('w-new', closedBy('agent')), first(closedBy('agent'))]);
    expect(runs(acts)).toEqual([]);
    expect(dues(acts).map((a) => a.item)).toEqual(['w-new']);
  });

  it('starts a new thread when the job has none, or you closed it', () => {
    for (const items of [[], [first(closedBy('agent'))], [duty('w-a', closedBy('founder'))]]) {
      const acts = plan(items);
      expect(runs(acts)).toHaveLength(1);
      expect(dues(acts)).toEqual([]);
      expect(acts).toContainEqual(served);
    }
  });

  it('a thread on another duty does not hold it; the new run queues behind', () => {
    const other = run('w-b', { status: 'claimed', labels: ['founder', teammateLabel(t.id), 'hop:0', 'duty:d-other'] });
    const r = runs(plan([other]));
    expect(r).toHaveLength(1);
    expect(r[0].start).toBe('later');
  });

  it('past its weekly runs it wakes nothing and the slot stays owed', () => {
    const acts = plan([first(reported)], { ...t, limit: 1 });
    expect(dues(acts)).toEqual([]);
    expect(acts).not.toContainEqual(served);
    expect(acts).toContainEqual(expect.objectContaining({ type: 'limit', teammate: t.id }));
  });
});

describe('the app carries the slot into the thread', () => {
  it('hands the duty to the job thread through tell, and makes no new thread', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { appHome } = await import('../main/store/home.mts');
    const { loadStore } = await import('../main/store-modules.mts');
    const { Teammates } = await import('../main/teammates.mts');
    const { writeTeammate } = await import('../main/store/teammates-files.mts');
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    (await import('../mcp/core/account.mts')).resolveAccount();
    const product = (await import('../mcp/core/products.mts')).createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    const dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    const work = mods.workItemsDisk;
    const store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => work.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    try {
      const team = new Teammates(store);
      const made = team.create({ name: 'Collaboration tester', job: 'Run the tester loop.' });
      writeTeammate(team.dir(), made.id, { status: 'active', product: product.id, firstRun: 'served', duties: t.duties, dutyServed: t.dutyServed }, NOW - 50 * HOUR);
      const firstId = runIdFor(`${made.id}#first`);
      work.createWorkItemIfAbsent(dir, firstId, { title: 'Start on its first job', kind: 'directive', priority: 5, labels: ['founder', teammateLabel(made.id), 'hop:0'] }, { source: 'system', now: NOW - 40 * HOUR });
      work.updateWorkItem(dir, firstId, { result: 'Ran the loop, all green.' }, { source: 'agent', now: NOW - 15 * HOUR });
      const told = [];
      const before = store.listItems(NOW).length;
      await team.tick({ items: store.listItems(NOW), now: NOW, deliver: async () => {}, tell: async (p, id, hand) => { told.push({ p, id, hand }); } });
      expect(store.listItems(NOW)).toHaveLength(before);
      expect(told).toEqual([{ p: product.id, id: firstId, hand: expect.objectContaining({ from: { teammate: made.id, name: 'Collaboration tester' }, hold: false }) }]);
      expect(told[0].hand.text).toMatch(/Run the tester loop/);
      // Served, so the next tick brings it nothing more.
      await team.tick({ items: store.listItems(NOW + 60_000), now: NOW + 60_000, deliver: async () => {}, tell: async (p, id, hand) => { told.push({ p, id, hand }); } });
      expect(told).toHaveLength(1);
    } finally {
      delete process.env.STORE_ACCOUNT_ID;
    }
  });
});
