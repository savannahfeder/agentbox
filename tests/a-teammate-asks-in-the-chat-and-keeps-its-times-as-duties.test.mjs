// The founder's Growth marketer described itself as checking for trends twice
// a day, at 10:30am and 3:30pm, while the page beside it said "Works daily at
// 10:30am": team_setup still offered the old single round (every, at, on), the
// teammate used it, and its job promised times nothing would wake it at. Its
// "What needs your yes first" read "When a check turns up nothing, do you want
// to hear about it at all?", a setup question saved where a rule belongs.
// Measured on the founder's screenshot. Now the tool sets times only as duties,
// the setup brief says the job promises no other times, and a question is
// refused as asksFirst with where to ask it instead.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';

describe('a teammate setting itself up', () => {
  let team; let store; let dir; let product; let core;
  beforeEach(async () => {
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
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title: 'Set up', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = product.id;
    return run;
  };

  it('cannot save a question as what needs your yes, and is told to ask it in the chat', () => {
    const t = team.create({ starter: 'growth' });
    asRun(t);
    expect(() => core.teamSetup({ asksFirst: 'When a check turns up nothing, do you want to hear about it at all?' })).toThrow(/statement[\s\S]*team_post/);
    expect(() => core.teamSetup({ asksFirst: 'Anything public? ' })).toThrow(/team_post/);
    core.teamSetup({ asksFirst: 'Anything that goes out in public (posts, emails?) or costs money.' });
    expect(team.list().find((x) => x.id === t.id).asksFirst).toBe('Anything that goes out in public (posts, emails?) or costs money.');
  });

  it('is told that every time it wakes on its own is a duty, and its job promises no other', () => {
    const t = team.describe({ text: 'Find trends worth a post' }).teammate;
    const run = asRun(t);
    expect(team.briefFor({ id: run.id, labels: run.labels })).toMatch(/each time you wake on your own is a duty, and your job promises no time your duties do not hold/);
  });
});

describe('the team_setup tool', () => {
  it('sets times only as duties, so a teammate cannot pick the old single round', () => {
    const src = fs.readFileSync(new URL('../mcp/tools.mjs', import.meta.url), 'utf8');
    const tool = src.slice(src.indexOf("name: 'team_setup'"), src.indexOf("name: 'team_roster'"));
    const top = tool.slice(tool.indexOf('schema: {'), tool.indexOf('run:'));
    const outside = top.replace(/duties: z\.array\(z\.object\(\{[\s\S]*?\}\)\)\.optional\(\),/, '');
    expect(outside).not.toMatch(/\bevery:/);
    expect(outside).not.toMatch(/\bat:/);
    expect(top).toMatch(/duties: z\.array/);
    expect(tool).toMatch(/a statement, never a question/);
  });
});
