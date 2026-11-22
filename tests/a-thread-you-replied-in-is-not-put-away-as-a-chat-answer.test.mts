// "I never marked this task done so not sure why it's in the done pile"
// (2026-11-19). A thread began with a message to the Head of Marketing in the
// team chat. The person then worked in that thread itself, 35 messages. Its
// last answer, a list of features, had no question mark and no Options, so
// planWakes read it as a quick chat reply: it posted it to the chat and closed
// the thread as done and clean. The person never closed it.
//
// Pinned on plain data: a chat-started run whose latest word from you was
// typed in the thread is not closed by the app, and the brief asks the
// teammate to leave it open; a chat answer still closes quietly.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { planWakes, teammateLabel, CHAT_LABEL, DEFAULT_LIMIT, YOU } from '../shared/teammates.mts';
import { appHome } from '../main/store/home.mts';
import { loadStore } from '../main/store-modules.mts';
import { Teammates } from '../main/teammates.mts';

const NOW = new Date(2026, 10, 19, 0, 41).getTime();
const head = { id: 't-ma0001', name: 'Head of Marketing', letter: 'H', status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'agentbox-team', memory: [], primary: false };
const chat = (messages: object[] = []) => ({ messages, seen: new Set<string>() });
const opening = { id: 'm-open', kind: 'msg', from: YOU, to: [head.id], text: 'I want a few teams to come to us for multiplayer from one post with a video.', ts: NOW - 86_400_000 };
const run = (answer: string | null, over: object = {}) => ({
  id: 'w-0a9a000e0c76', product: 'agentbox-team', title: 'Getting teams onto multiplayer', status: 'open',
  labels: ['founder', teammateLabel(head.id), CHAT_LABEL], createdAt: NOW - 86_400_000,
  result: 'These are the features to cover, grouped so you can drop them into your flow in any order.',
  ...(answer === null ? {} : { answer }),
  wrote: {
    result: { ts: NOW, source: 'agent' },
    ...(answer === null ? {} : { answer: { ts: NOW - 600_000, source: 'founder' } }),
  },
  ...over,
});
const closes = (item: object, messages: object[] = [opening]) =>
  planWakes({ teammates: [head], chat: chat(messages), items: [item], now: NOW }).some((a) => a.type === 'replied');

describe('a chat-started thread you went on to reply in', () => {
  it('stays open when your latest reply was typed in the thread', () => {
    expect(closes(run('List every feature we have for teams so I can write the flow.'))).toBe(false);
  });

  it('stays open when the same words were also said in the chat, but to someone else', () => {
    const elsewhere = { id: 'm-x', kind: 'msg', from: YOU, to: ['t-other'], text: 'yes', ts: NOW - 600_000 };
    expect(closes(run('yes'), [opening, elsewhere])).toBe(false);
  });

  it('still closes quietly when it answered only the message that started it', () => {
    expect(closes(run(null))).toBe(true);
  });

  it('still closes quietly when your latest reply reached it from the chat', () => {
    const fromChat = { id: 'm-ans', kind: 'msg', from: YOU, to: [head.id], text: 'Framing B, plain Loom tour.', ts: NOW - 600_000 };
    expect(closes(run(' Framing B, plain Loom tour.\n'), [opening, fromChat])).toBe(true);
  });

  it('counts a teammate\'s words on the thread as nobody typing in it', () => {
    const told = run('Here is the brief from Growth.', { wrote: { result: { ts: NOW, source: 'agent' }, answer: { ts: NOW - 600_000, source: 'system' } } });
    expect(closes(told)).toBe(true);
  });
});

describe('what the teammate is told on a thread your chat words started', () => {
  let team: Teammates; let mate: { id: string };
  beforeEach(async () => {
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(appHome(), 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    (await import('../mcp/core/account.mts')).resolveAccount();
    const product = (await import('../mcp/core/products.mts')).createProduct(`Lumen ${Math.random().toString(36).slice(2, 8)}`);
    const dir = path.join(appHome(), 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    const mods = await loadStore();
    team = new Teammates({
      config: { storeRoot: appHome(), accountId: process.env.STORE_ACCOUNT_ID }, modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now: number) => mods.workItemsDisk.readWorkItems(dir, now).map((i: object) => ({ ...i, product: product.id })),
    } as never);
    const made = team.create({ name: 'Head of Marketing', role: 'Head of Marketing' }) as { teammate?: { id: string }; id?: string };
    mate = (made.teammate ?? made) as { id: string };
  });
  afterEach(() => { delete process.env.STORE_ACCOUNT_ID; });

  it('leaves it open, where its own run may close itself', () => {
    const own = ['founder', `teammate:${mate.id}`, 'hop:0'];
    const told = team.briefFor({ id: 'w-c', labels: [...own, CHAT_LABEL] } as never);
    expect(told).toMatch(/began with the person's own words to you/);
    expect(told).not.toMatch(/This run is your own work/);
    expect(team.briefFor({ id: 'w-d', labels: own } as never)).toMatch(/This run is your own work/);
  });
});
