// THE THREADS PAGE HAS FOUR TABS, NOT FIVE: THERE IS NO ALL.
//
// Asked for 2026-10-14 (w-313907fa49), over a screenshot of the strip reading
// NEEDS YOU 42, IN PROGRESS 3, LATER 13, DONE, ALL: "not sure if 'all' is
// actually useful of a filter. we can remove it". All was the other four tabs
// poured into one list (2026-10-01, finished threads added 2026-10-07), so
// nothing it showed was missing from the tab it really belongs to.
//
// Measured by reading the tab list the bar draws and Tab walks, the list the
// page builds per tab, and the type every tab name is checked against. The
// case that must NOT change: the four tabs that stay, in their order.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INBOX_TABS } from '../renderer/src/threads/Pages.tsx';
import { nextTab, filteredEmptyWords } from '../renderer/src/threads/page-rules.ts';
import { teammateRows } from '../renderer/src/threads/people-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const order = INBOX_TABS.map((t) => t.view);

describe('the tab bar', () => {
  it('draws Needs you, In progress, Later and Done, in that order', () => {
    expect(order).toEqual(['inbox', 'progress', 'snoozed', 'done']);
  });

  it('has no tab named All', () => {
    expect(INBOX_TABS.map((t) => t.label)).not.toContain('All');
  });
});

describe('Tab', () => {
  it('goes from Done back round to Needs you, with no stop between', () => {
    expect(nextTab(order, 'done')).toBe('inbox');
  });

  it('goes back from Needs you to Done', () => {
    expect(nextTab(order, 'inbox', true)).toBe('done');
  });

  it('lands on Needs you from a view the bar no longer draws', () => {
    expect(nextTab(order, 'all')).toBe('inbox');
  });
});

describe('the page', () => {
  const app = src('App.tsx');

  it('builds no All list', () => {
    expect(app).not.toContain('allRows');
    expect(app).not.toMatch(/view === 'all'/);
  });

  it('still asks for the next page of old finished threads at the foot of Done', () => {
    expect(app).toMatch(/onEnd=\{[^}]*view === 'done'/);
  });

  it('knows no view called all', () => {
    const types = src('types.ts');
    const line = types.slice(types.indexOf('export type View ='), types.indexOf(';', types.indexOf('export type View =')));
    expect(line).not.toContain("'all'");
  });
});

describe("a teammate's threads", () => {
  const card = (threadId, state) => ({ personId: 'them', threadId, state, visible: true, title: threadId, project: 'P', priority: 5, updatedAt: 0 });
  const args = { picked: ['me', 'them'], me: 'me', display: { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any', privacy: 'any' }, products: [], now: 0 };

  it('are offered for no tab called all', () => {
    expect(teammateRows([card('a', 'waiting'), card('b', 'done')], { ...args, tab: 'all' })).toEqual([]);
  });

  it('are still on Done when they are finished', () => {
    expect(teammateRows([card('a', 'waiting'), card('b', 'done')], { ...args, tab: 'done' }).map((r) => r.card?.threadId ?? r.threadId)).toEqual(['b']);
  });
});

describe('an empty tab under a filter', () => {
  it('has no sentence kept for All', () => {
    expect(filteredEmptyWords('all', 2).head).toBe(filteredEmptyWords('inbox', 2).head);
  });
});
