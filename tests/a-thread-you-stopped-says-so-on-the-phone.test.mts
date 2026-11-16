// A THREAD YOU STOPPED SAYS SO ON THE PHONE.
//
// In phone session m19 (2026-11-15) a thread the tester stopped showed only a
// "send back to agent" button, with no words saying it had been stopped or by
// whom. The computer marks it blocked by the person (shared/answers.mts
// `stoppedByHer`); the phone's live line had nothing for that state.
// Measured by calling liveOf on the row the stop leaves.
import { describe, it, expect } from 'vitest';
import { waitFacts } from '../renderer/src/phone-rows';
import { liveOf } from '../mobile/src/lib/thread-offers';

const T = Date.UTC(2026, 10, 15, 18, 0);
const view = { queued: [], runNow: [], stalled: [], shipping: [], signInNeeded: {}, atLimit: {}, paused: false, approvals: [] };
const stopped = { id: 'w-aaaaaaaaaa', product: 'p', title: 'Tidy the README', kind: 'directive', status: 'blocked', wrote: { status: { ts: T - 60_000, source: 'founder' } } };
const facts = (extra = {}) => ({ session: null, inProgress: false, now: T, ...waitFacts(view, stopped.id), ...extra });

describe('the line under a thread you stopped', () => {
  it('says you stopped it', () => {
    expect(liveOf(stopped, facts())).toMatchObject({ state: 'stopped', working: false, word: 'You stopped this' });
  });
  it('not when an agent or the app blocked it', () => {
    expect(liveOf({ ...stopped, wrote: { status: { ts: T - 60_000, source: 'agent' } } }, facts())).toBeNull();
  });
  it('not once your reply came after the stop', () => {
    const replied = { ...stopped, answer: 'try the other way', wrote: { ...stopped.wrote, answer: { ts: T - 30_000, source: 'founder' } } };
    expect(liveOf(replied, facts())?.state).not.toBe('stopped');
  });
  it('not while an agent runs on it again, or once it is closed', () => {
    expect(liveOf(stopped, facts({ session: { startedAt: T - 5_000 }, inProgress: true }))?.state).toBe('working');
    expect(liveOf({ ...stopped, status: 'done' }, facts())).toBeNull();
  });
});
