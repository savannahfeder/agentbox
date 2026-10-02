// J AND K ON THE BOARD WALK THE CARDS IN THE ORDER THEY ARE DRAWN, AND THE
// TEAM BOARD SORTS BY PRIORITY.
//
// Reported 2026-10-02: on the board, J from inside an opened task stopped as
// though there were nothing left while the board still showed many cards. J/K
// walked `list`, the current TAB's rows, while the board draws every state in
// columns, each sorted on its own. A card opened from another column was not in
// that list at all (findIndex -1), so J fell back to the old row index and ran
// off the end. Now the board hands App.tsx its own reading order: down the
// first column, then down the next, the way the eye goes.
//
// And the board did not sort by priority: the team half of the page defaulted
// to Sort: Updated, and her saved display carried that default (read from the
// app's own storage: {"view":"board","sort":"updated",...} under
// threads.display.team). The team default is Priority now, and a team display
// saved before this is read as Priority once.
import { describe, it, expect } from 'vitest';
import { boardColumns, boardWalk, readDisplay, writeDisplay, DEFAULT_DISPLAY } from '../renderer/src/threads/page-rules.ts';

const NOW = Date.UTC(2026, 9, 2, 17);
const MIN = 60_000;
const products = [{ slug: 'p', name: 'P' }];
const item = (id, priority, agoMin, state) => ({ id, priority, product: 'p', title: id, status: 'open', updatedAt: NOW - agoMin * MIN, _state: state });
const items = [
  item('w-low', 2, 1, 'waiting'),
  item('w-urgent', 9, 30, 'waiting'),
  item('w-high', 7, 5, 'waiting'),
  item('r-med', 5, 2, 'running'),
  item('r-urgent', 9, 40, 'running'),
  item('s-high', 7, 3, 'scheduled'),
];
const stateOf = (i) => i._state;
const display = { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' };
const cols = (d = display) => boardColumns({ items, products, display: d, now: NOW, stateOf, cards: [], me: null });
const ids = (rows) => rows.map((r) => r.id);

describe('the board', () => {
  it('sorts each column by priority, Urgent first', () => {
    const c = cols();
    expect(c.map((x) => x.state)).toEqual(['waiting', 'running', 'scheduled', 'done']);
    expect(c[0].rows.map((e) => e.item.id)).toEqual(['w-urgent', 'w-high', 'w-low']);
    expect(c[1].rows.map((e) => e.item.id)).toEqual(['r-urgent', 'r-med']);
  });

  it('is walked down each column, then on to the next, exactly as drawn', () => {
    expect(ids(boardWalk(cols()))).toEqual(['w-urgent', 'w-high', 'w-low', 'r-urgent', 'r-med', 's-high']);
  });

  it('lets J carry on past the end of a column instead of stopping', () => {
    const walk = ids(boardWalk(cols()));
    const at = walk.indexOf('w-low');
    expect(walk[at + 1]).toBe('r-urgent');
  });

  it('still walks by Updated when that is what the menu says', () => {
    expect(ids(boardWalk(cols({ ...display, sort: 'updated' })))).toEqual(['w-low', 'w-high', 'w-urgent', 'r-med', 'r-urgent', 's-high']);
  });

  it('leaves out a teammate card with no thread of yours behind it, since J opens threads', () => {
    const card = { id: 'c1', personId: 'm', state: 'waiting', priority: 9, updatedAt: NOW, visible: true, project: 'X', title: 'theirs' };
    const c = boardColumns({ items, products, display, now: NOW, stateOf, cards: [card], picked: ['m'], me: null });
    expect(c[0].rows.length).toBe(4);
    expect(ids(boardWalk(c))).not.toContain(undefined);
    expect(boardWalk(c)).toHaveLength(6);
  });
});

describe('the team board\'s sort', () => {
  const store = (v) => { const m = new Map(v ? [['threads.display.team', JSON.stringify(v)]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, x) => m.set(k, x) }; };
  it('defaults to Priority', () => {
    expect(DEFAULT_DISPLAY.team.sort).toBe('priority');
    expect(readDisplay('team', store(null)).sort).toBe('priority');
  });
  it('reads a team display saved under the old Updated default as Priority', () => {
    expect(readDisplay('team', store({ view: 'board', sort: 'updated', priorities: [], projects: ['a'], updated: 'any' })).sort).toBe('priority');
  });
  it('keeps Updated once it is chosen after this change', () => {
    const s = store(null);
    writeDisplay('team', { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any' }, s);
    expect(readDisplay('team', s).sort).toBe('updated');
  });
  it('leaves your own page\'s saved Updated alone', () => {
    const m = new Map([['threads.display.inbox', JSON.stringify({ view: 'list', sort: 'updated' })]]);
    expect(readDisplay('inbox', { getItem: (k) => m.get(k) ?? null }).sort).toBe('updated');
  });
});
