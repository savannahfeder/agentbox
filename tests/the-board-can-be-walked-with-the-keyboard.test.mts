// THE BOARD CAN BE WALKED WITH THE KEYBOARD, AND YOU CAN SEE WHERE YOU ARE.
//
// Reported 2026-10-02 (w-23fc91bff5): "in list view, it's very easy for me to
// navigate with my keyboard to open certain tasks, but I can't really do that
// in board view. I typically have to click, and it's not clear which one is
// selected on my keyboard." Measured in the code: J and K already moved the
// keyboard's place down the board (`boardWalk`), and Enter opened it, but
// InboxBoard was never told which card that was, so no card looked any
// different, and nothing moved sideways between columns at all.
//
// Now the card the keyboard is on is drawn as selected, and the left and right
// arrows move to the column beside it, onto the card level with the one you
// were on. L stays Later, as it is in the list, which is why sideways is the
// arrows and not H and L.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardColumns, boardSideways, boardWalk } from '../renderer/src/threads/page-rules.ts';
import { InboxBoard } from '../renderer/src/threads/Pages.tsx';
globalThis.React = React;

const NOW = Date.UTC(2026, 9, 2, 17);
const products = [{ slug: 'p', name: 'P' }];
// Priority sets the order inside a column: higher first.
const item = (id, state, priority = 5) => ({ id, priority, product: 'p', title: id, status: 'open', updatedAt: NOW - 60_000, _state: state });
const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const stateOf = (i) => i._state;
const cols = (items, extra = {}) => boardColumns({ items, products, display, now: NOW, stateOf, cards: [], me: null, ...extra });

// Waiting: w1 w2 w3 / In progress: r1 r2 / Later: (none) / Done today: d1
const items = [
  item('w1', 'waiting', 9), item('w2', 'waiting', 7), item('w3', 'waiting', 5),
  item('r1', 'running', 9), item('r2', 'running', 7),
  item('d1', 'done', 9),
];
const board = cols(items);
const walk = boardWalk(board).map((i) => i.id);
const at = (id) => walk.indexOf(id);
const go = (from, dir, c = board) => boardWalk(c)[boardSideways(c, boardWalk(c).findIndex((i) => i.id === from), dir)].id;

describe('the arrows move between columns', () => {
  it('right goes to the card level with this one in the next column', () => {
    expect(walk).toEqual(['w1', 'w2', 'w3', 'r1', 'r2', 'd1']);
    expect(go('w1', 1)).toBe('r1');
    expect(go('w2', 1)).toBe('r2');
  });

  it('left comes back level too', () => {
    expect(go('r2', -1)).toBe('w2');
    expect(go('r1', -1)).toBe('w1');
  });

  it('lands on the last card when the next column is shorter', () => {
    expect(go('w3', 1)).toBe('r2');
  });

  it('steps over an empty column', () => {
    expect(go('r2', 1)).toBe('d1');
    expect(go('d1', -1)).toBe('r1');
  });

  it('stays put at either edge of the board', () => {
    expect(go('w2', -1)).toBe('w2');
    expect(go('d1', 1)).toBe('d1');
  });

  it('follows the columns in the order you dragged them to', () => {
    const c = cols(items, { order: ['done', 'running', 'scheduled', 'waiting'] });
    expect(go('d1', 1, c)).toBe('r1');
    expect(go('r2', 1, c)).toBe('w2');
  });

  it('steps over a column holding only a teammate\'s cards, which the keys cannot open', () => {
    const card = { personId: 'm', threadId: 't', state: 'running', visible: true, title: 'theirs', project: 'P', priority: 5, updatedAt: NOW };
    const c = cols([item('w1', 'waiting'), item('d1', 'done')], { cards: [card], picked: ['m', 'me'], me: 'me' });
    expect(c.find((x) => x.state === 'running').rows).toHaveLength(1);
    expect(go('w1', 1, c)).toBe('d1');
  });

  it('does nothing on an empty board', () => {
    expect(boardSideways(cols([]), 0, 1)).toBe(0);
  });
});

describe('the card the keyboard is on is drawn as selected', () => {
  const draw = (selected) => renderToStaticMarkup(React.createElement(InboxBoard, {
    items, products, display, now: NOW, stateOf, onOpenItem: () => {}, selected,
  }));
  it('exactly one card, the one the keys are on', () => {
    const out = draw(items[4]);
    expect(out.match(/th-card selected/g)).toHaveLength(1);
    expect(out).toMatch(/th-card selected[^>]*>(?:(?!<button).)*r2/);
  });
  it('no card when there is nothing selected', () => {
    expect(draw(undefined)).not.toContain('th-card selected');
  });
  it('not a card of the same id in another project', () => {
    expect(draw({ ...items[4], product: 'other' })).not.toContain('th-card selected');
  });
});

// "I keep running into little instances of lag ... it looks like it's
// jumping" (2026-10-02). Timed over a copy of the real inbox (1,254 threads)
// in headless Chrome: a press showed in 14 to 19 ms median before and after,
// the slow ones (up to 100 ms) arriving with the Mac's load at 60 to 78. What
// the code did own: the keyboard's card was scrolled to AFTER the frame was
// painted, so a card below the fold was drawn, then moved.
describe('moving down the board does not jump', () => {
  const pages = readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  const board = pages.slice(pages.indexOf('export function InboxBoard'));
  it('scrolls to the keyboard\'s card before the frame is drawn', () => {
    expect(pages).toContain('const useBeforePaint = typeof window === \'undefined\' ? useEffect : useLayoutEffect;');
    expect(board).toMatch(/useBeforePaint\(\(\) => \{[^}]{0,200}boardRef\.current\?\.querySelector\('\.th-card\.selected'\)/);
  });
  // A column's first card scrolled into view left its heading above the top
  // of the board (the founder's screenshots, 2026-10-02). On a first card the
  // heading is what is brought into view, and the card comes with it.
  it('shows the column\'s heading when the keyboard is on its first card', () => {
    expect(board).toContain("const first = col?.querySelector('.th-card') === card;");
    expect(board).toContain("(first ? col?.querySelector('.th-col-h') ?? card : card).scrollIntoView");
  });
  it('does not scroll the board while a column is being carried', () => {
    expect(board).toContain('if (drag.current?.started) return;');
  });
  it('does not rebuild the columns when only the keyboard\'s card moved', () => {
    expect(board).toMatch(/const columns = useMemo\(/);
  });
});

describe('App.tsx', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const list = app.slice(app.indexOf('      switch (e.key) {'));
  it('moves sideways on the arrows, only on the board', () => {
    expect(list).toContain("case 'ArrowLeft': case 'ArrowRight':");
    expect(list).toContain('boardSideways(boardCols, selected,');
  });
  it('tells the board which card the keyboard is on', () => {
    expect(app).toContain('selected={current}');
  });
});
