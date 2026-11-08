// A THREAD ASKING YOUR PERMISSION SAYS ASKING ON THE PHONE, NOT NOTHING RUNNING.
//
// The 2026-11-06 phone workday (issue 23): the foot of "Write the launch
// script" said Nothing running right above the card asking to run ffmpeg for
// that same thread. The desktop reads a waiting approval as `asking`
// (live-line.ts), above the session; the phone never told liveLine about its
// approvals, so a thread stopped on one read Nothing running with no session
// and Working with one.
import { describe, it, expect } from 'vitest';
import { waitFacts } from '../renderer/src/phone-rows';
import { liveOf } from '../mobile/src/lib/thread-offers';

const T = Date.UTC(2026, 10, 6, 18, 0);
const item = { id: 'w-aaaaaaaaaa', product: 'film', title: 'Write the launch script', status: 'open', kind: 'directive' };
const view = (approvals) => ({ queued: [], runNow: [], stalled: [], shipping: [], signInNeeded: {}, atLimit: {}, paused: false, approvals });
const ask = (id) => ({ id: 'ap-1', at: T, product: 'film', item: id, tool: 'Bash', input: { command: 'ffmpeg -i a.mov b.mp4' } });
const session = { startedAt: T - 120_000, activity: [{ id: 'a', label: 'Running ffmpeg', detail: '' }] };

describe('the line under a thread with an approval waiting', () => {
  it('says Asking with no session', () => {
    expect(liveOf(item, { session: null, inProgress: true, now: T, ...waitFacts(view([ask(item.id)]), item.id) })).toMatchObject({ state: 'asking', word: 'Asking' });
  });
  it('says Asking over a live session, as the desktop does', () => {
    expect(liveOf(item, { session, inProgress: true, now: T, ...waitFacts(view([ask(item.id)]), item.id) })).toMatchObject({ state: 'asking', word: 'Asking' });
  });
  it('an approval for another thread changes nothing here', () => {
    expect(liveOf(item, { session: null, inProgress: true, now: T, ...waitFacts(view([ask('w-bbbbbbbbbb')]), item.id) })?.state).not.toBe('asking');
    expect(liveOf(item, { session, inProgress: true, now: T, ...waitFacts(view([ask('w-bbbbbbbbbb')]), item.id) })?.state).toBe('working');
  });
  it('a closed thread says nothing, approval or not', () => {
    expect(liveOf({ ...item, status: 'done' }, { session: null, inProgress: false, now: T, ...waitFacts(view([ask(item.id)]), item.id) })).toBeNull();
  });
});
