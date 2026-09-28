// WHY HER CORNER SAID "41%" AND NOTHING ELSE.
//
// She could not tell, and the pill was the reason. It is built to say two
// things, the percent and the time left, and on her machine it was saying one.
// A lone number in a corner with no unit and no noun is not a status line, it
// is a riddle.
//
// THE CAUSE IS ONE REGEX AND IT IS MEASURED, not guessed. `claude -p '/usage'`
// run on her Mac at 2026-09-01 13:46 local, verbatim:
//
//   Current session: 45% used · resets Sep 1 at 4pm (America/Los_Angeles)
//   Current week (all models): 7% used · resets Sep 3 at 4pm (America/Los_Angeles)
//   Current week (Fable): 0% used
//
// The stamp is "4pm". The parser wanted "4:00pm": its time was
// `(\d{1,2}):(\d{2})` with the colon and the minutes REQUIRED. The CLI drops
// both when a reset lands on the hour, which it does for a whole hour out of
// every five, so `resetAt` returned null, `resetsText` returned null, and
// `pillText` fell through to its last line, `{ used, when: null }`. The tooltip
// lost the reset too, so there was nowhere left in the app that said it.
//
// It is not a rare shape. The August reading this suite's sibling was written
// against (`Aug 31 at 6:19pm`) has minutes, so every existing test passed while
// the corner was broken in front of her.
//
// WHAT IS TESTED HERE: on the hour parses, with minutes still parses, the
// countdown is the same either way, and midnight and noon are not read as each
// other. And the case that must NOT match, because that is the one that catches
// the next regression: a bare hour with no am or pm is still refused, since
// "resets Sep 1 at 4" could be either and a countdown built on the wrong one is
// twelve hours out.

import { describe, it, expect } from 'vitest';
import { pillText, readUsage, resetAt } from '../shared/claude-usage.mjs';
import { usageSentence } from '../shared/usage.mjs';

// VERBATIM off her Mac, 2026-09-01 13:46 America/Los_Angeles. Kept whole, with
// the paragraphs the command prints around the three numbers, because the risk
// in reading somebody else's output is inventing a format they do not use.
const HERS = `You are currently using your subscription to power your Claude Code usage

Current session: 45% used · resets Sep 1 at 4pm (America/Los_Angeles)
Current week (all models): 7% used · resets Sep 3 at 4pm (America/Los_Angeles)
Current week (Fable): 0% used

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices or claude.ai. Behaviors are independent characteristics, not a breakdown.

Last 24h · 1796 requests · 15 sessions
  78% of your usage was at >150k context
  39% of your usage was while 4+ sessions ran in parallel
  Top MCP servers: agentbox 5%, zero-approvals 1%`;

const ZONE = 'America/Los_Angeles';
// 13:46 on the same day, which is 2h 14m before the 4pm session reset.
const NOW = Date.parse('2026-09-01T13:46:00-07:00');

describe('a reset stamp printed on the hour', () => {
  it('is read, where before it was thrown away', () => {
    const at = resetAt('Sep 1 at 4pm (America/Los_Angeles)', NOW, ZONE);
    expect(at).toBe(Date.parse('2026-09-01T16:00:00-07:00'));
  });

  it('gives the same answer as the same time written with minutes', () => {
    expect(resetAt('Sep 1 at 4pm (America/Los_Angeles)', NOW, ZONE))
      .toBe(resetAt('Sep 1 at 4:00pm (America/Los_Angeles)', NOW, ZONE));
  });

  it('still reads a stamp that HAS minutes, which is the shape that already worked', () => {
    expect(resetAt('Aug 31 at 6:19pm (America/Los_Angeles)', Date.parse('2026-08-31T16:47:00-07:00'), ZONE))
      .toBe(Date.parse('2026-08-31T18:19:00-07:00'));
  });

  // The two boundaries either side of the twelve hour wrap. 12am is midnight
  // and 12pm is noon, and reading either as the other puts the countdown out by
  // half a day.
  it('reads 12am as midnight and 12pm as noon', () => {
    expect(resetAt('Sep 2 at 12am (America/Los_Angeles)', NOW, ZONE))
      .toBe(Date.parse('2026-09-02T00:00:00-07:00'));
    expect(resetAt('Sep 1 at 12pm (America/Los_Angeles)', Date.parse('2026-09-01T09:00:00-07:00'), ZONE))
      .toBe(Date.parse('2026-09-01T12:00:00-07:00'));
  });

  // THE CASE THAT MUST NOT MATCH. Loosening the minutes must not loosen the
  // half: an hour with no am or pm is ambiguous by twelve hours, and this
  // parser's standing rule is that it refuses rather than guesses.
  it('refuses an hour with no am or pm rather than guessing which half', () => {
    expect(resetAt('Sep 1 at 4 (America/Los_Angeles)', NOW, ZONE)).toBe(null);
    expect(resetAt('Sep 1 at 4:00 (America/Los_Angeles)', NOW, ZONE)).toBe(null);
  });

  // And the other standing refusal, unchanged: a stamp computed somewhere else
  // is not a countdown this machine can honestly draw.
  it('still refuses a stamp computed in another timezone', () => {
    expect(resetAt('Sep 1 at 4pm (Europe/Berlin)', NOW, ZONE)).toBe(null);
  });
});

describe('her corner, on the reading that confused her', () => {
  it('says the time left, where before it said a bare percent', () => {
    const limits = readUsage(HERS, NOW, ZONE);
    expect(pillText(limits, NOW)).toEqual({ used: '45%', when: '2h 14m left' });
  });

  it('carries the reset into the sentence the pointer gets', () => {
    const limits = readUsage(HERS, NOW, ZONE);
    const said = usageSentence(limits, NOW);
    expect(said).toContain('This session: 45% used, 2h 14m left.');
    // The week line lost its "all models" qualifier on 2026-09-01, in her own
    // words. The reason is in tests/the-corner-drains-and-opens.test.mjs.
    expect(said).toContain('This week: 7% used, 2d 2h left.');
  });

  // The third line of her reading has NO reset at all, and that is the CLI's
  // own output rather than a parse failure. It stays a limit with no countdown
  // instead of being dropped or given an invented one.
  it('keeps the limit that the command reported without any reset', () => {
    const limits = readUsage(HERS, NOW, ZONE);
    const fable = limits.find((l) => l.qualifier === 'Fable');
    expect(fable).toMatchObject({ percent: 0, resetsAt: null, resetsText: null });
    expect(usageSentence(limits, NOW)).toContain('This week, Fable: 0% used.');
  });

  it('reads all three limits off the real output', () => {
    expect(readUsage(HERS, NOW, ZONE).map((l) => l.percent)).toEqual([45, 7, 0]);
  });
});
