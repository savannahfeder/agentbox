// WHAT SHIPPED THIS WEEK IS A SHORT LIST ANYONE ON THE TEAM CAN READ.
//
// 2026-10-30: Maya wrote her investor update by listing everything
// by hand because "there's no shipped this week view". Jordan: "Finding out if
// the fix shipped without asking Dev. His thread dropped off his own card and
// Done doesn't say whether it's live." A card left the cloud at midnight, so a
// thread finished on Tuesday could not be on any list by Wednesday.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cardsFor, shippedAtOf } from '../shared/thread-cards.mjs';
import { shippedNote } from '../shared/shipped-note.mjs';
import { buildLine, foldWorkItems } from '../shared/work-items.mjs';
import { shippedThisWeek, shippedWords } from '../renderer/src/team/shipped.ts';
import { statusCell } from '../renderer/src/status-word.ts';
import { threadMenuRows } from '../renderer/src/threads/ThreadMenu.tsx';
import { threadCommands } from '../renderer/src/thread-commands.ts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';

const DAY = 86_400_000;
const now = new Date(2026, 9, 30, 15).getTime();
const product = { slug: 'lumen', name: 'Lumen app' };

describe('what makes a thread shipped', () => {
  it('a person marking it', () => {
    expect(shippedAtOf({ shippedAt: now })).toBe(now);
  });
  it('the app’s own note when its merge lands', () => {
    expect(shippedAtOf({ note: shippedNote('abc1234'), wrote: { note: { source: 'system', ts: now - 5 } } })).toBe(now - 5);
  });
  it('never an agent saying so', () => {
    expect(shippedAtOf({ note: shippedNote('abc1234'), wrote: { note: { source: 'agent', ts: now } } })).toBeNull();
    expect(shippedAtOf({ result: 'Shipped it!', note: 'It is live' })).toBeNull();
  });
  it('a person taking it back outranks the merge', () => {
    expect(shippedAtOf({ shippedAt: 0, note: shippedNote(), wrote: { note: { source: 'system', ts: now } } })).toBeNull();
  });
});

