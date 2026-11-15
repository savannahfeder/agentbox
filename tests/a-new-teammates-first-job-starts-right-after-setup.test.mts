// A NEW TEAMMATE'S FIRST JOB STARTS RIGHT AFTER ITS SETUP.
//
// 2026-11-08, a Sunday: a Loom lead was set up at about 19:00 for work its
// owner called "an urgent priority right now". It saved weekday 09:00 duties,
// went ready and closed its setup, and then nothing ran until Monday 09:00:
// a teammate only wakes for a message, a pass or a duty's time, and its brief
// asking it to do opening work in the setup run was read as a description.
// Measured by setting a teammate up through team_setup on a Sunday at 18:59
// and asking the planner what runs two minutes later.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { planWakes, teammateLabel, DEFAULT_LIMIT } from '../shared/teammates.mts';

const SUNDAY_1859 = new Date(2026, 10, 8, 18, 59).getTime();
const MINUTES = 60_000;
const loom = (over = {}) => ({ id: 't-loom', name: 'Loom lead', letter: 'L', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'agentbox-team', memory: [],
  duties: [{ id: 'd-looms', what: 'Draft the day\'s Looms', every: 'weekday', at: ['09:00'] }], dutyServed: { 'd-looms': '2026-11-06T09:00' }, ...over });
const firstRuns = (acts) => acts.filter((a) => a.type === 'run' && a.trigger.kind === 'first');
const plan = (t, items = []) => planWakes({ teammates: [t], chat: { messages: [], seen: new Set() }, items, now: SUNDAY_1859 + 2 * MINUTES });

describe('the planner', () => {
  it('starts the first run of a teammate whose first run is owed', () => {
    const acts = plan(loom({ firstRun: 'owed' }));
    expect(firstRuns(acts)).toHaveLength(1);
    expect(firstRuns(acts)[0].start).toBe('now');
    expect(acts).toContainEqual({ type: 'firstServed', teammate: 't-loom' });
  });

  it('queues it behind the setup run still finishing, so it starts as that one ends', () => {
    const setup = { id: 'w-setup', product: 'agentbox-team', status: 'claimed', labels: ['founder', teammateLabel('t-loom'), 'hop:0'], createdAt: SUNDAY_1859 - 30 * MINUTES };
    expect(firstRuns(plan(loom({ firstRun: 'owed' }), [setup]))[0].start).toBe('later');
  });

  it('starts nothing once it has started, when you said when to start, or for a teammate set up before this', () => {
    expect(firstRuns(plan(loom({ firstRun: 'served' })))).toEqual([]);
    expect(firstRuns(plan(loom({ firstRun: 'waits' })))).toEqual([]);
    expect(firstRuns(plan(loom()))).toEqual([]);
  });

  it('starts nothing for a paused teammate or one still being set up', () => {
    expect(firstRuns(plan(loom({ firstRun: 'owed', paused: true })))).toEqual([]);
    expect(firstRuns(plan(loom({ firstRun: 'owed', status: 'draft' })))).toEqual([]);
  });
});

describe('set up on a Sunday at 18:59 with weekday 09:00 duties', () => {
  let team; let store; let dir;
  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    const product = createProduct(`Looms ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_ITEM; delete process.env.ZERO_PRODUCT; });

  const setUp = async (extra = {}) => {
    const at = SUNDAY_1859 - 20 * MINUTES;
    team.describe({ text: 'Take over the thread for AI-personalized Looms. It is urgent.', greeted: true }, at);
    await team.tick({ items: store.listItems(at), now: at });
    const run = store.listItems(at).find((i) => i.title === 'Set up a new teammate');
    const disk = store.modules.workItemsDisk;
    disk.updateWorkItem(dir, run.id, { answer: 'Weekdays at 9, and start on it now.' }, { source: 'founder', now: at + MINUTES });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = store.listProducts()[0].slug;
    const core = await import('../mcp/core/teammates.mts');
    core.teamSetup({ name: 'Loom lead', role: 'Loom lead', duties: [{ what: 'Draft the day\'s Looms', every: 'weekday', at: '09:00' }], ready: true, ...extra }, { now: SUNDAY_1859 });
    disk.updateWorkItem(dir, run.id, { status: 'done', result: "I'm set up. Starting on the Looms now." }, { source: 'agent', now: SUNDAY_1859 + MINUTES });
    return run;
  };
  const runsAfter = (run) => store.listItems(SUNDAY_1859 + 3 * MINUTES).filter((i) => i.id !== run.id);

  it('has a run going within minutes, and only one after another tick', async () => {
    const run = await setUp();
    await team.tick({ items: store.listItems(SUNDAY_1859 + 2 * MINUTES), now: SUNDAY_1859 + 2 * MINUTES });
    await team.tick({ items: store.listItems(SUNDAY_1859 + 3 * MINUTES), now: SUNDAY_1859 + 3 * MINUTES });
    const started = runsAfter(run);
    expect(started).toHaveLength(1);
    expect(started[0].status).toBe('open');
    expect(started[0].start ?? 'now').toBe('now');
    expect(started[0].body).toMatch(/first/i);
  });

  it('waits for its first duty when you said when to start', async () => {
    const run = await setUp({ startNow: false });
    await team.tick({ items: store.listItems(SUNDAY_1859 + 2 * MINUTES), now: SUNDAY_1859 + 2 * MINUTES });
    expect(runsAfter(run)).toEqual([]);
  });

  it('a teammate saving again once active owes no second first run', async () => {
    const run = await setUp();
    await team.tick({ items: store.listItems(SUNDAY_1859 + 2 * MINUTES), now: SUNDAY_1859 + 2 * MINUTES });
    const core = await import('../mcp/core/teammates.mts');
    core.teamSetup({ goal: 'Ten Looms a day', ready: true }, { now: SUNDAY_1859 + 4 * MINUTES });
    await team.tick({ items: store.listItems(SUNDAY_1859 + 5 * MINUTES), now: SUNDAY_1859 + 5 * MINUTES });
    expect(runsAfter(run)).toHaveLength(1);
  });
});
