// WHAT IS LEFT OF THE USER'S LIMIT, pinned.
//
// The text below is in the exact shape `claude -p '/usage'` prints on a real
// Mac, with the figures made up. Everything this suite asserts is asserted against the
// real shape rather than an imagined one, because the whole risk in reading
// somebody else's output is inventing a format they do not use.
//
// The failure it guards is the one every status line in this app guards: a
// CONFIDENT WRONG NUMBER. A countdown is a promise about a clock the user cannot see,
// so a pill that is an hour out is worse than no pill.

import { describe, it, expect } from 'vitest';
import { pillText, readUsage, resetAt } from '../shared/claude-usage.mjs';
// The words the panel prints left shared/claude-usage.mjs on 2026-09-05, because
// the corner draws Codex's limits too now and a Codex reading may not flow
// through a module called `claude-usage`. Same functions, same rules, one home.
import { sessionLimit, untilReset, usageSentence } from '../shared/usage.mjs';

const REAL = `You are currently using your subscription to power your Claude Code usage

Current session: 40% used · resets Aug 31 at 6:19pm (America/Los_Angeles)
Current week (all models): 10% used · resets Sep 3 at 3:59pm (America/Los_Angeles)
Current week (Fable): 5% used · resets Sep 3 at 3:59pm (America/Los_Angeles)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai.

Last 24h · 500 requests · 8 sessions
  60% of your usage was while 4+ sessions ran in parallel
  50% of your usage was at >150k context
  Top MCP servers: agentbox 5%`;

const ZONE = 'America/Los_Angeles';
// 2026-08-31 16:47 IN THAT ZONE, which is when the text above was really taken.
//
// IT WAS `new Date(2026, 7, 31, 16, 47)` UNTIL 2026-09-04, which is a wall time
// in whatever zone the machine running the suite is in. Paired with the ZONE on
// the line above saying Los Angeles, that is two different clocks called one
// moment, and it stayed green only because `resetAt` carried the identical bug
// and built its answer on the machine's clock too. The two wrongs cancelled on
// every desk; fixing one turned this file red, which is how it was found. A
// moment in a test is an instant or it is not a moment.
const NOW = Date.parse('2026-08-31T16:47:00-07:00');

describe('reading what the command printed', () => {
  it('finds all three limits, in the order they were given', () => {
    const limits = readUsage(REAL, NOW, ZONE);
    expect(limits.map((l) => [l.span, l.qualifier, l.percent])).toEqual([
      ['session', null, 40],
      ['week', 'all models', 10],
      ['week', 'Fable', 5],
    ]);
  });

  it('ignores every line that is not a limit', () => {
    expect(readUsage(REAL, NOW, ZONE)).toHaveLength(3);
    expect(readUsage('Last 24h · 500 requests · 8 sessions', NOW, ZONE)).toEqual([]);
    expect(readUsage('  60% of your usage was while 4+ sessions ran in parallel', NOW, ZONE)).toEqual([]);
  });

  it('says nothing at all about text it cannot read', () => {
    expect(readUsage('', NOW, ZONE)).toEqual([]);
    expect(readUsage(null, NOW, ZONE)).toEqual([]);
    expect(readUsage('Login required', NOW, ZONE)).toEqual([]);
  });

  it('is the session limit that the pill is about', () => {
    expect(sessionLimit(readUsage(REAL, NOW, ZONE)).percent).toBe(40);
    expect(sessionLimit([])).toBe(null);
  });
});

