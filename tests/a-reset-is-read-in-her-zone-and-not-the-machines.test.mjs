// THE COUNTDOWN WAS BUILT ON THE MACHINE'S CLOCK, NOT ON HERS (2026-09-04).
//
// `resetAt(text, now, zoneNow)` has taken a zone since it was written. It used
// that zone for one thing, the refusal — Claude Code prints the zone it computed
// a stamp in, and a stamp from another zone is refused rather than counted down
// from — and then built the instant with `new Date(y, m, d, h, min)`, which
// reads those fields in whatever zone the PROCESS is in. A function handed the
// moment AND the zone, reading one of them off the machine.
//
// On her Mac the two are the same zone, so every number she has ever seen was
// right and nothing pointed at it. THE MEASUREMENT THAT DID: this whole suite
// run on a machine in Asia/Tbilisi (UTC+4) against her verbatim
// America/Los_Angeles reading of 2026-09-01 13:46. `resetAt` came back
// 1788264000000 where the stamp means 1788303600000 — eleven hours early, the
// exact Tbilisi-to-Los-Angeles difference. Downstream of that one number:
// `pillText` said `{ used: '45%', when: 'any moment' }` instead of `2h 14m
// left`, `usageSentence` said "any moment" in the tooltip, and the panel printed
// "Resets Sep 1 at 4pm" for a reset that was that afternoon, because `sameDay`
// read its calendar off the process too. Six assertions across two files, all of
// them describing the machine rather than the app.
//
// A CLOCK THAT IS AN HOUR OUT IS THE ONE THING THIS PILL MAY NOT BE. Its own
// file says so: "a countdown is a promise about a clock she cannot see, so a
// pill that is an hour out is worse than no pill." Eleven hours out is the same
// failure with a bigger number, and the only reason it was invisible is that the
// test could not put the app anywhere but where the test was running.
//
// WHY THIS IS ITS OWN FILE. Its two siblings are about the CLI's wording — the
// on-the-hour stamp with no minutes, and which way round the bar fills. This is
// about neither: it is the claim that the answer is a function of the arguments
// and of nothing else, which is what makes those two files mean anything on a
// second machine. It is written so it can only pass for the right reason: every
// expectation below names an instant, and no assertion anywhere in it reads a
// date back through the process's own clock.

import { describe, it, expect } from 'vitest';
import { pillText, readUsage, resetAt } from '../shared/claude-usage.mjs';
import { limitRows } from '../shared/usage.mjs';

// Her reading, 2026-09-01 13:46 America/Los_Angeles, as an INSTANT.
const NOW = Date.parse('2026-09-01T13:46:00-07:00');

describe('the same stamp, read for three different zones', () => {
  // THE CASE. One string, three answers, and which one you get is decided by
  // the zone handed in. Whichever machine runs this is in at most one of these
  // three, so at least two of them would be wrong if the process clock were
  // still doing the work — and all three are wrong on a machine in none.
  it('lands on the clock time in the zone it was told, and never on the machine\'s', () => {
    expect(resetAt('Sep 1 at 4pm', NOW, 'America/Los_Angeles'))
      .toBe(Date.parse('2026-09-01T16:00:00-07:00'));
    expect(resetAt('Sep 1 at 4pm', NOW, 'Europe/Berlin'))
      .toBe(Date.parse('2026-09-01T16:00:00+02:00'));
    expect(resetAt('Sep 1 at 4pm', NOW, 'UTC'))
      .toBe(Date.parse('2026-09-01T16:00:00Z'));
    expect(resetAt('Sep 1 at 4pm', NOW, 'Asia/Tbilisi'))
      .toBe(Date.parse('2026-09-01T16:00:00+04:00'));
  });

  // AND THE COUNTDOWN THE PILL PRINTS IS THAT SUBTRACTION AND NOTHING ELSE.
  // 13:46 to 16:00 is 2h 14m in Los Angeles; the same wall time in Berlin is
  // nine hours behind us and already gone.
  it('turns into the pill\'s own words without the machine getting a vote', () => {
    const hers = readUsage('Current session: 45% used · resets Sep 1 at 4pm', NOW, 'America/Los_Angeles');
    expect(pillText(hers, NOW)).toEqual({ used: '45%', when: '2h 14m left' });
    const berlin = readUsage('Current session: 45% used · resets Sep 1 at 4pm', NOW, 'Europe/Berlin');
    expect(pillText(berlin, NOW)).toEqual({ used: '45%', when: 'any moment' });
  });

  // THE BOUNDARY ON THE OTHER SIDE. No zone to be told means the process's own
  // clock is the best answer there is, and that is the behaviour every reading
  // before today had. It is a fallback and never a first choice.
  it('falls back to the machine\'s own clock only when it is told no zone at all', () => {
    const at = resetAt('Sep 1 at 4pm', NOW, null);
    expect(at).toBe(new Date(2026, 8, 1, 16, 0, 0, 0).getTime());
  });

  // THE CASE THAT MUST NOT MATCH, unchanged. The stamp naming a zone that is not
  // ours is still refused outright rather than read in either of them.
  it('still refuses a stamp the command computed somewhere else', () => {
    expect(resetAt('Sep 1 at 4pm (Europe/Berlin)', NOW, 'America/Los_Angeles')).toBe(null);
    expect(resetAt('Sep 1 at 4pm (America/Los_Angeles)', NOW, 'Europe/Berlin')).toBe(null);
  });
});

