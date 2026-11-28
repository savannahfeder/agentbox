// THE PHONE SAYS CLAUDE CODE IS NOT SIGNED IN WHEN THE COMPUTER DOES.
//
// A computer with Claude Code installed and its one login not signed in shows
// "Not signed in · Finish signing in to use it". The phone showed "Claude Code,
// 1 account" on Settings and "In use · Signed in" on the Claude Code page
// (QA session m19, 2 of 2 looks). The computer's copy carried Claude logins
// without `signedIn` (Codex's had it), so the phone took the login for a
// signed-in one, counted it and marked it in use.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneSettingsOf } from '../shared/phone-settings.mts';
import { accountsAside, computerAccounts, loginLabel } from '../mobile/src/lib/cloud-accounts';

const copyOf = (accounts: object[]) => phoneSettingsOf({
  ok: true,
  workspace: { permission: 'auto', codexMode: 'auto', memoryGate: {}, leftovers: {}, claudeFound: true, accounts, codex: { found: false } },
  projects: [],
} as never, { version: '1' }).workspace as never;

const notSignedIn = { profile: 'default', email: null, chosen: true, state: 'live' };
const signedIn = { profile: 'default', email: 'me@example.com', chosen: true, state: 'live' };

describe('the copy the computer sends', () => {
  it('says a Claude login with no address is not signed in, as the desktop reads it', () => {
    const list = computerAccounts(copyOf([notSignedIn]), 'claude') as { signedIn?: boolean }[];
    expect(list[0].signedIn).toBe(false);
  });

  it('says a Claude login with an address is signed in', () => {
    const list = computerAccounts(copyOf([signedIn]), 'claude') as { signedIn?: boolean }[];
    expect(list[0].signedIn).toBe(true);
  });
});

describe('Settings on the phone', () => {
  it('says Not signed in beside Claude Code when its only login is not signed in', () => {
    expect(accountsAside([{ chosen: true, email: null, signedIn: false }], 0)).toBe('Not signed in');
  });

  it('counts only signed-in logins, and still names the one in use', () => {
    expect(accountsAside([{ chosen: false, email: null, signedIn: false }, { chosen: false, email: null, signedIn: true }], 0)).toBe('1 account');
    expect(accountsAside([{ chosen: true, email: 'me@example.com', signedIn: true }], 0)).toBe('me@example.com');
  });

  it('counts a cloud account even when the computer is not signed in, and says nothing with no logins at all', () => {
    expect(accountsAside([{ chosen: true, email: null, signedIn: false }], 1)).toBe('1 account');
    expect(accountsAside([], 0)).toBeUndefined();
  });

  it('reads an older computer\'s copy, which had no signedIn on Claude logins, as before', () => {
    expect(accountsAside([{ chosen: false, email: null }], 0)).toBe('1 account');
  });
});

describe('the Claude Code page on the phone', () => {
  it('calls a login that is not signed in "Not signed in", as the desktop does', () => {
    expect(loginLabel({ email: null, signedIn: false }, 'claude', 0, 1)).toBe('Not signed in');
    expect(loginLabel({ email: null }, 'claude', 0, 1)).toBe('Claude account');
    expect(loginLabel({ email: null, name: 'Work', signedIn: false }, 'codex', 0, 1)).toBe('Work');
  });

  it('never marks a login that is not signed in as In use, nor offers to use it', () => {
    const page = fs.readFileSync(new URL('../mobile/src/ui/SettingsPages.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/const live = !signingIn && inUseHere\(/);
    expect(page).toMatch(/control=\{!\(picked && chosen\(a\)\) && !signingIn && list\.length > 1/);
  });

  it('and the phone website, which draws the same copy, does the same', () => {
    const web = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
    expect(web).toMatch(/const live = picked && chosen\(a\) && a\.signedIn !== false;/);
    expect(web).toMatch(/list\.length > 1 && a\.signedIn !== false && <button/);
  });
});
