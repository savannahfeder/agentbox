// THE BEAT THAT PRESSES 1, AND WHY SHE NEVER SAW IT.
//
// It was not removed. Her walk skipped it, and her own ledger says how. The
// practice project keeps every walk that has ever run on this machine, and the
// four rows are processed in a recorded order. Four scripted walks in it go:
//
//    the two finished rows closed, the not-for-today row snoozed,
//    and the stopped row ANSWERED with "Option 1: Delete all three"
//
//    13:09:07  the STOPPED row, closed with E
//    13:09:11  a finished row, closed
//    13:09:14  the other finished row, closed
//    13:09:18  the not-for-today row, snoozed
//
// Every beat in the walk ends on "that row left the inbox". So `clear` ended at
// 13:09:14, `snooze` ended at 13:09:18, and `unblock` opened with its row
// eleven seconds gone: it was over in the render it began in and the card that
// says press 1 was never drawn. A script cannot catch this, because a script
// presses the keys in the order the beats expect.
//
// So these are the two halves of the fix, and the second one is the point: the
// stopped row cannot leave her inbox except by being answered, and the key that
// tries says which row it is and what to do with it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  beatRows, clearIds, closingRefused, finishedCleared, inboxCleared, laterCleared,
  laterIndex, pressAtWrongRow, snoozeRefused, waitingIndex,
} from '../renderer/src/onboarding.ts';
import { PRACTICE_ROWS } from '../shared/first-run-practice.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');

const WAITING_AT = waitingIndex(PRACTICE_ROWS);
const LATER_AT = laterIndex(PRACTICE_ROWS);
// The ids the store hands back, in the order the rows are declared, which is
// the link the walk itself relies on.
const IDS = PRACTICE_ROWS.map((_, i) => `w-example${i}`);
const walk = (step) => ({
  step, folder: '/tmp', name: 'Zero', product: 'zero', practice: 'practice',
  item: 'w-hers', sentAt: 1, examples: IDS,
});
const rows = (ids) => ids.map((id) => ({ id }));

describe('the row an agent is stopped on cannot be closed while the walk is on', () => {
  it('refuses E on it, and says which row and what to do instead', () => {
    const why = closingRefused(walk('clear'), IDS[WAITING_AT], WAITING_AT, LATER_AT);
    expect(why).toBe('That one is an agent stopped, waiting on you. Open it and answer it.');
    // No jargon, no key names she has not been taught, one sentence per idea.
    expect(why).not.toMatch(/inbox zero|beat|onboarding|item/i);
  });

  it('refuses S on it too, because putting it off empties the inbox the same way', () => {
    expect(snoozeRefused(walk('clear'), IDS[WAITING_AT], WAITING_AT)).toBeTruthy();
  });

  it('leaves the two finished rows alone, because E is the right key on those', () => {
    for (const [i, row] of PRACTICE_ROWS.entries()) {
      if (row.waiting || row.later) continue;
      expect(closingRefused(walk('clear'), IDS[i], WAITING_AT, LATER_AT)).toBe(null);
    }
  });

  it('refuses E on the not-for-today row and points at S, which is its own beat', () => {
    expect(closingRefused(walk('clear'), IDS[LATER_AT], WAITING_AT, LATER_AT))
      .toBe('That one is not finished. Press S to deal with it later.');
    // And S is right on that one, so it is not refused.
    expect(snoozeRefused(walk('clear'), IDS[LATER_AT], WAITING_AT)).toBe(null);
  });

  it('says nothing at all when no walk is running, or once it has landed', () => {
    expect(closingRefused(null, IDS[WAITING_AT], WAITING_AT, LATER_AT)).toBe(null);
    expect(closingRefused(walk('landed'), IDS[WAITING_AT], WAITING_AT, LATER_AT)).toBe(null);
    expect(snoozeRefused(walk('landed'), IDS[WAITING_AT], WAITING_AT)).toBe(null);
  });
});

