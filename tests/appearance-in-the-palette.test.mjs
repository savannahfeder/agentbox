// 2026-09-14: mode switching now selects Frost/Valley Haze; plain looks remain in the picker.
// ⌘K and the themes: what she types, and whether anything comes back.
//
// Nothing in the app logged anything when that happened, because nothing was
// broken in the sense a program can notice: the palette filtered on labels, the
// labels did not contain the words people type, and an empty list is a legal
// answer to a query. The only way to catch it is to type those words at it,
// which is this file. Every case below is a real query turned into a test.

import { describe, expect, it } from 'vitest';
import { emptyLine, lookRows, matchesQuery } from '../renderer/src/palette-rows.ts';
import { SKINS, lookMeans } from '../renderer/src/skins.ts';

// A real picture off the list, never a name typed in here: Mountain was removed
// on 2026-08-18 and every test that had spelled it out would have failed for the
// wrong reason (tests/skin-choice.test.mjs made the same move).
const PICTURE = SKINS.find(s => !s.light).id;
const LOOKS = ['light', 'dark', PICTURE];

const find = (look, query) => lookRows(look).filter((r) => matchesQuery(query, r));

describe('matchesQuery', () => {
  it('matches a label', () => {
    expect(matchesQuery('inbox', { label: 'Inbox' })).toBe(true);
  });

  it('matches every word of the query in any order', () => {
    const row = { label: 'Switch to dark', keywords: 'light mode dark mode' };
    expect(matchesQuery('dark mode', row)).toBe(true);
    expect(matchesQuery('mode dark', row)).toBe(true);
  });

  it('needs every word, not just one', () => {
    expect(matchesQuery('dark inbox', { label: 'Switch to dark' })).toBe(false);
  });

  it('matches keywords the label does not say', () => {
    expect(matchesQuery('wallpaper', { label: 'Switch to Lake', keywords: 'wallpaper' })).toBe(true);
  });

  it('is not fuzzy: a word that is not there does not match', () => {
    expect(matchesQuery('drak', { label: 'Switch to dark' })).toBe(false);
  });

  it('an empty query keeps every row', () => {
    expect(matchesQuery('   ', { label: 'anything' })).toBe(true);
  });
});

describe('typing "dark", from anywhere', () => {
  // THE REPORTED BUG. On a picture the rows were "Turn off Lake" and "Switch to
  // light", so this returned nothing at all and read as an app that did not
  // know it was in dark mode.
  for (const look of LOOKS) {
    it(`finds exactly one row from ${look}`, () => {
      expect(find(look, 'dark').map((r) => r.id)).toEqual(['theme']);
    });

    it(`finds the same one row from ${look} when she types "dark mode"`, () => {
      expect(find(look, 'dark mode').map((r) => r.id)).toEqual(['theme']);
    });
  }

  it('toggles to light when she is already dark', () => {
    expect(find('dark', 'dark')[0].to).toBe('frost-haze');
  });

  it('toggles to light when she is wearing a picture, which is dark', () => {
    expect(find(PICTURE, 'dark')[0].to).toBe('frost-haze');
  });

  it('goes to dark when she is in light', () => {
    expect(find('light', 'dark')[0].to).toBe('valley-haze');
  });
});

describe('typing "light", from anywhere', () => {
  for (const look of LOOKS) {
    it(`finds the same single toggle row from ${look}`, () => {
      expect(find(look, 'light').map((r) => r.id)).toEqual(['theme']);
    });
  }

  it('toggles to dark when she is already light', () => {
    expect(find('light', 'light')[0].to).toBe('valley-haze');
  });
});

describe('the toggle uses the two Haze defaults', () => {
  for (const look of LOOKS) {
    for (const query of ['dark', 'light', 'dark mode', 'light mode']) {
      it(`"${query}" from ${look} lands on the matching Haze default`, () => {
        for (const row of find(look, query)) {
          expect(['frost-haze', 'valley-haze']).toContain(row.to);
        }
      });
    }
  }
});

describe('every row says where it lands', () => {
  // The older law, measured before it shipped: "Switch to light" off a picture
  // once landed on plain dark. The label names the destination, so it cannot.
  for (const look of LOOKS) {
    for (const row of lookRows(look)) {
      it(`${look}: "${row.label}" is honest`, () => {
        const dest = lookMeans(row.to);
        if (row.label === 'Switch to light') expect(dest).toEqual({ theme: 'light', skin: 'frost-haze' });
        if (row.label === 'Switch to dark') expect(dest).toEqual({ theme: 'dark', skin: 'valley-haze' });
      });
    }
  }
});

