// A teammate rewrote its whole method inside the run doing your work, after
// every correction. Measured on the Head of Marketing's multiplayer-video
// thread (2026-11-18): one run spent 19 of its 29 actions on team_method, and
// the method was saved 32 times that day, each time held under the 16,000
// character cap. Meanwhile the look-back that tidies the method waited for
// three separate threads with your replies, so a day of corrections on one
// long thread never got one.
//
// Memory systems that work (RockBot's dream pass, Letta's sleep-time agents,
// Claude's dreaming) split the two: the working agent jots a note and keeps
// going, and a pass while it is idle folds the notes in. So now a working run
// applies a correction and notes it with team_remember, notes newer than the
// method outrank it in every brief, and five such notes start a look-back on
// their own, under the same once-a-day and plan-room limits.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { planWakes, teammateLabel, DEFAULT_LIMIT, LOOK_BACK_LABEL, LOOK_BACK_NOTES } from '../shared/teammates.mts';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';

const HOUR = 3600_000;
const NOW = new Date(2026, 10, 19, 15, 0).getTime();
const base = { id: 't-aaaaaa', name: 'Marketing lead', letter: 'M', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [], duties: [], dutyServed: {} };
const chat = { messages: [], seen: new Set() };
const lookBacks = (acts) => acts.filter((a) => a.type === 'run' && a.trigger.kind === 'look-back');
const notesAt = (n, ago = HOUR) => Array.from({ length: n }, (_, k) => NOW - ago - k * 1000);
const oneLongThread = [{
  id: 'w-long', product: 'kestrel', title: 'Launch video', status: 'done',
  labels: ['founder', teammateLabel(base.id), 'hop:0'], createdAt: NOW - 10 * HOUR,
  wrote: { answer: { source: 'founder', ts: NOW - HOUR }, status: { source: 'agent', ts: NOW - 30 * 60_000 } },
}];
const plan = (notes, items = oneLongThread) => lookBacks(planWakes({ teammates: [base], chat, items, now: NOW, lookBack: { ok: () => true, notes: () => notes } }));

describe('notes a working run kept start a look-back', () => {
  it(`at ${LOOK_BACK_NOTES} notes from one long thread, and not one fewer`, () => {
    expect(LOOK_BACK_NOTES).toBe(5);
    expect(plan(notesAt(5))).toHaveLength(1);
    expect(plan(notesAt(4))).toHaveLength(0);
  });

  it('counts only notes since the last look-back, which still runs at most once a day', () => {
    const last = { ...oneLongThread[0], id: 'w-lb', labels: [...oneLongThread[0].labels, LOOK_BACK_LABEL, 'clean'], createdAt: NOW - 30 * HOUR };
    expect(plan(notesAt(5, 31 * HOUR), [...oneLongThread, last])).toHaveLength(0);
    expect(plan(notesAt(5), [...oneLongThread, last])).toHaveLength(1);
    const recent = { ...last, createdAt: NOW - 3 * HOUR };
    expect(plan(notesAt(5, HOUR), [...oneLongThread, recent])).toHaveLength(0);
  });

  it('never without the go-ahead the app gives', () => {
    expect(lookBacks(planWakes({ teammates: [base], chat, items: oneLongThread, now: NOW, lookBack: { ok: () => false, notes: () => notesAt(9) } }))).toHaveLength(0);
  });
});

describe('a working run\'s brief', () => {
  let team; let store; let dir; let core; let product;
  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
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
    core = await import('../mcp/core/teammates.mts');
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_ITEM; delete process.env.ZERO_PRODUCT; });

  const asRun = (t) => {
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title: 'Launch video', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = product.id;
    return run;
  };

  it('tells it to note a correction rather than rewrite its method', () => {
    const t = team.create({ starter: 'marketing' });
    const run = asRun(t);
    core.teamMethod({ text: '## The job\nShort clips.' });
    const brief = team.briefFor({ id: run.id, labels: run.labels });
    expect(brief).toMatch(/team_remember/);
    expect(brief).not.toMatch(/update your method in this run/);
    expect(brief).not.toMatch(/tighten it this run/);
  });

  it('puts notes newer than the method above it, as the newer word', () => {
    const t = team.create({ starter: 'marketing' });
    const run = asRun(t);
    core.teamMethod({ text: '## The job\nShort clips.' });
    core.teamRemember({ text: '19 Nov: "start on the homepage"' }, { now: Date.now() + 5_000 });
    const brief = team.briefFor({ id: run.id, labels: run.labels }, Date.now() + 6_000);
    expect(brief).toMatch(/start on the homepage/);
    expect(brief).toMatch(/they win/i);
    expect(brief).not.toMatch(/put these in it/);
  });
});
