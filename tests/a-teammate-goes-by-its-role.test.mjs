// "I'm running into problems with the agent names because I don't know who's
// talking and I keep forgetting who's who. I think it's best for their names
// to just be their roles." Teammates were Ada, Felix, Juno and Mira: the
// starters had people's names, a new teammate was told to pick one, and
// team_setup kept only the first word of any name it was given, so a role
// could not be a name at all. Now a teammate is called by what it does, the
// ones already on a team are renamed to their role once, and a name you give
// one later is kept.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { STARTERS } from '../shared/teammates.mjs';
import { writeTeammate } from '../main/store/teammates-files.mjs';

describe('a teammate\'s name', () => {
  it('is its role for every starter', () => {
    for (const s of STARTERS) expect(s.name).toBe(s.role);
    expect(STARTERS.map((s) => s.name)).toContain('Marketing lead');
    expect(new Set(STARTERS.map((s) => s.name)).size).toBe(STARTERS.length);
  });
});

describe('teammates on a team', () => {
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

  it('already named after people are renamed to their role once, with a free letter, and a name without a role stays', async () => {
    const juno = team.create({ name: 'Juno', role: 'growth marketer' });
    const mira = team.create({ name: 'Mira', role: 'Video producer' });
    const plain = team.create({ name: 'Rex' });
    await team.tick({ items: [], now: Date.now() });
    const byId = new Map(team.list().map((t) => [t.id, t]));
    expect(byId.get(juno.id)).toMatchObject({ name: 'Growth marketer', letter: 'G' });
    expect(byId.get(mira.id)).toMatchObject({ name: 'Video producer', letter: 'V' });
    expect(byId.get(plain.id).name).toBe('Rex');
  });

  it('keeps a name you give it after the rename', async () => {
    const juno = team.create({ name: 'Juno', role: 'growth marketer' });
    await team.tick({ items: [], now: Date.now() });
    team.update(juno.id, { name: 'Juno' });
    await team.tick({ items: [], now: Date.now() });
    expect(team.get(juno.id).name).toBe('Juno');
  });

  it('two with the same role get told apart', async () => {
    team.create({ name: 'Ada', role: 'Quality lead' });
    team.create({ name: 'Bea', role: 'Quality lead' });
    await team.tick({ items: [], now: Date.now() });
    expect(team.list().map((t) => t.name).sort()).toEqual(['Quality lead', 'Quality lead 2']);
  });

  it('shows no role beside a name that already is it', () => {
    team.create({ starter: 'support' });
    const [row] = team.view([], Date.now()).list;
    expect(row.name).toBe('Support lead');
    expect(row.role).toBeNull();
  });

  it('is set up by the teammate as a role of more than one word, and the brief says to', async () => {
    const { teammate } = team.describe({ text: 'Someone for our launch videos', greeted: true });
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title: 'Set up its job', labels: ['founder', `teammate:${teammate.id}`, 'hop:0'] }, { source: 'system' });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = product.id;
    const core = await import('../mcp/core/teammates.mjs');
    core.teamSetup({ name: 'Video producer', role: 'Video producer' });
    expect(team.get(teammate.id)).toMatchObject({ name: 'Video producer', letter: 'V' });
    const brief = team.briefFor({ id: run.id, labels: run.labels });
    expect(brief).toMatch(/Your name is your role/);
    expect(brief).not.toMatch(/person's first name/);
  });

  it('an active teammate changing its own instructions says so in the chat', async () => {
    const t = team.create({ starter: 'support' });
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title: 'x', labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = product.id;
    const core = await import('../mcp/core/teammates.mjs');
    core.teamSetup({ asksFirst: 'Before any refund over $20' });
    const said = team.chat().messages.filter((m) => m.kind === 'act' && m.from === t.id && m.verb === 'updated');
    expect(said).toHaveLength(1);
    expect(said[0].text).toMatch(/what needs your yes/i);
    // A draft setting itself up is not "updating its instructions".
    writeTeammate(team.dir(), t.id, { status: 'draft' });
    core.teamSetup({ goal: 'Every email answered today' });
    expect(team.chat().messages.filter((m) => m.verb === 'updated')).toHaveLength(1);
  });
});
