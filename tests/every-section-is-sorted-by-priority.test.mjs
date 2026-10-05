// SORT BY PRIORITY HAD TO ACTUALLY SORT BY PRIORITY.
//
// Reported 2026-10-01: the Display menu said Priority and the board's columns
// ran Medium, Low, High, Medium, High. A section that promises priority order
// has to be in one.
//
// Two reasons, both here:
//
//   `sorted` DID NOTHING ON PRIORITY. It sorted on Updated and returned the
//   rows untouched otherwise, trusting "the app's own ranking". That ranking is
//   `byRunningOrder(score)`, where a product's place in the running order is
//   worth a hundred item points, so an Urgent thread in the fourth project sits
//   under a Low one in the first. That is the right order for the fleet picking
//   what to run next. It is not what the word Priority on a menu promises.
//
//   THE BOARD NEVER ASKED. `teamEntries` ended on `b.updatedAt - a.updatedAt`
//   and the columns drew what it handed back, so the Display's Sort reached the
//   list and not one column of the board.
//
// Priority means Urgent, High, Medium, Low, newest first inside a level.
//
// AND YOUR PROJECT ORDER BEFORE THAT, since 2026-10-02 (w-e263a8a0fb): "Tasks
// in board and list view should be organized by priority, which *includes*
// projects." Every row here is in one project, so these still hold; the
// project half is tests/sort-by-priority-puts-your-higher-project-first.test.mjs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sorted, sortedEntries } from '../renderer/src/threads/page-rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (...p) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', ...p), 'utf8');
const pages = src('threads', 'Pages.tsx');

const NOW = Date.UTC(2026, 9, 1, 17);
const MIN = 60_000;
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const byUpdated = { ...byPriority, sort: 'updated' };
// The stored numbers behind the four words (renderer/src/priority.ts).
const row = (id, priority, agoMin, product = 'northwind') => ({ id, priority, product, updatedAt: NOW - agoMin * MIN });
const ids = (list) => list.map((r) => r.id);

describe('a list under Sort by Priority', () => {
  it('runs Urgent, High, Medium, Low', () => {
    const rows = [row('med', 5, 1), row('low', 2, 2), row('urg', 9, 3), row('high', 7, 4)];
    expect(ids(sorted(rows, byPriority))).toEqual(['urg', 'high', 'med', 'low']);
  });

  it('puts the newest first inside one level', () => {
    const rows = [row('old', 9, 300), row('new', 9, 1), row('mid', 9, 50)];
    expect(ids(sorted(rows, byPriority))).toEqual(['new', 'mid', 'old']);
  });

  it('reads an untagged thread as Medium, the way every other surface does', () => {
    const rows = [row('low', 2, 1), row('none', null, 2), row('high', 7, 3)];
    expect(ids(sorted(rows, byPriority))).toEqual(['high', 'none', 'low']);
  });

  it('still sorts newest first under Updated', () => {
    const rows = [row('old', 9, 300), row('new', 2, 1)];
    expect(ids(sorted(rows, byUpdated))).toEqual(['new', 'old']);
  });

  it('leaves the rows the app makes itself at the top, under either sort', () => {
    // A broken session and a waiting update belong to no project. They are
    // first because they are about every project at once, and a sort that
    // ranked them against one project's work would put them somewhere
    // meaningless. `keeps` already exempts them; so does the order.
    const rows = [
      { id: 'trouble', product: '', priority: 5, updatedAt: NOW - 400 * MIN },
      row('urg', 9, 3), row('low', 2, 1),
    ];
    expect(ids(sorted(rows, byPriority))).toEqual(['trouble', 'urg', 'low']);
    expect(ids(sorted(rows, byUpdated))).toEqual(['trouble', 'low', 'urg']);
  });

  it('does not change the array it was handed', () => {
    const rows = [row('low', 2, 1), row('urg', 9, 2)];
    sorted(rows, byPriority);
    expect(ids(rows)).toEqual(['low', 'urg']);
  });
});

describe('a board column under Sort by Priority', () => {
  const entry = (key, priority, agoMin) => ({ key, priority, updatedAt: NOW - agoMin * MIN, state: 'waiting', ownerId: null, title: key, project: 'Northwind', projectSlug: 'northwind', item: null, card: null });

  it('runs Urgent, High, Medium, Low, like the list beside it', () => {
    const rows = [entry('med', 5, 1), entry('urg', 9, 9), entry('low', 2, 2), entry('high', 7, 3)];
    expect(sortedEntries(rows, byPriority).map((e) => e.key)).toEqual(['urg', 'high', 'med', 'low']);
  });

  it('reads a teammate\'s card with no level as Medium', () => {
    const rows = [entry('low', 2, 1), entry('card', null, 2), entry('high', 7, 3)];
    expect(sortedEntries(rows, byPriority).map((e) => e.key)).toEqual(['high', 'card', 'low']);
  });

  it('keeps newest first when the menu says Updated', () => {
    const rows = [entry('old', 9, 90), entry('new', 2, 1)];
    expect(sortedEntries(rows, byUpdated).map((e) => e.key)).toEqual(['new', 'old']);
  });
});

describe('where the order is applied', () => {
  it('every column of the board asks for it, not just the list', () => {
    // The board draws `boardColumns` (page-rules.ts since 2026-10-02, so J and
    // K can walk the same order), and every column there goes through the
    // Display the page is drawn with. The column's own name goes in too, so
    // Done today can run newest finished first (w-c61f5bf497,
    // tests/the-done-tab-runs-newest-finished-first.test.mjs).
    const board = pages.slice(pages.indexOf('export function InboxBoard'));
    expect(board).toContain('boardColumns({ items, products, display,');
    const rules = src('threads', 'page-rules.ts');
    // And the conversation projects, which rank with your top project
    // (w-2e8aa16f0f, tests/a-message-ranks-with-your-top-project.test.mjs).
    expect(rules.slice(rules.indexOf('export function boardColumns'))).toContain('sortedEntries(entries.filter((e) => e.state === col.state), display, col.state, projectOrder, conversationSlugs(products))');
  });
});
