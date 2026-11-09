// The Later list did not say when anything came back.
//
// Power-test-1, issue 18: a tester put a weekly check off to "monday 9am",
// pressed Tab to Later, and found THREAD / PROJECT / PRIORITY / UPDATED with
// the row reading "4 min ago". "Each row should show when it returns (e.g. Mon
// 9:00 AM), so I can check my weekly checks are set." The return time existed
// in one place only: a toast that had already gone.
//
// Updated is the wrong fact on that page. Later is a list of things coming
// back, so its time column is when.

import { describe, expect, it } from 'vitest';
import { backWords, timeHeading, updatedWords } from '../renderer/src/threads/page-rules.ts';

// Local time, because the column prints a wall clock.
const MON_9AM = new Date(2026, 9, 26, 9, 0).getTime();
const now = new Date(2026, 9, 20, 22, 0).getTime();

describe('the time column on Later', () => {
  it('is headed by what it holds', () => {
    expect(timeHeading('snoozed')).toBe('Back');
  });

  it('leaves the other tabs alone', () => {
    expect(timeHeading('inbox')).toBe('Sent');
    expect(timeHeading('progress')).toBe('Sent');
    expect(timeHeading('done')).toBe('Done');
  });
});

describe('what one row says', () => {
  it('says the day and the clock the thread comes back on', () => {
    const words = backWords({ runAt: MON_9AM, wrote: { runAt: { source: 'founder' } } }, now);
    expect(words).toMatch(/Mon/);
    expect(words).toMatch(/9:00/);
  });

  it('reads a reminder you set the same as a schedule', () => {
    const reminder = backWords({ snoozedUntil: MON_9AM, wrote: { snoozedUntil: { source: 'founder' } } }, now);
    expect(reminder).toBe(backWords({ runAt: MON_9AM, wrote: { runAt: { source: 'founder' } } }, now));
  });

  it('is empty on a thread added to Later and never started, which says so itself', () => {
    expect(backWords({ start: 'later' }, now)).toBe('');
  });

  it('is empty rather than wrong on a row with no moment at all', () => {
    expect(backWords({}, now)).toBe('');
  });

  it('is not how long ago it was touched, which is what the page used to show', () => {
    expect(backWords({ runAt: MON_9AM, wrote: { runAt: { source: 'founder' } } }, now))
      .not.toBe(updatedWords(now - 4 * 60_000, now));
  });
});
