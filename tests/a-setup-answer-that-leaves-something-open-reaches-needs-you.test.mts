// A SETUP ANSWER THAT LEAVES SOMETHING OPEN REACHES NEEDS YOU.
//
// 2026-11-08: a new Loom lead finished its setup with "...You mentioned an ICP
// you settled on earlier, and I can't find it... I'll use X until you tell me
// otherwise." and closed its own setup thread, as its brief told it to. A
// closed thread is in nobody's Needs you, and the answer has no question mark,
// so the chat rule that re-says a closed thread's question passed it by. Its
// owner never saw it. Measured from the setup thread's record: done by the
// agent, that result, no answer since.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';
import { planWakes, teammateLabel, runIdFor, waitingOnYou, leavesSomethingOpen, DEFAULT_LIMIT } from '../shared/teammates.mts';

const SAID = "I'm set up and ready... Nothing has started yet: my first run is at 9:00 on a weekday. You mentioned an ICP you settled on earlier, and I can't find it... I'll use X until you tell me otherwise.";
const NOW = new Date(2026, 10, 8, 19, 30).getTime();
const loom = { id: 't-loom', name: 'Loom lead', letter: 'L', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'agentbox-team', memory: [] };
const asked = { id: 'm-setup', kind: 'msg', from: 'you', to: [loom.id], setup: true, text: 'Take over the thread for AI-personalized Looms', ts: NOW - 3_600_000 };
const SETUP_RUN = runIdFor(`${asked.id}>${loom.id}`);
const chat = (messages = [asked]) => ({ messages, seen: new Set() });
const closed = (over = {}) => ({
  id: SETUP_RUN, product: 'agentbox-team', title: 'Set up Loom lead', status: 'done',
  labels: ['founder', teammateLabel(loom.id), 'hop:0', 'clean'], createdAt: NOW - 3_600_000,
  result: SAID,
  wrote: { status: { ts: NOW - 5 * 60_000, source: 'agent' }, result: { ts: NOW - 4 * 60_000, source: 'agent' }, answer: { ts: NOW - 20 * 60_000, source: 'founder' } },
  ...over,
});
const reopens = (acts) => acts.filter((a) => a.type === 'reopen');

describe('what counts as leaving something open', () => {
  it('the Loom lead\'s answer, which asks no question', () => {
    expect(leavesSomethingOpen(SAID)).toBe(true);
  });
  it('a question, or options', () => {
    expect(leavesSomethingOpen('Set up. Which ICP should I use?')).toBe(true);
    expect(leavesSomethingOpen('Set up.\n\n## Options\n1. Start now (recommended)\n2. Wait')).toBe(true);
  });
  it('an assumption said outright, curly apostrophes and all', () => {
    expect(leavesSomethingOpen('I’ll assume the US market for now.')).toBe(true);
    expect(leavesSomethingOpen('I couldn’t find the pricing sheet, so I used last month’s.')).toBe(true);
    expect(leavesSomethingOpen('Using Lisbon as home unless you say otherwise.')).toBe(true);
  });
  it('not a plain finished setup', () => {
    expect(leavesSomethingOpen("I'm set up. First up: the competitor price check, now and then Mondays at 9:00.")).toBe(false);
    expect(leavesSomethingOpen("Setup is complete. I'll wait for your next task.")).toBe(false);
    expect(leavesSomethingOpen('')).toBe(false);
  });
});

