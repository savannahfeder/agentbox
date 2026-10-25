// "It feels like a recurring automation, not an employee. I want to tell a
// teammate: you have these different jobs. One is to check twice a week
// whether anything we've built is worth sharing publicly. Another is to check
// twice a day for trends." A teammate had one schedule (`works`: daily, on
// weekdays or weekly, at one time) and one kind of run, "Today's round", so
// none of that could be said. Now a teammate has duties, each with its own
// times or "after a ship" in its project, and a duty run first checks whether
// anything is worth doing and stays quiet when nothing is.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { planWakes, foldTeammates, dutyWhen, teammateLabel, DEFAULT_LIMIT } from '../shared/teammates.mjs';

const NOW = new Date(2026, 9, 26, 15, 10).getTime(); // a Monday, 3:10pm
const base = { id: 't-aaaaaa', name: 'Marketing lead', letter: 'M', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const TRENDS = { id: 'd-trends', what: 'Look for a trend worth jumping on', every: 'day', at: ['09:00', '15:00'] };
const SHIPS = { id: 'd-ships', what: 'Look for anything we built worth a post', after: 'ship', most: 2 };
const chat = { messages: [], seen: new Set() };
const runs = (acts) => acts.filter((a) => a.type === 'run');

describe('when a duty runs', () => {
  it('a time that has come and was not served yet starts one run, titled for the duty', () => {
    const t = { ...base, duties: [TRENDS], dutyServed: { 'd-trends': '2026-10-26T09:00' } };
    const acts = planWakes({ teammates: [t], chat, items: [], now: NOW });
    expect(runs(acts)).toHaveLength(1);
    expect(runs(acts)[0]).toMatchObject({ title: 'Look for a trend worth jumping on', trigger: { kind: 'duty', duty: 'd-trends' } });
    expect(acts).toContainEqual({ type: 'dutyServed', teammate: t.id, duty: 'd-trends', key: '2026-10-26T15:00' });
  });

  it('runs once for the latest time missed, not once for every time missed', () => {
    const t = { ...base, duties: [TRENDS], dutyServed: { 'd-trends': '2026-10-25T15:00' } };
    expect(runs(planWakes({ teammates: [t], chat, items: [], now: NOW }))).toHaveLength(1);
  });

  it('does not run again for a time already served, or before its first time today', () => {
    const t = { ...base, duties: [TRENDS], dutyServed: { 'd-trends': '2026-10-26T15:00' } };
    expect(runs(planWakes({ teammates: [t], chat, items: [], now: NOW }))).toHaveLength(0);
    const early = new Date(2026, 9, 26, 8, 0).getTime();
    const y = { ...base, duties: [TRENDS], dutyServed: { 'd-trends': '2026-10-25T15:00' } };
    expect(runs(planWakes({ teammates: [y], chat, items: [], now: early }))).toHaveLength(0);
  });

  it('after a ship in its own project, up to its weekly most, and not for a ship elsewhere or one it already looked at', () => {
    const t = { ...base, duties: [SHIPS], dutyServed: { 'd-ships': 'ship@100' } };
    const go = (shipped, items = []) => runs(planWakes({ teammates: [t], chat, items, now: NOW, shipped }));
    expect(go({ kestrel: 200 })).toHaveLength(1);
    expect(go({ kestrel: 100 })).toHaveLength(0);
    expect(go({ other: 500 })).toHaveLength(0);
    const ran = (id, ago) => ({ id, product: 'kestrel', title: 'x', status: 'done', labels: ['founder', teammateLabel(t.id), 'duty:d-ships', 'clean'], createdAt: NOW - ago, wrote: {} });
    expect(go({ kestrel: 200 }, [ran('w-1', 3600_000), ran('w-2', 7200_000)])).toHaveLength(0);
    expect(go({ kestrel: 200 }, [ran('w-1', 3600_000), ran('w-2', 8 * 86400_000)])).toHaveLength(1);
  });

  it('a duty run carries its label so its runs can be counted', () => {
    const t = { ...base, duties: [SHIPS], dutyServed: { 'd-ships': 'ship@100' } };
    const r = runs(planWakes({ teammates: [t], chat, items: [], now: NOW, shipped: { kestrel: 200 } }))[0];
    expect(r.trigger).toMatchObject({ kind: 'duty', duty: 'd-ships', key: 'ship@200' });
  });

  it('a paused teammate, or one with the old single schedule, works as before', () => {
    expect(runs(planWakes({ teammates: [{ ...base, paused: true, duties: [TRENDS], dutyServed: {} }], chat, items: [], now: NOW }))).toHaveLength(0);
    const old = { ...base, works: { every: 'weekday', at: '09:00' }, served: '2026-10-23' };
    expect(runs(planWakes({ teammates: [old], chat, items: [], now: NOW }))[0].title).toBe("Today's round");
  });
});

describe('a duty, written down', () => {
  it('folds a list of duties whole, drops a malformed one, and keeps what each has served', () => {
    const [t] = foldTeammates([
      { id: 't-aaaaaa', ts: 1, patch: { name: 'Marketing lead', duties: [TRENDS, { id: 'd-bad', what: 'x', every: 'day', at: ['25:00'] }, SHIPS] } },
      { id: 't-aaaaaa', ts: 2, patch: { dutyServed: { 'd-trends': '2026-10-26T09:00' } } },
      { id: 't-aaaaaa', ts: 3, patch: { dutyServed: { 'd-ships': 'ship@9' } } },
    ], NOW);
    expect(t.duties.map((d) => d.id)).toEqual(['d-trends', 'd-ships']);
    expect(t.dutyServed).toEqual({ 'd-trends': '2026-10-26T09:00', 'd-ships': 'ship@9' });
  });

  it('says when it runs in plain words', () => {
    expect(dutyWhen(TRENDS)).toBe('Daily at 9:00am and 3:00pm');
    expect(dutyWhen({ every: 'weekday', at: ['10:00'] })).toBe('Weekdays at 10:00am');
    expect(dutyWhen({ every: 'week', on: 1, at: ['09:00'] })).toBe('Mondays at 9:00am');
    expect(dutyWhen(SHIPS)).toBe('After a ship, at most twice a week');
    expect(dutyWhen({ after: 'ship' })).toBe('After a ship');
  });
});

describe('a teammate given duties', () => {
  let team; let store; let product; let dir; let core;
  beforeEach(async () => {
    const { appHome } = await import('../main/store/home.mjs');
    const { loadStore } = await import('../main/store-modules.mjs');
    const { Teammates } = await import('../main/teammates.mjs');
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
    core = await import('../mcp/core/teammates.mjs');
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_ITEM; delete process.env.ZERO_PRODUCT; });

  const asRun = (t) => {
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title: 'x', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = product.id;
    return run;
  };

  it('sets them itself, which replaces its old single schedule and fires nothing already past', async () => {
    const t = team.create({ starter: 'quality' });
    asRun(t);
    core.teamSetup({ duties: [{ what: 'Look for a trend worth jumping on', every: 'day', at: ['09:00', '15:00'] }, { what: 'Look for anything we built worth a post', after: 'ship', most: 2 }] });
    const after = team.get(t.id);
    expect(after.works).toBeNull();
    expect(after.duties).toHaveLength(2);
    expect(after.duties.every((d) => /^d-/.test(d.id))).toBe(true);
    const planned = planWakes({ teammates: [after], chat: team.chat(), items: [], now: Date.now() + 1000, shipped: {} });
    expect(planned.filter((a) => a.type === 'run')).toHaveLength(0);
  });

  it('refuses a duty it cannot run, saying what is wrong', () => {
    const t = team.create({ starter: 'quality' });
    asRun(t);
    expect(() => core.teamSetup({ duties: [{ what: 'x', every: 'day', at: ['9am'] }] })).toThrow(/HH:MM/);
    expect(() => core.teamSetup({ duties: [{ what: '', every: 'day', at: ['09:00'] }] })).toThrow(/what/);
  });

  it('a duty run is told to check first and stay quiet when nothing is worth doing', async () => {
    const t = team.create({ starter: 'quality' });
    asRun(t);
    core.teamSetup({ duties: [{ what: 'Look for anything we built worth a post', after: 'ship', most: 2, tell: 'there is a post worth your yes' }] });
    const shippedRow = store.modules.workItemsDisk.createWorkItem(dir, { title: 'Faster checkout', labels: ['founder'] }, { source: 'founder' });
    store.modules.workItemsDisk.updateWorkItem(dir, shippedRow.id, { note: 'Shipped to main as abc1234.' }, { source: 'system', now: Date.now() + 5000 });
    await team.tick({ items: store.listItems(), now: Date.now() + 10_000 });
    const run = store.listItems().find((i) => (i.labels ?? []).some((l) => l.startsWith('duty:')));
    expect(run.title).toBe('Look for anything we built worth a post');
    expect(run.body).toMatch(/check first/i);
    expect(run.body).toMatch(/nothing is worth/i);
    expect(run.body).toMatch(/there is a post worth your yes/);
  });

  it('shows each duty with when it runs and when it last ran', async () => {
    const t = team.create({ starter: 'quality' });
    asRun(t);
    core.teamSetup({ duties: [{ what: 'Look for a trend worth jumping on', every: 'day', at: ['09:00', '15:00'] }] });
    const [row] = team.view(store.listItems(), Date.now()).list;
    expect(row.duties).toEqual([expect.objectContaining({ what: 'Look for a trend worth jumping on', when: 'Daily at 9:00am and 3:00pm', lastRan: null })]);
  });
});
