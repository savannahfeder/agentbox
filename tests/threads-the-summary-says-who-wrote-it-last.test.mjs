// THE SUMMARY SAYS WHO WROTE IT LAST, AND HOW LONG AGO.
//
// Approved 2026-10-01 (w-e731ca9376, round 9). A thread's summary is three
// short lines the agent keeps current and the person can edit in place, and
// the later write wins. So the one faint line under them is the only thing on
// the screen that tells her whether she is reading the agent's words or her
// own: "Kept up to date by the agent · 19 min ago" or "Edited by you · 2 min
// ago". The fold already records who set each field and when (`wrote`), so
// this reads that and nothing else. The cases that must NOT match are the
// title and body, which she wrote at the start and are not the summary, and a
// teammate's edit, which is not "you".
import { describe, it, expect } from 'vitest';
import { agoWords, lastEdit, stateGlyph, STATE_WORD, readSummaryOpen, SUMMARY_OPEN_KEY } from '../renderer/src/threads/summary-rules.ts';

const NOW = Date.parse('2026-10-01T15:00:00');
const M = 60_000;

describe('how long ago, in words', () => {
  it('says just now under a minute, then minutes', () => {
    expect(agoWords(NOW - 20_000, NOW)).toBe('just now');
    expect(agoWords(NOW - M, NOW)).toBe('1 min ago');
    expect(agoWords(NOW - 19 * M, NOW)).toBe('19 min ago');
    expect(agoWords(NOW - 59 * M, NOW)).toBe('59 min ago');
  });
  it('says hours from the hour, then yesterday, then days', () => {
    expect(agoWords(NOW - 60 * M, NOW)).toBe('1 hour ago');
    expect(agoWords(NOW - 5 * 60 * M, NOW)).toBe('5 hours ago');
    expect(agoWords(NOW - 30 * 60 * M, NOW)).toBe('Yesterday');
    expect(agoWords(NOW - 3 * 24 * 60 * M, NOW)).toBe('3 days ago');
  });
  it('never says a time in the future', () => {
    expect(agoWords(NOW + 5 * M, NOW)).toBe('just now');
  });
});

describe('the line under the summary', () => {
  const item = (wrote) => ({ id: 'w-1', title: 'Acme', wrote });
  it('names the agent when the agent wrote last', () => {
    const it1 = item({ problem: { ts: NOW - 40 * M, source: 'founder' }, progress: { ts: NOW - 19 * M, source: 'agent' } });
    expect(lastEdit(it1, { me: 'p-sav', now: NOW })).toBe('Kept up to date by the agent · 19 min ago');
  });
  it('names you when you wrote last, with or without a person on the line', () => {
    expect(lastEdit(item({ solution: { ts: NOW - 2 * M, source: 'founder' } }), { me: 'p-sav', now: NOW })).toBe('Edited by you · 2 min ago');
    expect(lastEdit(item({ solution: { ts: NOW - 2 * M, source: 'founder', by: 'p-sav' } }), { me: 'p-sav', now: NOW })).toBe('Edited by you · 2 min ago');
  });
  it('names a teammate by their first name, not you', () => {
    const names = new Map([['p-maya', 'Maya Chen']]);
    expect(lastEdit(item({ progress: { ts: NOW - 4 * M, source: 'founder', by: 'p-maya' } }), { me: 'p-sav', names, now: NOW })).toBe('Edited by Maya · 4 min ago');
  });
  it('says nothing when only the title and body were ever written', () => {
    expect(lastEdit(item({ title: { ts: NOW, source: 'founder' }, body: { ts: NOW, source: 'founder' } }), { me: 'p-sav', now: NOW })).toBeNull();
    expect(lastEdit(item(undefined), { me: 'p-sav', now: NOW })).toBeNull();
  });
  it('counts an edit of yours still on its way to the ledger as the latest', () => {
    const it1 = item({ progress: { ts: NOW - 19 * M, source: 'agent' } });
    expect(lastEdit(it1, { me: 'p-sav', now: NOW, pending: { progress: NOW - 1000 } })).toBe('Edited by you · just now');
    // and an older pending edit loses to a newer agent write
    expect(lastEdit(it1, { me: 'p-sav', now: NOW, pending: { progress: NOW - 30 * M } })).toBe('Kept up to date by the agent · 19 min ago');
  });
});

describe('the state, as a word and a mark', () => {
  it('has exactly the four approved words', () => {
    expect(STATE_WORD).toEqual({ waiting: 'Waiting', running: 'Running', scheduled: 'Scheduled', done: 'Done' });
  });
  it('fills the mark when the thread waits on you and leaves it hollow when it waits on someone else', () => {
    expect(stateGlyph('waiting', true)).toBe('need');
    expect(stateGlyph('waiting', false)).toBe('wait');
    expect(stateGlyph('running', true)).toBe('run');
    expect(stateGlyph('scheduled', false)).toBe('sched');
    expect(stateGlyph('done', true)).toBe('done');
  });
});

describe('open or closed, remembered', () => {
  const store = (v) => ({ getItem: (k) => (k === SUMMARY_OPEN_KEY ? v : null) });
  it('is open the first time', () => {
    expect(SUMMARY_OPEN_KEY).toBe('threads.summary.open');
    expect(readSummaryOpen(store(null))).toBe(true);
  });
  it('stays closed once closed, and open once opened', () => {
    expect(readSummaryOpen(store('0'))).toBe(false);
    expect(readSummaryOpen(store('1'))).toBe(true);
  });
  it('reads open when storage throws', () => {
    expect(readSummaryOpen({ getItem: () => { throw new Error('denied'); } })).toBe(true);
  });
});