describe('a setup thread its teammate closed', () => {
  it('opens again when its answer leaves something open', () => {
    expect(reopens(planWakes({ teammates: [loom], chat: chat(), items: [closed()], now: NOW })))
      .toEqual([{ type: 'reopen', teammate: loom.id, item: SETUP_RUN, product: 'agentbox-team', labels: ['founder', teammateLabel(loom.id), 'hop:0'] }]);
  });

  it('opens again on a question too, rather than only saying it in the chat', () => {
    const acts = planWakes({ teammates: [loom], chat: chat(), items: [closed({ result: 'Set up. Which ICP should I use?' })], now: NOW });
    expect(reopens(acts)).toHaveLength(1);
    expect(acts.filter((a) => a.type === 'say')).toEqual([]);
  });

  it('stays closed when it finished with nothing open, as on 2026-10-31', () => {
    const item = closed({ result: "I'm set up. First up: the competitor price check, now and then Mondays at 9:00." });
    expect(reopens(planWakes({ teammates: [loom], chat: chat(), items: [item], now: NOW }))).toEqual([]);
  });

  it('stays closed when you closed it', () => {
    const item = closed({ wrote: { ...closed().wrote, status: { ts: NOW - 60_000, source: 'founder' } } });
    expect(reopens(planWakes({ teammates: [loom], chat: chat(), items: [item], now: NOW }))).toEqual([]);
  });

  it('stays closed when you answered after it', () => {
    const item = closed({ wrote: { ...closed().wrote, answer: { ts: NOW - 60_000, source: 'founder' } } });
    expect(reopens(planWakes({ teammates: [loom], chat: chat(), items: [item], now: NOW }))).toEqual([]);
  });

  it('left open by its teammate, is not closed quietly as a chat answer, and your next words answer it', () => {
    const open = closed({ status: 'open', labels: ['founder', teammateLabel(loom.id), 'hop:0', 'from-chat'], wrote: { ...closed().wrote, status: { ts: NOW - 60 * 60_000, source: 'system' } } });
    expect(planWakes({ teammates: [loom], chat: chat(), items: [open], now: NOW }).filter((a) => a.type === 'replied')).toEqual([]);
    const reply = { id: 'm-icp', kind: 'msg', from: 'you', to: [loom.id], text: 'The ICP is seed-stage dev tools founders', ts: NOW };
    expect(planWakes({ teammates: [loom], chat: chat([asked, reply]), items: [open], now: NOW }))
      .toContainEqual(expect.objectContaining({ type: 'answer', item: SETUP_RUN }));
  });

  it('left open with nothing open, still closes quietly as before', () => {
    const open = closed({ status: 'open', result: "I'm set up. Starting on the Looms now.", labels: ['founder', teammateLabel(loom.id), 'hop:0', 'from-chat'], wrote: { ...closed().wrote, status: { ts: NOW - 60 * 60_000, source: 'system' } } });
    expect(planWakes({ teammates: [loom], chat: chat(), items: [open], now: NOW }).filter((a) => a.type === 'replied')).toHaveLength(1);
  });

  it('leaves a thread that is not its setup to the chat rule', () => {
    const item = closed({ id: 'w-other', title: 'Draft this week\'s Looms' });
    expect(reopens(planWakes({ teammates: [loom], chat: chat(), items: [item], now: NOW }))).toEqual([]);
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
    const product = createProduct(`Looms ${Math.random().toString(36).slice(2, 8)}`);
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

  it('the closed setup thread is waiting on you after a tick, and stays so', async () => {
    const { teammate } = team.describe({ text: 'Take over the thread for AI-personalized Looms', greeted: true });
    await team.tick({ items: store.listItems(Date.now()), now: Date.now() });
    const run = store.listItems(Date.now()).find((i) => i.title === 'Set up a new teammate');
    expect(run).toBeTruthy();
    const disk = store.modules.workItemsDisk;
    team.update(teammate.id, { name: 'Loom lead' });
    team.start(teammate.id);
    disk.updateWorkItem(dir, run.id, { status: 'done', labels: [...run.labels, 'clean'] }, { source: 'agent' });
    disk.updateWorkItem(dir, run.id, { result: SAID }, { source: 'agent' });
    await team.tick({ items: store.listItems(Date.now()), now: Date.now() });
    await team.tick({ items: store.listItems(Date.now()), now: Date.now() });
    const after = disk.readWorkItem(dir, run.id);
    expect(after.status).toBe('open');
    expect(after.labels).not.toContain('clean');
    expect(waitingOnYou(after)).toBe(true);
  });
});
