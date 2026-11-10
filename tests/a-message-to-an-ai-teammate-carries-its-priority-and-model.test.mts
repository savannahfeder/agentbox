// "There are also no functions: how do I switch and control the model, and
// how do I control priority?" (2026-11-09, a note on the teammate chat box.)
// The box had no priority and no model, unlike the thread reply box, and a
// run a teammate's message started was always Medium (priority 5 in
// main/teammates.mts tick). Here: the priority on your message reaches the run
// it starts and the run it joins, a new teammate takes its first message's
// priority and model, and the box draws both chips.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { teammateIdOf } from '../shared/teammates.mts';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('a message to an AI teammate carries its priority and model', () => {
  let home; let chunk; let team; let work; let store;
  const dirOf = (slug) => path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, slug);
  const tick = () => team.tick({ items: store.listItems(), deliver: async () => {} });
  const runsOf = (id) => store.listItems().filter((i) => teammateIdOf(i) === id);

  beforeEach(async () => {
    home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    chunk = createProduct(`Chunk ${Math.random().toString(36).slice(2, 6)}`);
    const mods = await loadStore();
    work = mods.workItemsDisk;
    const products = [{ slug: chunk.id, dir: dirOf(chunk.id), name: chunk.name }];
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => products,
      productDir: (slug) => dirOf(slug),
      listItems: (now) => products.flatMap((p) => work.readWorkItems(p.dir, now).map((i) => ({ ...i, product: p.slug }))),
    };
    team = new Teammates(store);
  });

  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('starts its run at the priority you picked', async () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    team.post({ text: 'The checkout is down', to: [chief.id], priority: 9 });
    await tick();
    expect(runsOf(chief.id)[0].priority).toBe(9);
  });

  it('starts at Medium when you picked nothing, as before', async () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    team.post({ text: 'Look at the pricing page', to: [chief.id] });
    await tick();
    expect(runsOf(chief.id)[0].priority).toBe(5);
  });

  it('keeps no priority that is not one of the four', () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    expect(team.post({ text: 'a', to: [chief.id], priority: 4 }).priority).toBeUndefined();
    expect(team.post({ text: 'b', to: [chief.id], priority: '9' }).priority).toBeUndefined();
    expect(team.post({ text: 'c', to: [chief.id], priority: 2 }).priority).toBe(2);
  });

  it('moves the run your answer joins to the priority you picked', async () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    team.post({ text: 'Commit the README', to: [chief.id] });
    await tick();
    const [run] = runsOf(chief.id);
    work.updateWorkItem(dirOf(run.product), run.id, { result: 'Which name should I commit as?', status: 'open' }, { source: 'agent' });
    await tick();
    team.post({ text: 'Use mine, and quickly', to: [chief.id], priority: 7 });
    await tick();
    expect(runsOf(chief.id)).toHaveLength(1);
    expect(runsOf(chief.id)[0].priority).toBe(7);
  });

  it('a new teammate takes the model, level and priority of the words that make it', async () => {
    const made = team.describe({ text: 'Answer user emails', product: chunk.id, model: 'sonnet', effort: 'low', priority: 7 });
    expect(made.teammate).toMatchObject({ model: 'sonnet', effort: 'low' });
    await tick();
    expect(runsOf(made.teammate.id)[0].priority).toBe(7);
  });
});

describe('the teammate chat box draws the thread box\'s chips', () => {
  const page = read('renderer/src/teammates/TeammatesPage.tsx');
  const box = /function Composer\([\s\S]*?\n}\n/.exec(page)?.[0] ?? '';

  it('has the priority chip and the model chip on the left of its bar', () => {
    expect(box).toMatch(/<span className="dock-chips">/);
    expect(box).toMatch(/<PriorityPicker variant="chip"/);
    expect(box).toMatch(/<span className="dock-chips">[\s\S]*?\{model\}/);
    // In a teammate's chat, on its About page, and in a new teammate's first answer.
    expect(page.match(/model=\{<ModelOf /g)).toHaveLength(2);
    expect(page).toMatch(/<Composer placeholder="Answer your new teammate"[\s\S]*?model=\{<TeammateModel /);
  });

  it('sends the priority with the message', () => {
    expect(page).toMatch(/call\('post', \{ text, to: \[t\.id\], priority,/);
    expect(read('main/ipc.mts')).toMatch(/mates\.post\(\{[^}]*priority: a\.priority/);
  });

  it('keeps what you attached off the bar\'s line', () => {
    expect(read('renderer/src/teammates/teammates.css')).toMatch(/\.dock-card\.tq-compose \.attach-row \{ padding: 0 16px 12px; \}/);
  });
});
