// THERE IS ONE PRIMARY EMPLOYEE, AND IT IS THE ONE YOU TALK TO (w-cb18598d2f).
//
// "One primary employee that I can chat with." It is an ordinary teammate
// marked primary: at most one at a time, made from the Chief of staff starter
// or by making an existing teammate primary. Its brief says what the role is
// (take anything, hand it to whoever's job it is, do small things itself,
// offer a new teammate when a job has no owner, check in with only what needs
// you) and shows it the whole team, with what is waiting on you, so a check-in
// has something to read. It sits first in the Chats list.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { foldTeammates, STARTERS, primaryOf } from '../shared/teammates.mjs';
import { matesInOrder } from '../renderer/src/teammates/chat-lines';

describe('the primary mark', () => {
  it('is kept by the fold, and cleared by a later write', () => {
    const [kept] = foldTeammates([{ id: 't-aaaaaa', ts: 1, patch: { name: 'Chief of staff', primary: true } }]);
    expect(kept.primary).toBe(true);
    const [cleared] = foldTeammates([{ id: 't-aaaaaa', ts: 1, patch: { name: 'Chief of staff', primary: true } }, { id: 't-aaaaaa', ts: 2, patch: { primary: false } }]);
    expect(cleared.primary).toBe(false);
  });

  it('names one primary, and none when nobody is marked or the marked one is paused', () => {
    expect(primaryOf([{ id: 't-a', name: 'A' }, { id: 't-b', name: 'B', primary: true, status: 'active' }])?.id).toBe('t-b');
    expect(primaryOf([{ id: 't-a', name: 'A' }])).toBeNull();
    expect(primaryOf([{ id: 't-b', name: 'B', primary: true, paused: true, status: 'active' }])).toBeNull();
  });

  it('is first in the Chats list, the rest in their order', () => {
    const order = matesInOrder([{ id: 't-a', name: 'A' }, { id: 't-b', name: 'B' }, { id: 't-c', name: 'C', primary: true }]);
    expect(order.map((t) => t.id)).toEqual(['t-c', 't-a', 't-b']);
  });

  it('comes with a Chief of staff starter, offered first', () => {
    expect(STARTERS[0]).toMatchObject({ starter: 'chief', name: 'Chief of staff', primary: true });
  });
});

describe('a primary teammate in the store', () => {
  let product; let dir; let mods; let team; let store;

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
  });

  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('is made primary by the Chief of staff starter when there is none, and only then', () => {
    const first = team.describe({ starter: 'chief', product: product.id }).teammate;
    expect(team.get(first.id).primary).toBe(true);
    const second = team.create({ starter: 'chief', name: 'Second chief', product: product.id });
    expect(team.get(second.id).primary).toBeFalsy();
  });

  it('making one primary takes the mark off the other, and says so in the chat', () => {
    const a = team.create({ name: 'Chief of staff' });
    const b = team.create({ name: 'Ops lead' });
    team.update(a.id, { primary: true });
    team.update(b.id, { primary: true });
    expect(team.get(a.id).primary).toBe(false);
    expect(team.get(b.id).primary).toBe(true);
    expect(team.chat().messages.at(-1).text).toMatch(/Ops lead is your primary employee/);
  });

  it('is briefed as the one you talk to, with the team and what waits on you', () => {
    const chief = team.create({ name: 'Chief of staff' });
    const video = team.create({ name: 'Video producer', job: 'Makes the videos.' });
    team.update(chief.id, { primary: true });
    mods.workItemsDisk.createWorkItemIfAbsent(dir, 'w-waits00001', { title: 'Which cut goes out?', labels: ['founder', `teammate:${video.id}`, 'hop:0'] }, { source: 'system' });
    mods.workItemsDisk.updateWorkItem(dir, 'w-waits00001', { result: '**Which cut goes out?**' }, { source: 'agent' });
    const brief = team.briefFor({ id: 'w-run', product: product.id, labels: ['founder', `teammate:${chief.id}`, 'hop:0'] });
    expect(brief).toContain('## You are the primary employee');
    expect(brief).toMatch(/hand it over with team_pass/i);
    expect(brief).toMatch(/team_hire/);
    expect(brief).toContain('Which cut goes out?');
    expect(brief).toMatch(/Video producer.*Makes the videos/);
  });

  it('a teammate that is not primary is not briefed as one', () => {
    const t = team.create({ name: 'Video producer' });
    expect(team.briefFor({ id: 'w-run', product: product.id, labels: ['founder', `teammate:${t.id}`, 'hop:0'] })).not.toContain('primary employee');
  });
});
