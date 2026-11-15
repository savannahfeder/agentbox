// ONE STATE RULE FOR TABS AND BOARDS (2026-10-01). The board said Running for
// queued work the tab did not, and Team and Inbox must never disagree like
// that. Your own threads now sit in
// the column whose tab lists them; queued and running share "In progress"; the
// ones an agent is on right now carry a turning mark.
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { teamEntries, BOARD_COLUMNS } from '../renderer/src/threads/page-rules.ts';
import { STATE_WORD } from '../renderer/src/threads/summary-rules.ts';

const NOW = 1_800_000_000_000;
const products = [{ slug: 'nw', name: 'Northwind', team: null }];
const row = (id, extra = {}) => ({ id, product: 'nw', title: id, status: 'open', createdAt: NOW - 1000, updatedAt: NOW - 1000, ...extra });

it('puts your own threads in the column their tab lists them in', () => {
  const tabs = new Map([['queued', 'running'], ['asks', 'waiting'], ['later', 'scheduled']]);
  const entries = teamEntries({ items: [row('queued'), row('asks'), row('later')], products, cards: [], me: 'me', now: NOW, stateOf: (i) => tabs.get(i.id) ?? null });
  expect(Object.fromEntries(entries.map((e) => [e.item.id, e.state]))).toEqual({ queued: 'running', asks: 'waiting', later: 'scheduled' });
});

it('marks only the thread an agent is on now as live', () => {
  const entries = teamEntries({ items: [row('on'), row('waiting-turn')], products, cards: [], me: 'me', now: NOW, stateOf: () => 'running', live: new Set(['on']) });
  expect(Object.fromEntries(entries.map((e) => [e.item.id, e.live]))).toEqual({ on: true, 'waiting-turn': false });
});

it('says In progress for queued and running alike, on the tab, the column and the state word', () => {
  expect(STATE_WORD.running).toBe('In progress');
  expect(BOARD_COLUMNS.find((c) => c.state === 'running').label).toBe('In progress');
  expect(fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8')).toContain("{ view: 'progress', label: 'In progress' }");
});