describe('the ledger keeps the mark', () => {
  const id = 'w-0000000001';
  const folded = (value) => {
    const first = buildLine({ id, patch: { title: 'Fix', status: 'open' }, source: 'founder', now: now - 10 });
    const second = buildLine({ id, patch: { shippedAt: value }, source: 'founder', now: now - 5 });
    const out = foldWorkItems([first, second], now);
    return (out.get ? out.get(id) : out.find((i) => i.id === id)).shippedAt;
  };
  it('keeps a moment and a take-back, and refuses anything else', () => {
    expect(folded(now)).toBe(now);
    expect(folded(0)).toBe(0);
    expect(() => folded('yes')).toThrow();
    expect(() => folded(-3)).toThrow();
  });
  it('a person’s edit may set it, and it is never a word to the agent', () => {
    const store = readFileSync(new URL('../main/store.mts', import.meta.url), 'utf8');
    expect(store).toMatch(/const fields = \[[^\]]*'shippedAt'/);
    const sup = readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    expect(sup).toMatch(/NOT_A_WORD = new Set\(\[[^\]]*'shippedAt'/);
  });
});

describe('the card a teammate reads', () => {
  const cards = (items, at = now) => cardsFor({ products: [product], readItems: () => items, now: at });
  const row = (o) => ({ id: 't', title: 'Fix', status: 'done', updatedAt: now - DAY, createdAt: now - 2 * DAY, ...o });
  it('carries when it shipped', () => {
    expect(cards([row({ shippedAt: now - DAY })])[0].shippedAt).toBe(now - DAY);
  });
  it('a thread finished three days ago is still published, so a week can be listed', () => {
    expect(cards([row({ updatedAt: now - 3 * DAY })]).map((c) => c.threadId)).toEqual(['t']);
  });
  it('one finished eight days ago is not', () => {
    expect(cards([row({ updatedAt: now - 8 * DAY })])).toEqual([]);
  });
  it('a private thread publishes nothing, shipped or not', () => {
    expect(cards([row({ shippedAt: now, visibility: 'private' })])).toEqual([]);
  });
  it('a thread nobody shipped carries no date', () => {
    expect(cards([row({})])[0].shippedAt).toBeUndefined();
  });
  it('survives the memory cloud', async () => {
    const cloud = createMemoryCloud();
    const maya = memoryBackend(cloud, signUpMemory(cloud, { email: 'maya@a.test', name: 'Maya' }));
    const team = await maya.createTeam('Lumen');
    await maya.putCards(team.id, [{ threadId: 't', visible: true, title: 'Fix', state: 'done', updatedAt: now, shippedAt: now - 1 }]);
    expect((await maya.listCards())[0].shippedAt).toBe(now - 1);
  });
  it('the hosted cloud has a column for it, and an older cloud still takes the cards', () => {
    const backend = readFileSync(new URL('../main/team/supabase-backend.mjs', import.meta.url), 'utf8');
    expect(backend).toContain('shipped_at');
    expect(backend).toMatch(/PGRST204|42703/);
    expect(readFileSync(new URL('../cloud/supabase/migrations/20261031000050_threads_say_when_they_shipped.sql', import.meta.url), 'utf8'))
      .toMatch(/add column if not exists shipped_at timestamptz/);
  });
});

describe('the list', () => {
  const me = 'dev';
  const card = (id, o = {}) => ({ personId: 'maya', threadId: id, visible: true, title: id, project: 'Lumen app', state: 'done', updatedAt: now, shippedAt: now - 1000, ...o });
  const item = (id, o = {}) => ({ id, product: 'lumen', title: id, status: 'done', createdBy: me, createdAt: now - DAY, updatedAt: now, ...o });
  const list = (o) => shippedThisWeek({ items: [], cards: [], products: [product], me, since: null, now, ...o });
  it('holds mine and my teammates’, newest first', () => {
    const out = list({ items: [item('mine', { shippedAt: now - 5 })], cards: [card('hers', { shippedAt: now - 500 })] });
    expect(out.map((r) => r.title)).toEqual(['mine', 'hers']);
    expect(out.map((r) => r.ownerId)).toEqual([me, 'maya']);
  });
  it('holds a thread that shipped exactly a week ago and not one a minute older', () => {
    const out = list({ cards: [card('in', { shippedAt: now - 7 * DAY }), card('out', { shippedAt: now - 7 * DAY - 60_000 })] });
    expect(out.map((r) => r.title)).toEqual(['in']);
  });
  it('leaves out a thread that was only finished', () => {
    expect(list({ cards: [card('done', { shippedAt: undefined })], items: [item('also')] })).toEqual([]);
  });
  it('leaves out my own private thread, which the team cannot read', () => {
    expect(list({ items: [item('secret', { shippedAt: now, visibility: 'private' })] })).toEqual([]);
  });
  it('draws my own card only once', () => {
    const out = list({ items: [item('same', { shippedAt: now - 5 })], cards: [card('same', { personId: me })] });
    expect(out).toHaveLength(1);
    expect(out[0].item?.id).toBe('same');
  });
  it('says it plainly', () => {
    expect(shippedWords(now - 1000, now)).toBe('Today');
    expect(shippedWords(now - DAY, now)).toBe('Yesterday');
    expect(shippedWords(now - 3 * DAY, now)).toBe('Tue');
  });
});

describe('where a person says so', () => {
  it('the thread’s menu offers it and takes it back', () => {
    expect(threadMenuRows({ change: false, terminal: null, finish: true, shipped: 'unmarked' }).map((r) => r.label)).toContain('Mark as shipped');
    expect(threadMenuRows({ change: false, terminal: null, finish: true, shipped: 'marked' }).map((r) => r.label)).toContain('Not shipped after all');
    expect(threadMenuRows({ change: false, terminal: null, finish: true }).map((r) => r.id)).not.toContain('shipped');
  });
  it('Ctrl+K finds it under the word live too', () => {
    const row = threadCommands({ shipped: false }).find((r) => r.does.act === 'shipped');
    expect(row.label).toBe('Mark as shipped');
    expect(row.keywords).toContain('live');
  });
  it('the row says Shipped, marked or merged, and an open thread keeps saying so', () => {
    expect(statusCell({ id: 'a', status: 'done', shippedAt: now }, { now }).word).toBe('Shipped');
    expect(statusCell({ id: 'a', status: 'open', shippedAt: now, labels: ['founder'], result: 'x' }, { now }).word).toBe('Shipped');
    expect(statusCell({ id: 'a', status: 'done' }, { now }).word).not.toBe('Shipped');
  });
});
