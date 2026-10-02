// THE WALK OPENS THE BOARD, which is the one view it never showed.
//
// The tutorial toured the tabs, said where each thing went, and then jumped
// straight to the command palette. So the walk ended without ever opening the
// view somebody with a team opens in the morning: seeing what everyone is up
// to at once is the question the board answers and no tab does.
//
// HOW IT WAS MEASURED. The walk's own end-to-end run
// (tests/the-whole-walk-runs-end-to-end.test.mjs) stepped `where` straight to
// `command`, and no beat anywhere named the board. The nineteen-beat count in
// tests/her-three-off-the-page-of-nineteen.test.mjs is twenty now, and that
// renumbering is deliberate rather than a pin drifting.
//
// THE RULE THIS FILE HOLDS. There is a board beat; it sits after the tour and
// before the palette; it names the two presses that really reach the board,
// because the board is not a tab but a row inside the View and filters menu;
// and the beat ends when the board is actually on the screen rather than when
// either of those presses happens.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANCHOR, BEAT, COACHED, IN_PRACTICE, N_BEATS, STEPS, coach, walkRows,
} from '../renderer/src/onboarding.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

/** The loud line of a card, which is the line that names the press. */
const loud = (say) => `${say.lead}${say.key ?? ''}${say.tail}`;

describe('the board is a beat of the walk', () => {
  it('is in the walk at all, which is the whole of the fault', () => {
    expect(STEPS).toContain('board');
  });

  it('comes after the tour and before the palette', () => {
    // The tour says where each thing went; the board is all of it at once, one
    // layer up. Either side of it is the boundary that matters: putting it
    // before `where` would show the columns to somebody who has not yet seen
    // the tabs they summarise.
    expect(STEPS.indexOf('board')).toBe(STEPS.indexOf('where') + 1);
    expect(STEPS.indexOf('board')).toBe(STEPS.indexOf('command') - 1);
  });

  it('is coached, and is inside the practice project', () => {
    // Both lists, because a beat missing from either draws no card or draws
    // one over the person's own inbox instead of the practice one.
    expect(COACHED).toContain('board');
    expect(IN_PRACTICE).toContain('board');
  });

  it('is its own beat, and the walk is twenty rather than nineteen', () => {
    expect(BEAT.board).toBe(18);
    expect(BEAT.command).toBe(19);
    expect(BEAT.done).toBe(20);
    expect(BEAT.landed).toBe(20);
    expect(N_BEATS).toBe(20);
    // Nothing shares the board's number: `working`/`open` and `done`/`landed`
    // are the only pairs that double up, and this is not one of them.
    const sharing = Object.entries(BEAT).filter(([, n]) => n === 18).map(([s]) => s);
    expect(sharing).toEqual(['board']);
  });
});

describe('what the board card says', () => {
  const say = coach('board', 0);

  it('names the columns, which is what the board actually is', () => {
    // The quiet line says what the thing IS; the loud line says how to get
    // there. The board's whole lesson is in the quiet half.
    expect(say.quiet).toContain('columns');
  });

  it('names both presses that reach it, because it is two deep', () => {
    // The board is not a tab. It is a row inside the View and filters menu, so
    // the honest route is a button and then a row, and one card carries both.
    const line = loud(say).toLowerCase();
    expect(line).toContain('click');
    expect(line).toContain('view and filters');
    expect(line).toContain('board');
  });

  it('names no key, because the app has no shortcut that opens the menu', () => {
    // A card naming a cap invented to keep the other cards' shape is the dead
    // key tests/the-walk-promises-no-dead-keys.test.mjs refuses.
    expect(say.key).toBeNull();
  });

  it('does not promise a team to somebody who has none', () => {
    // THE CASE THAT MUST NOT MATCH. On a Mac with nobody else the board is
    // your own work in the same columns, which is worth knowing on its own.
    // The sentence names the columns rather than the people, so it stays true
    // either way, and "everyone" or "your team" in the card would not.
    const line = `${say.quiet}${say.lead}${say.tail}`.toLowerCase();
    expect(line).not.toContain('everyone');
    expect(line).not.toContain('your team');
    expect(line).not.toContain('teammate');
  });
});

