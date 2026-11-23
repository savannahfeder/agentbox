// THE USAGE SENTENCE SAYS WHEN THE LIMIT RESETS, NOT TIME LEFT (w-34443a206b).
//
// Two testers on 2026-11-22 read "This session: 89% used, 24m left" as 24
// minutes of use left, when it is 24 minutes until the window starts over and
// 11% is what is left. The panel's own rows already said "Resets in 24m";
// the sentence the usage bar shows on hover and reads aloud now says the
// same, and so does the pill's countdown.
import { describe, expect, it } from 'vitest';
import { untilReset, usageSentence } from '../shared/usage.mts';
import { pillText } from '../shared/claude-usage.mts';

const NOW = Date.parse('2026-11-22T18:00:00Z');
const MIN = 60_000;
const session = (percent: number, inMinutes: number) => ({
  span: 'session' as const, qualifier: null, name: 'This session', percent,
  resetsText: null, resetsOn: null, resetsAt: NOW + inMinutes * MIN, zone: null,
});

describe('the countdown to a reset', () => {
  it('says it resets in that long', () => {
    expect(untilReset(24 * MIN)).toBe('resets in 24m');
    expect(untilReset(134 * MIN)).toBe('resets in 2h 14m');
  });

  it('says any moment when under a minute is left', () => {
    expect(untilReset(20_000)).toBe('resets any moment');
  });

  it('never says left', () => {
    for (const ms of [0, 20_000, 24 * MIN, 134 * MIN, 3 * 24 * 60 * MIN]) expect(untilReset(ms)).not.toMatch(/left/);
  });
});

describe('the sentence the usage bar reads', () => {
  it('is the tester\'s case, in words that cannot be read as time to use', () => {
    expect(usageSentence([session(89, 24)], NOW)).toBe('This session: 89% used, resets in 24m.');
  });

  it('keeps the agent\'s name in front', () => {
    expect(usageSentence([session(45, 134)], NOW, 'Codex')).toBe('Codex. This session: 45% used, resets in 2h 14m.');
  });
});

describe('the pill', () => {
  it('counts down to the reset in the same words', () => {
    expect(pillText([session(45, 134)], NOW)).toEqual({ used: '45%', when: 'resets in 2h 14m' });
  });
});
