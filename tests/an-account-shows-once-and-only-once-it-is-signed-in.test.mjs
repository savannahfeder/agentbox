// AN ACCOUNT SHOWS ONCE, AND ONLY ONCE IT IS SIGNED IN.
//
// What broke (a tester's report, 2026-10-14): Settings > Claude Code listed a
// second row reading "Not signed in" for ~/.claude-2, a folder Add account had
// made and nobody had finished signing into. The fleet treated that row as a
// real account and sent it every other task, and each of those opened with
// "could not sign in, so nothing has been done" before finishing on the real
// account. She then signed the folder in with the same Google account, and
// Settings listed the one subscription twice.
//
// The founder's call on the row: "if somebody accidentally signs into the same
// account twice, it should only show one account signed in in your settings
// ... If you click Add Account but you don't finish logging in, it shouldn't
// show that as a second account."
//
// So the rule discovery already used for folders it found on its own now also
// covers the ones written into `authProfiles`: a `.claude-<n>` folder in the
// home directory is an account when it holds a login, and only the first
// folder holding a given subscription counts. `effectiveProfiles` is the one
// list both the fleet and the Settings page read, so both change together.
// Measured before the fix: `effectiveProfiles(['default', empty])` answered
// both, and `(['default', sameAccount])` answered both.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { effectiveProfiles, forgetDiscovery } from '../main/account-discovery.mjs';
import { addClaudeAccount } from '../main/settings.mjs';

let home;

const login = (email, accountUuid) => ({ oauthAccount: { emailAddress: email, accountUuid } });

function folder(name, claudeJson) {
  const dir = path.join(home, name);
  fs.mkdirSync(dir, { recursive: true });
  if (claudeJson) fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify(claudeJson));
  return dir;
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'one-account-'));
  folder('.claude', login('person@example.com', 'uuid-a'));
  forgetDiscovery();
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

describe('a folder nobody finished signing into', () => {
  it('is not an account, even when the config names it', () => {
    const empty = folder('.claude-2');
    expect(effectiveProfiles(['default', empty], { home })).toEqual(['default']);
  });

  // Running `claude` there writes .claude.json before any login does.
  it('is still not one once Claude Code has opened it without a login', () => {
    const opened = folder('.claude-2', { numStartups: 1 });
    expect(effectiveProfiles(['default', opened], { home })).toEqual(['default']);
  });

  it('becomes one the moment the sign-in lands', () => {
    const later = folder('.claude-2');
    expect(effectiveProfiles(['default', later], { home })).toEqual(['default']);
    fs.writeFileSync(path.join(later, '.claude.json'), JSON.stringify(login('other@example.com', 'uuid-b')));
    expect(effectiveProfiles(['default', later], { home })).toEqual(['default', later]);
  });
});

describe('one subscription signed in twice', () => {
  it('is one account when the config names both folders', () => {
    const twin = folder('.claude-2', login('person@example.com', 'uuid-a'));
    expect(effectiveProfiles(['default', twin], { home })).toEqual(['default']);
  });

  it('is one account when the second folder was only found on the disk', () => {
    folder('.claude-2', login('person@example.com', 'uuid-a'));
    expect(effectiveProfiles(['default'], { home })).toEqual(['default']);
  });

  // The check is the subscription, never the email: one email can hold two.
  it('is two accounts when one email holds two subscriptions', () => {
    const work = folder('.claude-2', login('person@example.com', 'uuid-work'));
    expect(effectiveProfiles(['default', work], { home })).toEqual(['default', work]);
  });
});

describe('what must not change', () => {
  it('keeps a second account that is signed in', () => {
    const second = folder('.claude-2', login('other@example.com', 'uuid-b'));
    expect(effectiveProfiles(['default', second], { home })).toEqual(['default', second]);
  });

  // The default login is never judged by a file: some installs keep it where
  // this check does not look, and dropping it would stop a working fleet.
  it('never drops the default login', () => {
    fs.rmSync(path.join(home, '.claude', '.claude.json'));
    expect(effectiveProfiles(['default'], { home })).toEqual(['default']);
  });

  // A folder somewhere else is a hand-written setting, not one Add account
  // made, and stays exactly as written.
  it('leaves a folder outside the home directory alone', () => {
    expect(effectiveProfiles(['default', '/elsewhere/.claude-work'], { home })).toEqual(['default', '/elsewhere/.claude-work']);
  });
});

describe('pressing Add account', () => {
  const bench = () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-account-conf-'));
    return { config: { home, appDir }, supervisor: { onChange: () => {} } };
  };

  it('lists nothing new until the sign-in finishes', () => {
    const { config, supervisor } = bench();
    addClaudeAccount({ config, supervisor });
    forgetDiscovery();
    expect(effectiveProfiles(config.authProfiles, { home })).toEqual(['default']);
  });

  it('writes nothing into the config, so an abandoned sign-in leaves no entry behind', () => {
    const { config, supervisor } = bench();
    addClaudeAccount({ config, supervisor });
    expect(config.authProfiles).toBeUndefined();
  });

  it('lists the new account once it is signed in', () => {
    const { config, supervisor } = bench();
    const made = addClaudeAccount({ config, supervisor });
    fs.writeFileSync(path.join(made.home, '.claude.json'), JSON.stringify(login('other@example.com', 'uuid-b')));
    forgetDiscovery();
    expect(effectiveProfiles(config.authProfiles, { home })).toEqual(['default', made.profile]);
  });
});
