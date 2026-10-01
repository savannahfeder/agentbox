// THE NEW THREAD COMPOSER: SEND LATER LANDS AT EIGHT IN THE MORNING, LOCAL TIME.
//
// The caret on the Send button (w-e731ca9376, approved 2026-10-01) offers
// "Tomorrow morning" and "Monday morning", each with its moment on the right
// ("Fri 8:00"), and "Pick a date and time". What is sent is a `runAt`, which
// the store holds as a predicate rather than a timer, so the only thing this
// card owns is which moment it means. The case that has to be pinned is Monday:
// pressed ON a Monday it means the next one, seven days on, never "today at
// eight", which would run at once whenever it is already past eight.
//
// Every date below is built in local time, the same way the card builds them,
// so these hold in any timezone the suite runs in. 2026-10-01 is a Thursday.
import { describe, it, expect } from 'vitest';
import { tomorrowMorning, mondayMorning, laterHint, momentFromInput, inputValueOf } from '../renderer/src/threads/composer-rules.ts';

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('Tomorrow morning', () => {
  it('is the next calendar day at 8:00', () => {
    expect(tomorrowMorning(at(2026, 10, 1, 15, 30))).toBe(at(2026, 10, 2, 8));
  });

  it('crosses a month end', () => {
    expect(tomorrowMorning(at(2026, 10, 31, 23, 59))).toBe(at(2026, 11, 1, 8));
  });

  it('is still tomorrow when pressed before eight today', () => {
    expect(tomorrowMorning(at(2026, 10, 1, 6, 0))).toBe(at(2026, 10, 2, 8));
  });
});

describe('Monday morning', () => {
  it('is the coming Monday at 8:00 from a Thursday', () => {
    expect(mondayMorning(at(2026, 10, 1, 15))).toBe(at(2026, 10, 5, 8));
  });

  it('is tomorrow from a Sunday', () => {
    expect(mondayMorning(at(2026, 10, 4, 21))).toBe(at(2026, 10, 5, 8));
  });

  it('is a week on when pressed on a Monday, even before eight', () => {
    expect(mondayMorning(at(2026, 10, 5, 7))).toBe(at(2026, 10, 12, 8));
  });
});

describe('the hint on the right of each row', () => {
  it('says the short day and the clock', () => {
    expect(laterHint(at(2026, 10, 2, 8))).toBe('Fri 8:00');
    expect(laterHint(at(2026, 10, 5, 14, 5))).toBe('Mon 14:05');
  });
});

describe('Pick a date and time', () => {
  const now = at(2026, 10, 1, 12);

  it('reads the date input as local time', () => {
    expect(momentFromInput('2026-10-03T09:30', now)).toBe(at(2026, 10, 3, 9, 30));
  });

  it('refuses a moment that has already passed', () => {
    expect(momentFromInput('2026-10-01T11:59', now)).toBeNull();
  });

  it('refuses an empty or broken value', () => {
    expect(momentFromInput('', now)).toBeNull();
    expect(momentFromInput('tomorrow', now)).toBeNull();
  });

  it('opens on a value the input can show, and reads back the same moment', () => {
    const t = at(2026, 10, 2, 8);
    expect(inputValueOf(t)).toBe('2026-10-02T08:00');
    expect(momentFromInput(inputValueOf(t), now)).toBe(t);
  });
});
