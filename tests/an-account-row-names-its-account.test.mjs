// AN ACCOUNT ROW NAMES ITS ACCOUNT, NOT ITS FOLDER.
//
// HOW IT GOES WRONG, as the config backups Claude Code writes for itself in
// a folder such as ~/.claude-second/backups would show it:
//
//   day 1        work@example.com   (accountUuid bbbb2222…)
//   day 7 :00    work@example.com
//   day 7 :03    you@example.com     (accountUuid aaaa1111…, the other one)
//
// with a single `/login` in ~/.claude-second/history.jsonl in between. The
// page says the second account is signed out and to run that command and
// type /login, and a person does exactly that. /login opens the browser and
// takes whoever is already signed in to Claude there without asking, so the
// login hands back the account already in the first slot. The second account
// is gone and both folders become one subscription, which is half the
// capacity the page's own lede promises.
//
// Nothing on the screen could have said so, before or after. The rows are
// named `default` and `.claude-second`, which are folders. That is also why
// nothing appeared to change in settings: nothing on that page has ever said
// whose account a row holds, so nothing on it could change when the account
// did.
//
// These tests pin the three things that fix that: a row knows its account, two
// rows that are secretly one say so, and a folder with no login says nothing
// rather than guessing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountIdentity, duplicateAccountNote } from '../main/account-tooling.mjs';

// Two accounts, uuids made up and shortened but distinct the way real ones are.
const WORK = { emailAddress: 'work@example.com', accountUuid: 'bbbb2222-work' };
const PERSONAL = { emailAddress: 'you@example.com', accountUuid: 'aaaa1111-personal' };

let home;

function makeAccount(name, oauthAccount) {
  const dir = path.join(home, name);
  fs.mkdirSync(dir, { recursive: true });
  write(dir, oauthAccount);
  return dir;
}

function write(dir, oauthAccount) {
  fs.writeFileSync(
    path.join(dir, '.claude.json'),
    JSON.stringify(oauthAccount ? { oauthAccount, userID: 'x' } : { userID: 'x' }),
  );
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-accounts-'));
});
afterEach(() => {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
});

describe('which account a folder is signed in as', () => {
  it('reads the email out of the folder, which is the thing she asked for', () => {
    const dir = makeAccount('.claude-second', WORK);
    expect(accountIdentity(dir)).toEqual({
      email: 'work@example.com',
      accountUuid: 'bbbb2222-work',
    });
  });

  it('reads the file beside ~/.claude when no folder is named, because that is what the default row is', () => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    write(home, PERSONAL);
    expect(accountIdentity(null, { home })?.email).toBe('you@example.com');
  });

  it('says nothing at all about a folder with no login in it', () => {
    const dir = makeAccount('.claude-third', null);
    expect(accountIdentity(dir)).toBe(null);
  });

  it('says nothing about a folder that is not there, rather than throwing', () => {
    expect(accountIdentity(path.join(home, 'nope'))).toBe(null);
  });

  it('survives a half-written file, because the page must still draw', () => {
    const dir = makeAccount('.claude-broken', WORK);
    fs.writeFileSync(path.join(dir, '.claude.json'), '{"oauthAccount":{"emailAdd');
    expect(accountIdentity(dir)).toBe(null);
  });

  // THE ONE THAT CATCHES THE SWAP. The whole point of showing the
  // email is that it changes under a person when a /login goes to the wrong account,
  // so a cached answer that outlived the login is worse than no answer at all.
  it('sees a /login that swaps the account, rather than serving a cached answer', () => {
    const dir = makeAccount('.claude-second', WORK);
    expect(accountIdentity(dir).email).toBe('work@example.com');
    // What that /login does to the folder.
    const later = fs.statSync(path.join(dir, '.claude.json')).mtimeMs + 1000;
    write(dir, PERSONAL);
    fs.utimesSync(path.join(dir, '.claude.json'), later / 1000, later / 1000);
    expect(accountIdentity(dir).email).toBe('you@example.com');
  });
});

describe('two rows that turned out to be one subscription', () => {
  it('says so when both folders hold the same account', () => {
    const note = duplicateAccountNote([
      { email: 'you@example.com', accountUuid: 'aaaa1111-personal' },
      { email: 'you@example.com', accountUuid: 'aaaa1111-personal' },
    ]);
    expect(note).toBeTruthy();
    // It has to say what happened in her words rather than name a uuid.
    expect(note).toMatch(/same Claude account/);
    expect(note).not.toMatch(/uuid|accountUuid|aaaa1111/i);
    /* * THE WORD PINNED HERE USED TO BE "capacity", inside a sentence claiming the second
       folder added none. That claim was wrong about our own scheduler: `_capacity()` in
       main/supervisor.mts multiplies by live PROFILE FOLDERS, so a duplicated machine
       really is told it can run double and really does start double, all against one
       subscription. The clause after it told the reader to sign one of them in as their
       other account, which they could not do from that screen and which reads to anybody else as a
       nudge to go and get a second subscription.
    */
    expect(note).not.toMatch(/Sign one of them|your other account/i);
  });

  it('stays quiet on the healthy pair, which is two different accounts', () => {
    expect(duplicateAccountNote([
      { email: 'you@example.com', accountUuid: 'aaaa1111-personal' },
      { email: 'work@example.com', accountUuid: 'bbbb2222-work' },
    ])).toBe(null);
  });

  it('stays quiet on one account, and on none', () => {
    expect(duplicateAccountNote([{ email: 'a@b.com', accountUuid: 'one' }])).toBe(null);
    expect(duplicateAccountNote([])).toBe(null);
  });

  // Two folders that hold no login are not two of the same subscription; they
  // are two unknowns, and claiming they are duplicates would be a made-up fact
  // on the one page she opens to find out what is true.
  it('never calls two folders with no login a duplicate', () => {
    expect(duplicateAccountNote([
      { email: null, accountUuid: null },
      { email: null, accountUuid: null },
    ])).toBe(null);
  });

  it('reads a list of account rows straight out of settings, uuid field and all', () => {
    // The shape main/settings.mts actually passes, so a rename there fails here.
    const accounts = [
      { profile: 'default', email: 'you@example.com', accountUuid: 'same' },
      { profile: '/Users/you/.claude-second', email: 'you@example.com', accountUuid: 'same' },
    ];
    expect(duplicateAccountNote(accounts)).toMatch(/same Claude account/);
  });
});
