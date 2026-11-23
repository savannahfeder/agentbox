// A REPLY ON A THREAD SET FOR LATER IS NOT SHOWN AS STILL SCHEDULED.
//
// On 2026-11-13 a power tester replied on a thread put off until tomorrow
// 2:40pm. The app runs a reply written after the moment at once
// (shared/answers.mts wordWaits, isDue), but the window read the moment
// alone (App.tsx dueAt = runAt), so the thread kept "Back to inbox ·
// Scheduled for tomorrow 2:40pm", stayed out of the inbox, and showed no
// queued or working state. Measured in the copy's ledger: the answer at
// 20:04:21, runAt written on Oct 29.
import { describe, it, expect } from 'vitest';
import { deferredUntil } from '../renderer/src/list-rules.ts';

const now = Date.UTC(2026, 10, 13, 20, 10);
const tomorrow = now + 18 * 3600_000;
const setLater = now - 15 * 86400_000;

const scheduled = {
  id: 'w-1', status: 'open', runAt: tomorrow,
  wrote: { runAt: { ts: setLater, source: 'founder' } },
};

describe('when a thread set for later is due, as the window reads it', () => {
  it('is now once you replied after setting it', () => {
    const replied = { ...scheduled, answer: 'please draft it now', wrote: { ...scheduled.wrote, answer: { ts: now - 60_000, source: 'founder' } } };
    expect(deferredUntil(replied)).toBe(0);
  });

  it('is its moment when nothing was said after it', () => {
    expect(deferredUntil(scheduled)).toBe(tomorrow);
    const saidBefore = { ...scheduled, answer: 'older words', wrote: { ...scheduled.wrote, answer: { ts: setLater - 60_000, source: 'founder' } } };
    expect(deferredUntil(saidBefore)).toBe(tomorrow);
  });

  it('is its moment again once a run has answered the reply', () => {
    const answered = { ...scheduled, answer: 'please draft it now', answeredThrough: now - 30_000, wrote: { ...scheduled.wrote, answer: { ts: now - 60_000, source: 'founder' } } };
    expect(deferredUntil(answered)).toBe(tomorrow);
  });

  it('is its moment for a reply set for later, written a moment before its time', () => {
    const later = { ...scheduled, answer: 'send this tomorrow', wrote: { runAt: { ts: now, source: 'founder' }, answer: { ts: now - 2, source: 'founder' } } };
    expect(deferredUntil(later)).toBe(tomorrow);
  });

  it('is 0 for a thread with no moment', () => {
    expect(deferredUntil({ id: 'w-2', status: 'open' })).toBe(0);
  });
});
