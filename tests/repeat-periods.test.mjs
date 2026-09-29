// A period is a local calendar date, never arithmetic. Everything the schedule
// promises (one run a day, downtime collapsing to one, DST being boring) is a
// property of that one choice, so this is where it is pinned.

import { describe, it, expect } from 'vitest';
import {
  periodKey, isOwed, servedOf, occurrenceId, foldRepeats, nextRunAt, isCleanRun, ruleIdOf,
} from '../shared/repeats.mjs';

const rule = (over = {}) => ({ id: 'r-3f9a21bc44', every: 'day', at: '09:00', served: '', ...over });
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();

describe('periodKey', () => {
  it('is today once the hour has passed, and yesterday before it', () => {
    expect(periodKey(rule(), at(2026, 8, 12, 9, 1))).toBe('2026-08-12');
    expect(periodKey(rule(), at(2026, 8, 12, 8, 59))).toBe('2026-08-11');
  });

  it('serves the period at the exact boundary', () => {
    expect(periodKey(rule(), at(2026, 8, 12, 9, 0))).toBe('2026-08-12');
    expect(periodKey(rule(), at(2026, 8, 12, 9, 0) - 1)).toBe('2026-08-11');
  });

  it('is null for a rule it cannot read', () => {
    expect(periodKey({ every: 'day' }, at(2026, 8, 12, 10))).toBeNull();
    expect(periodKey({ every: 'fortnight', at: '09:00' }, at(2026, 8, 12, 10))).toBeNull();
    expect(periodKey({ every: 'day', at: '25:00' }, at(2026, 8, 12, 10))).toBeNull();
  });
});

describe('isOwed', () => {
  it('a rule that never ran is owed', () => {
    expect(isOwed(rule(), at(2026, 8, 12, 10))).toBe(true);
  });

  it('is not owed twice in one period', () => {
    expect(isOwed(rule({ served: '2026-08-12' }), at(2026, 8, 12, 23))).toBe(false);
  });

  it('three days away owes ONE period, not four', () => {
    const r = rule({ served: '2026-08-09' });
    expect(isOwed(r, at(2026, 8, 12, 10))).toBe(true);
    expect(periodKey(r, at(2026, 8, 12, 10))).toBe('2026-08-12');
  });

  it('an ended rule is never owed', () => {
    expect(isOwed(rule({ endedAt: at(2026, 8, 11, 12) }), at(2026, 8, 12, 10))).toBe(false);
  });

  // The comparison is `>`, not `!==`: moving 09:00 to 17:00 at noon puts the
  // current period back on yesterday, and `!==` would re-run a served day.
  it('moving the time later in the day does not re-run today', () => {
    const moved = rule({ at: '17:00', served: '2026-08-12' });
    expect(isOwed(moved, at(2026, 8, 12, 12))).toBe(false);
    expect(isOwed(moved, at(2026, 8, 12, 17))).toBe(false);
    expect(isOwed(moved, at(2026, 8, 13, 17))).toBe(true);
  });

  it('moving the time earlier in the day does not skip tomorrow', () => {
    const moved = rule({ at: '09:00', served: '2026-08-12' });
    expect(isOwed(moved, at(2026, 8, 13, 9))).toBe(true);
  });
});

describe('nextRunAt', () => {
  it('is today if the hour is ahead, tomorrow once it has passed', () => {
    expect(nextRunAt(rule(), at(2026, 8, 12, 8))).toBe(at(2026, 8, 12, 9));
    expect(nextRunAt(rule(), at(2026, 8, 12, 10))).toBe(at(2026, 8, 13, 9));
  });

  it('is nothing for a rule that has ended', () => {
    expect(nextRunAt(rule({ endedAt: 1 }), at(2026, 8, 12, 8))).toBeNull();
  });
});

