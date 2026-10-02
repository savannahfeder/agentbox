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
// the row chip, the hover plate, ⌘K, the shortcuts page, the tutorial and the
// two refusal sentences the tutorial speaks.
//
// WHAT THIS FILE IS FOR, AND IT IS NOT THE LETTER. It is that there is ONE
// answer per letter and that every surface reads it off the same place. The
// surfaces are listed out below precisely because the fault was never in any
// one of them: each was locally correct and they disagreed.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HINTS } from '../renderer/src/hint-plate.ts';
import { OPENS_A_TEXT_FIELD } from '../renderer/src/keys.ts';
import { SHORTCUTS, everyKey } from '../renderer/src/shortcuts.ts';
import { rowKeys } from '../renderer/src/list-rules.ts';
import { closingRefused, coach, laterIndex, waitingIndex } from '../renderer/src/onboarding.ts';
import { PRACTICE_ROWS } from '../shared/first-run-practice.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('renderer/src/App.tsx');
const summary = read('renderer/src/threads/Summary.tsx');

/** Every row of the shortcuts page that draws a given cap. */
const rowsFor = (cap) => SHORTCUTS.flatMap((g) => g.keys).filter((k) => k.keys.includes(cap));

describe('the app answers L for later and S for the summary', () => {
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

  it('leaves S to the summary panel, which owns it in its own component', () => {
    expect(summary).toContain("if (e.key !== 's' && e.key !== 'S') return;");
    expect(summary).toContain("window.addEventListener('keydown', onKey, true);");
    // It still stops the key, which is the right shape for a component that
    // owns one whatever else happens to be bound.
    expect(summary).toContain('e.stopImmediatePropagation();');
  });

  it('swallows the press that opens the picker, and only the ones with a field', () => {
    // The picker focuses a text field the moment it opens, so the keystroke
    // that opened it would be typed into that field. The whole story is in
    // tests/shortcuts-swallow-their-key.test.mjs.
    expect([...OPENS_A_TEXT_FIELD]).toContain('l');
    // The summary panel has no field in it, so S needs no swallow.
    expect([...OPENS_A_TEXT_FIELD]).not.toContain('s');
  });
});

describe('every surface that says a key says the same one', () => {
  it('the hover plate on a row', () => {
    expect(HINTS.row.map((l) => l.key)).toEqual(['↵', 'E', 'L']);
    expect(HINTS.row.find((l) => l.key === 'L').what).toBe('Schedule for later');
    // S is on no plate but the Summary button's own. The button used to print
    // its S on its face; since keys are shown on hover and not on a button
    // (w-5984544441), that plate is where S is said, and it is the only one.
    for (const [name, lines] of Object.entries(HINTS)) {
      for (const line of lines) if (name !== 'summary') expect(line.key, `${line.what} is on S`).not.toBe('S');
    }
    expect(HINTS.summary).toEqual([{ key: 'S', what: 'Show or hide the summary' }]);
  });

  it('the chip drawn on a row while the tutorial is on', () => {
    expect(rowKeys('inbox').map((k) => k.key)).toEqual(['R', 'E', 'L']);
    expect(rowKeys('snoozed').map((k) => k.key)).toEqual(['E', 'L']);
    for (const view of ['inbox', 'snoozed', 'progress', 'done']) {
      expect(rowKeys(view).some((k) => k.key === 'S'), view).toBe(false);
    }
  });

  it('the ⌘K rows, both the single one and the one over a ticked selection', () => {
    expect(app).toContain("{ id: 'snooze', label: 'Remind Me (Snooze)', keyHint: 'L', run: () => openSnooze(target) },");
    expect(app).toContain("keyHint: 'L', run: () => openSnooze(sel) },");
    expect(app).not.toMatch(/keyHint: 'S'/);
  });

  it('the shortcuts page, which is the one page that promises to answer this', () => {
    // One row per letter, and each says the one thing its letter does.
    expect(rowsFor('L')).toHaveLength(1);
    expect(rowsFor('L')[0].what).toBe('Put the task off until a time you pick.');
    expect(rowsFor('S')).toHaveLength(1);
    expect(rowsFor('S')[0].what).toBe('Show or hide the summary.');
    // S is listed under the heading for an open thread, because that is the one
    // place it works. The handler behind each of these caps is checked in
    // tests/the-shortcuts-page-lists-keys-that-work.test.mjs.
    const group = SHORTCUTS.find((g) => g.keys.some((k) => k.keys.includes('S')));
    expect(group.label).toBe('In a task you have opened');
    expect(everyKey()).toContain('L');
    expect(everyKey()).toContain('S');
  });

  it('the tutorial, on the beat that teaches putting work off', () => {
    const say = coach('snooze', 0);
    expect(say.key).toBe('L');
    // The key alone: the beat named a click for an hour on 2026-10-01 and the
    // chip it pointed at exists only inside the tutorial, which is written up
    // in tests/every-tutorial-beat-says-what-to-click.test.mjs. What this file
    // is about is unchanged, which is that the letter is L.
    expect(`${say.lead}${say.key}${say.tail}`).toBe('Press L to deal with it later.');
  });

  it('the tutorial refusal that sends somebody to the other key', () => {
    // The walk refuses E on the row that is real work and not for today, and
    // the sentence names the key that IS right for it. Naming a key the app no
    // longer answers would be the worst version of this fault: the one place
    // somebody is being taught.
    // The walk's own rows, in the order it stages them, which is the link the
    // refusals read: the row that is real work and not for today is the one at
    // `laterIndex`. Walked at length in
    // tests/the-walk-keeps-the-beat-that-presses-one.test.mjs.
    const ids = PRACTICE_ROWS.map((_, i) => `w-example${i}`);
    const run = {
      step: 'clear', folder: '/tmp', name: 'Zero', product: 'zero',
      practice: 'practice', item: 'w-hers', sentAt: 1, examples: ids,
    };
    const later = laterIndex(PRACTICE_ROWS);
    const refused = closingRefused(run, ids[later], waitingIndex(PRACTICE_ROWS), later);
    expect(refused).toBe('That one is not finished. Press L to deal with it later.');
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
    // And both of this round's letters are in that sweep rather than beside it.
    expect(letters).toContain('L');
    expect(letters).toContain('S');
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
