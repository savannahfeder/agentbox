// THE PHONE LISTS THE CLOUD'S ACCOUNTS AS THE DESKTOP DOES.
//
// On the desktop's Claude Code and Codex pages, once a cloud is set up, every
// account is one tile wherever it is signed in (renderer/src/accounts-once.ts):
// the tile says Local, Cloud or both, an account signed in only in the cloud
// has a tile of its own, and "Use the cloud" names the account the cloud runs
// on, as "Claude account 2" when the vendor gave no address. The phone's copy
// carried only which agents the cloud had and an in-use address it already
// knew (measured 2026-11-08: `cloud` was mode, whenOn, engines, inUse), so the
// phone drew none of that and named no cloud-only account at all.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSettingsOf } from '../shared/phone-settings.mts';
import { accountsAside, cloudInUseName, cloudOnlyAccounts, placesOf, withPlaces } from '../mobile/src/lib/cloud-accounts';

const HOME = '/Users/someone';
const model = (cloud) => ({
  ok: true,
  cloud,
  workspace: {
    permission: 'auto', codexMode: 'auto', memoryGate: {}, leftovers: {},
    accounts: [
      { profile: 'default', email: 'me@example.com', chosen: true, state: 'live' },
      { profile: `${HOME}/.claude-work`, email: 'work@example.com', chosen: false, state: 'live' },
    ],
    codex: { found: true, accounts: [{ profile: `${HOME}/.codex-2`, email: 'c@example.com', signedIn: true, chosen: true }] },
  },
  projects: [],
});
const limits = [{ span: 'session', name: 'This session', percent: 40, resetsAt: 5 }];
const cloudOf = (accounts) => phoneSettingsOf(model({ setUp: true, mode: 'full', whenOn: 'full', accounts, keys: [{ name: 'STRIPE_KEY', savedAt: 1 }] }), { version: '1' }).workspace.cloud;

describe('the copy the computer sends', () => {
  it('carries each cloud account once, with what its tile says', () => {
    const cloud = cloudOf([
      { engine: 'claude', key: 'k1', name: 'me@example.com', profile: 'default', inUse: true, state: 'ready', plan: 'Max 20x', limits, readAt: 9 },
      { engine: 'claude', key: 'k2', name: null, state: 'limited', limitedUntil: 77 },
      { engine: 'claude', key: 'k3', name: 'me@example.com', state: 'duplicate', duplicateOf: 'k1' },
      { engine: 'codex', key: 'k4', name: 'c@example.com', state: 'ready', inUse: true },
    ]);
    expect(cloud.accounts).toEqual([
      { engine: 'claude', email: 'me@example.com', inUse: true, plan: 'Max 20x', state: 'ready', limitedUntil: null, same: 'default', usage: { at: 9, limits: [expect.objectContaining({ span: 'session', percent: 40 })] } },
      { engine: 'claude', email: null, inUse: false, plan: null, state: 'limited', limitedUntil: 77, same: null, usage: null },
      { engine: 'codex', email: 'c@example.com', inUse: true, plan: null, state: 'ready', limitedUntil: null, same: '.codex-2', usage: null },
    ]);
  });

  it('pairs a Claude account by its folder and a Codex one by its address, as the desktop does', () => {
    const cloud = cloudOf([
      { engine: 'claude', key: 'k1', name: 'work@example.com', state: 'ready' },
      { engine: 'claude', key: 'k2', name: 'other@example.com', profile: `${HOME}/.claude-work`, state: 'ready' },
    ]);
    expect(cloud.accounts.map((a) => a.same)).toEqual([null, '.claude-work']);
  });

  it('names the account the cloud runs on, whatever the address', () => {
    expect(cloudOf([{ engine: 'claude', key: 'k1', name: 'stranger@example.com', inUse: true }]).inUse.claude).toBe('stranger@example.com');
  });

  it('carries no key, no folder and no reading error', () => {
    const copy = JSON.stringify(cloudOf([{ engine: 'claude', key: 'k-secret-key', name: null, profile: `${HOME}/.claude-work`, readError: 'token expired at /Users/someone', state: 'ready' }]));
    expect(copy).not.toMatch(/STRIPE_KEY|k-secret-key|\/Users\/|token expired/);
  });
});

