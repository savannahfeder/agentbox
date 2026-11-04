// LATER SAID 15 OVER A LIST OF 16 ROWS.
//
// A tester put a thread off with "every monday 9am", which makes a repeating
// task, and opened Later: the tab read LATER 15 and the list drew 16 rows, the
// 15 put-off threads and the repeating task's own row at the top. The list is
// right: a repeating task is a row like every other on Later
// (a-repeating-task-is-a-row-like-every-other), and the sidebar's count
// (`scheduledCount`) already added the rules in. The tab bar counted the
// threads alone, and so did the folding header over Later on Your threads.
//
// Measured on the real pieces: the rows List draws for 15 threads and one rule
// (16), against the expression App.tsx hands StateTabs as Later's number,
// evaluated on the same 15 and 1 (15 before the fix). With no thread in Later
// but a rule, the tab bar dropped Later altogether, over a page with a row on it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { List } from '../renderer/src/components/List.tsx';
import { StateTabs } from '../renderer/src/threads/Pages.tsx';
import { stackRows } from '../renderer/src/threads/stack-rules.ts';
import { laterTabShown } from '../renderer/src/later-tab.ts';
globalThis.React = React;

const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

const at = (d, h) => new Date(2026, 10, d, h, 0, 0, 0).getTime();
const thread = (n) => ({
  id: `w-${String(n).padStart(10, '0')}`, product: 'personal', productName: 'Personal', status: 'open', title: `Thread ${n}`,
  kind: 'directive', labels: ['founder'], priority: 5, epoch: 0, claim: null,
  createdAt: at(1, 9), updatedAt: at(2, 9), snoozedUntil: at(10, 9),
});
const threads = (n) => Array.from({ length: n }, (_, i) => thread(i + 1));
const rule = { id: 'r-abc1234567', product: 'personal', productName: 'Personal', title: 'Weekly check', priority: 5,
  every: 'week', on: 1, at: '09:00', createdAt: at(3, 9), served: '', misses: 0, alerted: 0 };

const rowsDrawn = (items, repeats) => {
  const html = renderToStaticMarkup(React.createElement(List, {
    items, view: 'snoozed', selected: -1, seen: new Set(), running: [], multiSel: new Set(),
    repeats, allItems: items, onSelect() {}, onOpen() {}, onToggle() {}, onRange() {}, table: true, products: [],
  }));
  return (html.match(/data-item-id=/g) ?? []).length + (html.match(/data-repeat-id=/g) ?? []).length;
};

// The number App.tsx hands the tab bar for one tab, worked out from its own
// expression with this file's rows in place of the window's.
const countsBlock = app.slice(app.indexOf('<StateTabs'), app.indexOf('needs={team ?', app.indexOf('<StateTabs')));
const tabCount = (tab, { later = [], rules = [], inbox = [] } = {}) => {
  const expr = countsBlock.match(new RegExp(`\\n\\s*${tab}: ([^\\n]+),\\n`))?.[1];
  if (!expr) throw new Error(`no count for ${tab} in App.tsx`);
  const scope = {
    mineShown: true, shownCount: (rows) => rows.length, theirCount: () => 0,
    inbox, progressTab: [], snoozed: later, done: [], repeats: rules,
    leadCount: 0, sharedFileNews: [], followingNews: [],
  };
  return new Function(...Object.keys(scope), `return ${expr};`)(...Object.values(scope));
};

describe("Later's number on the tab bar is the rows its page draws", () => {
  it('15 threads and a repeating task: 16 rows, and the tab says 16', () => {
    expect(rowsDrawn(threads(15), [rule])).toBe(16);
    expect(tabCount('snoozed', { later: threads(15), rules: [rule] })).toBe(16);
  });

  it('with no repeating task the number is the threads, as before', () => {
    expect(rowsDrawn(threads(15), [])).toBe(15);
    expect(tabCount('snoozed', { later: threads(15) })).toBe(15);
  });

  it('a repeating task alone keeps Later on the tab bar, with its 1', () => {
    expect(rowsDrawn([], [rule])).toBe(1);
    const count = tabCount('snoozed', { rules: [rule] });
    expect(count).toBe(1);
    expect(laterTabShown({ count, view: 'inbox', walking: false })).toBe(true);
    const html = renderToStaticMarkup(React.createElement(StateTabs, { view: 'inbox', counts: { inbox: 2, snoozed: count }, onView() {} }));
    expect(html).toMatch(/Later<b>1<\/b>/);
  });

  it('and Tab stops on Later whenever the tab bar draws it', () => {
    expect(app).toContain("laterTabShown({ count: scheduledCount, view, walking: !!run })");
    expect(app).toContain('const scheduledCount = snoozed.length + repeats.length;');
  });

  it('a repeating task never adds to Needs you, In progress or Done', () => {
    const inbox = threads(3);
    expect(tabCount('inbox', { inbox, rules: [rule] })).toBe(3);
    expect(tabCount('progress', { rules: [rule] })).toBe(0);
    expect(tabCount('done', { rules: [rule] })).toBe(0);
  });
});

describe("Later's header on Your threads counts its repeating tasks too", () => {
  const DAY = at(3, 0);
  it('two threads and a rule under it: 3', () => {
    const stack = stackRows({ progress: [], later: threads(2), done: [], dayStart: DAY, folded: new Set(), laterRules: 1 });
    expect(stack.sections.find((s) => s.key === 'later')?.count).toBe(3);
  });

  it('a rule alone: 1, and still no thread among the rows the keys walk', () => {
    const stack = stackRows({ progress: [], later: [], done: [], dayStart: DAY, folded: new Set(), laterRules: 1 });
    expect(stack.sections.find((s) => s.key === 'later')?.count).toBe(1);
    expect(stack.rows).toEqual([]);
  });

  it('no rule: the threads alone, and no other header moves', () => {
    const stack = stackRows({ progress: threads(1), later: threads(2).map((t) => ({ ...t, id: `${t.id}x` })), done: [], dayStart: DAY, folded: new Set() });
    expect(stack.sections.map((s) => [s.key, s.count])).toEqual([['progress', 1], ['later', 2]]);
  });
});
