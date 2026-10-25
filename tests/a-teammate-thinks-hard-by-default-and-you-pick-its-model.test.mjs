// "I noticed the agents felt kind of stupid and it turns out they're on medium
// by default. They should probably be on high by default and I should be able
// to change their model. I would think I can in this setting but I can't."
// A teammate's runs carried no effort, so each ran at the app's default
// (Medium in the run's own model menu), and the teammate's settings had no
// model or effort to pick. Now a run is High unless the teammate says
// otherwise, its settings carry the same model menu a thread has, and a change
// there reaches its runs that have not finished.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { teammateIdOf, TEAMMATE_EFFORT } from '../shared/teammates.mjs';

describe('how hard a teammate thinks, and on which model', () => {
  let dir; let work; let store; let team; let product;

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
    work = mods.workItemsDisk;
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => work.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  const tick = (now = Date.now()) => team.tick({ items: store.listItems(now), now, deliver: async () => {} });
  const runOf = (t) => store.listItems().find((i) => teammateIdOf(i) === t.id && i.status !== 'done');

  it('runs on High when the teammate names no effort', async () => {
    expect(TEAMMATE_EFFORT).toBe('high');
    const ada = team.create({ starter: 'quality' });
    team.post({ text: 'Try checkout on a phone', to: [ada.id] });
    await tick();
    expect(runOf(ada).effort).toBe('high');
  });

  it('runs on the effort and model you picked for it', async () => {
    const ada = team.create({ starter: 'quality' });
    team.update(ada.id, { effort: 'max', model: 'opus' });
    team.post({ text: 'Try checkout on a phone', to: [ada.id] });
    await tick();
    expect(runOf(ada)).toMatchObject({ effort: 'max', model: 'opus' });
  });

  it('a change reaches its runs that have not finished, and not the finished ones', async () => {
    const ada = team.create({ starter: 'quality' });
    team.post({ text: 'one', to: [ada.id] });
    await tick();
    const open = runOf(ada);
    const done = work.createWorkItem(dir, { title: 'old', labels: ['founder', `teammate:${ada.id}`, 'hop:0'], effort: 'low' }, { source: 'system' });
    work.updateWorkItem(dir, done.id, { status: 'done' }, { source: 'agent' });
    team.update(ada.id, { model: 'sonnet', effort: 'xhigh' });
    expect(store.listItems().find((i) => i.id === open.id)).toMatchObject({ model: 'sonnet', effort: 'xhigh' });
    expect(store.listItems().find((i) => i.id === done.id).effort).toBe('low');
    // Back to its default: the model the engine picks, and High.
    team.update(ada.id, { model: null, effort: null });
    const back = store.listItems().find((i) => i.id === open.id);
    expect(back.model || null).toBeNull();
    expect(back.effort).toBe('high');
  });

  it('is picked in its settings with the same model menu a thread has, High lit by default', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/<ModelPicker[^>]*value=\{t\.model \?\? null\}/);
    expect(page).toMatch(/effort=\{t\.effort \?\? TEAMMATE_EFFORT\}/);
    expect(page).toMatch(/onEffortChange=\{\(e\) => keep\(\{ effort: e \}\)\}/);
  });
});
