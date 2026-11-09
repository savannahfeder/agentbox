// A CLOUD ACCOUNT ADDED TWICE SHOWS ONCE IN SETTINGS.
//
// What broke (2026-10-17, again 2026-10-19): Settings › Claude Code drew the
// same Gmail cloud login twice, both "Ready" with the same 1% and 31%. Her
// cloud note held two Claude logins with one organization, saved 16 seconds
// apart. Main already marks the second 'duplicate' and never runs on it, and
// the cloud menu leaves it out (`countedAccounts`), but the Settings tiles
// drew every login and worded 'duplicate' as "Ready".
import { describe, expect, it } from 'vitest';
import { cloudPlaceAccounts } from '../renderer/src/components/Settings';
import { cloudPlaceLine } from '../renderer/src/account-words.ts';

const now = 1_000_000;
const login = (key, extra = {}) => ({ engine: 'claude', key, name: null, ready: true, state: 'ready', ...extra });

describe('the cloud card in Settings', () => {
  it('her case: the second login of one account is not a second tile', () => {
    const cloud = { mode: 'all', accounts: [
      login('a1', { name: 'one@example.test' }),
      login('a2', { name: 'one@example.test', ready: false, state: 'duplicate', duplicateOf: 'a1' }),
      login('a3', { name: 'two@example.test' }),
    ] };
    const tiles = cloudPlaceAccounts(cloud, 'claude', now);
    expect(tiles.map((t) => t.key)).toEqual(['a1', 'a3']);
    expect(cloudPlaceLine(cloud, tiles.length)).toBe('Threads start here first, on the account in use.');
  });

  it('must NOT drop a different account, or one that is merely not ready', () => {
    const cloud = { mode: 'all', accounts: [
      login('a1'),
      login('a2', { ready: false, state: 'limited', limitedUntil: now + 60_000 }),
      login('a3', { ready: false, state: 'broken' }),
    ] };
    expect(cloudPlaceAccounts(cloud, 'claude', now).map((t) => t.key)).toEqual(['a1', 'a2', 'a3']);
  });

  it('the one left is the first one added, and a lone account says so', () => {
    const cloud = { mode: 'all', accounts: [login('a1'), login('a2', { state: 'duplicate', duplicateOf: 'a1', ready: false })] };
    const tiles = cloudPlaceAccounts(cloud, 'claude', now);
    expect(tiles.map((t) => t.key)).toEqual(['a1']);
    expect(cloudPlaceLine(cloud, tiles.length)).toBe('Threads start here first, on this account.');
  });
});
