// THE PHONE'S "SHOWING N OF M" COUNTS WHAT THE SCREEN DRAWS.
//
// Three testers on 2026-11-06 opened View and filters with no filter on and
// read "Showing 3 of 4", "Showing 2 of 3" and "Showing 4 of 4" over lists of
// 8, 7 and 5 threads. Measured in the phone preview: Everything else counted
// your own threads against yours plus your AI teammates' runs, counted one tab
// while the board drew three columns, and Needs you left out the mention rows
// it draws above its threads.
import { describe, it, expect } from 'vitest';
import { filterCount } from '../mobile/src/lib/tabs';

const row = (id, labels = []) => ({ key: `p/${id}`, id, product: 'p', item: { id, product: 'p', labels } });
const mate = (id) => row(id, ['teammate:m1']);
const col = (n) => ({ rows: Array.from({ length: n }, (_, i) => ({ i })) });

describe('Showing N of M in View and filters', () => {
  it('leaves an AI teammate\'s run out of both numbers on your own list', () => {
    const whole = [row('a'), row('b'), row('c'), mate('d')];
    expect(filterCount({ rows: whole, whole, mineOnly: true })).toEqual({ shown: 3, total: 3 });
  });

  it('still counts a teammate\'s run on a list that draws it', () => {
    const whole = [row('a'), mate('d')];
    expect(filterCount({ rows: whole, whole })).toEqual({ shown: 2, total: 2 });
  });

  it('counts the mention rows drawn above Needs you', () => {
    const whole = [row('a'), row('b'), row('c'), row('d')];
    expect(filterCount({ rows: whole, whole, above: 1 })).toEqual({ shown: 5, total: 5 });
  });

  it('counts every column the board draws, not one tab', () => {
    expect(filterCount({ rows: [row('a')], whole: [row('a'), row('b')], board: [col(3), col(3), col(2)], wholeBoard: [col(3), col(3), col(2)] }))
      .toEqual({ shown: 8, total: 8 });
  });

  it('still says fewer when a filter hides some', () => {
    const whole = [row('a'), row('b'), row('c'), mate('d')];
    expect(filterCount({ rows: whole.slice(0, 2), whole, mineOnly: true })).toEqual({ shown: 2, total: 3 });
    expect(filterCount({ rows: [], whole: [], board: [col(1), col(0)], wholeBoard: [col(3), col(2)] })).toEqual({ shown: 1, total: 5 });
  });
});
