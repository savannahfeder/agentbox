// IN PROGRESS RUNS NEWEST SENT FIRST, WHATEVER THE SORT SAYS.
//
// Reported 2026-10-21 (w-21b638d821): "Oftentimes after I submit something and
// go to the In Progress tab ... I can't find it for the life of me. I often
// look at the first thread and think, 'Ah that's not it.'" The tab ran in the
// fleet's order, project first and then level, so a Medium thread in the
// fourth project, sent a minute before, was drawn eighth of ten. Measured on
// the ten threads photographed for the five options; newest sent first was
// picked.
//
// Nothing in In Progress waits on you, so it reads by when you last wrote
// (`sentAt`), like Done reads by when each finished. Needs you and Later keep
// the Display's sort. Pins still lead, and dragging to set a place is off here
// because the order is time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { sorted, sortedEntries } from '../renderer/src/threads/page-rules.ts';
import { mergeRows } from '../renderer/src/threads/people-rules.ts';
import { DisplayMenu } from '../renderer/src/threads/Pages.tsx';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');

const NOW = Date.UTC(2026, 9, 21, 15);
const MIN = 60_000;
const HOUR = 60 * MIN;
const ORDER = ['payments', 'web', 'mobile', 'infra'];
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const bySentSort = { ...byPriority, sort: 'updated' };
// A thread you sent `ago`, that an agent last wrote on `touched` ago.
const thread = (id, product, priority, ago, { touched = ago, pinned = false } = {}) => ({
  id, product, priority, status: 'claimed', createdAt: NOW - ago, updatedAt: NOW - touched, pinned,
  wrote: { body: { ts: NOW - ago, source: 'founder' }, ...(touched < ago ? { note: { ts: NOW - touched, source: 'agent' } } : {}) },
});
const ids = (rows) => rows.map((r) => r.id);

// The reported case: what you just sent is Medium, in the fourth project.
const justSent = thread('deploy', 'infra', 5, MIN, { touched: 30_000 });
const highFirstProject = thread('refund', 'payments', 7, 2 * HOUR, { touched: 2 * MIN });
const urgent = thread('crash', 'mobile', 9, 50 * MIN, { touched: MIN });
const busyOld = thread('rollout', 'mobile', 5, 26 * HOUR, { touched: 20_000 });
const rows = [highFirstProject, urgent, busyOld, justSent];

describe('In Progress', () => {
  it('puts what you just sent on top under Sort by Priority', () => {
    expect(ids(sorted(rows, byPriority, 'progress', ORDER))).toEqual(['deploy', 'crash', 'refund', 'rollout']);
  });
  it('and under Sort by Sent', () => {
    expect(ids(sorted(rows, bySentSort, 'progress', ORDER))).toEqual(['deploy', 'crash', 'refund', 'rollout']);
  });
  it('an agent writing on an old thread does not lift it', () => {
    expect(ids(sorted(rows, byPriority, 'progress', ORDER)).at(-1)).toBe('rollout');
  });
  it('a pinned thread still leads', () => {
    const pinned = thread('pinned', 'infra', 2, 3 * HOUR, { pinned: true });
    expect(ids(sorted([...rows, pinned], byPriority, 'progress', ORDER))[0]).toBe('pinned');
  });
  it('the board’s In progress column runs the same way', () => {
    const entry = (item) => ({ key: item.id, priority: item.priority, projectSlug: item.product, updatedAt: item.updatedAt, item, card: null, state: 'running' });
    expect(sortedEntries(rows.map(entry), byPriority, 'running', ORDER).map((e) => e.key)).toEqual(['deploy', 'crash', 'refund', 'rollout']);
  });
  it('a teammate’s card falls in by when it last changed', () => {
    const theirs = { threadId: 'theirs', priority: 9, updatedAt: NOW - 30 * MIN, project: 'Payments API' };
    const mine = sorted(rows, byPriority, 'progress', ORDER);
    const keys = mergeRows(mine, [theirs], 'updated').map((r) => (r.item ? r.item.id : r.card.threadId));
    expect(keys).toEqual(['deploy', 'theirs', 'crash', 'refund', 'rollout']);
  });
});

describe('the other tabs keep the Display’s sort', () => {
  it('Needs you is still project and level first', () => {
    expect(ids(sorted(rows, byPriority, 'inbox', ORDER))).toEqual(['refund', 'crash', 'rollout', 'deploy']);
  });
  it('and Later', () => {
    expect(ids(sorted(rows, byPriority, 'snoozed', ORDER))).toEqual(['refund', 'crash', 'rollout', 'deploy']);
  });
});

describe('the app around it', () => {
  const menu = (tab) => renderToStaticMarkup(React.createElement(DisplayMenu, { page: 'inbox', display: byPriority, onDisplay: () => {}, products: [], tab }));
  it('the Display menu says so on In Progress', () => {
    expect(menu('progress')).toContain('In progress runs newest sent first');
  });
  it('and not on Needs you', () => {
    expect(menu('inbox')).not.toContain('runs newest sent first');
  });
  it('a teammate’s rows merge in by time on In Progress', () => {
    expect(src('App.tsx')).toMatch(/mergeRows\(displayedBox, theirRows, view === 'done' \? 'done' : view === 'progress' \? 'updated' : inboxDisplay\.sort[,)]/);
  });
  it('dragging sets no place in In Progress, in the list or on the board', () => {
    const app = src('App.tsx');
    const reorder = app.match(/onReorder=\{[^}]*\}/)?.[0] ?? '';
    expect(reorder).toContain("view === 'inbox'");
    expect(reorder).not.toContain("view === 'progress'");
    expect(src('threads', 'Pages.tsx')).toMatch(/col\.state !== 'done' && col\.state !== 'running' && display\.sort === 'priority'/);
  });
});
