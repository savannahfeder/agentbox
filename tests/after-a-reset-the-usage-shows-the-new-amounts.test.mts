// AFTER A RESET THE USAGE SHOWS THE NEW AMOUNTS (w-99a2196117).
//
// What broke (2026-11-24): the Claude account hit its limit, the limit was
// reset early, and Refresh had the cloud read the account at 0% for the week.
// The new amount still did not show everywhere. The usage bar in the sidebar
// takes only this Mac's own reading, so it kept the old figure until that
// reader came round again. And `_limitedUntil` believed the cloud's older
// reading at 100% whatever came after it, so the account stayed "out of
// usage" (the compose box's note, the move to another account) though this
// Mac had since read it with room.
//
// Now a cloud reading of the account in use reaches the sidebar's reading,
// and the newer of the two readings decides whether the account is full.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Supervisor } from '../main/supervisor.mts';

const NOW = Date.now();
const MIN = 60_000;
const PROFILE = '/Users/her/.claude-2';
const fullWeek = [{ span: 'session', percent: 40, resetsAt: NOW + 3 * 60 * MIN }, { span: 'week', percent: 100, resetsAt: NOW + 2 * 24 * 60 * MIN }];
const roomy = [{ span: 'session', percent: 2, resetsAt: NOW + 5 * 60 * MIN }, { span: 'week', percent: 0, resetsAt: NOW + 7 * 24 * 60 * MIN }];

const make = (cloudReading: { limits: unknown[]; readAt: number }) => {
  const s = new Supervisor(
    { storeRoot: '/nonexistent-zero-root', home: '/nonexistent-home', maxConcurrentSessions: 3, authProfiles: [PROFILE] },
    { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {}, recordSessionResult() {} } as never,
    '/nonexistent-app',
  );
  s._saveState = () => {};
  s._cloudLoginOf = (p: string) => (p === PROFILE ? { engine: 'claude', id: 'id-1', key: 'acct-1', ...cloudReading } : null);
  return s;
};

describe('whether the account is full goes by the newer reading', () => {
  it('a reading here with room, newer than the cloud\'s full one, says it has room', () => {
    const s = make({ limits: fullWeek, readAt: NOW - 30 * MIN });
    expect(s._limitedUntil(PROFILE, NOW)).toBe(fullWeek[1].resetsAt);
    s.noteUsageReading(PROFILE, { at: NOW - MIN, limits: roomy });
    expect(s._limitedUntil(PROFILE, NOW)).toBe(null);
  });

  it('a reading here older than the cloud\'s full one leaves it full', () => {
    const s = make({ limits: fullWeek, readAt: NOW - MIN });
    s.noteUsageReading(PROFILE, { at: NOW - 30 * MIN, limits: roomy });
    expect(s._limitedUntil(PROFILE, NOW)).toBe(fullWeek[1].resetsAt);
  });

  it('a newer reading here that is itself full leaves it full', () => {
    const s = make({ limits: fullWeek, readAt: NOW - 30 * MIN });
    s.noteUsageReading(PROFILE, { at: NOW - MIN, limits: [{ percent: 100 }, { percent: 10 }] });
    expect(s._limitedUntil(PROFILE, NOW)).toBe(fullWeek[1].resetsAt);
  });
});

describe('the sidebar\'s reading', () => {
  it('is handed each cloud reading of an account signed in here', () => {
    const s = make({ limits: roomy, readAt: NOW });
    s._cloudAccounts = () => [{ engine: 'claude', key: 'acct-1', profile: PROFILE, limits: roomy, readAt: NOW }];
    const got: unknown[] = [];
    s.onCloudReading = (profile: string, reading: unknown) => { got.push({ profile, reading }); };
    s._noteCloudReadings();
    expect(got).toEqual([{ profile: PROFILE, reading: { limits: roomy, at: NOW } }]);
  });

  it('is not handed a cloud account with no login here, or one never read', () => {
    const s = make({ limits: roomy, readAt: NOW });
    s._cloudAccounts = () => [
      { engine: 'claude', key: 'acct-2', profile: null, limits: roomy, readAt: NOW },
      { engine: 'claude', key: 'acct-3', profile: PROFILE, limits: null, readAt: null },
    ];
    const got: unknown[] = [];
    s.onCloudReading = (profile: string, reading: unknown) => { got.push({ profile, reading }); };
    s._noteCloudReadings();
    expect(got).toEqual([]);
  });

  it('takes it, as it takes the Settings page\'s readings', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    expect(ipc).toMatch(/supervisor\.onCloudReading = \(profile, reading\) => usage\.adopt\(\{ \.\.\.reading, profile \}\);/);
  });
});
