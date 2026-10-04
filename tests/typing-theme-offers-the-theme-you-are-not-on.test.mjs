// TYPING "THEME" OFFERS THE THEME YOU ARE NOT ON, FIRST (w-e5f31083ff).
//
// What broke: on Light, ⌘K "them" listed Theme: Light (hinted "on now") at the
// top, under the return key, then Theme: Dark, then Match system. The one row
// that does nothing was the one Enter would press. Measured off lookRows: for
// every one of the three looks, all three rows came back for "theme", in the
// fixed order Light, Dark, Match system, so on Light the first row was always
// the theme already on.
//
// The ask: there are two themes, so typing "theme" is asking for the other
// one. The row for the look already on is gone, and the row that changes what
// the window looks like goes first. On Match system that is the opposite of
// what the Mac is showing right now, so the palette is told which way it
// points.
import { describe, it, expect } from 'vitest';
import { lookRows, matchesQuery } from '../renderer/src/palette-rows.ts';

const typed = (q, look, machine) =>
  lookRows(look, machine).filter((r) => matchesQuery(q, r)).map((r) => r.id);

describe('typing "theme"', () => {
  it('on Light, offers Dark first and never Light', () => {
    expect(typed('theme', 'light', 'dark')).toEqual(['theme-dark', 'theme-match']);
    expect(typed('them', 'light', 'light')).toEqual(['theme-dark', 'theme-match']);
  });

  it('on Dark, offers Light first and never Dark', () => {
    expect(typed('theme', 'ember-grid', 'dark')).toEqual(['theme-light', 'theme-match']);
    expect(typed('theme', 'ember-grid', 'light')).toEqual(['theme-light', 'theme-match']);
  });

  it('on Match system with a dark Mac, offers Light first, then Dark', () => {
    expect(typed('theme', 'match', 'dark')).toEqual(['theme-light', 'theme-dark']);
  });

  it('on Match system with a light Mac, offers Dark first, then Light', () => {
    expect(typed('theme', 'match', 'light')).toEqual(['theme-dark', 'theme-light']);
  });
});

describe('the look already on is never a row', () => {
  it('whatever is typed', () => {
    for (const [look, id] of [['light', 'theme-light'], ['ember-grid', 'theme-dark'], ['match', 'theme-match']]) {
      for (const machine of ['light', 'dark']) {
        for (const q of ['', 'theme', 'light', 'dark', 'system', 'appearance']) {
          expect(typed(q, look, machine), `${look} / ${machine} / "${q}"`).not.toContain(id);
        }
      }
    }
  });

  it('always leaves exactly two rows to choose from', () => {
    for (const look of ['light', 'ember-grid', 'match']) {
      for (const machine of ['light', 'dark']) {
        expect(lookRows(look, machine), `${look} / ${machine}`).toHaveLength(2);
      }
    }
  });
});

describe('the words that are not "theme" still land', () => {
  it('"dark" on Light finds Dark, and "light" on Dark finds Light', () => {
    expect(typed('dark', 'light', 'dark')).toEqual(['theme-dark']);
    expect(typed('light', 'ember-grid', 'dark')).toEqual(['theme-light']);
  });

  it('"system" finds Match system from either theme, and nothing once on it', () => {
    expect(typed('system', 'light', 'dark')).toEqual(['theme-match']);
    expect(typed('system', 'ember-grid', 'dark')).toEqual(['theme-match']);
    expect(typed('system', 'match', 'dark')).toEqual([]);
  });
});