describe('the board the beat opens has the work on it', () => {
  // HOW THIS WAS FOUND. Shooting the beat headless
  // (scripts/scratch/shot-w8fed-board.mjs) drew an empty board, which sent me
  // to `walkRows`. The empty board itself is the harness and not the app: a
  // headless run has no main process, so the practice project's rows are never
  // seeded, and the shipped `where` beat draws an empty list there too. That
  // was measured rather than assumed, by pointing the same probe at `where`.
  //
  // THE FAULT UNDER IT IS REAL. The board beat was added with no branch in
  // `walkRows`, so it fell through to `r.id === run.item` and kept one row: the
  // thread the walk wrote, which by this beat is closed. The tour beat one step
  // earlier keeps the staged three AND that thread. So the board showed less
  // than the tab tour just had, while its card promised everything at once.
  const rows = [
    { id: 'ex-1' }, { id: 'ex-2' }, { id: 'ex-3' },
    { id: 'hers' },
    // The directive that making the project composed. It stays out of both
    // beats, which is what keeping a named set rather than dropping the filter
    // buys.
    { id: 'made-the-project' },
  ];
  const run = (step) => ({ step, examples: ['ex-1', 'ex-2', 'ex-3'], item: 'hers' });

  it('shows the staged examples and her own thread, not that thread alone', () => {
    const ids = walkRows(rows, run('board')).map((r) => r.id);
    expect(ids).toEqual(['ex-1', 'ex-2', 'ex-3', 'hers']);
  });

  it('shows exactly what the tour before it showed, one layer up', () => {
    // The boundary either side: the tour says where each thing went, the board
    // is the same things sorted by what is happening to them. A different set
    // in the two beats would teach that the board hides something.
    const tour = walkRows(rows, run('where')).map((r) => r.id);
    const board = walkRows(rows, run('board')).map((r) => r.id);
    expect(board).toEqual(tour);
  });

  it('still keeps the project-making directive out', () => {
    // THE CASE THAT MUST NOT MATCH. Widening this beat to every row is the
    // easy wrong fix, and it would put a row she never saw on the board.
    expect(walkRows(rows, run('board')).map((r) => r.id)).not.toContain('made-the-project');
  });
});

describe('where the ring sits for the board beat', () => {
  it('prefers the open menu and falls back to the button that opens it', () => {
    // The same order-of-preference shape as `snooze` and `unblock`: the thing
    // that is only on the screen part of the time wins while it is there, so
    // the ring follows the press from the button into the menu without the
    // beat having to know which half it is on.
    expect(ANCHOR.board).toEqual(['.th-pop', '.th-right .th-disp']);
  });
});

describe('when the board beat ends', () => {
  it('ends on the board being on the screen, not on a click', () => {
    // Read off the view the inbox is drawn in. The press is two deep and the
    // beat is about the board rather than about either press that reaches it,
    // so a click handler here would end the beat with the menu still open.
    expect(app).toMatch(/run\?\.step !== 'board' \|\| inboxDisplay\.view !== 'board'/);
    expect(app).toMatch(/inboxDisplay\.view !== 'board'\) return;\s*\n\s*setRun\(\(r\) => \(r \? stepTo\(r, 'command'\) : r\)\)/);
  });

  it('is what the tour hands on to, rather than the palette', () => {
    // The tour's own effect used to step straight to `command`. If this goes
    // back the board beat is in every list above and still never drawn.
    expect(app).toMatch(/!toured\.current\.has\(v\)\)\) return;\s*\n\s*setRun\(\(r\) => \(r \? stepTo\(r, 'board'\) : r\)\)/);
  });

  it('clears whatever is over the app and puts the walk on the inbox', () => {
    // The board lives on the Inbox, so the beat cannot start on the Team page
    // or under a modal left open by the beat before it.
    expect(app).toMatch(/if \(run\.step === 'board'\) \{ setModal\(null\); setFocused\(null\); setView\('inbox'\); \}/);
  });
});
