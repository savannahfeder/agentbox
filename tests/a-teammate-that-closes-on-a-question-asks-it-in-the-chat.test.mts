// A TEAMMATE THAT CLOSES ITS THREAD ON A QUESTION ASKS IT IN THE CHAT.
//
// 2026-11-08: YC Partner finished its Day 1 work, posted "Day 1 sheet now has
// a revenue table..." to the chat, then closed its thread with the answer
// "What was Agentbox's MRR today, on 8 Nov? That's the first row." The thread
// was done, so it was in nobody's Needs you, and the chat never showed the
// question. Measured from the thread's own record: status done by the agent,
// a result ending in a question, and no chat message carrying it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { planWakes, teammateLabel, replyMessageId, DEFAULT_LIMIT } from '../shared/teammates.mts';

const NOW = new Date(2026, 10, 8, 12, 40).getTime();
const yc = { id: 't-475a08a829', name: 'YC Partner', letter: 'Y', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'agentbox-team', memory: [] };
const chat = (messages = []) => ({ messages, seen: new Set() });
const RESULT = "The Day 1 sheet in day-1-v3.md now has a Friday MRR table. What was Agentbox's MRR today, on 8 Nov? That's the first row.";
const closed = (over = {}) => ({
  id: 'w-e4dc89d3d32a', product: 'agentbox-team', title: 'Set up YC Partner', status: 'done',
  labels: ['founder', teammateLabel(yc.id), 'hop:0', 'clean'], createdAt: NOW - 3_600_000,
  result: RESULT,
  wrote: { result: { ts: NOW - 4 * 60_000, source: 'agent' }, status: { ts: NOW - 4 * 60_000, source: 'agent' }, answer: { ts: NOW - 10 * 60_000, source: 'founder' } },
  ...over,
});
const posted = { id: 'm-post', kind: 'msg', from: yc.id, to: [], run: 'w-e4dc89d3d32a', ts: NOW - 5 * 60_000,
  text: 'Day 1 sheet now has a revenue table you fill each Friday, starting with today\'s MRR.' };
const says = (acts) => acts.filter((a) => a.type === 'say');

describe('a thread a teammate closed on a question', () => {
  it('says the question in the chat, even after it posted something else from that thread', () => {
    const acts = planWakes({ teammates: [yc], chat: chat([posted]), items: [closed()], now: NOW });
    expect(says(acts)).toEqual([{ type: 'say', teammate: yc.id, item: 'w-e4dc89d3d32a', text: RESULT }]);
  });

  it('says it once', () => {
    const said = { id: replyMessageId('w-e4dc89d3d32a'), kind: 'msg', from: yc.id, to: [], run: 'w-e4dc89d3d32a', text: RESULT, ts: NOW - 60_000 };
    expect(says(planWakes({ teammates: [yc], chat: chat([posted, said]), items: [closed()], now: NOW }))).toEqual([]);
  });

  it('does not say it again when the chat already asked it', () => {
    const asked = { ...posted, id: 'm-asked', text: "What was Agentbox's MRR today, on 8 Nov?" };
    expect(says(planWakes({ teammates: [yc], chat: chat([asked]), items: [closed()], now: NOW }))).toEqual([]);
  });

  it('says it when only an Options section asks and the chat has no options from that thread', () => {
    const result = 'Drafted the post.\n\n## Options\n1. Post it (recommended)\n2. Change it first';
    const acts = planWakes({ teammates: [yc], chat: chat([posted]), items: [closed({ result })], now: NOW });
    expect(says(acts)).toEqual([{ type: 'say', teammate: yc.id, item: 'w-e4dc89d3d32a', text: result }]);
  });
});

describe('what is left alone', () => {
  it('a thread whose answer asks nothing', () => {
    const result = 'The Day 1 sheet in day-1-v3.md now has a Friday MRR table.';
    expect(says(planWakes({ teammates: [yc], chat: chat([posted]), items: [closed({ result })], now: NOW }))).toEqual([]);
  });

  it('a thread you closed yourself', () => {
    const item = closed({ wrote: { ...closed().wrote, status: { ts: NOW - 60_000, source: 'founder' } } });
    expect(says(planWakes({ teammates: [yc], chat: chat([posted]), items: [item], now: NOW }))).toEqual([]);
  });

  it('a thread you answered after its question', () => {
    const item = closed({ wrote: { ...closed().wrote, answer: { ts: NOW - 60_000, source: 'founder' } } });
    expect(says(planWakes({ teammates: [yc], chat: chat([posted]), items: [item], now: NOW }))).toEqual([]);
  });

  it('a thread closed long before, so an update does not fill the chat with old questions', () => {
    const item = closed({ wrote: { ...closed().wrote, status: { ts: NOW - 2 * 3_600_000, source: 'agent' } } });
    expect(says(planWakes({ teammates: [yc], chat: chat([posted]), items: [item], now: NOW }))).toEqual([]);
  });

  it('a thread still open, which the reply rule already handles', () => {
    expect(says(planWakes({ teammates: [yc], chat: chat([posted]), items: [closed({ status: 'open' })], now: NOW }))).toEqual([]);
  });
});

describe('on a real store', () => {
  let team; let store; let dir;
  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mts');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    const product = createProduct(`Batch ${Math.random().toString(36).slice(2, 8)}`);
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
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('one tick puts the question in the chat, and the next adds nothing', async () => {
    const { teammate } = team.describe({ text: 'Run our own YC-style program', greeted: true });
    team.update(teammate.id, { name: 'YC Partner' });
    team.start(teammate.id);
    const disk = store.modules.workItemsDisk;
    const run = disk.createWorkItem(dir, { title: 'Set up YC Partner', labels: ['founder', teammateLabel(teammate.id), 'hop:0'] }, { source: 'system' });
    disk.updateWorkItem(dir, run.id, { result: RESULT, status: 'done', labels: ['founder', teammateLabel(teammate.id), 'hop:0', 'clean'] }, { source: 'agent' });
    await team.tick({ items: store.listItems(Date.now()), now: Date.now() });
    await team.tick({ items: store.listItems(Date.now()), now: Date.now() });
    const said = team.chat().messages.filter((m) => m.id === replyMessageId(run.id));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ from: teammate.id, text: RESULT, run: run.id });
  });
});
