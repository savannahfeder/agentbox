// "every monday 9am" in the Later box was "not a time".
//
// Power-test-1, issue 14: a tester opened their weekly dependency check,
// pressed L and typed the rhythm they run it on. The box offered 30 min / 4
// hours / tomorrow / next week and nothing else. "monday 9am" worked, once, so
// the answer was to remember to do it again every Monday for ever.
//
// The app has kept repeating tasks the whole time, and the grammar that reads
// "every monday at 9am" is the same one the new thread card and the reply box
// use. The Later box simply never asked it.

import { describe, expect, it } from 'vitest';
import { laterMeans } from '../renderer/src/components/Snooze.tsx';

const now = new Date(2026, 9, 20, 22, 0).getTime();

describe('what the Later box reads', () => {
  it('reads the rhythm the tester typed', () => {
    const read = laterMeans('every monday 9am', now);
    expect(read?.rule).toEqual({ every: 'week', at: '09:00', on: 1 });
    expect(read?.label).toContain('Mondays');
  });

  it('reads the other rhythms the rest of the app reads', () => {
    expect(laterMeans('every day at 8am', now)?.rule).toEqual({ every: 'day', at: '08:00' });
    expect(laterMeans('every weekday 7am', now)?.rule?.every).toBe('weekday');
  });

  it('still reads a one-off moment as a moment, and takes it first', () => {
    const read = laterMeans('monday 9am', now);
    expect(read?.rule).toBeUndefined();
    expect(typeof read?.ts).toBe('number');
    expect(read.ts).toBeGreaterThan(now);
  });

  it('still refuses words that are neither', () => {
    expect(laterMeans('satisfy the customer', now)).toBe(null);
    expect(laterMeans('', now)).toBe(null);
  });

  it('refuses a rhythm it could not keep rather than guessing one', () => {
    expect(laterMeans('every 3 minutes', now)).toBe(null);
  });
});
