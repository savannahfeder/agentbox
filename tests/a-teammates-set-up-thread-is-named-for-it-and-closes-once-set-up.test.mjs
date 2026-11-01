// 2026-10-31: the Team view held two of Maya's threads both
// titled "Set up its job", and her Today page and Needs you kept "Chief of
// staff: Set up its job" as waiting on her long after it had said "I'm set
// up" at 6:11. Measured from the title a setup run is given, the title after
// the teammate names itself, and the brief's step for the run that goes ready.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { runTitle } from '../shared/teammates.mjs';

describe('the title of a setup run', () => {
  it('names the teammate', () => {
    expect(runTitle({ kind: 'message', opening: 'setup' }, { name: 'Pricing researcher' })).toBe('Set up Pricing researcher');
  });
  it('says a new teammate while it has no name of its own', () => {
    expect(runTitle({ kind: 'message', opening: 'setup' }, { name: 'New teammate' })).toBe('Set up a new teammate');
  });
  it('leaves other runs as they were', () => {
    expect(runTitle({ kind: 'message', opening: 'start' }, { name: 'Pricing researcher' })).toBe('Introduce itself and begin');
  });
});

describe('a teammate setting itself up', () => {
  let team; let store; let product; let dir;
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
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; delete process.env.ZERO_ITEM; delete process.env.ZERO_PRODUCT; });

  const runFor = (teammate, title) => {
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title, labels: ['founder', `teammate:${teammate.id}`, 'hop:0'] }, { source: 'system' });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = product.id;
    return run;
  };
  const titleOf = (run) => store.modules.workItemsDisk.readWorkItem(dir, run.id).title;

  it('retitles its setup run with the name it takes', async () => {
    const { teammate } = team.describe({ text: 'Someone to check competitor prices every Monday', greeted: true });
    const run = runFor(teammate, 'Set up a new teammate');
    const core = await import('../mcp/core/teammates.mjs');
    core.teamSetup({ name: 'Pricing researcher', role: 'Pricing researcher' });
    expect(titleOf(run)).toBe('Set up Pricing researcher');
  });

  it('leaves a run that is not its setup alone when renamed', async () => {
    const { teammate } = team.describe({ text: 'Someone to check competitor prices every Monday', greeted: true });
    const run = runFor(teammate, 'Compare Jane and Cliniko');
    const core = await import('../mcp/core/teammates.mjs');
    core.teamSetup({ name: 'Pricing researcher' });
    expect(titleOf(run)).toBe('Compare Jane and Cliniko');
  });

  it('is told to close its setup run once it is set up, so it does not wait on the person', () => {
    const { teammate } = team.describe({ text: 'Someone to check competitor prices every Monday', greeted: true });
    const run = runFor(teammate, 'Set up a new teammate');
    const brief = team.briefFor({ id: run.id, labels: run.labels });
    const step3 = brief.split('\n').find((l) => l.startsWith('3. '));
    expect(step3).toMatch(/ready true/);
    expect(step3).toMatch(/update_work_item with status done/);
  });
});
