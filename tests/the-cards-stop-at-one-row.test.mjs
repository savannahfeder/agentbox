// THE CARDS STOP AT ONE ROW (w-b5f23cff71, then w-2b3e1a85e5).
//
// "There's a point after which we should stop expanding this section at the
// top because it completely overloads the space below." The screenshot had
// eleven cards and New teammate in four rows over an open chat, which left
// the chat a message box and two lines. The cards area drew every row until
// you dragged the grip, then two. Of five layouts drawn on 2026-10-28, the one
// picked was "the team at the top with the board below, and the team by
// default only showing one row". Now it draws one row, the rest scroll inside
// it, and a line under them says how many more there are; "Show fewer" puts
// it back. The grip still moves it between none and all, a whole row at a time.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { moreLine, readCardRows, rowsShown, writeCardRows } from '../renderer/src/team/everything/members.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('how many rows of cards show', () => {
  it('is one until you choose, however many there are', () => {
    expect(rowsShown(null, 4)).toBe(1);
    expect(rowsShown(null, 3)).toBe(1);
    expect(rowsShown(null, 2)).toBe(1);
  });

  it('is never more rows than there are', () => {
    expect(rowsShown(null, 1)).toBe(1);
    expect(rowsShown(null, 0)).toBe(0);
    expect(rowsShown(3, 2)).toBe(2);
    expect(rowsShown('all', 4)).toBe(4);
  });

  it('is what the grip left it at, down to none', () => {
    expect(rowsShown(3, 4)).toBe(3);
    expect(rowsShown(1, 4)).toBe(1);
    expect(rowsShown(0, 4)).toBe(0);
  });
});

describe('the line under the cards', () => {
  it('says how many more there are when rows are cut', () => {
    expect(moreLine(2, 4, 6)).toEqual({ words: 'Show 6 more', next: 'all' });
    expect(moreLine(1, 4, 9)).toEqual({ words: 'Show 9 more', next: 'all' });
  });

  // New teammate is a card but not a member; a row holding only it is not "1 more".
  it('says Show all when the only card past the cut is New teammate', () => {
    expect(moreLine(2, 3, 0)).toEqual({ words: 'Show all', next: 'all' });
  });

  it('brings the usual row back when the cards were dragged away', () => {
    expect(moreLine(0, 4, 12)).toEqual({ words: 'Show the cards', next: null });
  });

  it('offers fewer once every row of more than one shows', () => {
    expect(moreLine(4, 4, 0)).toEqual({ words: 'Show fewer', next: null });
    expect(moreLine(2, 2, 0)).toEqual({ words: 'Show fewer', next: null });
  });

  it('says nothing when one row holds every card', () => {
    expect(moreLine(1, 1, 0)).toBeNull();
    expect(moreLine(0, 0, 0)).toBeNull();
  });
});

describe('the choice', () => {
  const memory = () => {
    const box = new Map();
    return { box, store: { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, String(v)), removeItem: (k) => box.delete(k) } };
  };

  it('is the usual one when nothing was chosen', () => {
    expect(readCardRows({ getItem: () => null })).toBeNull();
  });

  it('is remembered: a count, none, or every row', () => {
    const { store } = memory();
    writeCardRows(3, store);
    expect(readCardRows(store)).toBe(3);
    writeCardRows(0, store);
    expect(readCardRows(store)).toBe(0);
    writeCardRows('all', store);
    expect(readCardRows(store)).toBe('all');
    writeCardRows(null, store);
    expect(readCardRows(store)).toBeNull();
  });

  it('is the usual one when what was kept makes no sense', () => {
    const { box, store } = memory();
    for (const bad of ['tall', '-1', '1.5', '']) {
      box.set('agentbox.everything.cardRows', bad);
      expect(readCardRows(store)).toBeNull();
    }
  });
});

describe('in the app', () => {
  const app = read('renderer/src/App.tsx');
  const area = read('renderer/src/team/everything/CardsArea.tsx');
  const css = read('renderer/src/team/everything/everything.css');

  it('draws the cards through the area that caps them, on every page they show on', () => {
    expect(app).toMatch(/<CardsArea rows=\{evRows\} onRows=\{setEvRows\}/);
    expect(app).not.toMatch(/evFill && evCardsH/);
  });

  it('scrolls the rows past the cut rather than drop them', () => {
    expect(css).toMatch(/\.ev-cards \{[^}]*overflow-y: auto/);
    expect(area).toMatch(/maxHeight/);
  });

  // Scrolled to its third row, the first build showed 4px of the second row's
  // border over it: 14px of padding over the first row, 10px between rows.
  it('scrolls a whole row at a time, with no sliver of the row above', () => {
    expect(css).toMatch(/\.ev-cards \{[^}]*scroll-snap-type: y mandatory/);
    expect(css).toMatch(/\.ev-strip \{[^}]*gap: 10px; padding: 10px /);
    expect(css).toMatch(/\.ev-cards \.ev-card \{[^}]*scroll-margin-top: 10px/);
  });

  it('brings the open card into view when it sits past the cut', () => {
    expect(area).toMatch(/scrollTop/);
  });

  // The first build kept every row open after "Show 6 more", and at three
  // cards a row that was five rows over a chat whose space measured 0px. It
  // is for finding someone, so picking them puts the usual row back, and only
  // the grip's choice is kept.
  it('folds Show N more back once a card is picked, and does not keep it', () => {
    expect(area).toContain('useLayoutEffect(() => { setOpen(false); }, [picked]);');
    expect(area).toMatch(/if \(line\?\.next === 'all'\) setOpen\(true\);/);
    expect(area).toContain('choice={choice} onRows={choose} />');
  });
});
