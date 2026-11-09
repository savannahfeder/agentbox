// A THREAD JUST SENT READ "NOTHING RUNNING" WITH TRY AGAIN (QA batch 011, F-196).
//
// A tester filed "Add an average" with Ctrl+Enter and pressed O. The thread
// opened in In progress reading Nothing running, with a Try again button; a
// moment later it read Queued and an agent took it. The window draws the new
// row before the next fleet snapshot lists it in `queued`, so `liveLine` fell
// through to idle. A Try again on a thread sent a second ago invites a second send.
import { describe, it, expect } from 'vitest';
import { liveLine } from '../renderer/src/live-line.ts';
import { offersTryAgain } from '../renderer/src/try-again.ts';

const NOW = Date.parse('2026-11-02T23:48:00Z');
const SEC = 1000;

const thread = (sentAgo, over = {}) => ({
  id: 'w-1', product: 'avg-js', productName: 'Avg JS', status: 'open', kind: 'directive', title: 'Add an average', body: '',
  labels: ['founder'], priority: 2, createdAt: NOW - sentAgo, updatedAt: NOW - sentAgo, claim: null,
  wrote: { title: { ts: NOW - sentAgo, source: 'founder' } },
  ...over,
});
const fleet = (over = {}) => ({ queued: [], runNow: [], signInNeeded: {}, atLimit: {}, inProgress: true, now: NOW, ...over });

describe('a thread sent moments ago, before the queue has listed it', () => {
  it('reads Queued and offers no Try again', () => {
    expect(liveLine(thread(1 * SEC), fleet())?.state).toBe('queued');
    expect(offersTryAgain(thread(1 * SEC), fleet())).toBe(false);
  });

  it('still does at 29 seconds', () => {
    expect(liveLine(thread(29 * SEC), fleet())?.state).toBe('queued');
  });

  it('a reply sent moments ago to an old thread reads the same', () => {
    const old = thread(3600 * SEC, { wrote: { title: { ts: NOW - 3600 * SEC, source: 'founder' }, answer: { ts: NOW - 2 * SEC, source: 'founder' } } });
    expect(liveLine(old, fleet())?.state).toBe('queued');
  });
});

describe('what still reads Nothing running', () => {
  it('a thread sent over half a minute ago that nothing picked up', () => {
    expect(liveLine(thread(31 * SEC), fleet())?.state).toBe('idle');
    expect(offersTryAgain(thread(31 * SEC), fleet())).toBe(true);
  });

  it('paused agents say Paused, however new the thread', () => {
    expect(liveLine(thread(1 * SEC), fleet({ paused: true }))?.state).toBe('paused');
  });

  it('a thread an agent has already claimed, a second after it was sent', () => {
    expect(liveLine(thread(1 * SEC, { epoch: 1, wrote: { title: { ts: NOW - SEC, source: 'founder' }, status: { ts: NOW, source: 'agent' } } }), fleet())?.state).toBe('idle');
  });

  it('a reply an agent has already answered', () => {
    const old = thread(3600 * SEC, { epoch: 2, wrote: { answer: { ts: NOW - 5 * SEC, source: 'founder' }, result: { ts: NOW - 2 * SEC, source: 'agent' } } });
    expect(liveLine(old, fleet())?.state).toBe('idle');
  });

  it('an agent writing on it is not her sending it', () => {
    const old = thread(3600 * SEC, { wrote: { title: { ts: NOW - 3600 * SEC, source: 'founder' }, result: { ts: NOW - 2 * SEC, source: 'agent' } } });
    expect(liveLine(old, fleet())?.state).toBe('idle');
  });
});
