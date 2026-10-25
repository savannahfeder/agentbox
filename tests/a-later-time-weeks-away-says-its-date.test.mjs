// A time a week or more away says its date, not just its weekday.
//
// What broke: on Thursday 15 Oct, typing "3 weeks" into the Later box showed
// "THU 8:00 AM" beside it. The reading was right, Thursday 5 Nov at 8am, but
// the box only ever printed the weekday, so it looked like it had settled for
// this Thursday. Today is a Thursday and so is three weeks from now, so a
// weekday alone cannot tell them apart. The same weekday-only label was drawn
// by the Start later box, the Later list's time column and the Team page.
//
// The rule: inside the coming six days the weekday names one day and stands
// alone. From seven days on, the month and day are added.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWhen, dayAndTime } from '../renderer/src/format';

// Thursday 15 Oct 2026, 5:01pm local, the minute of the report.
const now = new Date(2026, 9, 15, 17, 1).getTime();
const at = (days, h = 8) => new Date(2026, 9, 15 + days, h, 0).getTime();

describe('a time weeks away says its date', () => {
  it('"3 weeks" on a Thursday is Thursday 5 Nov, and the label says Nov 5', () => {
    const when = parseWhen('3 weeks', now);
    expect(when.ts).toBe(new Date(2026, 10, 5, 8, 0).getTime());
    const label = dayAndTime(when.ts, now);
    expect(label).toMatch(/Nov/);
    expect(label).toMatch(/\b5\b/);
    expect(label).toMatch(/Thu/);
    expect(label).toMatch(/8:00/);
  });

  it('exactly a week out, the same weekday as today, carries the date', () => {
    expect(dayAndTime(at(7), now)).toMatch(/Oct 22/);
  });

  it('six days out the weekday alone is unambiguous and stays short', () => {
    const label = dayAndTime(at(6), now);
    expect(label).toMatch(/Wed/);
    expect(label).not.toMatch(/Oct/);
  });

  it('later today and tomorrow stay short', () => {
    expect(dayAndTime(at(0, 18), now)).not.toMatch(/Oct/);
    expect(dayAndTime(at(1), now)).not.toMatch(/Oct/);
  });

  it('a time already gone carries the date', () => {
    expect(dayAndTime(at(-3), now)).toMatch(/Oct 12/);
  });
});

describe('every box that prints a coming time uses it', () => {
  const files = [
    'renderer/src/components/Snooze.tsx',
    'renderer/src/components/When.tsx',
    'renderer/src/components/List.tsx',
    'renderer/src/team/company.ts',
  ];
  for (const file of files) {
    it(`${file} prints no weekday-only time of its own`, () => {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/weekday: 'short', hour: 'numeric'/);
      expect(src).toMatch(/dayAndTime/);
    });
  }
});
