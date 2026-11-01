// A READING THAT CONTRADICTS THE CLOUD'S IS NOT SHOWN.
//
// What broke (2026-10-30, 14:42): the cloud looked at a second account at 14:41:58 and
// read 39% session and 6% week, the week resetting Thu Nov 5 at 11am. This
// computer's reading landed a few seconds later with 45% and 59%, the week
// resetting Sun Nov 1 at 1pm, and the page drew the newer one. Two readings of
// one subscription a few seconds apart cannot be in two different weeks, and
// the cloud's is the one whose account is proven: its organization comes back
// on the same reply as its numbers.
//
// The fix: when the two disagree about when a window still running resets,
// the cloud's reading is shown. A reading main could not confirm is not shown
// at all, not even the corner's copy of it.
import { describe, it, expect } from 'vitest';
import { accountsOnce } from '../renderer/src/accounts-once.ts';

const MIN = 60_000;
const T = Date.parse('2026-10-30T21:42:00Z');
const SUN = Date.parse('2026-11-01T21:00:00Z');
const THU = Date.parse('2026-11-05T19:00:00Z');
const limits = (session, sessionReset, week, weekReset) => [
  { span: 'session', qualifier: null, name: 'This session', percent: session, resetsText: null, resetsOn: null, resetsAt: sessionReset, zone: null },
  { span: 'week', qualifier: 'all models', name: 'This week', percent: week, resetsText: null, resetsOn: null, resetsAt: weekReset, zone: null },
];
const here = (profile, extra = {}) => ({ profile, email: 'second@example.test', plan: 'Max 20x', chosen: false, signedIn: true, trouble: null, dir: profile, ...extra });
const cloud = (extra = {}) => ({ engine: 'claude', key: 'acct-1', name: null, ready: true, state: 'ready', profile: '/h/.claude-3', ...extra });
const percents = (one) => one.limits?.map((l) => l.percent) ?? null;

describe('this computer’s reading against the cloud’s', () => {
  it('the reported case: a newer reading here in another week loses to the cloud’s', () => {
    const [one] = accountsOnce({
      here: [here('/h/.claude-3')],
      cloud: [cloud({ limits: limits(39, T + 58 * MIN, 6, THU), readAt: T - 2_000 })],
      readings: [{ profile: '/h/.claude-3', at: T, limits: limits(45, T + 78 * MIN, 59, SUN) }],
    });
    expect([percents(one), one.checkedAt]).toEqual([[39, 6], T - 2_000]);
  });

  it('readings that agree: the newer one is shown, as before', () => {
    const [one] = accountsOnce({
      here: [here('/h/.claude-3')],
      cloud: [cloud({ limits: limits(39, T + 58 * MIN, 6, THU), readAt: T - 2_000 })],
      readings: [{ profile: '/h/.claude-3', at: T, limits: limits(40, T + 58 * MIN, 7, THU + 30_000) }],
    });
    expect(percents(one)).toEqual([40, 7]);
  });

  it('must NOT call it a contradiction when the cloud read the window before it reset', () => {
    const [one] = accountsOnce({
      here: [here('/h/.claude-3')],
      cloud: [cloud({ limits: limits(90, T - MIN, 6, THU), readAt: T - 10 * MIN })],
      readings: [{ profile: '/h/.claude-3', at: T, limits: limits(3, T + 5 * 60 * MIN, 7, THU) }],
    });
    expect(percents(one)).toEqual([3, 7]);
  });

  it('must NOT compare readings hours apart, when the limits themselves may have changed', () => {
    const [one] = accountsOnce({
      here: [here('/h/.claude-3')],
      cloud: [cloud({ limits: limits(39, T + 58 * MIN, 6, THU), readAt: T - 3 * 60 * MIN })],
      readings: [{ profile: '/h/.claude-3', at: T, limits: limits(45, T + 78 * MIN, 59, SUN) }],
    });
    expect(percents(one)).toEqual([45, 59]);
  });
});

describe('a reading main could not confirm', () => {
  it('is not drawn, and the card says why', () => {
    const [one] = accountsOnce({
      here: [here('/h/.claude-3')],
      readings: [{ profile: '/h/.claude-3', unconfirmed: true, error: 'It reported the same usage as another account.' }],
    });
    expect([one.limits, one.usageError]).toEqual([null, 'It reported the same usage as another account.']);
  });

  it('must NOT fall back to the corner’s copy of the same account', () => {
    const [one] = accountsOnce({
      here: [here('/h/.claude-3', { chosen: true })],
      readings: [{ profile: '/h/.claude-3', unconfirmed: true, error: 'It reported the same usage as another account.' }],
      current: { engine: 'claude', profile: '/h/.claude-3', at: T, limits: limits(45, T + 78 * MIN, 59, SUN) },
    });
    expect(one.limits).toBeNull();
  });

  it('the cloud’s reading of it is still shown, since its account is proven', () => {
    const [one] = accountsOnce({
      here: [here('/h/.claude-3')],
      cloud: [cloud({ limits: limits(39, T + 58 * MIN, 6, THU), readAt: T - 2_000 })],
      readings: [{ profile: '/h/.claude-3', unconfirmed: true, error: 'It reported the same usage as another account.' }],
    });
    expect([percents(one), one.usageError]).toEqual([[39, 6], null]);
  });
});