// A ZONE IS NOT AN OFFSET, and the two days a year that prove it are the days
// the offset the answer needs is not the offset at the moment you first guess.
// Turning a wall time into an instant means sampling the offset somewhere, and
// the only place to sample it before you have the answer is the wall time itself
// read as UTC — seven or eight hours off, which on these two days is the far
// side of the transition. The morning hours are the ones that catch it: 4am
// Pacific is 11am or noon UTC and the transitions are at 09:00 and 10:00 UTC, so
// a single-sample conversion lands an hour out on both. 4pm does not catch it,
// which is why both are here and why the morning one is not decoration.
describe('the two days a year the offset moves', () => {
  it('reads a spring-forward Sunday and the day before it', () => {
    const now = Date.parse('2026-03-07T00:30:00-08:00');
    expect(resetAt('Mar 7 at 4am', now, 'America/Los_Angeles'))
      .toBe(Date.parse('2026-03-07T04:00:00-08:00'));   // still PST
    expect(resetAt('Mar 8 at 4am', now, 'America/Los_Angeles'))
      .toBe(Date.parse('2026-03-08T04:00:00-07:00'));   // PDT, an hour nearer
    expect(resetAt('Mar 8 at 4pm', now, 'America/Los_Angeles'))
      .toBe(Date.parse('2026-03-08T16:00:00-07:00'));
  });

  it('reads a fall-back Sunday and the day before it', () => {
    const now = Date.parse('2026-10-31T00:30:00-07:00');
    expect(resetAt('Oct 31 at 4am', now, 'America/Los_Angeles'))
      .toBe(Date.parse('2026-10-31T04:00:00-07:00'));   // still PDT
    expect(resetAt('Nov 1 at 4am', now, 'America/Los_Angeles'))
      .toBe(Date.parse('2026-11-01T04:00:00-08:00'));   // PST, an hour further
    expect(resetAt('Nov 1 at 4pm', now, 'America/Los_Angeles'))
      .toBe(Date.parse('2026-11-01T16:00:00-08:00'));
  });
});

// AND THE OTHER HALF OF THE SAME DEFECT. `limitRows` decides whether to print
// the day in front of the clock time by asking whether the reset is TODAY, and
// it asked the process. One instant, two zones, two honest answers: 4pm on
// Tuesday in Los Angeles is 1am on Wednesday in Berlin, so one of them needs its
// date said out loud and the other does not.
describe('whether a reset is today is a question about her calendar', () => {
  const SAME_INSTANT = Date.parse('2026-09-01T16:00:00-07:00');

  it('says the clock time alone where the reset falls on today', () => {
    const hers = readUsage(
      'Current session: 45% used · resets Sep 1 at 4pm (America/Los_Angeles)', NOW, 'America/Los_Angeles',
    );
    expect(hers[0].resetsAt).toBe(SAME_INSTANT);
    expect(limitRows(hers, NOW)[0].when).toBe('Resets 4pm');
  });

  it('puts the day in front where the very same moment falls on tomorrow', () => {
    const berlin = readUsage(
      'Current session: 45% used · resets Sep 2 at 1am (Europe/Berlin)', NOW, 'Europe/Berlin',
    );
    expect(berlin[0].resetsAt).toBe(SAME_INSTANT);
    expect(limitRows(berlin, NOW)[0].when).toBe('Resets Sep 2 at 1am');
  });
});