describe('the Claude Code and Codex pages on the phone', () => {
  const ws = (accounts) => ({ cloud: cloudOf(accounts) });

  it('names the account the cloud runs on as the desktop does, numbered when it has no address', () => {
    const two = ws([{ engine: 'claude', key: 'a', name: null, state: 'ready' }, { engine: 'claude', key: 'b', name: null, state: 'ready', inUse: true }]);
    expect(cloudInUseName(two, 'claude')).toBe('Claude account 2');
    expect(cloudInUseName(ws([{ engine: 'codex', key: 'a', name: null, inUse: true }]), 'codex')).toBe('Codex account');
    expect(cloudInUseName(ws([{ engine: 'claude', key: 'a', name: 'me@example.com', inUse: true }]), 'claude')).toBe('me@example.com');
  });

  it('names no account when the cloud runs on none, and reads an older computer\'s copy', () => {
    expect(cloudInUseName(ws([{ engine: 'claude', key: 'a', name: 'me@example.com' }]), 'claude')).toBeNull();
    expect(cloudInUseName({ cloud: { engines: ['claude'], inUse: { claude: 'me@example.com', codex: null } } }, 'claude')).toBe('me@example.com');
    expect(cloudInUseName({ cloud: null }, 'claude')).toBeNull();
  });

  it('lists an account signed in only in the cloud on its own row, and not one signed in here too', () => {
    const w = ws([
      { engine: 'claude', key: 'a', name: 'me@example.com', profile: 'default', state: 'ready', plan: 'Max 20x' },
      { engine: 'claude', key: 'b', name: 'cloud@example.com', state: 'ready', plan: 'Pro', limits, readAt: 3 },
      { engine: 'codex', key: 'c', name: null, state: 'ready' },
    ]);
    expect(cloudOnlyAccounts(w, 'claude')).toEqual([{ name: 'cloud@example.com', desc: 'Pro · Cloud', usage: { at: 3, limits: [expect.objectContaining({ percent: 40 })] } }]);
    expect(cloudOnlyAccounts(w, 'codex')).toEqual([{ name: 'Codex account', desc: 'Cloud', usage: null }]);
    expect(cloudOnlyAccounts({ cloud: null }, 'claude')).toEqual([]);
  });

  it('drops the Cloud tag from an account whose cloud sign-in stopped', () => {
    const w = ws([{ engine: 'claude', key: 'a', name: 'me@example.com', profile: 'default', state: 'broken' }, { engine: 'claude', key: 'b', name: 'x@example.com', state: 'broken', plan: 'Pro' }]);
    expect(placesOf(w, 'claude', 'default')).toEqual(['Local']);
    expect(cloudOnlyAccounts(w, 'claude')).toEqual([{ name: 'x@example.com', desc: 'Pro', usage: null }]);
  });

  it('tags this computer\'s accounts Local, and Cloud as well when the cloud has it', () => {
    const w = ws([{ engine: 'claude', key: 'a', name: 'me@example.com', profile: 'default', state: 'ready' }]);
    expect(placesOf(w, 'claude', 'default')).toEqual(['Local', 'Cloud']);
    expect(placesOf(w, 'claude', '.claude-work')).toEqual(['Local']);
    expect(placesOf({ cloud: null }, 'claude', 'default')).toEqual([]);
    expect(withPlaces('Max 20x', ['Local', 'Cloud'])).toBe('Max 20x · Local · Cloud');
    expect(withPlaces('Max 20x', [])).toBe('Max 20x');
  });

  // A tester read "2 accounts" on Settings' front page and counted 3 on the page.
  it('Settings\' front page counts the cloud\'s own accounts with this computer\'s', () => {
    const local = [{ chosen: false, email: 'me@example.com' }, { chosen: false, email: 'work@example.com' }];
    expect(accountsAside(local, 1)).toBe('3 accounts');
    expect(accountsAside(local, 0)).toBe('2 accounts');
    expect(accountsAside([{ chosen: true, email: 'me@example.com' }, local[1]], 1)).toBe('me@example.com');
    expect(accountsAside([], 1)).toBe('1 account');
    expect(accountsAside([], 0)).toBe(undefined);
    expect(fs.readFileSync(new URL('../mobile/src/ui/SettingsHome.tsx', import.meta.url), 'utf8')).toMatch(/accountsAside\(w\.accounts, cloudOnlyAccounts\(w, 'claude'\)\.length\)/);
  });

  it('draws them on the pages', () => {
    const src = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/cloudOnlyAccounts\(w, engine\)/);
    expect(src).toMatch(/cloudInUseName\(/);
    expect(src).toMatch(/withPlaces\(/);
  });
});
