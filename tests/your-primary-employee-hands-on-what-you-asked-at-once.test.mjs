// YOUR PRIMARY EMPLOYEE HANDS ON WHAT YOU ASKED, AT ONCE (w-cb18598d2f).
//
// Since 2026-10-29 a hand-off between teammates waits for the person's yes,
// because two teammates once woke each other into 19 threads and videos nobody
// approved. A primary employee that routes your asks would then stop every one
// of them in your inbox, which is the opposite of what it is for. So a hand-off
// from the primary goes straight to work when the run it came from was started
// by your own words (you wrote to it, or Auto gave it your thread, or you
// replied on it). On its own round, or from any other teammate, a hand-off
// still waits. The app decides which, from the run; the model cannot claim it.
//
// The same rule covers making a new teammate, which Grok Bot's primary does
// ("suggest or create a focused Bot when a job should have a long-lived owner").
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { writeTeammate } from '../main/store/teammates-files.mjs';
import { planWakes, teammateIdOf, DEFAULT_LIMIT } from '../shared/teammates.mjs';

describe('a hand-off from the primary', () => {
  const base = { status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
  const chief = { ...base, id: 't-chief', name: 'Chief of staff', primary: true };
  const video = { ...base, id: 't-video', name: 'Video producer' };
  const pass = (extra = {}) => ({ id: 'm-1', kind: 'pass', from: chief.id, to: video.id, title: 'Make the clip', details: '', hop: 0, run: 'w-run', ts: 1, ...extra });
  const plan = (m) => planWakes({ teammates: [chief, video], chat: { messages: [m], seen: new Set(), into: new Map() }, items: [], now: 10 });

  it('carrying your words starts at once', () => {
    expect(plan(pass({ yours: true })).find((a) => a.type === 'run').trigger.hold).toBeUndefined();
  });

  it('without them waits for your yes', () => {
    expect(plan(pass()).find((a) => a.type === 'run').trigger.hold).toBe(true);
  });
});

describe('through the store', () => {
  let product; let dir; let mods; let team; let store; let core;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    mods = await loadStore();
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
    core = await import('../mcp/core/teammates.mjs');
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const runOf = (t, { yours }) => {
    const id = `w-run${Math.random().toString(16).slice(2, 8)}`;
    mods.workItemsDisk.createWorkItemIfAbsent(dir, id, { title: 'x', body: yours ? 'Get the launch clip made.' : "Time for your weekday round.", labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: yours ? 'founder' : 'system' });
    process.env.ZERO_ITEM = id;
    process.env.ZERO_PRODUCT = product.id;
    return id;
  };
  const lastPass = () => team.chat().messages.filter((m) => m.kind === 'pass').at(-1);

  it('marks a pass yours only when the primary passes from a run your words started', () => {
    const chief = team.create({ name: 'Chief of staff' });
    const video = team.create({ name: 'Video producer' });
    writeTeammate(team.dir(), chief.id, { primary: true }, Date.now());
    runOf(chief, { yours: true });
    expect(core.teamPass({ to: 'Video producer', title: 'Make the clip', details: '' }).note).toMatch(/starts now/);
    expect(lastPass().yours).toBe(true);
    runOf(chief, { yours: false });
    core.teamPass({ to: 'Video producer', title: 'Another clip', details: '' });
    expect(lastPass().yours).toBeUndefined();
    runOf(video, { yours: true });
    core.teamPass({ to: 'Chief of staff', title: 'Back to you', details: '' });
    expect(lastPass().yours).toBeUndefined();
  });

  it('a reply of yours on the primary\'s run counts as your words', () => {
    const chief = team.create({ name: 'Chief of staff' });
    team.create({ name: 'Video producer' });
    writeTeammate(team.dir(), chief.id, { primary: true }, Date.now());
    const id = runOf(chief, { yours: false });
    mods.workItemsDisk.updateWorkItem(dir, id, { answer: 'Yes, hand it to the Video producer.' }, { source: 'founder' });
    core.teamPass({ to: 'Video producer', title: 'Make the clip', details: '' });
    expect(lastPass().yours).toBe(true);
  });

  it('the primary makes a new teammate on your words, which sets itself up', async () => {
    const chief = team.create({ name: 'Chief of staff' });
    writeTeammate(team.dir(), chief.id, { primary: true }, Date.now());
    runOf(chief, { yours: true });
    const made = core.teamHire({ name: 'Support lead', job: 'Answer user emails and ask before any refund.' });
    expect(made.teammate.name).toBe('Support lead');
    const hired = team.list().find((t) => t.name === 'Support lead');
    expect(hired).toMatchObject({ status: 'draft', job: 'Answer user emails and ask before any refund.' });
    await team.tick({ items: store.listItems(), now: Date.now(), deliver: async () => {} });
    expect(store.listItems().some((i) => teammateIdOf(i) === hired.id)).toBe(true);
  });

  it('nobody else may make one, and the primary not on its own round', () => {
    const chief = team.create({ name: 'Chief of staff' });
    const video = team.create({ name: 'Video producer' });
    writeTeammate(team.dir(), chief.id, { primary: true }, Date.now());
    runOf(chief, { yours: false });
    expect(() => core.teamHire({ name: 'Support lead', job: 'x' })).toThrow(/person's words/);
    runOf(video, { yours: true });
    expect(() => core.teamHire({ name: 'Support lead', job: 'x' })).toThrow(/primary/);
    expect(team.list().some((t) => t.name === 'Support lead')).toBe(false);
  });
});