describe('her own run, replayed by the clock', () => {
  // The walk's three list beats, as the app runs them: `clear` ends when the
  // two finished rows are gone, `snooze` when the not-for-today row is gone,
  // `unblock` when the stopped row is gone.
  const replay = (presses) => {
    let step = 'clear';
    let list = [...IDS];
    const seen = [step];
    for (const [id, key] of presses) {
      const refused = key === 'E'
        ? closingRefused(walk(step), id, WAITING_AT, LATER_AT)
        : snoozeRefused(walk(step), id, WAITING_AT);
      if (refused) continue;              // the key does nothing but speak
      list = list.filter((x) => x !== id);
      const at = rows(list);
      if (step === 'clear' && finishedCleared(at, walk(step), WAITING_AT, LATER_AT)) step = 'snooze';
      if (step === 'snooze' && laterCleared(at, walk(step), LATER_AT)) step = 'unblock';
      if (step === 'unblock' && inboxCleared(at, walk(step))) step = 'where';
      if (seen[seen.length - 1] !== step) seen.push(step);
    }
    return { seen, list };
  };

  it('reaches the beat that presses 1, and stops there with its row still in her inbox', () => {
    const { seen, list } = replay([
      [IDS[WAITING_AT], 'E'],   // 13:09:07 — refused now
      [IDS[0], 'E'],            // 13:09:11
      [IDS[1], 'E'],            // 13:09:14
      [IDS[LATER_AT], 'S'],     // 13:09:18
    ]);
    expect(seen).toEqual(['clear', 'snooze', 'unblock']);
    expect(seen).not.toContain('where');
    expect(list).toEqual([IDS[WAITING_AT]]);
  });

  it('is the run that used to end one beat early', () => {
    // The same four presses with nothing refused, which is what her Mac did.
    let step = 'clear';
    let list = [...IDS];
    for (const id of [IDS[WAITING_AT], IDS[0], IDS[1], IDS[LATER_AT]]) {
      list = list.filter((x) => x !== id);
      const at = rows(list);
      if (step === 'clear' && finishedCleared(at, walk(step), WAITING_AT, LATER_AT)) step = 'snooze';
      if (step === 'snooze' && laterCleared(at, walk(step), LATER_AT)) step = 'unblock';
      if (step === 'unblock' && inboxCleared(at, walk(step))) step = 'where';
    }
    expect(step).toBe('where');
    expect(list).toEqual([]);
  });
});

describe('every way a row leaves her inbox goes past the refusal', () => {
  it('the single close does', () => {
    expect(app).toMatch(/const markDone[\s\S]{0,900}?closingRefused\(run, item\.id, WAITING_AT, LATER_AT\)/);
  });

  it('a ticked selection does, so E over four ticks cannot take it out', () => {
    expect(app).toMatch(/const batchDone[\s\S]{0,900}?closingRefused\(run, i\.id, WAITING_AT, LATER_AT\)/);
  });

  it('and the snooze picker does', () => {
    // The window grew when the trouble row's own refusal went in above this
    // one, and again when the new-version row's did. Neither can carry a
    // moment, so both say so rather than swallowing the key. It is still the
    // same check on the same rows.
    expect(app).toMatch(/const openSnooze[\s\S]{0,1800}?snoozeRefused\(run, i\.id, WAITING_AT\)/);
  });
});


/* ------------------------------------------------------------------------- */
/*
 * AND THE SECOND ROUND OF IT, WHICH IS WHAT SHE ANSWERED WITH (2026-08-27).
 *
 * The refusal above landed and it was not enough, and her screenshot of it says
 * why in one frame: the coaching card beside the list reading "Close the two
 * that are finished with E" and, at the foot of the same window, the app's
 * answer to her E — "That one is an agent stopped, waiting on you. Open it and
 * answer it.
 *
 * Two things made that screen, and both are pinned below.
 *
 *   THE CARD NAMED NO ROW. Four rows, two of them finished, a ring round
 *   whichever the list drew first, and the person walking left to work out
 *   which two the sentence meant.
 *
 *   AND THE PRESS REACHED THE APP. E is the key that beat asks for, so the
 *   walk's own wrong-key guard had nothing to say about it, and the refusal
 *   printed underneath a card that was still giving the first instruction.
 *
 * MEASURED BOTH WAYS on the built app on 2026-08-27, driving the real walk:
 * before, E on the stopped row left `said` as that sentence with the card
 * unchanged behind it; after, `said` is null and the card has not moved. */

