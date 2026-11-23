// The freeze log for 2026-11-21 put clockLabel (shared/repeats.mts) fourth: 80
// holds, 61 s, under the Teammates view that publishSettings builds for the
// phone. Every call went through toLocaleTimeString, which builds a new date
// formatter each time: 56 µs a label, measured over 20,000 labels. A time is
// now worded once and the words are kept.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clockLabel } from '../shared/repeats.mts';
import { dutyWhen } from '../shared/teammates.mts';

afterEach(() => { vi.restoreAllMocks(); });

describe('a clock time', () => {
  it('reads the same as before', () => {
    const local = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, ''); };
    for (const [at, h, m] of [['00:00', 0, 0], ['09:05', 9, 5], ['12:00', 12, 0], ['12:01', 12, 1], ['23:59', 23, 59]] as const)
      expect(clockLabel(at)).toBe(local(h, m));
  });

  it('is not worded again on every look', () => {
    dutyWhen({ every: 'day', at: ['08:30', '15:00'] });
    const slow = vi.spyOn(Date.prototype, 'toLocaleTimeString');
    const made = vi.spyOn(Intl, 'DateTimeFormat');
    for (let i = 0; i < 100; i++) dutyWhen({ every: 'day', at: ['08:30', '15:00'] });
    expect(slow).not.toHaveBeenCalled();
    expect(made.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('tells two different times apart', () => {
    expect(clockLabel('08:30')).not.toBe(clockLabel('20:30'));
    expect(clockLabel('08:30')).not.toBe(clockLabel('08:31'));
  });
});
