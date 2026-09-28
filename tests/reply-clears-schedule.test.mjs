// A reply is a claim on now.
//
// She replied to the Lantern row at 11:39. Nothing visible happened, and
// nothing invisible either: the row stayed in Scheduled, and the supervisor's
// continuation pass skips an answered row that is not yet due, so her words
// were going to sit unread until 8am the next day. The reply had no effect on
// anything at all until a moment twenty hours away.
//
// Her call: replying pulls it back. It costs the approve-Friday-run-Monday
// case, which is now answer-then-S, and the reply's own undo restores the
// moment it cancelled.

import { describe, it, expect } from 'vitest';
import { replyClearsSchedule, statusForReply } from '../renderer/src/list-rules';

const NOW = 1_786_480_000_000;
const HOUR = 3_600_000;

describe('replying to a scheduled task', () => {
  it('cancels a schedule an agent set', () => {
    expect(replyClearsSchedule({ status: 'open', runAt: NOW + 20 * HOUR }, NOW)).toBe(true);
  });

  it('cancels a schedule she set herself', () => {
    // Her answer here was "yes" without a caveat, so this does not ask who
    // wrote the moment. One rule she can hold in her head.
    expect(replyClearsSchedule({
      status: 'open', runAt: NOW + 20 * HOUR, wrote: { runAt: { ts: NOW, source: 'founder' } },
    }, NOW)).toBe(true);
  });

  it('leaves an unscheduled task alone', () => {
    expect(replyClearsSchedule({ status: 'open' }, NOW)).toBe(false);
    expect(replyClearsSchedule({ status: 'open', runAt: 0 }, NOW)).toBe(false);
  });

  it('does nothing to a moment that has already passed', () => {
    // Nothing to cancel, and clearing runAt here would be a pointless write.
    expect(replyClearsSchedule({ status: 'open', runAt: NOW - HOUR }, NOW)).toBe(false);
  });

  it('is separate from what the reply does to status', () => {
    // The two rules answer different questions and must not be collapsed: a
    // reply to a claimed row leaves status alone (a worker is on it) but still
    // has every reason to cancel a schedule.
    expect(statusForReply('claimed')).toBeUndefined();
    expect(replyClearsSchedule({ status: 'claimed', runAt: NOW + HOUR }, NOW)).toBe(true);
  });
});
