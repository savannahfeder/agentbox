// SORT BY PRIORITY PUTS YOUR HIGHER PROJECT FIRST, THEN THE THREAD'S OWN LEVEL.
//
// Reported 2026-10-02 (w-e263a8a0fb) with a picture of the board under Sort by
// Priority: "Tasks in board and list view should be organized by priority,
// which *includes* projects." The Waiting column ran Personal (High), Personal
// (Medium), Agentbox Team (Low), Agentbox Team (Low), Personal (Low): sorted by
// each thread's own level alone, so one project's threads were scattered
// through the column and the project order set in Settings > Project priority
// counted for nothing on the page.
//
// It had been taken out on purpose (w-5a08121f99, tests/every-section-is-
// sorted-by-priority.test.mjs). The order then was the fleet's score, where an
// agent's own number is thrown away, so levels inside one project read out of
// order. This keeps that fix: inside one project the levels still run Urgent,
// High, Medium, Low by the number the row shows. The project's place comes
// before it, the same rule shared/rank.mjs gives the fleet: a project one place
// higher outranks anything in one lower, whatever its level.
//
// A project you have never placed sits below every placed one, so with no
// order at all the page is exactly what it was. Updated and Done are not
// about priority and do not change.
import { describe, it, expect } from 'vitest';
import { sorted, sortedEntries, boardColumns } from '../renderer/src/threads/page-rules.ts';
import { mergeRows } from '../renderer/src/threads/people-rules.ts';

const NOW = Date.UTC(2026, 9, 2, 17);
const MIN = 60_000;
const byPriority = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const byUpdated = { ...byPriority, sort: 'updated' };
// Personal is placed above the team product, as in the picture.
const ORDER = ['personal', 'team-app'];
const row = (id, product, priority, agoMin) => ({ id, product, priority, title: id, status: 'open', updatedAt: NOW - agoMin * MIN });
const ids = (list) => list.map((r) => r.id ?? r.key ?? r.item?.id ?? r.card?.threadId);

describe('a list under Sort by Priority', () => {
  it('puts a Low thread in the higher project above an Urgent one in the lower', () => {
    const rows = [row('team-urgent', 'team-app', 9, 1), row('personal-low', 'personal', 2, 50)];
    expect(ids(sorted(rows, byPriority, undefined, ORDER))).toEqual(['personal-low', 'team-urgent']);
  });

  it('keeps one project together, Urgent to Low, as in the reported column', () => {
    const rows = [
      row('p-high', 'personal', 7, 1), row('p-med', 'personal', 5, 2),
      row('t-low-1', 'team-app', 2, 3), row('t-low-2', 'team-app', 2, 4),
      row('p-low', 'personal', 2, 5),
    ];
    expect(ids(sorted(rows, byPriority, undefined, ORDER))).toEqual(['p-high', 'p-med', 'p-low', 't-low-1', 't-low-2']);
  });

  it('runs newest first inside one project and one level', () => {
    const rows = [row('old', 'personal', 5, 300), row('new', 'personal', 5, 1)];
    expect(ids(sorted(rows, byPriority, undefined, ORDER))).toEqual(['new', 'old']);
  });

  it('puts a project you never placed below every placed one', () => {
    const rows = [row('loose-urgent', 'side-thing', 9, 1), row('team-low', 'team-app', 2, 2)];
    expect(ids(sorted(rows, byPriority, undefined, ORDER))).toEqual(['team-low', 'loose-urgent']);
  });

  it('with no order at all, is the level order it was', () => {
    const rows = [row('team-urgent', 'team-app', 9, 1), row('personal-low', 'personal', 2, 50)];
    expect(ids(sorted(rows, byPriority))).toEqual(['team-urgent', 'personal-low']);
    expect(ids(sorted(rows, byPriority, undefined, []))).toEqual(['team-urgent', 'personal-low']);
  });

  it('does not touch Sort by Updated', () => {
    const rows = [row('personal-old', 'personal', 9, 300), row('team-new', 'team-app', 2, 1)];
    expect(ids(sorted(rows, byUpdated, undefined, ORDER))).toEqual(['team-new', 'personal-old']);
  });

  it('does not touch the Done tab, which runs newest finished first', () => {
    const done = (id, product, agoMin) => ({ ...row(id, product, 9, agoMin), status: 'done', wrote: { status: { ts: NOW - agoMin * MIN } } });
    const rows = [done('personal-old', 'personal', 300), done('team-new', 'team-app', 1)];
    expect(ids(sorted(rows, byPriority, 'done', ORDER))).toEqual(['team-new', 'personal-old']);
  });
});

