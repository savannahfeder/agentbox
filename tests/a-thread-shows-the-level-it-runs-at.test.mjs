// A THREAD SHOWS THE LEVEL IT RUNS AT (w-5ac9c9006d, 2026-10-15).
//
// Reported with a picture of In Progress: "Seems that tasks are working out of
// priority/order." Three threads marked Low had agents on them while one
// marked High and two marked Medium waited.
//
// The fleet was not out of order. The screen was. The fleet ranks every row by
// `itemPriority` (shared/rank.mjs), which counts a level an agent wrote for
// nothing and reads a row nobody tagged (0) as Medium. The list, the board,
// the summary, the reply box and the filters all drew the raw stored number
// instead, through `priorityIdOf`, which reads 0 as Low and an agent's 8 as
// High. Measured on the real store that day: the three "Low" threads that were
// running (web link previews, chat import search, hover previews) were all
// filed by an agent with priority 0, so the fleet had them at 5, level with
// the Medium thread that waited; the "High" one waiting (glass card proposals)
// was an agent's 8, which the fleet also had at 5. Same rows, two levels.
//
// AND A LEVEL COUNTS WHOEVER SET IT (2026-10-16). Her answer to the first
// version of this fix, which made the screen show Medium for the agent's 8:
// "If agent-determined priorities are ignored, then it seems like the whole
// prioritization system is ignored. If an agent sets something and I'm like,
// 'Oh that's the wrong priority,' I'll fix it." So the glass card thread is
// High on screen and High to the fleet. Only a row nobody tagged (0) is read,
// on both, as Medium.
//
// A conversation with a person is the one exception: the level on it is the
// message sorter's (main/message-priority.mjs), written as an agent on
// purpose, and a conversation never spawns, so it keeps the number it carries.
import { describe, it, expect } from 'vitest';
import { isUrgent, itemPriority, shownPriority } from '../shared/rank.mjs';
import { cardsFor } from '../shared/thread-cards.mjs';
import { keeps, rankScore, sorted, teamEntries } from '../renderer/src/threads/page-rules.ts';
import { filterBox, filterMenu } from '../renderer/src/box-filter.ts';
import { priorityCommands, priorityIdOf } from '../renderer/src/priority.ts';

const NOW = Date.UTC(2026, 9, 15, 17);
const MIN = 60_000;
const src = (source) => ({ ts: NOW - 60 * MIN, source, by: 'p1' });

// The rows from the picture, as the store holds them.
const urgent = { id: 'launch', product: 'team', priority: 9, wrote: { priority: src('system') }, updatedAt: NOW - 1 * MIN };
const herHigh = { id: 'env', product: 'team', priority: 7, wrote: { priority: src('system') }, updatedAt: NOW - 2 * MIN };
const herMedium = { id: 'toast', product: 'team', priority: 5, wrote: { priority: src('system') }, updatedAt: NOW - 5 * MIN };
const agentHigh = { id: 'glass', product: 'team', priority: 8, wrote: { priority: src('agent') }, updatedAt: NOW - 3 * MIN };
const untagged = { id: 'links', product: 'team', priority: 0, wrote: {}, updatedAt: NOW - 28 * MIN };
const herLow = { id: 'low', product: 'team', priority: 2, wrote: { priority: src('founder') }, updatedAt: NOW - 4 * MIN };
const hersOverAgent = { id: 'raised', product: 'team', priority: 7, wrote: { priority: src('founder') }, updatedAt: NOW - 6 * MIN };

const word = (item, conversation) => priorityIdOf(shownPriority(item, conversation));

describe('the level a work thread shows', () => {
  it('is the level the fleet runs it at, for every row in the picture', () => {
    for (const item of [urgent, herHigh, herMedium, agentHigh, untagged, herLow, hersOverAgent]) {
      expect(shownPriority(item)).toBe(itemPriority(item));
    }
  });

  it('reads a thread nobody tagged as Medium, not Low', () => {
    expect(word(untagged)).toBe('medium');
    expect(word({ ...untagged, priority: undefined })).toBe('medium');
  });

  it('shows an agent\'s High as High, and runs it as High', () => {
    expect(word(agentHigh)).toBe('high');
    expect(itemPriority(agentHigh)).toBeGreaterThan(itemPriority(herMedium));
  });

  it('runs an agent\'s Urgent as Urgent, interrupt included', () => {
    const agentUrgent = { ...agentHigh, priority: 9 };
    expect(word(agentUrgent)).toBe('urgent');
    expect(isUrgent(agentUrgent)).toBe(true);
    expect(isUrgent(agentHigh)).toBe(false);
  });

  it('runs an agent\'s Low as Low, below a thread nobody tagged', () => {
    const agentLow = { ...agentHigh, priority: 2 };
    expect(word(agentLow)).toBe('low');
    expect(itemPriority(agentLow)).toBeLessThan(itemPriority(untagged));
  });

  it('keeps every level she set, Low included', () => {
    expect(word(urgent)).toBe('urgent');
    expect(word(herHigh)).toBe('high');
    expect(word(herMedium)).toBe('medium');
    expect(word(herLow)).toBe('low');
    expect(word(hersOverAgent)).toBe('high');
  });

  it('leaves a conversation on the level the message sorter gave it', () => {
    const message = { id: 'm', product: 'dm', priority: 7, wrote: { priority: src('agent') }, updatedAt: NOW };
    expect(word(message, true)).toBe('high');
    expect(shownPriority({ ...message, priority: 0 }, true)).toBe(0);
  });
});