describe('the clearing beat points at one row, so there is never a second instruction', () => {
  const inbox = rows(IDS);
  const finished = IDS.filter((_, i) => i !== WAITING_AT && i !== LATER_AT);

  it('offers E on the finished rows and on neither of the other two', () => {
    const offered = beatRows('clear', walk('clear'), inbox, WAITING_AT, LATER_AT);
    expect(offered).toEqual(finished);
    expect(offered).not.toContain(IDS[WAITING_AT]);
    expect(offered).not.toContain(IDS[LATER_AT]);
  });

  it('walks them one at a time, so the ring moves as each one goes', () => {
    // `clearIds` is what the ring reads, and it is read off the DRAWN list. The
    // first entry is the row the card is about; closing it makes the second one
    // the row the card is about, with no press counter anywhere.
    expect(clearIds(inbox, walk('clear'), WAITING_AT, LATER_AT)[0]).toBe(finished[0]);
    const after = rows(IDS.filter((id) => id !== finished[0]));
    expect(clearIds(after, walk('clear'), WAITING_AT, LATER_AT)).toEqual([finished[1]]);
    const both = rows(IDS.filter((id) => !finished.includes(id)));
    expect(clearIds(both, walk('clear'), WAITING_AT, LATER_AT)).toEqual([]);
  });

  it('stops E aimed at the row an agent is stopped on, which is her own press', () => {
    const offered = beatRows('clear', walk('clear'), inbox, WAITING_AT, LATER_AT);
    expect(pressAtWrongRow(offered, IDS[WAITING_AT])).toBe(true);
    expect(pressAtWrongRow(offered, IDS[LATER_AT])).toBe(true);
  });

  it('lets E through on EITHER finished row, not only the ringed one', () => {
    // THE RING CAN ONLY BE ROUND ONE OF THEM AT A TIME AND THE KEY IS RIGHT ON
    // BOTH. Swallowing E on the second finished row because the ring is on the
    // first would be the walk refusing a correct move, which is a worse fault
    // than the one being fixed here.
    const offered = beatRows('clear', walk('clear'), inbox, WAITING_AT, LATER_AT);
    for (const id of finished) expect(pressAtWrongRow(offered, id)).toBe(false);
  });

  it('guards the other two beats by their own row, and nothing while a picker is up', () => {
    expect(beatRows('snooze', walk('snooze'), inbox, WAITING_AT, LATER_AT)).toEqual([IDS[LATER_AT]]);
    expect(beatRows('unblock', walk('unblock'), inbox, WAITING_AT, LATER_AT)).toEqual([IDS[WAITING_AT]]);
    // Once the picker or the reading pane is open the press is about THAT and
    // no row is being pointed at, so nothing is guarded and nothing is eaten.
    expect(beatRows('snooze', walk('snooze'), inbox, WAITING_AT, LATER_AT, { picking: true })).toEqual([]);
    expect(beatRows('unblock', walk('unblock'), inbox, WAITING_AT, LATER_AT, { opened: true })).toEqual([]);
  });

  it('guards nothing on a beat that is not about a row, and nothing with no row under the keys', () => {
    for (const step of ['make', 'task', 'working', 'open', 'answer', 'note', 'where', 'command']) {
      expect(beatRows(step, walk(step), inbox, WAITING_AT, LATER_AT), step).toEqual([]);
      expect(pressAtWrongRow([], IDS[0]), step).toBe(false);
    }
    const offered = beatRows('clear', walk('clear'), inbox, WAITING_AT, LATER_AT);
    expect(pressAtWrongRow(offered, null)).toBe(false);
    expect(pressAtWrongRow(offered, undefined)).toBe(false);
  });

  it('never points at a row that is not in the list', () => {
    // A row cleared out of order used to leave the ring pointing at nothing.
    // Everything here is filtered against the drawn list, so an empty answer is
    // the honest one and the guard falls away with it.
    const gone = rows([IDS[WAITING_AT]]);
    expect(beatRows('clear', walk('clear'), gone, WAITING_AT, LATER_AT)).toEqual([]);
    expect(beatRows('snooze', walk('snooze'), gone, WAITING_AT, LATER_AT)).toEqual([]);
    expect(pressAtWrongRow(beatRows('clear', walk('clear'), gone, WAITING_AT, LATER_AT), IDS[WAITING_AT])).toBe(false);
  });
});

