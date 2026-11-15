// A THREAD YOU ASK FOR A TEAMMATE MAKES ONE (w-d87b486767).
//
// On a plain thread the person wrote "I want you to make a new AI teammate,
// labelled YC Partner". team_hire refused with "this session is not a
// teammate's run, so it has no team chat to write to": it worked only from the
// primary employee's run, and that team had no primary, so no thread anywhere
// could make one. Now the person's words decide it, on any thread: a run they
// started or answered makes the teammate, and a run they did not is refused
// with the real reason and what to do instead.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { writeTeammate } from '../main/store/teammates-files.mts';

describe('team_hire', () => {
  let product; let dir; let mods; let team; let core;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    mods = await loadStore();
    team = new Teammates({
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => mods.workItemsDisk.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    });
    core = await import('../mcp/core/teammates.mts');
    team.create({ name: 'Growth marketer' });
    team.create({ name: 'Video producer' });
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const thread = ({ yours, labels = ['founder'] }) => {
    const id = `w-run${Math.random().toString(16).slice(2, 8)}`;
    mods.workItemsDisk.createWorkItemIfAbsent(dir, id, { title: 'x', body: yours ? 'I want you to make a new AI teammate, labelled YC Partner.' : 'Weekly review.', labels }, { source: yours ? 'founder' : 'system' });
    process.env.ZERO_ITEM = id;
    process.env.ZERO_PRODUCT = product.id;
    return id;
  };
  const hire = () => core.teamHire({ name: 'YC Partner', job: 'Run our four-week batch.' });
  const made = () => team.list().find((t) => t.name === 'YC Partner');

  it('is made from a plain thread you wrote, with no primary employee on the team', () => {
    thread({ yours: true });
    expect(hire().teammate).toMatchObject({ name: 'YC Partner', status: 'draft' });
    expect(made()).toMatchObject({ status: 'draft', job: 'Run our four-week batch.', product: product.id });
    expect(team.chat().messages.at(-1).text).toMatch(/You made YC Partner/);
  });

  it('is made from a plain thread you replied on', () => {
    const id = thread({ yours: false });
    mods.workItemsDisk.updateWorkItem(dir, id, { answer: 'Yes, make the YC Partner.' }, { source: 'founder' });
    expect(hire().teammate.name).toBe('YC Partner');
  });

  it('is made from a teammate\'s run your words started, even when it is not the primary', () => {
    const video = team.list().find((t) => t.name === 'Video producer');
    thread({ yours: true, labels: ['founder', `teammate:${video.id}`, 'hop:0'] });
    hire();
    expect(made()).toBeTruthy();
    expect(team.chat().messages.at(-1).text).toMatch(/Video producer made YC Partner/);
  });

  it('is refused on a thread your words did not start, saying why and what to do', () => {
    thread({ yours: false });
    expect(hire).toThrow(/person did not ask.*ask them first/);
    expect(hire).not.toThrow(/team chat/);
    expect(made()).toBeUndefined();
  });

  it('is refused on the primary\'s own round too', () => {
    const chief = team.create({ name: 'Chief of staff' });
    writeTeammate(team.dir(), chief.id, { primary: true }, Date.now());
    thread({ yours: false, labels: ['founder', `teammate:${chief.id}`, 'hop:0'] });
    expect(hire).toThrow(/person did not ask/);
    expect(made()).toBeUndefined();
  });

  it('outside any thread, says so rather than blaming a team chat', () => {
    expect(hire).toThrow(/not running for a thread/);
    expect(hire).not.toThrow(/team chat/);
  });
});
