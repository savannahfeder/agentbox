// WHAT A TEAMMATE SENDS YOU IS RAISED ONE LEVEL, TO HIGH AT MOST.
//
// w-718af6d149, 2026-11-22: "Part of the premise of multiplayer is that items
// from your teammates get automatically prioritized in your inbox." A
// teammate's review ask sat in Needs you reading Medium over a column of agent
// threads at High. Nothing had set that level for you: an ask carries the
// level of the asker's own thread, and a message carries the sender's or the
// sorter's. So a teammate waiting on you ranked exactly like an agent waiting
// on you, and agents put High on most of what they write. On the demo team,
// Priya's task (due today) and Lena's message drew 5th and 6th of 9 in Needs
// you, under four agent threads at High.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { levelForYou, messagePriority, sorted, withLevelsForYou, DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules.ts';
import { itemPriority, oneLevelUp, shownPriority } from '../shared/rank.mts';
import type { Product, WorkItem } from '../renderer/src/types.ts';

const ME = 'p-me', TONY = 'p-tony';
const DIRECT = 'direct-1';
const products = [
  { slug: DIRECT, name: 'Direct', team: { projectId: 'd', people: [ME, TONY], sharedBy: TONY, direct: true } },
  { slug: 'app', name: 'App', team: { projectId: 'x', people: [ME, TONY], sharedBy: ME } },
  { slug: 'side', name: 'Side' },
] as unknown as Product[];
const product = (slug: string) => products.find((p) => p.slug === slug);

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id, product: 'app', productName: 'App', status: 'open', title: id, kind: 'directive', labels: [], priority: 5, updatedAt: 500, createdAt: 500, ...over,
}) as unknown as WorkItem;
// An ask as it arrives: the level of the asker's thread, written by the system on the asker's line.
const ask = (id: string, priority: number, over: Record<string, unknown> = {}) => row(id, {
  product: DIRECT, labels: ['given-task'], priority, assignee: ME, people: [TONY, ME], createdBy: TONY,
  ask: { kind: 'review', owner: TONY, thread: 'w-1', product: 'agentbox' },
  wrote: { priority: { ts: 1, source: 'system', by: TONY } }, updatedAt: 100, ...over,
});
const message = (id: string, priority: number, over: Record<string, unknown> = {}) => row(id, {
  product: DIRECT, priority, assignee: ME, people: [TONY, ME], createdBy: TONY, updatedAt: 100, ...over,
});
const agent = (id: string, priority: number, over: Record<string, unknown> = {}) => row(id, { priority, ...over });
const forYou = (i: WorkItem) => levelForYou(i, product(i.product), ME);

describe('the level a teammate\'s row has for you', () => {
  it('raises a review ask that came at Medium to High, as Tony\'s did', () => {
    expect(forYou(ask('tony', 5))).toBe(7);
  });

  it('raises a message nobody levelled to High, and a Low one to Medium', () => {
    expect(forYou(message('m', 0))).toBe(7);
    expect(forYou(message('thanks', 2))).toBe(5);
  });

  it('leaves High and Urgent where they are', () => {
    expect(forYou(ask('high', 7))).toBe(7);
    expect(forYou(ask('urgent', 9))).toBe(9);
    expect(oneLevelUp(8)).toBe(8);
  });

  it('keeps a level you picked yourself', () => {
    expect(forYou(ask('picked', 2, { wrote: { priority: { ts: 2, source: 'founder', by: ME } } }))).toBeNull();
  });

  it('still raises a level the sender picked by hand: you did not', () => {
    expect(forYou(ask('theirs', 5, { wrote: { priority: { ts: 2, source: 'founder', by: TONY } } }))).toBe(7);
  });

  it('keeps your level on a task you gave a teammate', () => {
    expect(forYou(ask('given', 5, { assignee: TONY, createdBy: ME, people: [ME, TONY] }))).toBeNull();
  });

  it('keeps the level of every thread outside a conversation, an AI teammate\'s or a shared project\'s', () => {
    expect(forYou(agent('mine', 5))).toBeNull();
    expect(forYou(agent('coach', 5, { labels: ['teammate:m-coach'] }))).toBeNull();
    expect(forYou(agent('theirs-in-app', 5, { createdBy: TONY }))).toBeNull();
    expect(levelForYou(agent('solo', 5, { product: 'side' }), product('side'), ME)).toBeNull();
  });

  it('raises nothing when nobody is signed in to a team', () => {
    expect(levelForYou(ask('tony', 5), product(DIRECT), null)).toBeNull();
    const rows = [ask('tony', 5)];
    expect(withLevelsForYou(rows, products, null)).toBe(rows);
  });

  it('raises once, however many times the rows pass through', () => {
    const once = withLevelsForYou([message('thanks', 2)], products, ME);
    expect(withLevelsForYou(once, products, ME)[0].levelForYou).toBe(5);
  });

  it('is the level every screen shows: the row, a chat row\'s cell and the sort all read it', () => {
    const [tony, chat] = withLevelsForYou([ask('tony', 5), message('m', 0)], products, ME);
    expect(shownPriority(tony)).toBe(7);
    expect(shownPriority(tony, true)).toBe(7);
    expect(itemPriority(tony)).toBe(7);
    expect(messagePriority(chat)).toBe(7);
  });

  it('leaves a chat row nobody levelled and nobody sent you without a level, as before', () => {
    expect(messagePriority(message('m', 0))).toBeNull();
  });
});

describe('Needs you under Sort by Priority', () => {
  const ids = (rows: WorkItem[], order: string[] = []) => sorted(withLevelsForYou(rows, products, ME), DEFAULT_DISPLAY.inbox, 'inbox', order, new Set([DIRECT])).map((r) => r.id);
  // The demo team's morning: four agent threads at High, two at Medium, one Low, and two from teammates at Medium.
  const morning = [
    agent('google', 7, { updatedAt: 900 }), agent('pricing', 7, { updatedAt: 800 }), agent('onedrive', 7, { updatedAt: 700 }), agent('changelog', 7, { updatedAt: 600 }),
    ask('priya', 5, { updatedAt: 300 }), message('lena', 5, { updatedAt: 200 }),
    agent('copy', 5, { updatedAt: 950 }), agent('icons', 5, { updatedAt: 940 }), agent('typo', 2, { updatedAt: 990 }),
  ];

  it('puts what teammates sent you above your agents\' threads at High', () => {
    expect(ids(morning).slice(0, 2)).toEqual(['priya', 'lena']);
  });

  it('was under them before, which is the report', () => {
    const before = sorted(morning, DEFAULT_DISPLAY.inbox, 'inbox', [], new Set([DIRECT])).map((r) => r.id);
    expect(before.indexOf('priya')).toBe(4);
    expect(before.indexOf('lena')).toBe(5);
  });

  it('puts Tony\'s ask first when your top project is full of High threads', () => {
    expect(ids([agent('keep-light', 7, { updatedAt: 900 }), agent('slow-start', 7, { updatedAt: 800 }), ask('tony', 5)], ['app', 'side'])[0]).toBe('tony');
  });

  it('keeps an agent\'s Urgent thread above them', () => {
    expect(ids([ask('tony', 5), agent('outage', 9)])).toEqual(['outage', 'tony']);
  });

  it('keeps a teammate\'s Low message under your agents\' High threads', () => {
    expect(ids([message('thanks', 2), agent('google', 7)])).toEqual(['google', 'thanks']);
  });
});

describe('the app', () => {
  it('reads every row through it, so the list, the board, Home and the thread page agree', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/withLevelsForYou\(/);
  });
});
