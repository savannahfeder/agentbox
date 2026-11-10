// THE PRODUCT LOOP SPENDS A CODEX WEEK UP TO ITS LINE (w-e4d49a1539).
//
// The synthetic testers that improve Agentbox run on a Codex plan, and the aim
// is to have used about 90% of the week by the time it resets: less wastes the
// plan, more leaves nothing for the person's own work. Nothing measured how far
// through the week a run was, so a loop would either stop at an arbitrary hour
// or run until Codex refused it. The pacer reads the week's and the 5-hour
// window's used percent and reset times, as Codex logs them, and says whether
// to run, hold, wait or stop. Measured against readings at the start, middle
// and end of a week, with the 5-hour window full and with no reading at all.

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
  it('runs when it is behind the line', () => {
    const p = paceFor(reading(20), { now: at(3.5) });
    expect(p.verdict).toBe('run');
    expect(p.line).toBeCloseTo(45, 0);
  });

  it('holds when it is ahead, until the line catches up', () => {
    const p = paceFor(reading(60), { now: at(3.5) });
    expect(p.verdict).toBe('hold');
    expect(p.until).toBe(start + Math.round((60 / 90) * 7 * DAY));
  });

  it('stops once the week reaches its target, however early', () => {
    expect(paceFor(reading(90), { now: at(5) }).verdict).toBe('stop');
    expect(paceFor(reading(95), { now: at(1) }).verdict).toBe('stop');
  });

  it('runs on the last day to close the gap, and stops at the reset', () => {
    expect(paceFor(reading(70), { now: at(6.9) }).verdict).toBe('run');
    expect(paceFor(reading(70), { now: weekEnds + H }).verdict).toBe('run');
  });

  it('takes its target from the person', () => {
    expect(paceFor(reading(60), { now: at(3.5), target: 80 }).verdict).toBe('hold');
    expect(paceFor(reading(60), { now: at(6), target: 80 }).verdict).toBe('run');
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
