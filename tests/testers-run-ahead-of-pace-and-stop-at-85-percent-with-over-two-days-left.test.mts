// TESTERS RUN AHEAD OF PACE, AND STOP AT 85% WITH OVER TWO DAYS LEFT (w-a5db4e1f3e93).
//
// The pacer held testers back whenever the Codex week was ahead of a straight
// line from 0% to 90% across the week. Test days on Nov 10, 11, 12 and 13 ran
// no testers or started late for it (r-00a452c588-20261111, -20261112,
// -20261113, w-9f83a5ff20fd): at 57% on day 3 it held for a line at 45%. The
// person said that was never their rule: run, and stop at 85% while more than
// two days are left before the reset (w-40f996ee3de4, 2026-11-13). Measured
// against readings either side of 85% and of the two-day mark, at the target,
// with the 5-hour window full and with no reading at all.

import { describe, expect, it } from 'vitest';
import { paceFor, readingFromLimits } from '../.claude/skills/product-loop/scripts/pace.mjs';

const H = 3600_000;
const DAY = 24 * H;
const start = Date.parse('2026-11-02T00:00:00Z');
const weekEnds = start + 7 * DAY;
const at = (days) => start + days * DAY;
const reading = (weekPercent, sessionPercent = 10, { sessionResets = at(1) + 2 * H } = {}) => ({
  week: { percent: weekPercent, resetsAt: weekEnds },
  session: { percent: sessionPercent, resetsAt: sessionResets },
});

describe('where the week stands', () => {
  it('runs when the week is ahead of an even spread', () => {
    expect(paceFor(reading(57), { now: at(3) }).verdict).toBe('run');
    expect(paceFor(reading(55), { now: at(2.5) }).verdict).toBe('run');
    expect(paceFor(reading(84), { now: at(1) }).verdict).toBe('run');
  });

  it('stops at 85% while more than two days are left, until two days are left', () => {
    const p = paceFor(reading(85), { now: at(4.9) });
    expect(p.verdict).toBe('hold');
    expect(p.until).toBe(weekEnds - 2 * DAY);
    expect(paceFor(reading(88), { now: at(1) }).verdict).toBe('hold');
  });

  it('runs past 85% in the last two days, up to the target', () => {
    expect(paceFor(reading(85), { now: at(5) }).verdict).toBe('run');
    expect(paceFor(reading(89), { now: at(6.5) }).verdict).toBe('run');
  });

  it('stops once the week reaches its target, however early', () => {
    expect(paceFor(reading(90), { now: at(5.5) }).verdict).toBe('stop');
    expect(paceFor(reading(95), { now: at(1) }).verdict).toBe('stop');
  });

  it('runs on a reading from a week that has already reset', () => {
    expect(paceFor(reading(95), { now: weekEnds + H }).verdict).toBe('run');
  });

  it('takes its target from the person, and never runs past it early in the week', () => {
    expect(paceFor(reading(79), { now: at(1), target: 80 }).verdict).toBe('run');
    expect(paceFor(reading(80), { now: at(1), target: 80 }).verdict).toBe('stop');
  });
});

describe('the 5-hour window', () => {
  it('waits for it to reset when it is nearly full, even behind the line', () => {
    const p = paceFor(reading(20, 92, { sessionResets: at(3.5) + 2 * H }), { now: at(3.5) });
    expect(p.verdict).toBe('wait');
    expect(p.until).toBe(at(3.5) + 2 * H);
  });

  it('runs once a full window has reset, whatever its old figure says', () => {
    expect(paceFor(reading(20, 92, { sessionResets: at(3) }), { now: at(3.5) }).verdict).toBe('run');
  });

  it('runs when it has room', () => {
    expect(paceFor(reading(20, 89), { now: at(3.5) }).verdict).toBe('run');
  });
});

describe('no reading', () => {
  it('runs one stretch, because running is what writes the first reading', () => {
    const p = paceFor(null, { now: at(1) });
    expect(p.verdict).toBe('run');
    expect(p.why).toMatch(/no reading/i);
  });
});

describe('a reading as the app has it', () => {
  it('is taken from the limits the app draws, by span', () => {
    const limits = [
      { span: 'session', percent: 40, resetsAt: at(1) },
      { span: 'week', percent: 33, resetsAt: weekEnds },
    ];
    expect(readingFromLimits(limits)).toEqual({ week: { percent: 33, resetsAt: weekEnds }, session: { percent: 40, resetsAt: at(1) } });
  });

  it('is no reading without a week', () => {
    expect(readingFromLimits([{ span: 'session', percent: 40, resetsAt: at(1) }])).toBeNull();
    expect(readingFromLimits([])).toBeNull();
  });
});
