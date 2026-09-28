// A WEEKLY REPEAT KEEPS ITS DAY, AND A ONE-OFF DAY STAYS A ONE-OFF.
//
// They are two halves of the same day. A bare day name was read as a
// RECURRENCE, and `readWhen` gives the recurrence grammar first look, so the
// one-off she wanted was unreachable by typing. Then the rule that grammar
// built could not be stored, because both `composeRepeat` and `setRule`
// destructured the rule field by field and `on` was not among the fields: every
// weekly rule arrived at `isRepeatRule` with no day and was refused. Weekly
// repeats had never once worked.
//
// So: "every thursday" is the rule, "thursday" is the moment, and a rule that
// says a day arrives at the store still carrying it.
import { describe, it, expect } from 'vitest';
import { NAME } from '../shared/product-name.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseRepeat } from '../renderer/src/format';
import { readWhen } from '../renderer/src/components/When';
import { isRepeatRule, ruleLabel } from '../shared/repeats.mjs';
import { Repeats } from '../main/repeats.mjs';

// A Thursday noon, so "thursday at 8am" has a next Thursday to land on.
const THURSDAY_NOON = new Date(2026, 7, 27, 12, 0, 0, 0).getTime();

describe('a bare day name is a moment, not a rhythm', () => {
  it('reads "thursday at 8am" as one run on the next Thursday', () => {
    const v = readWhen('thursday at 8am', THURSDAY_NOON);
    expect(v?.repeat).toBe(null);
    const d = new Date(v.runAt);
    expect(d.getDay()).toBe(4);
    expect(d.getHours()).toBe(8);
    expect(d.getTime()).toBeGreaterThan(THURSDAY_NOON);
  });

  it('still reads "every thursday at 8am" as the weekly rule', () => {
    const v = readWhen('every thursday at 8am', THURSDAY_NOON);
    expect(v?.repeat).toEqual({ every: 'week', on: 4, at: '08:00' });
    expect(v.runAt).toBe(0);
  });

  // The plural is how a person says the rhythm without saying "every", and it
  // is the word the picker itself prints back, so it has to keep meaning a
  // rule.
  it('reads "thursdays at 8am" as the weekly rule', () => {
    const v = readWhen('thursdays at 8am', THURSDAY_NOON);
    expect(v?.repeat).toEqual({ every: 'week', on: 4, at: '08:00' });
  });

  it('leaves "daily at 8am" and "weekdays at 9am" alone', () => {
    expect(readWhen('daily at 8am', THURSDAY_NOON)?.repeat).toEqual({ every: 'day', at: '08:00' });
    expect(readWhen('weekdays at 9am', THURSDAY_NOON)?.repeat).toEqual({ every: 'weekday', at: '09:00' });
  });

  // Mid-sentence, a bare day name with a time is still how she changes a live
  // thread's rhythm, and BURIED_RE is the half of the grammar that reads it.
  it('still reads a buried "every thursday at 8am"', () => {
    const parsed = parseRepeat('Make this every thursday at 8am please');
    expect(parsed).toMatchObject({ rule: { every: 'week', on: 4, at: '08:00' } });
  });
});

describe('a weekly rule reaches the store with its day', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-weekly-'));
  const repeats = new Repeats({});

  it('accepts every week on Thursday at 08:00', () => {
    const rule = repeats.setRule(dir, {
      title: 'Run the panel', body: 'Body', priority: 5, every: 'week', on: 4, at: '08:00',
    });
    expect(rule.every).toBe('week');
    expect(rule.on).toBe(4);
    expect(isRepeatRule(rule)).toBe(true);
    expect(ruleLabel(rule)).toBe('Thursdays at 8:00am');
  });

  it('reads the day back off disk, not just out of the return value', () => {
    const stored = repeats.list(dir).find((r) => r.title === 'Run the panel');
    expect(stored.on).toBe(4);
    expect(isRepeatRule(stored)).toBe(true);
  });

  // The refusal still has to happen when the day is genuinely missing, because
  // a weekly rule with no day is a schedule nothing can keep.
  it('still refuses a weekly rule with no day at all', () => {
    expect(() => repeats.setRule(dir, { title: 'No day', every: 'week', at: '08:00' }))
      .toThrow(`not a schedule ${NAME} can keep`);
  });
});