describe('the card and the app cannot give two instructions at once', () => {
  const view = fs.readFileSync(path.join(root, 'renderer/src/components/Onboarding.tsx'), 'utf8');

  it('answers the right key on the wrong row with the cap, the way a wrong key is answered', () => {
    expect(view).toMatch(/keyToken\(e\) === say\.key && pressAtWrongRow\(/);
    // And it stops the press before the app can see it and refuse it out loud.
    expect(view).toMatch(/pressAtWrongRow[\s\S]{0,400}?stopImmediatePropagation/);
  });

  it('rings the row the clearing beat is about, not whichever the list drew first', () => {
    expect(view).toMatch(/const clearing = run\.step === 'clear' \? beat\?\.\[0\] \?\? null : null/);
    expect(view).toMatch(/clearing[\s\S]{0,120}?data-item-id="\$\{clearing\}"/);
  });

  it('leaves the app-side refusals in place for the routes that are not the keyboard', () => {
    // The reading pane's own button, a ticked selection and ⌘K do not go past
    // the walk's keydown listener, so `closingRefused` is still the thing that
    // protects the row on those. The three tests at the foot of this file pin
    // the callers; this one pins that the sentence itself has not been deleted
    // as newly unreachable.
    expect(closingRefused(walk('clear'), IDS[WAITING_AT], WAITING_AT, LATER_AT)).toBeTruthy();
  });
});

describe('the two lights on the clearing beat can actually fill in', () => {
  const view = fs.readFileSync(path.join(root, 'renderer/src/components/Onboarding.tsx'), 'utf8');

  it('counts the beat\'s own rows rather than every row on the screen', () => {
    // THE ARITHMETIC THAT WAS WRONG, and it was wrong in the shipped app.
    // `Lights` subtracted the number of rows in the whole pane from the number
    // of lights: two lights, four rows, `2 - 4` is negative and the floor at
    // zero swallowed it. MEASURED on the built app on 2026-08-27 before the
    // fix: four rows nothing lit, three rows nothing lit, two rows nothing lit.
    // Neither key had ever filled in on anybody's walk since the snooze row
    // went in on 08-24, and the harness shot named "the first light filled in"
    // was a photograph of two empty keys.
    const lit = (of, left) => Math.max(0, Math.min(of, of - left));
    expect(lit(2, 4)).toBe(0);
    expect(lit(2, 3)).toBe(0);
    // What it is handed now is the finished rows still in the inbox, which is
    // two at the start of the beat and one after the first press.
    expect(lit(2, 2)).toBe(0);
    expect(lit(2, 1)).toBe(1);
    expect(lit(2, 0)).toBe(2);
  });

  it('takes that count from the app rather than tallying key presses', () => {
    // The reason for the count coming off the drawn list has not changed: a
    // press that closed nothing, an E typed into a field or a row closed with
    // the mouse would all put a tally out of step with the screen.
    expect(view).toMatch(/<Lights of=\{say\.caps\} cap=\{say\.key\} left=\{beat\?\.length\}/);
    expect(view).toMatch(/function Lights\(\{ of, cap, left: given \}/);
  });
});
