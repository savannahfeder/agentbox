// A HAND-OFF YOU ASKED A TEAMMATE FOR STARTS AT ONCE (w-0e21f73f90).
//
// You asked an agent to give your feedback to the other agent, and the other
// agent never started: you had to start it by hand. Between two AI teammates
// that is team_pass, and a pass started at once only from your primary
// teammate; from any other teammate it waited in your inbox for a yes you had
// already given by asking. The hold is there so teammates cannot wake each
// other into work nobody asked for (19 threads, 2026-10-29), and that stays:
// a pass counts as yours only from a run whose newest word is yours, so the
// receiver's own passes, started by the pass and not by you, still wait.
// Measured through the store tool on two plain teammates.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { planWakes, DEFAULT_LIMIT } from '../shared/teammates.mts';

let product; let dir; let mods; let team; let core;

beforeEach(async () => {
  const home = appHome();
  process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
  fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
  const { resolveAccount } = await import('../mcp/core/account.mts');
  resolveAccount();
  const { createProduct } = await import('../mcp/core/products.mts');
  product = createProduct(`Calls ${Math.random().toString(36).slice(2, 8)}`);
  dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
  mods = await loadStore();
  const store = {
    config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
    modules: mods,
    listProducts: () => [{ slug: product.id, dir, name: product.name }],
    productDir: () => dir,
    listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
  };
  team = new Teammates(store);
  core = await import('../mcp/core/teammates.mts');
});

afterEach(() => {
  delete process.env.STORE_ACCOUNT_ID;
  delete process.env.ZERO_ITEM;
  delete process.env.ZERO_PRODUCT;
});

// A run of `t`'s, opened by your words, by its own round, or by your reply on it.
const runOf = (t, { opened, reply = null }) => {
  const id = `w-run${Math.random().toString(16).slice(2, 8)}`;
  const yours = opened === 'you';
  mods.workItemsDisk.createWorkItemIfAbsent(dir, id, { title: 'x', body: yours ? 'Tell the video producer the cut is too long.' : 'Time for your weekday round.', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: yours ? 'founder' : 'system' });
  if (opened === 'a pass') mods.workItemsDisk.updateWorkItem(dir, id, { answer: 'Make the clip shorter.', from: { teammate: 't-other', name: 'Launch lead' } }, { source: 'system' });
  if (reply) mods.workItemsDisk.updateWorkItem(dir, id, { answer: reply }, { source: 'founder' });
  process.env.ZERO_ITEM = id;
  process.env.ZERO_PRODUCT = product.id;
  return id;
};
const lastPass = () => team.chat().messages.filter((m) => m.kind === 'pass').at(-1);
const held = (m) => {
  const base = { status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: product.id, memory: [] };
  const plan = planWakes({ teammates: team.list().map((t) => ({ ...base, ...t })), chat: { messages: [m], seen: new Set(), into: new Map() }, items: [], now: Date.now() });
  return plan.find((a) => a.type === 'run' || a.type === 'tell')?.trigger?.hold ?? plan.find((a) => a.type === 'tell')?.hold;
};

describe('a pass from a teammate that is not your primary', () => {
  it('starts at once from a run your words opened', () => {
    const launch = team.create({ name: 'Launch lead' });
    team.create({ name: 'Video producer' });
    runOf(launch, { opened: 'you' });
    const out = core.teamPass({ to: 'Video producer', title: 'Shorten the cut', details: 'The cut is too long; bring it under a minute.' });
    expect(out.note).toMatch(/starts now/);
    expect(lastPass().yours).toBe(true);
    expect(held(lastPass())).toBeFalsy();
  });

  it('starts at once when your reply on its run asked for it', () => {
    const launch = team.create({ name: 'Launch lead' });
    team.create({ name: 'Video producer' });
    runOf(launch, { opened: 'round', reply: 'Give this feedback to the video producer.' });
    core.teamPass({ to: 'Video producer', title: 'Shorten the cut', details: '' });
    expect(lastPass().yours).toBe(true);
  });

  it('still waits for your yes on its own round', () => {
    const launch = team.create({ name: 'Launch lead' });
    team.create({ name: 'Video producer' });
    runOf(launch, { opened: 'round' });
    const out = core.teamPass({ to: 'Video producer', title: 'Shorten the cut', details: '' });
    expect(out.note).toMatch(/yes/);
    expect(lastPass().yours).toBeUndefined();
    expect(held(lastPass())).toBe(true);
  });

  it('still waits when another teammate\'s pass opened the run, so two cannot wake each other', () => {
    const video = team.create({ name: 'Video producer' });
    team.create({ name: 'Launch lead' });
    runOf(video, { opened: 'a pass' });
    core.teamPass({ to: 'Launch lead', title: 'Check the new cut', details: '' });
    expect(lastPass().yours).toBeUndefined();
  });
});
