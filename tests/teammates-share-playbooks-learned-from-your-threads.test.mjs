// "I don't really see the playbooks you talked about." What a teammate learned
// about how you like a kind of work done (posts, videos) lived only in its own
// memory, a list of one-liners nobody else could read, so a second teammate
// doing the same kind of work started from nothing. Now a teammate keeps such
// a lesson in a playbook by topic, with the thread it came from; every
// teammate that reads the playbook gets its lessons in its brief, and the
// window gets the playbooks to draw.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { foldPlaybooks } from '../shared/teammates.mjs';

describe('playbooks, folded', () => {
  it('keep each lesson once with where it came from, who reads them, and drop a forgotten lesson', () => {
    const books = foldPlaybooks([
      { kind: 'book', id: 'p-1', title: 'How you like videos made', ts: 1 },
      { kind: 'lesson', id: 'l-1', book: 'p-1', text: 'Open on the product, never a logo', by: 't-aaaaaa', from: { product: 'kestrel', id: 'w-1', title: 'Launch video' }, ts: 2 },
      { kind: 'lesson', id: 'l-1', book: 'p-1', text: 'Open on the product, never a logo', by: 't-aaaaaa', ts: 3 },
      { kind: 'lesson', id: 'l-2', book: 'p-1', text: 'Two cuts side by side', by: 't-bbbbbb', ts: 4 },
      { kind: 'reader', book: 'p-1', teammate: 't-cccccc', ts: 5 },
      { kind: 'forget', id: 'l-2', ts: 6 },
      { kind: 'lesson', id: 'l-9', book: 'p-missing', text: 'orphan', ts: 7 },
    ]);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ id: 'p-1', title: 'How you like videos made', updatedAt: 6 });
    expect(books[0].lessons.map((l) => l.text)).toEqual(['Open on the product, never a logo']);
    expect(books[0].lessons[0].from).toEqual({ product: 'kestrel', id: 'w-1', title: 'Launch video' });
    expect(books[0].readers.sort()).toEqual(['t-aaaaaa', 't-bbbbbb', 't-cccccc']);
  });
});

describe('a teammate keeping a lesson', () => {
  let team; let store; let product; let dir; let core;
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

  const asRun = (t, title = 'Launch video, version 3') => {
    const run = store.modules.workItemsDisk.createWorkItem(dir, { title, labels: ['founder', `teammate:${t.id}`, 'hop:0'] }, { source: 'system' });
    process.env.ZERO_ITEM = run.id;
    process.env.ZERO_PRODUCT = product.id;
    return run;
  };

  it('puts it in the playbook of that title, made if new, from the thread it is on, and says so in the chat', () => {
    const t = team.create({ starter: 'marketing' });
    const run = asRun(t);
    const r1 = core.teamPlaybook({ playbook: 'How you like videos made', lesson: 'Open on the product, never a logo' });
    const r2 = core.teamPlaybook({ playbook: 'how you like videos made', lesson: 'Two cuts side by side' });
    expect(r2.playbook).toBe(r1.playbook);
    const [book] = team.view([], Date.now()).playbooks;
    expect(book.title).toBe('How you like videos made');
    expect(book.lessons.map((l) => l.text)).toEqual(['Open on the product, never a logo', 'Two cuts side by side']);
    expect(book.lessons[0].from).toEqual({ product: product.id, id: run.id, title: 'Launch video, version 3' });
    expect(team.view([], Date.now()).list[0].playbooks).toEqual([book.id]);
    const said = team.chat().messages.filter((m) => m.kind === 'act' && m.verb === 'lesson');
    expect(said.map((m) => [m.from, m.ref, m.text])).toEqual([[t.id, book.id, 'Open on the product, never a logo'], [t.id, book.id, 'Two cuts side by side']]);
  });

  it('keeps the same lesson once, and refuses an empty one', () => {
    const t = team.create({ starter: 'marketing' });
    asRun(t);
    core.teamPlaybook({ playbook: 'How you write posts', lesson: 'Never write honestly' });
    expect(core.teamPlaybook({ playbook: 'How you write posts', lesson: 'never write honestly' })).toMatchObject({ kept: false });
    expect(() => core.teamPlaybook({ playbook: 'How you write posts', lesson: ' ' })).toThrow(/lesson/);
  });

  it('a teammate can start reading a playbook another one wrote, and then its brief carries the lessons', () => {
    const a = team.create({ starter: 'marketing' });
    asRun(a);
    core.teamPlaybook({ playbook: 'How you write posts', lesson: 'Never write honestly' });
    const b = team.create({ starter: 'growth' });
    const run = asRun(b, 'Week in numbers');
    expect(team.briefFor({ id: run.id, labels: run.labels })).not.toMatch(/Never write honestly/);
    expect(team.briefFor({ id: run.id, labels: run.labels })).toMatch(/Playbooks on the team.*How you write posts/s);
    core.teamPlaybook({ playbook: 'How you write posts' });
    const brief = team.briefFor({ id: run.id, labels: run.labels });
    expect(brief).toMatch(/## Shared playbooks you read/);
    expect(brief).toMatch(/How you write posts[\s\S]*Never write honestly/);
  });

  it('the brief tells a teammate to keep how-the-work-is-done lessons in playbooks', () => {
    const t = team.create({ starter: 'marketing' });
    const run = asRun(t);
    expect(team.briefFor({ id: run.id, labels: run.labels })).toMatch(/team_playbook/);
  });

  it('is a tool only a teammate\'s own run can use', async () => {
    const plain = store.modules.workItemsDisk.createWorkItem(dir, { title: 'x', labels: ['founder'] }, { source: 'founder' });
    process.env.ZERO_ITEM = plain.id;
    process.env.ZERO_PRODUCT = product.id;
    expect(() => core.teamPlaybook({ playbook: 'X', lesson: 'y' })).toThrow(/not a teammate/);
  });
});

// Anthropic's guidance on agents ("when to fold subagents into your main
// loop") found that each retelling between agents loses detail. A pass now
// points at the work instead of describing it again.
describe('handing work on', () => {
  it('the brief says to point at threads, files and links rather than retell them', () => {
    const src = fs.readFileSync(new URL('../main/teammates.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/point at the threads, files and links it needs rather than retelling them/);
  });
});
