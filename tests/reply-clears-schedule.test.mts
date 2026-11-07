// A reply is a claim on now.
//
// A reply to a scheduled row used to do nothing until the moment came: the
// supervisor skipped an answered row that was not yet due. So a reply cleared
// the moment, whoever set it. The cost, in use: Maya's message on the
// chief of staff's thread cleared the Monday 8:30 check it was parked for, and
// the agent could not book it again. Now the reply runs at once by itself
// (`wordWaits`, shared/work-items.mjs, pinned in
// a-message-on-a-scheduled-thread-runs-now-and-the-schedule-stays), so a reply
// lifts only a reminder and the moment to run stays.

import { describe, it, expect } from 'vitest';
import { replyClearsSchedule, statusForReply } from '../renderer/src/list-rules';

const NOW = 1_786_480_000_000;
const HOUR = 3_600_000;

describe('replying to a scheduled task', () => {
  it('keeps a schedule an agent set', () => {
    expect(replyClearsSchedule({ status: 'open', runAt: NOW + 20 * HOUR }, NOW)).toBe(false);
  });

  it('keeps a schedule she set herself', () => {
    expect(replyClearsSchedule({
      status: 'open', runAt: NOW + 20 * HOUR, wrote: { runAt: { ts: NOW, source: 'founder' } },
    }, NOW)).toBe(false);
  });

  it('lifts a reminder, which only hides the row', () => {
    expect(replyClearsSchedule({ status: 'open', snoozedUntil: NOW + HOUR }, NOW)).toBe(true);
  });

  it('leaves an unscheduled task alone', () => {
    expect(replyClearsSchedule({ status: 'open' }, NOW)).toBe(false);
    expect(replyClearsSchedule({ status: 'open', runAt: 0 }, NOW)).toBe(false);
  });

  it('does nothing to a moment that has already passed', () => {
    expect(replyClearsSchedule({ status: 'open', snoozedUntil: NOW - HOUR }, NOW)).toBe(false);
  });

  it('is separate from what the reply does to status', () => {
    // A reply to a claimed row leaves status alone (a worker is on it) but still lifts a reminder.
    expect(statusForReply('claimed')).toBeUndefined();
    expect(replyClearsSchedule({ status: 'claimed', snoozedUntil: NOW + HOUR }, NOW)).toBe(true);
  });
});
