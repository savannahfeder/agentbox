// A LIST HEADING NEVER REPEATS ITS TAB.
//
// Seen on the photo stage at 1440x900 (2026-11-01): the In progress tab drew a
// folding header "IN PROGRESS 1" straight under the tab "IN PROGRESS 1", with
// no column names, because In progress was the only section of your threads
// with anything in it. The Tasks tab did the same with "ALL OPEN" over its one
// group. A heading only earns its line when there is a second group to tell
// it from.
import { describe, it, expect } from 'vitest';
import React, { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stackRows } from '../renderer/src/threads/stack-rules.ts';
import { List } from '../renderer/src/components/List.tsx';
import { TasksPage } from '../renderer/src/team/TasksPage.tsx';
globalThis.React = React;

const DAY = Date.parse('2026-11-01T00:00:00');
const row = (id, extra = {}) => ({ id, product: 'p', productName: 'P', status: 'open', kind: 'directive', title: `Thread ${id}`, labels: ['founder'], priority: 5, epoch: 1, claim: null, createdAt: DAY - 9, updatedAt: DAY - 9, ...extra });

describe('your threads, stacked', () => {
  it('In progress alone has no header of its own', () => {
    const stack = stackRows({ progress: [row('a')], later: [], done: [], dayStart: DAY, folded: new Set() });
    expect(stack.sections).toMatchObject([{ key: 'progress', bare: true }]);
    expect(stack.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('and its rows show even if it was folded once, since nothing is left to unfold it', () => {
    const stack = stackRows({ progress: [row('a')], later: [], done: [], dayStart: DAY, folded: new Set(['progress']) });
    expect(stack.sections[0]).toMatchObject({ bare: true, folded: false });
    expect(stack.rows.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps every header once there is a second section', () => {
    const stack = stackRows({ progress: [row('a')], later: [row('b', { start: 'later' })], done: [], dayStart: DAY, folded: new Set() });
    expect(stack.sections.map((s) => [s.key, !!s.bare])).toEqual([['progress', false], ['later', false]]);
  });

  it('keeps Later\'s header when Later is the only one, since the tab is not called Later', () => {
    const stack = stackRows({ progress: [], later: [row('b', { start: 'later' })], done: [], dayStart: DAY, folded: new Set() });
    expect(stack.sections.map((s) => [s.key, !!s.bare])).toEqual([['later', false]]);
  });
});

describe('the table', () => {
  const draw = (stack) => renderToStaticMarkup(h(List, {
    items: stack.rows, view: 'progress', table: true, selected: -1, seen: new Set(), running: [], multiSel: new Set(),
    onSelect() {}, onOpen() {}, onToggle() {}, onRange() {}, products: [{ slug: 'p', name: 'P' }],
    stack: { sections: stack.sections, sectionOf: stack.sectionOf, onFold() {} },
  }));

  it('draws the column names in place of a header that repeats the tab', () => {
    const html = draw(stackRows({ progress: [row('a')], later: [], done: [], dayStart: DAY, folded: new Set() }));
    expect(html).not.toContain('th-section');
    expect(html).toContain('>Thread<');
    expect(html).toContain('>Status<');
  });

  it('draws the section headers, and no second set of column names, with two sections', () => {
    const html = draw(stackRows({ progress: [row('a')], later: [row('b', { start: 'later' })], done: [], dayStart: DAY, folded: new Set() }));
    expect((html.match(/th-section/g) ?? []).length).toBe(2);
    expect(html).not.toContain('>Thread<');
  });
});

describe('the Tasks tab', () => {
  const task = (key, extra = {}) => ({ key, item: null, title: key, holder: null, giver: null, due: null, block: null, agent: null, done: false, unread: false, ...extra });
  const draw = (groups) => renderToStaticMarkup(h(TasksPage, {
    groups: { late: [], blocked: [], open: [], done: [], ...groups }, faces: new Map(), nameOf: () => 'Someone', me: null,
    picked: null, onPicked() {}, keys: false, onOpen() {}, onOpenBlock() {}, onDone() {},
  }));

  it('draws no "All open" over its one group', () => {
    const html = draw({ open: [task('Write the words')] });
    expect(html).not.toMatch(/All open/i);
    expect(html).not.toContain('tk-label');
    expect(html).toContain('Write the words');
  });

  it('still names Open when Late or Blocked sits above it', () => {
    const html = draw({ late: [task('Late one')], open: [task('Write the words')] });
    expect(html).toContain('>Late<');
    expect(html).toContain('>Open<');
  });

  it('keeps Done this week, which folds', () => {
    const html = draw({ open: [task('Write the words')], done: [task('Done one', { done: true })] });
    expect(html).toContain('Done this week');
  });
});
