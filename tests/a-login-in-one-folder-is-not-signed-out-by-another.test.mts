// A LOGIN IN ONE FOLDER IS NOT SIGNED OUT BY ANOTHER FOLDER'S OLD LOGIN.
//
// What broke (2026-11-20): the account in use read "Signed out. Open Claude in
// a terminal and type /login." minutes after a /login on it. `claude auth
// status` said loggedIn: true in that folder. The sentence came from a second
// folder signed into the same account, ~/.claude-9, whose run had died with
// "Not logged in · Please run /login" eight days earlier: one row stands for
// every folder holding an account, and it borrowed the newest trouble from any
// of them. Each folder has its own login, so a signed-out is that folder's
// alone. A limit or an ended subscription belongs to the account and is still
// shared.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { troubleForProfile } from '../main/account-discovery.mts';

const UUID = 'acct-same';
const setUp = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-two-folders-'));
  const second = path.join(home, '.claude-9');
  fs.mkdirSync(second);
  const account = { oauthAccount: { emailAddress: 'you@example.com', accountUuid: UUID } };
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify(account));
  fs.writeFileSync(path.join(second, '.claude.json'), JSON.stringify(account));
  return { home, second };
};
const DAY = 24 * 60 * 60_000;

describe('the row for an account signed into two folders', () => {
  it('does not show the other folder\'s signed-out', () => {
    const { home, second } = setUp();
    const troubles = { [second]: { cause: 'signed-out', since: Date.now() - 8 * DAY, at: Date.now() - 8 * DAY } };
    expect(troubleForProfile(troubles, 'default', { home })).toBeNull();
  });

  it('shows its own folder\'s signed-out', () => {
    const { home, second } = setUp();
    const own = { cause: 'signed-out', since: Date.now(), at: Date.now() };
    expect(troubleForProfile({ default: own }, 'default', { home })).toBe(own);
    expect(troubleForProfile({ [second]: own }, second, { home })).toBe(own);
  });

  it('keeps its own older trouble rather than the other folder\'s newer signed-out', () => {
    const { home, second } = setUp();
    const own = { cause: 'at-limit', since: Date.now() - DAY, at: Date.now() - DAY };
    const troubles = { default: own, [second]: { cause: 'signed-out', since: Date.now(), at: Date.now() } };
    expect(troubleForProfile(troubles, 'default', { home })).toBe(own);
  });

  it('still shows a limit or an ended subscription filed on the other folder', () => {
    const { home, second } = setUp();
    for (const cause of ['at-limit', 'subscription-ended', 'org-blocked']) {
      const there = { cause, since: Date.now(), at: Date.now() };
      expect(troubleForProfile({ [second]: there }, 'default', { home })).toBe(there);
    }
  });
});
