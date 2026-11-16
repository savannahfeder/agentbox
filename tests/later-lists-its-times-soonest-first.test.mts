// LATER LISTS ITS TIMES SOONEST FIRST.
//
// In phone session m19 (2026-11-15, 2:05 PM) the Later sheet offered
// "In 4 hours, 6:05 PM" above "This evening, 6:00 PM": the presets were
// listed in a fixed order, not by time, so after 2 PM four hours runs past
// the evening. Measured with laterPresets at every quarter hour of a day.
import { describe, it, expect } from 'vitest';

const { laterPresets } = await import('../renderer/src/later-times.ts');
const labels = (now) => laterPresets(now).map((p) => p.label);

describe('Later', () => {
  it('after 2 PM, this evening comes before four hours from now', () => {
    expect(labels(new Date(2026, 10, 15, 14, 5).getTime())).toEqual(['In 30 minutes', 'This evening', 'In 4 hours', 'Tomorrow', 'Next week']);
  });
  it('before 2 PM, four hours from now still comes first', () => {
    expect(labels(new Date(2026, 10, 15, 13, 55).getTime())).toEqual(['In 30 minutes', 'In 4 hours', 'This evening', 'Tomorrow', 'Next week']);
  });
  it('at 5:45 PM this evening comes before thirty minutes from now', () => {
    expect(labels(new Date(2026, 10, 15, 17, 45).getTime()).slice(0, 2)).toEqual(['This evening', 'In 30 minutes']);
  });
  it('is in time order at every quarter hour of the week', () => {
    for (let q = 0; q < 7 * 96; q += 1) {
      const times = laterPresets(new Date(2026, 10, 15, 0, q * 15).getTime()).map((p) => p.ts);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    }
  });
});
