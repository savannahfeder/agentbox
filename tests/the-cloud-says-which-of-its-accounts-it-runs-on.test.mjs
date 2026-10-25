// THE CLOUD CARD SAYS WHICH ACCOUNT IT RUNS ON, AND DOES NOT CALL THE OTHER ONE READY.
//
// What broke, and how it was measured (2026-10-21): the picture of the
// accounts page sent for approval on w-dac993a554 showed the cloud with
// "Claude account 1 - At its limit, back at 5:10pm" beside "Claude account 2 -
// Ready", on a build where `pickCloudLogin` had just stopped rotating and runs
// on one account. Nothing would start in the cloud until 5:10pm, so "Ready"
// was a promise about a login nothing runs on, and neither tile said which
// account the cloud spends. The menu's last line had the same hole: it only
// spoke while EVERY account was at its limit, so the one case that matters now
// - the account in use is out and another is signed in - said "Nothing running
// in the cloud now" and left the reason unsaid.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cloudLoginInUse, cloudLoginState, listCloudLogins, markCloudLogin, pickCloudLogin, recordCloudLogin } from '../main/cloud/logins.mjs';
import { cloudAccountInUse, cloudFootLine } from '../renderer/src/cloud-menu';
import { cloudPlaceAccounts } from '../renderer/src/components/Settings';

let home;
beforeEach(() => { home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-in-use-'))); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const at = (h, m) => new Date(2026, 9, 21, h, m, 0, 0).getTime();
const now = at(16, 0);

// The accounts as the app hands them to the screen (Supervisor#_cloudAccounts).
const onScreen = (engine = 'claude') => listCloudLogins(engine, { home }).map((r) => ({
  engine, key: r.key, name: r.email ?? null, plan: null, state: cloudLoginState(r, { now }),
  ready: cloudLoginState(r, { now }) === 'ready', savedAt: r.savedAt ?? null,
  limitedUntil: r.limitedUntil ?? null, limits: null, readAt: null, duplicateOf: r.duplicateOf ?? null,
  inUse: r.key === cloudLoginInUse(engine, { home, now })?.key,
}));

const cloud = (accounts, running = 0, mode = 'full') => ({
  setUp: true, mode, whenOn: mode, running, accounts, signIns: [], month: { runs: 0, agentHours: 0 },
});

describe('a cloud with two Claude accounts signed in', () => {
  beforeEach(() => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', email: 'work@example.test', savedAt: 1 }, { home });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2', email: 'you@example.test', savedAt: 2 }, { home });
  });

  it('marks the tile of the account a run would actually take', () => {
    expect(pickCloudLogin('claude', { home, now }).key).toBe('acct-1');
    const tiles = cloudPlaceAccounts(cloud(onScreen()), 'claude', now);
    expect(tiles.map((t) => [t.key, t.inUse])).toEqual([['acct-1', true], ['acct-2', false]]);
  });

  it('calls the other one signed in, because nothing starts on it', () => {
    const [first, second] = cloudPlaceAccounts(cloud(onScreen()), 'claude', now);
    expect(first.about).toEqual(['Ready']);
    expect(second.about).toEqual(['Signed in']);
  });

  it('keeps the limited account as the account, and says when it is back', () => {
    markCloudLogin('claude', 'acct-1', 'id-1', { limitedUntil: at(17, 10) }, { home });
    expect(pickCloudLogin('claude', { home, now })).toBe(null);
    const [first, second] = cloudPlaceAccounts(cloud(onScreen()), 'claude', now);
    expect([first.inUse, first.about]).toEqual([true, ['At its limit, back at 5:10pm']]);
    expect([second.inUse, second.about]).toEqual([false, ['Signed in']]);
    expect(cloudFootLine(cloud(onScreen(), 2), now))
      .toBe('Your cloud account is at its usage limit until 5:10pm. Threads run on this Mac until then.');
  });

  it('must NOT say the cloud is out when the one it runs on has room', () => {
    markCloudLogin('claude', 'acct-2', 'id-2', { limitedUntil: at(17, 10) }, { home });
    expect(pickCloudLogin('claude', { home, now }).key).toBe('acct-1');
    expect(cloudFootLine(cloud(onScreen(), 2), now)).toBe('2 running in the cloud now');
  });

  it('passes over a login that has stopped working, as the picker does', () => {
    markCloudLogin('claude', 'acct-1', 'id-1', { broken: 'signed out' }, { home });
    expect(pickCloudLogin('claude', { home, now }).key).toBe('acct-2');
    expect(cloudAccountInUse(onScreen(), 'claude').key).toBe('acct-2');
  });
});

describe('a cloud with one Claude account', () => {
  // Marked, as this computer's one account is (main/settings.mjs `chosen`):
  // the badge says which subscription is being spent, and with one account
  // that is still worth saying once.
  it('marks it, and it is simply ready', () => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', email: 'work@example.test', savedAt: 1 }, { home });
    const [only] = cloudPlaceAccounts(cloud(onScreen()), 'claude', now);
    expect([only.inUse, only.about]).toEqual([true, ['Ready']]);
  });
});