describe('every surface reads that one level', () => {
  const products = [{ slug: 'team', name: 'Agentbox Team' }];

  it('the board draws it', () => {
    const entries = teamEntries({ items: [untagged, agentHigh, herLow], products, cards: [], me: null, now: NOW, stateOf: () => 'running', allMine: true });
    const level = Object.fromEntries(entries.map((e) => [e.item.id, priorityIdOf(e.priority)]));
    expect(level).toEqual({ links: 'medium', glass: 'high', low: 'low' });
  });

  it('a teammate\'s card carries it', () => {
    const product = { slug: 'team', name: 'Agentbox Team', team: { shared: true } };
    const items = [untagged, agentHigh, herHigh].map((i) => ({ ...i, status: 'open', title: i.id, labels: [], visibility: 'team', createdAt: NOW - 90 * MIN }));
    const cards = cardsFor({ products: [product], readItems: () => items, now: NOW });
    const level = Object.fromEntries(cards.map((c) => [c.threadId, priorityIdOf(c.priority)]));
    expect(level).toEqual({ links: 'medium', glass: 'high', env: 'high' });
  });

  it('the Low filter keeps her Low and not a thread nobody tagged', () => {
    const lowOnly = { view: 'list', sort: 'priority', priorities: ['low'], projects: [], updated: 'any', privacy: 'any' };
    expect(keeps(herLow, lowOnly, NOW)).toBe(true);
    expect(keeps(untagged, lowOnly, NOW)).toBe(false);
    const highOnly = { ...lowOnly, priorities: ['high'] };
    expect(keeps(agentHigh, highOnly, NOW)).toBe(true);
    expect(keeps(herHigh, highOnly, NOW)).toBe(true);
  });

  it('Sort by Priority puts an agent\'s High with hers, and the untagged above her Low', () => {
    const d = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' };
    const ids = sorted([herLow, untagged, agentHigh, herHigh, urgent], d).map((r) => r.id);
    expect(ids).toEqual(['launch', 'env', 'glass', 'links', 'low']);
    expect(rankScore(agentHigh)).toBe(rankScore(herHigh));
    expect(rankScore(untagged)).toBe(rankScore(herMedium));
  });

  it('a conversation still sorts and filters by its own level', () => {
    const direct = new Set(['dm']);
    const message = { id: 'm', product: 'dm', priority: 7, wrote: { priority: src('agent') }, updatedAt: NOW };
    const highOnly = { view: 'list', sort: 'priority', priorities: ['high'], projects: [], updated: 'any', privacy: 'any' };
    expect(keeps(message, highOnly, NOW, null, direct)).toBe(true);
    expect(rankScore(message, [], direct)).toBe(rankScore(herHigh, [], direct));
  });

  it('the box filter and its counts', () => {
    const rows = [untagged, agentHigh, herLow, herHigh];
    const filtered = filterBox(rows, { project: null, priority: 'low', harness: null });
    expect(filtered.map((r) => r.id)).toEqual(['low']);
    const menu = filterMenu(rows, { project: null, priority: null, harness: null }, [{ slug: 'team', name: 'Agentbox Team' }]);
    const count = Object.fromEntries(menu.priorities.map((p) => [p.value, p.count]));
    expect(count).toEqual({ urgent: 0, high: 2, medium: 1, low: 1 });
  });

  it('⌘K marks the level the row really has as current', () => {
    const current = priorityCommands([untagged]).find((c) => c.current);
    expect(current?.id).toBe('priority-medium');
    expect(priorityCommands([agentHigh]).find((c) => c.current)?.id).toBe('priority-high');
  });
});
