// YOUR ACTIONS READ AS A SHORT TIMELINE: A RING, A FEW WORDS, A SMALL TIME (w-49b4e45403).
//
// The first build drew each action as a grey sentence with a long time after
// it ("You snoozed it until tomorrow 9:00am  Thu, Oct 1 3:35pm") and was
// called "very ugly". Three rounds of drawings later the chosen one was the
// timeline (round3-2, then round4-single): a small ring at the column's edge,
// the action in a few words ("Snoozed until tomorrow 9:00am", "Picked <the
// option>"), and the time in the header's small mono caps ("THU 4:10PM"). A
// pick wears a filled dot. A hairline joins the rings only when actions come
// back to back; most come one at a time.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actWords, actWhen } from '../renderer/src/act-line.ts';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
const NOW = at(4, 15); // Sunday 4 October 2026, 3pm

describe('the words', () => {
  it('drops "You" and "it" from a snooze', () => {
    expect(actWords({ verb: 'You snoozed it', subject: 'until tomorrow 9:00am' }))
      .toEqual({ lead: 'Snoozed until tomorrow 9:00am', choice: null, picked: false });
  });

  it('reads a pick as "Picked" and the option, without its number', () => {
    expect(actWords({ verb: 'You picked option 1', subject: 'Sign the listing copy' }))
      .toEqual({ lead: 'Picked', choice: 'Sign the listing copy', picked: true });
  });

  it('keeps the rest of your actions, capitalised', () => {
    expect(actWords({ verb: 'You marked it done', subject: '' }).lead).toBe('Marked it done');
    expect(actWords({ verb: 'You brought it back', subject: '' }).lead).toBe('Brought it back');
    expect(actWords({ verb: 'You renamed it', subject: 'was "Old name"' }).lead).toBe('Renamed it, was "Old name"');
  });

  it('puts a teammate\'s name where "You" was', () => {
    expect(actWords({ verb: 'You snoozed it', subject: 'until 5:00pm' }, 'Ana').lead).toBe('Ana snoozed until 5:00pm');
    expect(actWords({ verb: 'You picked option 2', subject: 'Later' }, 'Ana')).toEqual({ lead: 'Ana picked', choice: 'Later', picked: true });
  });
});

describe('the time', () => {
  it('says today and yesterday', () => {
    expect(actWhen(at(4, 13, 10), NOW)).toBe('TODAY 1:10PM');
    expect(actWhen(at(3, 9, 5), NOW)).toBe('YESTERDAY 9:05AM');
  });

  it('says the weekday inside a week, and the date past it', () => {
    expect(actWhen(at(1, 16, 10), NOW)).toBe('THU 4:10PM');
    expect(actWhen(new Date(2026, 8, 7, 16, 10).getTime(), NOW)).toBe('SEP 7 4:10PM');
    // Six days back is still a weekday; seven is a date, or two Mondays would read alike.
    expect(actWhen(new Date(2026, 8, 28, 16).getTime(), NOW)).toBe('MON 4:00PM');
    expect(actWhen(new Date(2026, 8, 27, 16).getTime(), NOW)).toBe('SEP 27 4:00PM');
  });
});

describe('the line on screen', () => {
  it('is a ring, the words and the mono time; a pick fills the ring', () => {
    const src = read('renderer/src/components/Thread.tsx');
    expect(src).toMatch(/actWords\(/);
    expect(src).toMatch(/actWhen\(/);
    const css = read('renderer/src/styles.css');
    expect(css).toMatch(/\.act-line::before/);
    expect(css).toMatch(/\.act-line\.is-pick::before/);
    expect(css).toMatch(/\.act-when \{[^}]*var\(--mono\)/);
  });

  it('joins rings with a hairline only when actions come back to back', () => {
    const css = read('renderer/src/styles.css');
    expect(css).toMatch(/\.thread-block\.is-act \+ \.thread-block\.is-act \.act-line::after/);
    expect(css).toMatch(/\.act-after \.act-line \+ \.act-line::after/);
    expect(css).not.toMatch(/(^|\n)\.act-line::after/);
  });
});
