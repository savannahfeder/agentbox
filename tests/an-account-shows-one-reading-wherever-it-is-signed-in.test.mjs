// AN ACCOUNT SHOWS ONE READING, WHEREVER IT IS SIGNED IN.
//
// What broke (2026-10-21, a screenshot of Settings › Claude Code): the same
// two subscriptions were drawn twice, once under Cloud and once under This
// computer, and the numbers disagreed. The work account read 100% of its
// session in the cloud, checked 2 hours ago, and 13% here, checked just now;
// the Gmail one read 18% and 19%. Usage belongs to the subscription, not to
// the place, but each place drew only its own reader's last answer: this
// computer reads through Claude Code, the cloud reads one reply's headers in a
// sandbox, and the two are read at different times.
//
// The fix: main says which login here each cloud login is (the one login in
// its organization), and the page draws one reading per subscription, the
// newest either place has.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordCloudLogin } from '../main/cloud/logins.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { accountsOnce } from '../renderer/src/accounts-once.ts';

let home;
beforeEach(() => { home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'one-reading-'))); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const signIn = (dir, email, org) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: `a-${email}`, organizationUuid: org } }));
};
const supervisor = (profiles) => new Supervisor({ home, storeRoot: home, maxConcurrentSessions: 1, authProfiles: profiles }, { listItems: () => [], listProducts: () => [] }, '/nonexistent-app');

describe('main says which login here a cloud login is', () => {
  it('the reported case:each cloud login names the folder here in its organization', () => {
    signIn(home, 'work@example.test', 'org-w');
    const second = path.join(home, '.claude-2');
    signIn(second, 'me@example.test', 'org-p');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-p' }, { home, now: 1 });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2', org: 'org-w' }, { home, now: 2 });
    expect(supervisor(['default', second])._cloudAccounts().map((a) => [a.key, a.profile])).toEqual([['acct-1', second], ['acct-2', 'default']]);
  });

  it('must NOT pair a login whose organization has no folder here, or has two people in it', () => {
    signIn(home, 'a@example.test', 'org-team');
    const second = path.join(home, '.claude-2');
    signIn(second, 'b@example.test', 'org-team');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-team' }, { home, now: 1 });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2', org: 'org-elsewhere' }, { home, now: 2 });
    recordCloudLogin('claude', 'acct-3', { id: 'id-3' }, { home, now: 3 });
    expect(supervisor(['default', second])._cloudAccounts().map((a) => a.profile)).toEqual([null, null, null]);
  });

  it('must NOT pair a cloud login that names a different email than the folder in its organization', () => {
    signIn(home, 'a@example.test', 'org-team');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-team', email: 'b@example.test' }, { home });
    expect(supervisor(['default'])._cloudAccounts()[0].profile).toBeNull();
  });
});

const limits = (session, week, sessionResets = null) => [
  { span: 'session', qualifier: null, name: 'This session', percent: session, resetsText: null, resetsOn: null, resetsAt: sessionResets, zone: null },
  { span: 'week', qualifier: 'all models', name: 'This week', percent: week, resetsText: null, resetsOn: null, resetsAt: null, zone: null },
];
const here = (profile, email, extra = {}) => ({ profile, email, plan: 'Max 20x', chosen: false, signedIn: true, trouble: null, dir: null, ...extra });
const cloud = (key, extra = {}) => ({ engine: 'claude', key, name: null, ready: true, state: 'ready', limits: null, readAt: null, profile: null, ...extra });
const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

describe('one tile per account, with the newest reading', () => {
  it('the reported case:the work account reads 13% everywhere, not 100% from a cloud look two hours old', () => {
    const list = accountsOnce({
      here: [here('default', 'work@example.test', { chosen: true }), here('/h/.claude-2', 'me@example.test')],
      cloud: [
        cloud('acct-1', { name: 'me@example.test', profile: '/h/.claude-2', limits: limits(18, 3), readAt: NOW - 60_000 }),
        cloud('acct-2', { name: 'work@example.test', profile: 'default', limits: limits(100, 80), readAt: NOW - 2 * HOUR }),
      ],
      readings: [
        { profile: 'default', at: NOW, limits: limits(13, 82) },
        { profile: '/h/.claude-2', at: NOW, limits: limits(19, 3) },
      ],
    });
    expect(list.map((a) => [a.name, !!a.here, !!a.cloud, a.limits.map((l) => l.percent), a.checkedAt])).toEqual([
      ['work@example.test', true, true, [13, 82], NOW],
      ['me@example.test', true, true, [19, 3], NOW],
    ]);
  });

  it('the cloud’s reading wins when it is the newer one', () => {
    const [one] = accountsOnce({
      here: [here('default', 'work@example.test')],
      cloud: [cloud('acct-1', { profile: 'default', limits: limits(40, 50), readAt: NOW })],
      readings: [{ profile: 'default', at: NOW - HOUR, limits: limits(10, 45) }],
    });
    expect([one.limits[0].percent, one.checkedAt]).toEqual([40, NOW]);
  });

  it('this computer’s failed read is not said over a newer reading from the cloud', () => {
    const [one] = accountsOnce({
      here: [here('default', 'work@example.test')],
      cloud: [cloud('acct-1', { profile: 'default', limits: limits(40, 50), readAt: NOW })],
      readings: [{ profile: 'default', at: NOW - HOUR, limits: limits(10, 45), error: 'Claude Code did not answer.' }],
    });
    expect(one.usageError).toBeNull();
  });

  it('an account in one place only is listed once, with its own reading', () => {
    const list = accountsOnce({
      here: [here('default', 'work@example.test')],
      cloud: [cloud('acct-9', { name: 'other@example.test', limits: limits(7, 8), readAt: NOW, readError: null })],
      readings: [{ profile: 'default', at: NOW, limits: limits(13, 82) }],
    });
    expect(list.map((a) => [a.name, !!a.here, !!a.cloud, a.limits[0].percent])).toEqual([
      ['work@example.test', true, false, 13],
      ['other@example.test', false, true, 7],
    ]);
  });

  it('a cloud account that could not be read says why, and keeps the reading it had', () => {
    const [one] = accountsOnce({
      here: [],
      cloud: [cloud('acct-9', { name: 'other@example.test', limits: limits(7, 8), readAt: NOW - 2 * HOUR, readError: 'The cloud could not be reached.' })],
    });
    expect([one.limits[0].percent, one.checkedAt, one.usageError]).toEqual([7, NOW - 2 * HOUR, 'The cloud could not be reached.']);
  });

  it('must NOT pair a cloud login with a login here it was not said to be', () => {
    const list = accountsOnce({
      here: [here('default', 'work@example.test')],
      cloud: [cloud('acct-1', { name: 'Claude account', limits: limits(90, 90), readAt: NOW })],
      readings: [{ profile: 'default', at: NOW - HOUR, limits: limits(13, 82) }],
    });
    expect(list.map((a) => a.limits[0].percent)).toEqual([13, 90]);
  });

  it('the account in use here comes first, then the others in the order they were added', () => {
    const list = accountsOnce({
      here: [here('default', 'a@example.test'), here('/h/2', 'b@example.test', { chosen: true })],
      cloud: [cloud('acct-1', { name: 'c@example.test' }), cloud('acct-2', { profile: 'default' })],
    });
    expect(list.map((a) => a.name)).toEqual(['b@example.test', 'a@example.test', 'c@example.test']);
  });
});
