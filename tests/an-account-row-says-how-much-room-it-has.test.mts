// AN ACCOUNT ROW SAYS HOW MUCH ROOM IT HAS, AND A CLOUD ROW SAYS IT IS THE CLOUD'S.
//
// What broke (2026-10-16): Settings named one login at the top of Usage and
// listed the rest under Signed in with nothing but their plan, so with the work
// login at 5% and the Gmail one at 100% nothing on the page said which had
// room. And the cloud's own logins, the ones cloud runs actually used, were not
// on the Claude Code page at all.
import { describe, it, expect } from 'vitest';
import { cloudAccountState, cloudPlaceLine, hourWords, meterPair } from '../renderer/src/account-words.ts';

const at = (h, m = 0) => new Date(2026, 9, 16, h, m).getTime();
const session = (percent, extra = {}) => ({ span: 'session', qualifier: null, name: 'This session', percent, resetsText: null, resetsOn: null, resetsAt: null, zone: null, ...extra });

describe('the two meters every account shows', () => {
  it('one with room shows its number and when it resets, one at 99% is not yet full', () => {
    expect(meterPair([session(5, { resetsText: '8pm' })])[0]).toEqual({ key: 'session', word: 'Session', percent: 5, resets: '8pm' });
    expect(meterPair([session(99, { resetsText: '8pm' })])[0].percent).toBe(99);
  });

  it('a reset known only as a moment is printed as a clock', () => {
    expect(meterPair([session(100, { resetsAt: at(17, 10) })], at(15, 30))[0].resets).toBe('5:10pm');
  });

  const week = (percent, extra = {}) => ({ ...session(percent), span: 'week', name: 'This week', qualifier: 'all models', ...extra });

  it('her case: session full and back at 5:09pm, week at 15%', () => {
    expect(meterPair([session(100, { resetsText: '5:09pm' }), week(15)])).toEqual([
      { key: 'session', word: 'Session', percent: 100, resets: '5:09pm' },
      { key: 'week', word: 'Week', percent: 15, resets: null },
    ]);
  });

  it('the week is the all-models one, not a single model’s', () => {
    expect(meterPair([week(40, { qualifier: 'Fable' }), week(9)])[0].percent).toBe(9);
  });

  it('must NOT draw a meter it has no number for', () => {
    expect(meterPair(null)).toEqual([]);
    expect(meterPair([session(5)]).map((m) => m.key)).toEqual(['session']);
  });
});

describe('a login in the cloud', () => {
  const a = (extra) => ({ engine: 'claude', key: 'a1', name: null, ready: true, ...extra });

  it('her case: at its limit until 5:10pm', () => {
    expect(cloudAccountState(a({ state: 'limited', limitedUntil: at(17, 10) }), at(15, 30))).toBe('At its limit, back at 5:10pm');
  });

  it('a limit that has passed reads as ready', () => {
    expect(cloudAccountState(a({ state: 'ready', limitedUntil: at(17, 10) }), at(17, 11))).toBe('Ready');
  });

  it('a broken sign-in says where to fix it', () => {
    expect(cloudAccountState(a({ state: 'broken' }))).toMatch(/cloud menu/);
  });

  // AND NEVER "on these accounts in turn" (w-dac993a554): the cloud runs on one
  // account however many are signed in.
  it('the first row says when threads go there and on which account', () => {
    expect(cloudPlaceLine({ mode: 'full' }, 2)).toBe('Threads start here when this computer is full, on the account in use.');
    expect(cloudPlaceLine({ mode: 'all' }, 1)).toBe('Threads start here first, on this account.');
  });

  it('must NOT promise cloud runs while it is off', () => {
    expect(cloudPlaceLine({ mode: 'mac' }, 2)).toMatch(/^Off, so every thread runs on this computer/);
  });

  it('noon and midnight', () => {
    expect(hourWords(at(12))).toBe('12pm');
    expect(hourWords(at(0, 10))).toBe('12:10am');
  });
});