// TYPING "THEME" REACHES THE PICKER, AND THE PICKER IS ALL IT REACHES.
//
// This block used to say the opposite. It asserted that "theme" returned a row
// for every one of the pictures, which was an earlier fix from back when there
// was no picker at all.
//
// The old assertions are inverted rather than dropped: the words she reaches
// for must still land somewhere, and that somewhere is one row now.
describe('typing "theme" reaches the picker', () => {
  it('finds the picker from light', () => {
    expect(find('light', 'theme').map((r) => r.id)).toContain('theme-picker');
  });

  it('finds it by the plural too, which is the word she typed', () => {
    expect(find('light', 'themes').map((r) => r.id)).toContain('theme-picker');
  });

  it('opens the picker rather than setting a look', () => {
    const picker = find('light', 'theme').find((r) => r.id === 'theme-picker');
    expect(picker.opens).toBe('themes');
    expect(picker.to).toBeUndefined();
  });

  it('finds the way back out while she is wearing one', () => {
    expect(find(PICTURE, 'theme').map((r) => r.id)).toContain('theme-off');
  });

  it('does not put the light/dark toggle under that word', () => {
    for (const look of LOOKS) {
      expect(find(look, 'theme').map((r) => r.id)).not.toContain('theme');
    }
  });

  it('still lands on something for the words she might reach for', () => {
    for (const query of ['background', 'picture', 'wallpaper', 'photo', 'skin', 'look']) {
      const ids = find('light', query).map((r) => r.id);
      expect(ids, query).toContain('theme-picker');
    }
  });
});

// THE COUNT IS THE POINT OF HER REPORT, so it is pinned as a number and not
// only as an absence. Measured on the built app, 2026-08-28: hitting ⌘K with
// nothing typed drew 48 rows, 16 of them pictures. It draws 32 now, and typing
// "theme" went from 18 rows to 2.
describe('no picture is a row of its own', () => {
  it('offers no skin row from any look', () => {
    for (const look of LOOKS) {
      expect(lookRows(look).filter((r) => r.id.startsWith('skin-')), look).toEqual([]);
    }
  });

  it('cannot be reached by a picture own name any more', () => {
    for (const sk of SKINS) {
      expect(find('light', sk.name.toLowerCase()), sk.name).toEqual([]);
    }
  });

  // The guard is loose on purpose. What must hold is that the appearance
  // section stops growing when a picture is added, so this pins the ceiling and
  // only checks that there are enough pictures for the ceiling to mean
  // anything. Pinning SKINS.length exactly would fail the next time someone
  // adds a theme, which is not the thing worth failing over.
  it('is at most four rows however many pictures exist', () => {
    expect(SKINS.length, 'too few pictures for this to prove anything').toBeGreaterThan(10);
    for (const look of LOOKS) expect(lookRows(look).length, look).toBeLessThanOrEqual(4);
  });
});

// WHEN NOTHING COMES BACK.The divider now has a line under it to divide, and
// this pins the words of it, because the app already says this exact sentence
// when task search comes back empty (App.tsx) and the two must not drift
// apart.
describe('nothing matched', () => {
  it('says the sentence task search says, with her words in it', () => {
    expect(emptyLine('theme')).toBe('Nothing matches “theme”.');
  });

  it('echoes exactly what was typed, stray character and all', () => {
    expect(emptyLine('drak')).toBe('Nothing matches “drak”.');
    expect(emptyLine('dark mode')).toBe('Nothing matches “dark mode”.');
  });

  it('does not echo the surrounding space she did not mean to type', () => {
    expect(emptyLine('  theme  ')).toBe('Nothing matches “theme”.');
  });

  // A pasted paragraph is a real way to empty this list, and the line has one
  // row's worth of width to say it in.
  it('clips a long query rather than running off the row', () => {
    const line = emptyLine('a'.repeat(200));
    expect(line).toBe(`Nothing matches “${'a'.repeat(32)}…”.`);
    expect(line.length).toBeLessThan(60);
  });

  // Measured in the real palette on 2026-08-18: this sentence clipped to
  // "over t…", which reads as a rendering fault rather than as a quotation.
  it('clips at a word, never mid-letter', () => {
    expect(emptyLine('the quick brown fox jumps over the lazy dog'))
      .toBe('Nothing matches “the quick brown fox jumps over…”.');
  });

  it('leaves a query that fits exactly alone', () => {
    expect(emptyLine('b'.repeat(32))).toBe(`Nothing matches “${'b'.repeat(32)}”.`);
  });
});

// THE LINE ONLY EVER APPEARS WHEN THE LIST IS EMPTY, so the state it describes
// has to be reachable at all: an empty query matches everything, and these are
// the words that must never land here.
describe('the empty state is not reachable by her real words', () => {
  for (const look of LOOKS) {
    for (const query of ['dark', 'light', 'dark mode', 'theme', 'background', 'picture', 'wallpaper', 'photo']) {
      it(`"${query}" from ${look} finds a row, so nothing-matched never shows`, () => {
        expect(find(look, query).length).toBeGreaterThan(0);
      });
    }
  }
});
