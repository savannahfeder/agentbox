// THE CORNER FILLS AS SHE SPENDS, AND IT SAYS "used".
//
// This file was called the-corner-drains, and the direction it pinned was
// wrong.
//
// HOW IT WENT THE WRONG WAY IS WORTH WRITING DOWN, because the sentence that
// caused it is still on the row above and still reads persuasive. That is a
// fair reading of the words and the wrong reading of the instrument. A bar is
// not a sentence. Every progress bar anybody has used fills as the thing is
// consumed, Claude Code's `/usage` included, so one running backwards makes a
// reader do a subtraction before they can trust it. "45% used" is a perfectly
// good ANSWER to it, and it is the one her eye is already trained on.
//
// THE RULE IS CLAUDE CODE'S, off her screenshot of it:
//
//   Current session
//   [####--------------]  35% used
//   Resets 9:59pm (America/Los_Angeles)
//
//   Current week (all models)
//   [##----------------]  19% used
//   Resets Sep 3 at 3:59pm (America/Los_Angeles)
//
// The bar fills with what is spent, the number says "used", and the reset line
// is a CLOCK TIME carrying the day when the day is not today. That third part
// replaces a countdown the last round invented. The countdown existed to dodge
// a real ambiguity, that the week's stamp is "4pm" and reads as today. Claude
// Code solves it better by printing the day, so the day is printed and the
// countdown goes.
//
// THE NAMES STAY HERS. Claude Code writes "Current week (all models)"; she
// named these herself the round before and has not asked for that back. It is
// the LOGIC she asked to match.

import { describe, it, expect } from 'vitest';
import { readUsage } from '../shared/claude-usage.mjs';
import { limitRows, spanLeft, untilReset } from '../shared/usage.mjs';

// VERBATIM off her Mac, 2026-09-01 13:46 America/Los_Angeles.
const HERS = `You are currently using your subscription to power your Claude Code usage

Current session: 45% used · resets Sep 1 at 4pm (America/Los_Angeles)
Current week (all models): 7% used · resets Sep 3 at 4pm (America/Los_Angeles)
Current week (Fable): 0% used`;

const ZONE = 'America/Los_Angeles';
const NOW = Date.parse('2026-09-01T13:46:00-07:00');
const rows = () => limitRows(readUsage(HERS, NOW, ZONE), NOW);

describe('which way round the number is', () => {
  // THE WHOLE POINT OF THIS ROUND. 45% used stays 45, and there is no `left`
  // left anywhere for a caller to reach for by mistake.
  it('reports what has been spent, the way the command reported it', () => {
    expect(rows().map((r) => r.used)).toEqual([45, 7, 0]);
    for (const r of rows()) expect(r).not.toHaveProperty('left');
  });

  // THE TWO ENDS, and neither may come out as the other. An empty bar is an
  // untouched limit and a full one is a spent limit, which is the exact
  // opposite of what this file said an hour ago.
  it('draws an empty bar at nothing spent and a full one at everything spent', () => {
    const at = (pct) => limitRows(
      [{ span: 'session', qualifier: null, percent: pct, resetsText: null, resetsOn: null, resetsAt: null, zone: null }],
      NOW,
    )[0].used;
    expect(at(0)).toBe(0);
    expect(at(100)).toBe(100);
    expect(at(80)).toBe(80);
  });
});

describe('what the panel says', () => {
  it('is all three limits, in the order the command reported them', () => {
    expect(rows().map((r) => r.name)).toEqual(['This session', 'This week', 'This week, Fable']);
  });

  // CLAUDE CODE'S RESET LINE. A clock time alone when the reset is today, and
  // the day in front of it when it is not. The second half is what makes the
  // two week rows honest: their "4pm" is Thursday's.
  it('says the clock time alone when the reset is today', () => {
    expect(rows()[0].when).toBe('Resets 4pm');
  });

  it('puts the day in front when the reset is not today', () => {
    expect(rows()[1].when).toBe('Resets Sep 3 at 4pm');
  });

  // The third line has no reset at all, which is the CLI's own output for a
  // limit at 0%. It is not dropped and it is not given an invented one.
  it('says nothing about a limit the command gave no reset for', () => {
    expect(rows()[2]).toMatchObject({ name: 'This week, Fable', used: 0, when: null });
  });

  // WHEN THE STAMP WAS COMPUTED SOMEWHERE ELSE we cannot say which day it is
  // here, so the whole stamp goes out as the command wrote it. Still true, and
  // still refusing to guess.
  it('prints the command\'s whole stamp when the timezone is not ours', () => {
    const other = readUsage('Current session: 45% used · resets Sep 3 at 4pm (Europe/Berlin)', NOW, ZONE);
    expect(limitRows(other, NOW)[0].when).toBe('Resets Sep 3 at 4pm');
  });

  it('has nothing to say about an empty reading', () => {
    expect(limitRows([], NOW)).toEqual([]);
    expect(limitRows(null, NOW)).toEqual([]);
  });

  it('gives every row a key that tells the two week rows apart', () => {
    expect(new Set(rows().map((r) => r.key)).size).toBe(3);
  });
});

// The countdown belongs to the tooltip and the spoken sentence now, and to
// nothing on screen. Its two shapes still have to agree with each other.
describe('the countdown, which the spoken sentence still uses', () => {
  it('rounds the same whether it carries "left" or not', () => {
    for (const ms of [30_000, 60_000, 59 * 60_000, 90 * 60_000, 25 * 3_600_000, 48 * 3_600_000]) {
      const bare = spanLeft(ms);
      expect(untilReset(ms)).toBe(bare === 'any moment' ? bare : `${bare} left`);
    }
  });
});
