// QA batch 011 (F-183, F-190, F-191), end to end on a throwaway store with two
// projects. On Oct 30 and 31, 2026 a Chief of staff's answer to a plain
// question sat in Needs you inside its old setup thread and never showed in
// its chat, and "add a README to the truncate-js project" ran in the Chunk JS
// thread and wrote into the truncate-js checkout itself. Here: the answer is a
// chat message and its run closes quietly; your words naming the other project
// start a run in that project; and a teammate can hand itself work in another
// project, which becomes a run there, while passing to itself in its own
// project is still refused.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { teammateIdOf, replyMessageId, CHAT_LABEL } from '../shared/teammates.mjs';
import { isCleanRun } from '../shared/repeats.mjs';

describe('a teammate answers in its chat and works in the project you name', () => {
  let home; let chunk; let truncate; let work; let team; let core; let store;
  const dirOf = (slug) => path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, slug);

  beforeEach(async () => {
    home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    const tag = Math.random().toString(36).slice(2, 6);
    chunk = createProduct(`Chunk ${tag}`);
    truncate = createProduct(`Truncate ${tag}`);
    const mods = await loadStore();
    work = mods.workItemsDisk;
    const products = [chunk, truncate].map((p) => ({ slug: p.id, dir: dirOf(p.id), name: p.name }));
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => products,
      productDir: (slug) => dirOf(slug),
      listItems: (now) => products.flatMap((p) => work.readWorkItems(p.dir, now).map((i) => ({ ...i, product: p.slug }))),
    };
    team = new Teammates(store);
    core = await import('../mcp/core/teammates.mjs');
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const tick = (now = Date.now()) => team.tick({ items: store.listItems(now), now, deliver: async () => {} });
  const runsOf = (id) => store.listItems().filter((i) => teammateIdOf(i) === id);
  const onRun = (run) => { process.env.ZERO_ITEM = run.id; process.env.ZERO_PRODUCT = run.product; };

  it('a plain answer is said in the chat once, and its run leaves Needs you', async () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    team.post({ text: 'What does chunk() return for an empty array?', to: [chief.id] });
    await tick();
    const [run] = runsOf(chief.id);
    expect(run.product).toBe(chunk.id);
    expect(run.labels).toContain(CHAT_LABEL);
    work.updateWorkItem(dirOf(run.product), run.id, { result: 'chunk() returns [] for an empty array.', status: 'open' }, { source: 'agent' });
    await tick();
    await tick();
    const said = team.chat().messages.filter((m) => m.id === replyMessageId(run.id));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ from: chief.id, to: [], text: 'chunk() returns [] for an empty array.' });
    const after = runsOf(chief.id).find((i) => i.id === run.id);
    expect(after.status).toBe('done');
    expect(isCleanRun(after)).toBe(true);
  });

  it('a reply that asks you something stays in Needs you and takes your answer', async () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    team.post({ text: 'Commit the README', to: [chief.id] });
    await tick();
    const [run] = runsOf(chief.id);
    work.updateWorkItem(dirOf(run.product), run.id, { result: 'What name and email should I use for the commit?', status: 'open' }, { source: 'agent' });
    await tick();
    expect(runsOf(chief.id).find((i) => i.id === run.id).status).toBe('open');
    expect(team.chat().messages.some((m) => m.id === replyMessageId(run.id))).toBe(false);
  });

  it('your words naming the other project start a run in that project, not the teammate\'s own', async () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    const m = team.post({ text: `Please get an agent to add a README.md to the ${truncate.name} project. Keep it tiny.`, to: [chief.id] });
    expect(m.product).toBe(truncate.id);
    await tick();
    const [run] = runsOf(chief.id);
    expect(run.product).toBe(truncate.id);
  });

  it('a teammate hands itself work in another project as a run there; in its own project it is refused', async () => {
    const chief = team.create({ starter: 'chief', product: chunk.id });
    team.post({ text: 'Get an agent to add a README over there', to: [chief.id] });
    await tick();
    const [run] = runsOf(chief.id);
    onRun(run);
    expect(() => core.teamPass({ to: chief.name, title: 'Add a README' })).toThrow(/not to yourself/);
    expect(() => core.teamPass({ to: chief.name, title: 'Add a README', project: chunk.id })).toThrow(/not to yourself/);
    const passed = core.teamPass({ to: chief.name, title: 'Add a README', details: 'Keep it tiny.', project: truncate.id });
    expect(passed.note).toMatch(/thread of its own/);
    work.updateWorkItem(dirOf(run.product), run.id, { result: 'Started a thread for it in Truncate.', status: 'done' }, { source: 'agent' });
    await tick();
    await tick();
    const there = runsOf(chief.id).filter((i) => i.product === truncate.id);
    expect(there).toHaveLength(1);
    expect(there[0].title).toBe('Add a README');
    expect(there[0].status).not.toBe('blocked');
  });
});
