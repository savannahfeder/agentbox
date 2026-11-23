// ONE LETTER, ONE MEANING, EVERYWHERE IN THE APP.
//
// S MEANT TWO THINGS FOR A DAY. The approved thread top bar prints S on the
// Summary button (w-e731ca9376), and the window's own key handler read S as
// "put this off" both in the list and inside an open thread. Two handlers, one
// press: threads/Summary.tsx listens in the capture phase and stopped the key
// there, so on a thread WITH a summary the panel won and the picker did not
// open, and everywhere else S opened the picker. An office manager testing the
// app on 2026-10-01 hit both inside a minute, which is how it was found.
//
// Nothing was broken in the sense of throwing. What was broken is the thing a
// shortcut is for: S did not mean anything. The hint plate said "Schedule for
// later", the thread's own button said Summary, the shortcuts page said "Put
// the task off until a time you pick", and all three were on the screen in the
// same hour.
//
// THE DECISION. Summary keeps S, which is the half that was approved. Later
// takes L, which nothing else in the app uses and which is the word the row
// already draws. Then every place that says a key for either says the same one:
// the row keys, the hover plate, ⌘K and the shortcuts page. (The old walk's
// card and refusals said it too; they went with it, 2026-11-21.)
//
// WHAT THIS FILE IS FOR, AND IT IS NOT THE LETTER. It is that there is ONE
// answer per letter and that every surface reads it off the same place. The
// surfaces are listed out below precisely because the fault was never in any
// one of them: each was locally correct and they disagreed.
//
// AND S MEANS NOTHING SINCE 2026-11 (w-d143fcb40a). The side summary it opened
// had been unreachable since every thread opened on the one-at-a-time page, so
// it was taken out, and S with it. Nothing may say S until something answers it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HINTS } from '../renderer/src/hint-plate.ts';
import { OPENS_A_TEXT_FIELD } from '../renderer/src/keys.ts';
import { SHORTCUTS, everyKey } from '../renderer/src/shortcuts.ts';
import { rowKeys } from '../renderer/src/list-rules.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');

/** Every row of the shortcuts page that draws a given cap. */
const rowsFor = (cap) => SHORTCUTS.flatMap((g) => g.keys).filter((k) => k.keys.includes(cap));

describe('the app answers L for later, and nothing answers S', () => {
  it('binds L in both branches of the key handler and S in neither', () => {
    // The focused branch, with a thread open in front of somebody.
    expect(app).toContain("else if (e.key === 'l' || e.key === 'L') openSnooze(focused);");
    // The list switch, with nothing open.
    expect(app).toContain("case 'l': case 'L':");
    // AND THE OLD BINDING IS GONE RATHER THAN SHADOWED. It worked up to the day
    // it moved only because the summary's capture-phase listener got there
    // first, which is the kind of correctness that breaks when somebody deletes
    // a line in another file.
    expect(app).not.toContain("e.key === 's' || e.key === 'S') openSnooze");
    expect(app).not.toContain("case 's': case 'S':");
  });


  it('swallows the press that opens the picker, and only the ones with a field', () => {
    // The picker focuses a text field the moment it opens, so the keystroke
    // that opened it would be typed into that field. The whole story is in
    // tests/shortcuts-swallow-their-key.test.mts.
    expect([...OPENS_A_TEXT_FIELD]).toContain('l');
    expect([...OPENS_A_TEXT_FIELD]).not.toContain('s');
  });
});

describe('every surface that says a key says the same one', () => {
  it('the hover plate on a row', () => {
    expect(HINTS.row.map((l) => l.key)).toEqual(['↵', 'E', 'L']);
    expect(HINTS.row.find((l) => l.key === 'L').what).toBe('Schedule for later');
    for (const lines of Object.values(HINTS)) {
      for (const line of lines) expect(line.key, `${line.what} is on S`).not.toBe('S');
    }
  });

  it('the keys a row offers', () => {
    expect(rowKeys('inbox').map((k) => k.key)).toEqual(['R', 'E', 'L']);
    expect(rowKeys('snoozed').map((k) => k.key)).toEqual(['E', 'L']);
    for (const view of ['inbox', 'snoozed', 'progress', 'done']) {
      expect(rowKeys(view).some((k) => k.key === 'S'), view).toBe(false);
    }
  });

  it('the ⌘K rows, both the single one and the one over a ticked selection', () => {
    expect(app).toContain("{ id: 'snooze', label: 'Later', keywords: LATER_KEYWORDS, oldNames: LATER_OLD_NAMES, keyHint: 'L', run: () => openSnooze(target) },");
    expect(app).toContain("keyHint: 'L', run: () => openSnooze(sel) },");
    expect(app).not.toMatch(/keyHint: 'S'/);
  });

  it('the shortcuts page, which is the one page that promises to answer this', () => {
    // One row per letter, and each says the one thing its letter does.
    expect(rowsFor('L')).toHaveLength(1);
    expect(rowsFor('L')[0].what).toBe('Later: put the task off until a time you pick.');
    expect(rowsFor('S')).toHaveLength(0);
    expect(everyKey()).toContain('L');
    expect(everyKey()).not.toContain('S');
  });
});

describe('no letter in the app means two things', () => {
  // THE SWEEP, OVER THE LETTERS. Every letter the shortcuts page draws, against
  // every row that draws it: a letter with two sentences is this fault coming
  // back. It is the page rather than the handlers because the page is what
  // somebody reads when a key surprises them, and a page listing one letter
  // twice is the thing that cannot be read.
  //
  // IT IS THE LETTERS AND NOT THE GLYPHS, and the difference is not a hedge.
  // ↵, ↑ and ↓ each have two sentences on that page on purpose: ↵ opens the row
  // in the inbox and sends the selected option in a thread, and the arrows walk
  // the list in one place and an agent's options in the other. Those keys are
  // read off whatever is in front of somebody, the way they are in every app,
  // and the page's headings are what say which. A LETTER IS NOT LIKE THAT HERE:
  // E closes and R replies wherever you are, so a letter with two meanings is
  // a letter with none, which is exactly what S became.
  it('gives every letter on the shortcuts page exactly one sentence', () => {
    const letters = [...new Set(everyKey())].filter((cap) => /^[A-Z]$/.test(cap));
    expect(letters.length).toBeGreaterThan(6);
    const twice = letters.filter((cap) => new Set(rowsFor(cap).map((k) => k.what)).size > 1);
    expect(twice).toEqual([]);
    expect(letters).toContain('L');
  });

  // AND THE SAME ACROSS THE SURFACES, for the keys a row can draw. The plate
  // and the chip are two drawings of one promise about one row, so a letter
  // that appears in both has to mean the same thing in both. This is the
  // comparison nobody was making, and it is the whole fault: "S Schedule for
  // later" on the plate while the thread top bar printed S on Summary.
  it('gives every letter the row draws one meaning on the plate as well', () => {
    const plate = new Map(HINTS.row.map((l) => [l.key, l.what.toLowerCase()]));
    const chip = new Map(rowKeys('inbox').map((k) => [k.key, k.word.toLowerCase()]));
    for (const [key, word] of chip) {
      if (!plate.has(key)) continue;
      // Not the same words, which they never were: the plate has room for a
      // fragment and the chip has room for one word. What must hold is that
      // one is inside the other, so the two cannot be about different actions.
      const said = plate.get(key);
      expect(said.includes(word) || word.includes(said.split(' ')[0]), `${key}: "${said}" vs "${word}"`).toBe(true);
    }
  });
});
