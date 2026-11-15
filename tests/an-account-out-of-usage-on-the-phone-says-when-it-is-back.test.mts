// AN ACCOUNT OUT OF USAGE ON THE PHONE SAYS WHEN IT IS BACK (w-e4d49a1539).
//
// 2026-11-02 phone workday, issue 24: an account said "Out of usage until
// 6:19pm" late in the evening, with no day, so the tester could not tell
// whether it meant tomorrow or was stale. That line was the preview's own; the
// computer's real one said only "At its limit. Agents start again on their own
// when it resets", with no time at all. The computer now sends when the account
// resets, and the phone says it with its day.
import { describe, it, expect } from 'vitest';
import { phoneSettingsOf } from '../shared/phone-settings.mts';
import { backAt } from '../mobile/src/lib/back-at';

const at = (s) => new Date(s).getTime();
const NOW = at('2026-11-03T21:30:00');

describe('when an account is back, as the phone says it', () => {
  it('later today: the time', () => {
    expect(backAt(at('2026-11-03T23:10:00'), NOW)).toBe('Out of usage until 11:10pm');
  });
  it('tomorrow: tomorrow and the time, as at the tester\'s evening check', () => {
    expect(backAt(at('2026-11-04T18:19:00'), NOW)).toBe('Out of usage until tomorrow 6:19pm');
  });
  it('later this week: the day and the time', () => {
    expect(backAt(at('2026-11-06T09:00:00'), NOW)).toBe('Out of usage until Fri 9:00am');
  });
  it('a week or more away: the date', () => {
    expect(backAt(at('2026-11-12T09:00:00'), NOW)).toBe('Out of usage until Nov 12 9:00am');
  });
  it('a time already gone says nothing, rather than a reset that is stale', () => {
    expect(backAt(at('2026-11-03T18:19:00'), NOW)).toBeNull();
    expect(backAt(null, NOW)).toBeNull();
  });
});

describe('what the computer sends', () => {
  it('carries when an account at its limit resets', () => {
    const model = { ok: true, workspace: { accounts: [{ profile: '/h/.claude-2', email: 'a@b.c', state: 'at-limit', trouble: { cause: 'at-limit', note: 'At its limit.', resetsAt: at('2026-11-04T18:19:00') }, running: 0 }] } };
    expect(phoneSettingsOf(model, { version: 1 }).workspace.accounts[0]).toMatchObject({ id: '.claude-2', resetsAt: at('2026-11-04T18:19:00') });
  });
  it('and nothing for an account that is fine', () => {
    const model = { ok: true, workspace: { accounts: [{ profile: 'default', email: 'a@b.c', state: 'live', trouble: null, running: 1 }] } };
    expect(phoneSettingsOf(model, { version: 1 }).workspace.accounts[0].resetsAt).toBeNull();
  });
});