describe('foldRepeats', () => {
  const now = at(2026, 8, 12, 10);

  it('folds newest-wins per field', () => {
    const rules = foldRepeats([
      { id: 'r-1', ts: 1, patch: { title: 'first', at: '09:00' } },
      { id: 'r-1', ts: 2, patch: { at: '07:00' } },
    ], now);
    expect(rules.get('r-1')).toMatchObject({ title: 'first', at: '07:00' });
  });

  // served is the ONE field that does not fold newest-wins. A delayed or
  // clock-skewed writer landing an older date last would otherwise regress the
  // watermark and re-run a period already served.
  it('served folds by MAXIMUM, not by newest line', () => {
    const rules = foldRepeats([
      { id: 'r-1', ts: 5, patch: { title: 't', every: 'day', at: '09:00', served: '2026-08-12' } },
      { id: 'r-1', ts: 9, patch: { served: '2026-08-10' } },
    ], now);
    expect(rules.get('r-1').served).toBe('2026-08-12');
  });

  // And a date LATER than today cannot be legitimate. Accepted, it would
  // silence the task until the real calendar caught up, and because served
  // folds by maximum no later correct write could ever undo it.
  it('a served date in the future is refused, so one clock error cannot silence the task', () => {
    const rules = foldRepeats([
      { id: 'r-1', ts: 1, patch: { title: 't', every: 'day', at: '09:00' } },
      { id: 'r-1', ts: 2, patch: { served: '2027-01-01' } },
    ], now);
    expect(rules.get('r-1').served).toBe('');
    expect(isOwed(rules.get('r-1'), now)).toBe(true);
  });

  it('skips torn and unparseable lines rather than throwing', () => {
    const rules = foldRepeats([
      { id: 'r-1', ts: 1, patch: { title: 't', at: '09:00' } },
      null,
      'not an object',
      { ts: 2, patch: { title: 'no id' } },
      { id: 'r-2', ts: 2 },
    ], now);
    expect(rules.size).toBe(1);
  });

  it('defaults the counters, so a fresh rule needs no migration', () => {
    const rules = foldRepeats([{ id: 'r-1', ts: 1, patch: { title: 't', every: 'day', at: '09:00' } }], now);
    expect(rules.get('r-1')).toMatchObject({ served: '', misses: 0, alerted: 0 });
  });
});

describe('occurrenceId', () => {
  it('is deterministic and inside the 64 character id limit', () => {
    const id = occurrenceId('r-3f9a21bc44', '2026-08-12');
    expect(id).toBe('r-3f9a21bc44-20260812');
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});

describe('the clean marker', () => {
  it('reads a run back to its rule', () => {
    expect(ruleIdOf({ labels: ['founder', 'repeat:r-abc123'] })).toBe('r-abc123');
    expect(ruleIdOf({ labels: ['founder'] })).toBeNull();
    expect(ruleIdOf(null)).toBeNull();
  });

  // The label alone is not enough: this predicate hides things, so it must never
  // fire on something that is not a run of a repeating task.
  it('is only clean when it is a run', () => {
    expect(isCleanRun({ labels: ['founder', 'repeat:r-abc123', 'clean'] })).toBe(true);
    expect(isCleanRun({ labels: ['founder', 'clean'] })).toBe(false);
    expect(isCleanRun({ labels: ['founder', 'repeat:r-abc123'] })).toBe(false);
  });
});

describe('servedOf', () => {
  it('treats an absent or malformed watermark as never served', () => {
    expect(servedOf({})).toBe('');
    expect(servedOf({ served: 'yesterday' })).toBe('');
    expect(servedOf({ served: '2026-08-12' })).toBe('2026-08-12');
  });
});

// DST is boring here only because a period is a calendar date. If anyone ever
// replaces that with arithmetic, these are the tests that catch it. 2026's US
// transitions are 8 March and 1 November.
describe('daylight saving', () => {
  it('spring forward: the 23 hour day serves exactly one period', () => {
    expect(periodKey(rule(), at(2026, 3, 8, 10))).toBe('2026-03-08');
    expect(isOwed(rule({ served: '2026-03-08' }), at(2026, 3, 8, 23))).toBe(false);
    expect(isOwed(rule({ served: '2026-03-07' }), at(2026, 3, 8, 10))).toBe(true);
  });

  it('fall back: the 25 hour day serves exactly one period', () => {
    expect(periodKey(rule(), at(2026, 11, 1, 10))).toBe('2026-11-01');
    expect(isOwed(rule({ served: '2026-11-01' }), at(2026, 11, 1, 23))).toBe(false);
  });

  // 02:30 does not exist on the spring-forward date. The period is still that
  // calendar date, served at the first minute that does exist.
  it('a rule at a time that does not exist that day still serves that date', () => {
    const r = { id: 'r-1', every: 'day', at: '02:30', served: '' };
    expect(periodKey(r, at(2026, 3, 8, 12))).toBe('2026-03-08');
  });
});