describe('when it starts over', () => {
  it('reads the stamp as a clock time in the zone the command named', () => {
    const at = resetAt('Aug 31 at 6:19pm (America/Los_Angeles)', NOW, ZONE);
    // Asserted as an INSTANT rather than as `new Date(at).getHours === 18`,
    // which was the old shape and reads the answer back through the same
    // process clock that produced it: on a machine that is not in Los Angeles
    // both halves are wrong together and the test says nothing.
    expect(at).toBe(Date.parse('2026-08-31T18:19:00-07:00'));
    expect(at - NOW).toBe(92 * 60_000);
  });

  // REFUSED RATHER THAN GUESSED. Claude Code prints the zone it computed the
  // stamp in. Read on a machine in another zone the difference is whole hours,
  // and a countdown built on that is confidently wrong, which is the one thing a
  // status line may not be. The caller prints the clock time instead.
  it('refuses to count down from a stamp in another timezone', () => {
    expect(resetAt('Aug 31 at 6:19pm (Europe/London)', NOW, ZONE)).toBe(null);
  });

  it('takes the stamp at face value when no zone was printed', () => {
    expect(resetAt('Aug 31 at 6:19pm', NOW, ZONE)).toBeGreaterThan(NOW);
  });

  // The stamp carries no year. December to January is the only case where this
  // side of it matters, and it is the case that would otherwise read as eleven
  // months ago.
  it('rolls into next year rather than reading a reset as long past', () => {
    const newYear = new Date(2026, 11, 31, 23, 50).getTime();
    const at = resetAt('Jan 1 at 4:00am', newYear, null);
    expect(at).toBeGreaterThan(newYear);
    expect(new Date(at).getFullYear()).toBe(2027);
  });

  it('reads midnight and noon the way a clock does', () => {
    expect(new Date(resetAt('Aug 31 at 12:30am', NOW, null)).getHours()).toBe(0);
    expect(new Date(resetAt('Aug 31 at 12:30pm', NOW, null)).getHours()).toBe(12);
  });

  it('says nothing about a stamp it does not understand', () => {
    expect(resetAt('soon', NOW, ZONE)).toBe(null);
    expect(resetAt('', NOW, ZONE)).toBe(null);
  });
});

describe('the reading beside it', () => {
  it('never counts seconds', () => {
    expect(untilReset(0)).toBe('any moment');
    expect(untilReset(41_000)).toBe('any moment');
    expect(untilReset(59_999)).toBe('any moment');
  });

  it('reads in whole minutes, then in hours', () => {
    expect(untilReset(60_000)).toBe('1m left');
    expect(untilReset(92 * 60_000)).toBe('1h 32m left');
    expect(untilReset(59 * 60_000)).toBe('59m left');
  });

  // The session limit never runs this long and the weekly ones always do. The
  // first version stopped at hours and read "71h 12m left" on a week, which is
  // a number a person has to do arithmetic on before it means anything.
  it('reads a weekly allowance in days rather than in seventy hours', () => {
    expect(untilReset(71 * 3_600_000 + 12 * 60_000)).toBe('2d 23h left');
    expect(untilReset(48 * 3_600_000)).toBe('2d left');
    expect(untilReset(25 * 3_600_000)).toBe('1d 1h left');
    expect(untilReset(23 * 3_600_000)).toBe('23h 0m left');
  });

  it('never reads backwards from a limit that has already reset', () => {
    expect(untilReset(-5 * 60_000)).toBe('any moment');
  });
});

describe('what the pill says', () => {
  it('is the percent used and the time left, which is what he asked for', () => {
    expect(pillText(readUsage(REAL, NOW, ZONE), NOW)).toEqual({ used: '40%', when: '1h 32m left' });
  });

  // A pill that says it does not know is worse than no pill, so nothing is drawn
  // at all until there is something true to draw.
  it('is nothing at all when the command said nothing usable', () => {
    expect(pillText([], NOW)).toBe(null);
    expect(pillText(readUsage('', NOW, ZONE), NOW)).toBe(null);
  });

  // The clock time is still true when the countdown is not available, so it is
  // printed rather than the pill going blank.
  it('falls back to the clock time when it cannot count down', () => {
    const limits = readUsage(
      'Current session: 29% used · resets Aug 31 at 6:19pm (Europe/London)', NOW, ZONE,
    );
    expect(pillText(limits, NOW)).toEqual({ used: '29%', when: 'resets 6:19pm' });
  });

  it('draws a full limit as full rather than as something over', () => {
    const limits = readUsage('Current session: 100% used · resets Aug 31 at 6:19pm', NOW, ZONE);
    expect(pillText(limits, NOW).used).toBe('100%');
  });
});

describe('the whole sentence', () => {
  // The pill has room for the one limit that stops her today. The other two are
  // the ones that surprise her later, so the tooltip and the screen reader get
  // all three. AND "all models" CAME OFF THE WEEK LINE ON 2026-09-01. The
  // sentence and the panel's rows come out of the same `limitName`, so they
  // cannot say it two ways.
  it('says all three, in her words', () => {
    expect(usageSentence(readUsage(REAL, NOW, ZONE), NOW)).toBe(
      'This session: 40% used, 1h 32m left. '
      + 'This week: 10% used, 2d 23h left. '
      + 'This week, Fable: 5% used, 2d 23h left.',
    );
  });

  it('says nothing when there is nothing to say', () => {
    expect(usageSentence([], NOW)).toBe(null);
    expect(usageSentence(null, NOW)).toBe(null);
  });
});
