// A clean run is not news, and that has to hold everywhere news is counted,
// not only in the inbox. A daily quiet run that manufactures a digest, wakes
// the drive, or inflates what she cleared is a daily lie in three places.
//
// The suppression itself is the dangerous half of this feature: it is the only
// rule in the app that makes finishing hide something. So every case here that is
// NOT explicitly marked clean must stay exactly as loud as it was.

import { describe, it, expect } from 'vitest';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules';
import { isCleanRun } from '../shared/repeats.mjs';

const run = (over = {}) => ({
  status: 'done',
  labels: ['founder', 'repeat:r-abc1234567'],
  updatedAt: 5_000,
  wrote: { status: { ts: 5_000, source: 'agent' } },
  ...over,
});
const clean = (over = {}) => run({ labels: ['founder', 'repeat:r-abc1234567', 'clean'], ...over });

describe('a clean run', () => {
  it('is not in her inbox', () => {
    expect(belongsInInbox(clean())).toBe(false);
  });

  it('is still not in her inbox once it is old', () => {
    expect(belongsInInbox(clean(), { deliveredThrough: 0, now: 9_000_000 })).toBe(false);
  });
});

describe('everything that is not explicitly clean', () => {
  it('an unmarked finished run IS in her inbox', () => {
    expect(belongsInInbox(run())).toBe(true);
  });

  it('a run that finished with news is in her inbox', () => {
    expect(belongsInInbox(run({ result: 'email verification took 41 seconds' }))).toBe(true);
  });

  it('a blocked run is in her inbox', () => {
    expect(belongsInInbox(run({ status: 'blocked' }))).toBe(true);
  });

  it('a run still going is in progress, not hidden', () => {
    expect(belongsInProgress(run({ status: 'claimed' }))).toBe(true);
  });

  // The label alone must not hide an ordinary item: this predicate hides
  // things, so it may only fire on something that is genuinely one run.
  it('the clean label on something that is not a run hides nothing', () => {
    expect(isCleanRun({ labels: ['founder', 'clean'] })).toBe(false);
    expect(belongsInInbox(run({ labels: ['founder', 'clean'] }))).toBe(true);
  });

  it('she can still archive a clean run herself without it coming back', () => {
    const archived = clean({ wrote: { status: { ts: 6_000, source: 'founder' } } });
    expect(belongsInInbox(archived)).toBe(false);
  });
});
