// The recurrence grammar.
//
// The third answer is what makes the failure loud. With two, a phrase it cannot
// read is indistinguishable from prose, so it becomes a one-shot in silence and
// she finds out tomorrow, when the thing she set up did not happen.

import { describe, it, expect } from 'vitest';
import { parseRepeat } from '../renderer/src/format';

describe('parseRepeat', () => {
  it('reads the sentences a person actually types', () => {
    expect(parseRepeat('Every day at 9am, run onboarding QA')).toMatchObject({ rule: { every: 'day', at: '09:00' } });
    expect(parseRepeat('daily at 9')).toMatchObject({ rule: { at: '09:00' } });
    expect(parseRepeat('every morning at 7:30, check signups')).toMatchObject({ rule: { at: '07:30' } });
    expect(parseRepeat('Every day at 17:00')).toMatchObject({ rule: { at: '17:00' } });
    expect(parseRepeat('every day at 5pm, sweep the inbox')).toMatchObject({ rule: { at: '17:00' } });
    expect(parseRepeat('each day at 12am, tidy up')).toMatchObject({ rule: { at: '00:00' } });
    expect(parseRepeat('every day at 12pm, tidy up')).toMatchObject({ rule: { at: '12:00' } });
  });

  it('gives a day-shaped phrase the 8am parseWhen already uses', () => {
    expect(parseRepeat('every morning, check signups')).toMatchObject({ rule: { at: '08:00' } });
    expect(parseRepeat('every day, run the QA pass')).toMatchObject({ rule: { at: '08:00' } });
    expect(parseRepeat('daily')).toMatchObject({ rule: { at: '08:00' } });
  });

  it('labels what it read, so she can check it before she sends', () => {
    expect(parseRepeat('every day at 9am, x').label).toBe('daily at 9:00am');
    expect(parseRepeat('every day at 17:00, x').label).toBe('daily at 5:00pm');
  });

  it('is silent on ordinary prose', () => {
    expect(parseRepeat('run onboarding QA')).toBeNull();
    expect(parseRepeat('fix the signup counter, it reads zero every day')).toBeNull();
    expect(parseRepeat('the daily report is wrong')).toBeNull();
    expect(parseRepeat('')).toBeNull();
    expect(parseRepeat('   ')).toBeNull();
  });

  // The loud failure. Silently becoming a one-shot is the same class of bug as
  // swallowing something the user said.
  it('says when it sees a recurrence it cannot read', () => {
    expect(parseRepeat('every day at half past nine, run QA')).toEqual({ unreadable: true });
    expect(parseRepeat('every day at 25:00, run QA')).toEqual({ unreadable: true });
    expect(parseRepeat('every day at 9:99, run QA')).toEqual({ unreadable: true });
    expect(parseRepeat('every other day, run QA')).toEqual({ unreadable: true });
    expect(parseRepeat('every night at 9pm, run QA')).toEqual({ unreadable: true });
  });

  it('reads only the opening clause, so the task itself cannot change the schedule', () => {
    const parsed = parseRepeat('Every day at 9am, tell me if signups every hour drop');
    expect(parsed).toMatchObject({ rule: { at: '09:00' } });
  });
});

// The reply field only ever sees the BURIED shape: she is answering a thread,
// so the schedule arrives inside a sentence rather than opening it. An
// opener-only grammar showed her nothing in the one place she was most likely
// to type, which is how this was found: in the app, not in a test
// (2026-08-12).
describe('parseRepeat, buried in a sentence', () => {
  it('reads a schedule out of the middle of a reply', () => {
    expect(parseRepeat('Make this daily at 7am, I want it done before I am up.'))
      .toMatchObject({ rule: { every: 'day', at: '07:00' } });
    expect(parseRepeat('can you run this every day at 6:30pm instead'))
      .toMatchObject({ rule: { at: '18:30' } });
    expect(parseRepeat('please do this every morning at 8')).toMatchObject({ rule: { at: '08:00' } });
  });

  // Buried, it must carry an explicit time. That requirement is the whole
  // defence against reading prose as a schedule.
  it('stays silent on prose that merely mentions a rhythm', () => {
    expect(parseRepeat('the counter reads zero every day and it is wrong')).toBeNull();
    expect(parseRepeat('this happens every morning without fail')).toBeNull();
    expect(parseRepeat('sales are up every day this week')).toBeNull();
  });

  it('still refuses a buried rhythm it cannot keep', () => {
    expect(parseRepeat('make this every other day at 9am')).toEqual({ unreadable: true });
    expect(parseRepeat('make this every night at 9pm')).toEqual({ unreadable: true });
  });

  it('an opener anywhere in the first line still wins, time optional', () => {
    expect(parseRepeat('Ship the fix, every morning check the counter'))
      .toMatchObject({ rule: { at: '08:00' } });
  });
});

// Weekdays and one day a week: the two shapes people ask for as soon as
// "every day" is not what they meant.
describe('parseRepeat, beyond every day', () => {
  it('reads Monday to Friday', () => {
    expect(parseRepeat('every weekday at 9am, run QA')).toMatchObject({ rule: { every: 'weekday', at: '09:00' } });
    expect(parseRepeat('weekdays at 8')).toMatchObject({ rule: { every: 'weekday', at: '08:00' } });
    expect(parseRepeat('make this every weekday at 7:30am')).toMatchObject({ rule: { every: 'weekday', at: '07:30' } });
  });

  it('reads one day a week, however she abbreviates it', () => {
    expect(parseRepeat('every thursday at 9am, run QA')).toMatchObject({ rule: { every: 'week', on: 4, at: '09:00' } });
    expect(parseRepeat('thursdays at 6pm')).toMatchObject({ rule: { every: 'week', on: 4, at: '18:00' } });
    expect(parseRepeat('every mon at 9am')).toMatchObject({ rule: { every: 'week', on: 1, at: '09:00' } });
    expect(parseRepeat('every tues at 9am')).toMatchObject({ rule: { every: 'week', on: 2, at: '09:00' } });
    expect(parseRepeat('every wed at 9am')).toMatchObject({ rule: { every: 'week', on: 3, at: '09:00' } });
    expect(parseRepeat('every sat at 10am')).toMatchObject({ rule: { every: 'week', on: 6, at: '10:00' } });
  });

  // This line used to assert the opposite, that a bare "thursday" was a weekly
  // rule, and that assertion was the bug: with the recurrence grammar reading
  // first, a singular day name left NO way to type a one-off on that day. The
  // plural and the "every" still mean the habit.
  it('leaves a singular day name to the one-off grammar', () => {
    expect(parseRepeat('thursday')).toBe(null);
    expect(parseRepeat('thursday at 8am')).toBe(null);
    expect(parseRepeat('mon at 9am')).toBe(null);
    expect(parseRepeat('every thursday at 8am')).toMatchObject({ rule: { every: 'week', on: 4, at: '08:00' } });
    expect(parseRepeat('thursdays at 8am')).toMatchObject({ rule: { every: 'week', on: 4, at: '08:00' } });
  });

  it('labels each shape the way the tag and the row will print it', () => {
    expect(parseRepeat('every weekday at 9am').label).toBe('weekdays at 9:00am');
    expect(parseRepeat('every thursday at 9am').label).toBe('Thursdays at 9:00am');
    expect(parseRepeat('every day at 9am').label).toBe('daily at 9:00am');
  });
});
