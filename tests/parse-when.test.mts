// The snooze grammar: tiny, deterministic, and it says no rather than guess.

import { describe, it, expect } from 'vitest';
import { parseWhen } from '../renderer/src/format';

// A fixed Wednesday, 10:00 local time.
const now = new Date(2026, 7, 5, 10, 0, 0).getTime();

describe('parseWhen', () => {
  it('relative minutes, hours and days', () => {
    expect(parseWhen('1m', now).ts).toBe(now + 60_000);
    expect(parseWhen('30m', now).ts).toBe(now + 30 * 60_000);
    expect(parseWhen('45 min', now).ts).toBe(now + 45 * 60_000);
    expect(parseWhen('3h', now).ts).toBe(now + 3 * 3_600_000);
    const twoDays = new Date(parseWhen('2d', now).ts);
    expect([twoDays.getDate(), twoDays.getHours()]).toEqual([7, 8]);
  });

  it('minutes never collide with weekday names or clock times', () => {
    expect(new Date(parseWhen('mon', now).ts).getDay()).toBe(1); // still Monday
    expect(new Date(parseWhen('6:30pm', now).ts).getHours()).toBe(18); // still a clock time
  });

  it('clock times land today or roll to tomorrow', () => {
    const evening = new Date(parseWhen('6:30pm', now).ts);
    expect([evening.getDate(), evening.getHours(), evening.getMinutes()]).toEqual([5, 18, 30]);
    const morning = new Date(parseWhen('8am', now).ts); // 8am already past at 10:00
    expect([morning.getDate(), morning.getHours()]).toEqual([6, 8]);
    const twentyFourH = new Date(parseWhen('18:30', now).ts);
    expect(twentyFourH.getHours()).toBe(18);
  });

  it('weekdays mean the NEXT occurrence at 8am', () => {
    const monday = new Date(parseWhen('mon', now).ts);
    expect([monday.getDay(), monday.getDate(), monday.getHours()]).toEqual([1, 10, 8]);
    const wednesday = new Date(parseWhen('wed', now).ts); // today is Wednesday
    expect(wednesday.getDate()).toBe(12);
  });

  it('rejects what it does not understand', () => {
    expect(parseWhen('after my meeting', now)).toBeNull();
    expect(parseWhen('99', now)).toBeNull();
    expect(parseWhen('', now)).toBeNull();
  });

  // The box has to accept the words printed in the list directly beneath it.
  // Typing the label you can SEE and being told it is not a time is what sent
  // an item back in thirty minutes when she had asked for the morning
  // (personal/, 2026-08-10, 5:32pm).
  it('accepts the words the picker itself prints', () => {
    const tomorrow = new Date(parseWhen('tomorrow', now).ts);
    expect([tomorrow.getDate(), tomorrow.getHours()]).toEqual([6, 8]);
    expect(parseWhen('tmrw', now).ts).toBe(tomorrow.getTime());

    const tonight = new Date(parseWhen('this evening', now).ts);
    expect([tonight.getDate(), tonight.getHours()]).toEqual([5, 18]);
    expect(parseWhen('tonight', now).ts).toBe(tonight.getTime());

    const week = new Date(parseWhen('next week', now).ts);
    expect([week.getDay(), week.getDate(), week.getHours()]).toEqual([1, 10, 8]);
  });

  it('reads the filler words a person types', () => {
    expect(parseWhen('in 30 minutes', now).ts).toBe(now + 30 * 60_000);
    expect(parseWhen('in an hour', now).ts).toBe(now + 3_600_000);
    expect(new Date(parseWhen('next monday', now).ts).getDay()).toBe(1);
  });

  // Past 6pm "this evening" has gone. It must roll to the next one rather than
  // silently schedule a moment in the past, which reads as "it came straight
  // back" (an overdue runAt is due forever).
  it('this evening rolls forward once 6pm has passed', () => {
    const late = new Date(2026, 7, 5, 20, 0, 0).getTime();
    const d = new Date(parseWhen('tonight', late).ts);
    expect([d.getDate(), d.getHours()]).toEqual([6, 18]);
  });
});