describe('the board under Sort by Priority', () => {
  const products = [{ slug: 'personal', name: 'Personal' }, { slug: 'team-app', name: 'Team app' }];
  const display = { ...byPriority, view: 'board' };
  const stateOf = (i) => i._state;
  const waiting = (id, product, priority, agoMin) => ({ ...row(id, product, priority, agoMin), _state: 'waiting' });
  const card = (threadId, project, priority, agoMin) => ({
    personId: 'mate', threadId, visible: true, title: threadId, project, state: 'waiting', priority,
    problem: null, progress: null, solution: null, blockedBy: [], blocks: [], people: null, updatedAt: NOW - agoMin * MIN,
  });
  const column = (items, cards = [], projectOrder = ORDER) => boardColumns({
    items, products, display, now: NOW, stateOf, cards, picked: ['me', 'mate'], me: 'me', projectOrder,
  }).find((c) => c.state === 'waiting').rows.map((e) => e.item?.id ?? e.card.threadId);

  it('runs each column by project, then level, like the list', () => {
    const items = [
      waiting('p-high', 'personal', 7, 1), waiting('p-med', 'personal', 5, 2),
      waiting('t-low', 'team-app', 2, 3), waiting('t-urgent', 'team-app', 9, 4),
      waiting('p-low', 'personal', 2, 5),
    ];
    expect(column(items)).toEqual(['p-high', 'p-med', 'p-low', 't-urgent', 't-low']);
  });

  it("places a teammate's card by the project it is in, matched by name", () => {
    const items = [waiting('t-urgent', 'team-app', 9, 1)];
    expect(column(items, [card('their-low', 'Personal', 2, 9)])).toEqual(['their-low', 't-urgent']);
  });

  it("puts a teammate's card from a project you do not have with the unplaced", () => {
    const items = [waiting('t-low', 'team-app', 2, 1)];
    expect(column(items, [card('elsewhere', 'Not mine', 9, 9)])).toEqual(['t-low', 'elsewhere']);
  });

  it('with no order, is the level order it was', () => {
    const items = [waiting('t-urgent', 'team-app', 9, 1), waiting('p-low', 'personal', 2, 2)];
    expect(column(items, [], [])).toEqual(['t-urgent', 'p-low']);
  });

  it('sortedEntries reads the same order off an entry', () => {
    const entry = (key, projectSlug, priority, agoMin) => ({ key, projectSlug, priority, updatedAt: NOW - agoMin * MIN, state: 'waiting', item: null, card: null });
    const rows = [entry('team-urgent', 'team-app', 9, 1), entry('personal-low', 'personal', 2, 2)];
    expect(sortedEntries(rows, display, 'waiting', ORDER).map((e) => e.key)).toEqual(['personal-low', 'team-urgent']);
  });
});

describe("a list with a teammate's threads in it", () => {
  const products = [{ slug: 'personal', name: 'Personal' }, { slug: 'team-app', name: 'Team app' }];
  const card = (threadId, project, priority, agoMin) => ({ personId: 'mate', threadId, visible: true, title: threadId, project, state: 'waiting', priority, updatedAt: NOW - agoMin * MIN });

  it("puts their card from the higher project above your Urgent in the lower", () => {
    const mine = sorted([row('t-urgent', 'team-app', 9, 1)], byPriority, undefined, ORDER);
    const out = mergeRows(mine, [card('their-low', 'Personal', 2, 5)], 'priority', { order: ORDER, products });
    expect(ids(out)).toEqual(['their-low', 't-urgent']);
  });

  it("puts their card from the lower project below your Low in the higher", () => {
    const mine = sorted([row('p-low', 'personal', 2, 1)], byPriority, undefined, ORDER);
    const out = mergeRows(mine, [card('their-urgent', 'Team app', 9, 5)], 'priority', { order: ORDER, products });
    expect(ids(out)).toEqual(['p-low', 'their-urgent']);
  });

  it('with no order, still merges by level alone', () => {
    const mine = [row('p-low', 'personal', 2, 1)];
    expect(ids(mergeRows(mine, [card('their-urgent', 'Team app', 9, 5)], 'priority'))).toEqual(['their-urgent', 'p-low']);
  });
});
