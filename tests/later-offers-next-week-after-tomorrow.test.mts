// The power test ran on a Sunday evening: the Later menu offered Tomorrow
// and Next week as the same moment, Monday at 8am, and the tester stopped to
// work out which to pick. On a Sunday, next week now means the Monday after.
import { describe, it, expect } from 'vitest';

const { laterPresets } = await import('../renderer/src/later-times.ts');
const at = (label, now) => new Date(laterPresets(now).find((p) => p.label === label).ts);

describe('Later', () => {
  it('on a Sunday, offers next week as the Monday after tomorrow', () => {
    const sunday = new Date(2026, 9, 25, 21, 30).getTime();
    expect(at('Tomorrow', sunday).getDate()).toBe(26);
    expect(at('Next week', sunday).getDate()).toBe(2);
    expect(at('Next week', sunday).getMonth()).toBe(10);
  });

  it('on a Saturday and on a Monday, offers the coming Monday as before', () => {
    expect(at('Next week', new Date(2026, 9, 24, 10, 0).getTime()).getDate()).toBe(26);
    expect(at('Next week', new Date(2026, 9, 26, 10, 0).getTime()).getDate()).toBe(2);
  });

  it('never offers two choices for the same moment', () => {
    for (let d = 19; d <= 25; d += 1) {
      const times = laterPresets(new Date(2026, 9, d, 21, 0).getTime()).map((p) => p.ts);
      expect(new Set(times).size).toBe(times.length);
    }
  });
});
