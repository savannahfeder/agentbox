// AN ACCOUNT ROW NAMES ITS ACCOUNT, NOT ITS FOLDER.
//
// WHAT HAD ACTUALLY HAPPENED, measured off the config backups Claude Code
// writes for itself, in ~/.claude-second/backups:
//
//   08-23 22:00  work@example.com   (accountUuid c398ce06…)
//   08-29 13:47  work@example.com
//   08-29 13:50  you@example.com     (accountUuid 8fe4a357…, her personal)
//
// and in ~/.claude-second/history.jsonl, one line: she typed `/login` at
// 13:47:18. The page had told her the second account was signed out and to run
// that command and type /login, and she did exactly that. /login opens the
// browser and takes whoever is already signed in to Claude there without
// asking, so the login handed back the account she already had in the first
// slot. Her work account was gone by 13:50 and both folders became one
// subscription, which is half the capacity the page's own lede promises.
//
// Nothing on the screen could have told her, before or after. The rows are
// named `default` and `.claude-second`, which are folders. That is also the
// literal answer to "nothing changed in settings": nothing on that page has
// ever said whose account a row holds, so nothing on it could change when the
// account did.
//
// These tests pin the three things that fix that: a row knows its account, two
// rows that are secretly one say so, and a folder with no login says nothing
// rather than guessing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountIdentity, duplicateAccountNote } from '../main/account-tooling.mjs';

// Her two real accounts, uuids shortened but distinct the way the real ones are.
const WORK = { emailAddress: 'work@example.com', accountUuid: 'c398ce06-work' };
const PERSONAL = { emailAddress: 'you@example.com', accountUuid: '8fe4a357-personal' };

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
      accountUuid: 'c398ce06-work',
    });
  });

  it('falls back to the default home when no folder is named, because that is what the default row is', () => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    write(path.join(home, '.claude'), PERSONAL);
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

  // THE ONE THAT WOULD HAVE CAUGHT HER MORNING. The whole point of showing the
  // email is that it changes under her when a /login goes to the wrong account,
  // so a cached answer that outlived the login is worse than no answer at all.
  it('sees a /login that swaps the account, rather than serving a cached answer', () => {
    const dir = makeAccount('.claude-second', WORK);
    expect(accountIdentity(dir).email).toBe('work@example.com');
    // What 13:47 to 13:50 did to that folder.
    const later = fs.statSync(path.join(dir, '.claude.json')).mtimeMs + 1000;
    write(dir, PERSONAL);
    fs.utimesSync(path.join(dir, '.claude.json'), later / 1000, later / 1000);
    expect(accountIdentity(dir).email).toBe('you@example.com');
  });
});

describe('two rows that turned out to be one subscription', () => {
  it('says so when both folders hold the same account, which is her machine today', () => {
    const note = duplicateAccountNote([
      { email: 'you@example.com', accountUuid: '8fe4a357-personal' },
      { email: 'you@example.com', accountUuid: '8fe4a357-personal' },
    ]);
    expect(note).toBeTruthy();
    // It has to say what happened in her words rather than name a uuid.
    expect(note).toMatch(/same Claude account/);
    expect(note).not.toMatch(/uuid|accountUuid|8fe4a357/i);
    /* * THE WORD PINNED HERE USED TO BE "capacity", inside a sentence claiming the second
       folder added none. That claim was wrong about our own scheduler: `_capacity()` in
       main/supervisor.mjs multiplies by live PROFILE FOLDERS, so a duplicated machine
       really is told it can run double and really does start double, all against one
       subscription. The clause after it told her to sign one of them in as her other
       account, which she could not do from that screen and which reads to anybody else as a
       nudge to go and get a second subscription.
    */
    expect(note).not.toMatch(/Sign one of them|your other account/i);
  });

  it('stays quiet on the healthy pair, which is two different accounts', () => {
    expect(duplicateAccountNote([
      { email: 'you@example.com', accountUuid: '8fe4a357-personal' },
      { email: 'work@example.com', accountUuid: 'c398ce06-work' },
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
    // The shape main/settings.mjs actually passes, so a rename there fails here.
    const accounts = [
      { profile: 'default', email: 'you@example.com', accountUuid: 'same' },
      { profile: '/Users/you/.claude-second', email: 'you@example.com', accountUuid: 'same' },
    ];
    expect(duplicateAccountNote(accounts)).toMatch(/same Claude account/);
  });
});
