// AN ACCOUNT SHE SIGNED INTO IS NOT INVISIBLE.
//
// The shape: the Agents page shows two rows that are both the same
// subscription, while a different one sits signed in on the same disk.
//
// A MACHINE LIKE THIS, read off the `oauthAccount` in each folder's own
// .claude.json:
//
//   ~/.claude          you@example.com    aaaa1111-…   listed in authProfiles
//   ~/.claude-second   you@example.com    aaaa1111-…   listed in authProfiles
//   ~/.claude-work     work@example.com  bbbb2222-…   LISTED NOWHERE
//
// The whole fleet can sit at a limit for days with a second, rested
// subscription logged in on the same disk.
//
// THE CAUSE IS THAT AGENTBOX HAD NO WAY TO LEARN ABOUT IT. The only register of
// accounts was the hand-written `authProfiles` key in zero.config.json. Nothing
// in the app writes that key and nothing in the app reads the disk, so an
// account set up the way anybody would — a new CLAUDE_CONFIG_DIR, a
// /login — was invisible by construction. There was no symptom to see, which
// is the whole difficulty: the page showed two healthy-looking rows and every
// word on it was true.
//
// SO THE LIST IS NOW WHAT IS ON THE DISK, not what somebody remembered to type,
// and these tests pin the four rules that make that safe:
//
//   - a folder holding a subscription we are not already running on JOINS;
//   - a folder holding a subscription we ALREADY have does not (the
//     .claude-second above: two folders, one account, and counting it twice is
//     what double-books an account that is already at its limit);
//   - a folder with no login in it does not (a .claude-swap-backup or
//     .claude-worktrees, which are not accounts and never were);
//   - and nothing the user configured is ever dropped or reordered, because
//     their file is a decision and this is only a discovery.
//
// Cost, measured on a home folder of 200 entries (9 of them
// .claude-shaped, 5 of those directories, 3 of those holding a login) with the
// caches warm: 0.029 ms per call, the readdir skipped on an mtime check. It is
// asked on the supervisor's 15-second tick, so there is nothing here worth a
// refresh button.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverProfiles, effectiveProfiles } from '../main/account-discovery.mjs';

let home;

/**
 * A Claude config folder holding a real login, written the way Claude Code
 *  writes one: the account lives under `oauthAccount` in the folder's own
 *  .claude.json. `uuid` is the SUBSCRIPTION, which is what everything here
 *  turns on; the email is only what a person reads. */
function signedIn(name, email, uuid) {
  const dir = path.join(home, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({
    oauthAccount: { emailAddress: email, accountUuid: uuid },
    projects: {},
  }));
  return dir;
}

/**
 * Write a login into a folder that already exists, moving the file's mtime
 *  forward by hand. The identity cache is keyed on that mtime, and a rewrite
 *  inside the same millisecond as the previous read is a real possibility on a
 *  fast disk — in the app it never happens (a person logs in), but a test that
 *  can flake is a test nobody trusts at 2am. `account` of null signs out. */
function signIn(file, account) {
  fs.writeFileSync(file, JSON.stringify(account ? { oauthAccount: account } : { projects: {} }));
  const later = new Date(Date.now() + 2000);
  fs.utimesSync(file, later, later);
}

const PERSONAL = 'aaaa1111-0000-4000-8000-000000000001';
const WORK = 'bbbb2222-0000-4000-8000-000000000002';

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-accounts-'));
});

afterEach(() => {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
});

describe('the account she signed into', () => {
  it('joins the fleet even though nothing put it in the config', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    const work = signedIn('.claude-work', 'work@example.com', WORK);

    expect(effectiveProfiles(['default'], { home })).toEqual(['default', work]);
  });

  it('is named by the account in it, not by the folder', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    signedIn('.claude-work', 'work@example.com', WORK);

    expect(discoverProfiles({ home })).toEqual([
      { dir: path.join(home, '.claude'), email: 'you@example.com', accountUuid: PERSONAL },
      { dir: path.join(home, '.claude-work'), email: 'work@example.com', accountUuid: WORK },
    ]);
  });
});

describe('what must NOT join', () => {
  // The one that matters most, and the one a naive scan gets wrong. A
  // .claude-second holding the SAME subscription as ~/.claude, so adding it would
  // send two thirds of every spawn round to an account already at its limit.
  it('a second folder holding a subscription we already run on', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    signedIn('.claude-second', 'you@example.com', PERSONAL);
    const work = signedIn('.claude-work', 'work@example.com', WORK);

    expect(effectiveProfiles(['default'], { home })).toEqual(['default', work]);
  });

  // Two discovered folders that are one account: the second is still only one
  // account, whichever order the disk hands them back in.
  it('a third folder of the same subscription as a discovered one', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    signedIn('.claude-work', 'work@example.com', WORK);
    signedIn('.claude-work-2', 'work@example.com', WORK);

    expect(effectiveProfiles(['default'], { home }))
      .toEqual(['default', path.join(home, '.claude-work')]);
  });

  // ~/.claude-swap-backup (a tool's scratch folder) and
  // ~/.claude-worktrees. Claude-shaped names, no login, not accounts.
  it('a claude-shaped folder with no login in it', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    fs.mkdirSync(path.join(home, '.claude-swap-backup'), { recursive: true });
    fs.mkdirSync(path.join(home, '.claude-worktrees', 'claude'), { recursive: true });

    expect(effectiveProfiles(['default'], { home })).toEqual(['default']);
  });

  // A folder whose .claude.json is there but holds no account: a config file
  // written by something else, or a login that was removed.
  it('a folder whose config has no account in it', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    const dir = path.join(home, '.claude-empty');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ projects: {} }));

    expect(effectiveProfiles(['default'], { home })).toEqual(['default']);
  });

  // ~/.claude.json and ~/.claude.json.backup sit next to the folders and are
  // files. A file is not an account however it is named.
  it('a file that happens to be named like one', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    fs.writeFileSync(path.join(home, '.claude.json'), '{}');
    fs.writeFileSync(path.join(home, '.claude-notes'), 'hello');

    expect(effectiveProfiles(['default'], { home })).toEqual(['default']);
  });

  // The boundary either side of the name. `.claude` and `.claude-anything` are
  // ours; a folder called `claude-work` with no dot is somebody's source
  // checkout and we do not go reading .claude.json out of it.
  it('a folder that is not claude-shaped at all', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    signedIn('claude-work', 'work@example.com', WORK);
    signedIn('Zero', 'someone@example.com', 'other-uuid');

    expect(effectiveProfiles(['default'], { home })).toEqual(['default']);
  });
});

describe('her own file is a decision, not a suggestion', () => {
  // She has BOTH duplicates in her config. They used to be kept, as a choice
  // she had typed; the founder's call on 2026-10-14 is that one account signed
  // in twice shows once (tests/an-account-shows-once-and-only-once-it-is-signed-in).
  it('keeps her order, and lists one subscription once', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    const second = signedIn('.claude-second', 'you@example.com', PERSONAL);
    const work = signedIn('.claude-work', 'work@example.com', WORK);
    expect(effectiveProfiles(['default', second], { home }))
      .toEqual(['default', work]);
  });

  it('does not add a folder she had already configured', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    const work = signedIn('.claude-work', 'work@example.com', WORK);

    expect(effectiveProfiles(['default', work], { home })).toEqual(['default', work]);
  });

  // An empty or missing authProfiles is every ordinary install: one login, in
  // ~/.claude, and nothing to discover. It must behave exactly as it always
  // did rather than growing a second row out of nowhere.
  it('leaves a one-account machine with one account', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);

    expect(effectiveProfiles([], { home })).toEqual(['default']);
    expect(effectiveProfiles(null, { home })).toEqual(['default']);
  });

  // A machine where ~/.claude holds no login at all (a fresh Mac, or one that
  // signed out) still has to answer with something spawnable, because
  // 'default' is what CLAUDE_CONFIG_DIR-less spawning means.
  it('still answers default when nothing on the disk is signed in', () => {
    expect(effectiveProfiles([], { home })).toEqual(['default']);
  });

  // A second subscription joins a machine that has never had an authProfiles
  // key: this is the whole point, and it is the case her config did not have.
  it('finds a second subscription with no config at all', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    const work = signedIn('.claude-work', 'work@example.com', WORK);

    expect(effectiveProfiles(undefined, { home })).toEqual(['default', work]);
  });
});

describe('a login that lands while the app is running', () => {
  // The freshness rule, and the reason the scan is not cached wholesale: she
  // makes the folder first and signs in second, minutes apart. A cache keyed on
  // the home folder alone would have seen the empty folder and never looked
  // again, which is the same silence this whole file exists to remove.
  it('is seen without a restart', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    const dir = path.join(home, '.claude-work');
    fs.mkdirSync(dir, { recursive: true });

    expect(effectiveProfiles(['default'], { home })).toEqual(['default']);

    signIn(path.join(dir, '.claude.json'), { emailAddress: 'work@example.com', accountUuid: WORK });

    expect(effectiveProfiles(['default'], { home })).toEqual(['default', dir]);
  });

  // And a sign-OUT: the folder stays, the account leaves. It must drop out of
  // the rotation rather than being spawned onto forever.
  it('and so is a sign-out', () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    const work = signedIn('.claude-work', 'work@example.com', WORK);
    expect(effectiveProfiles(['default'], { home })).toEqual(['default', work]);

    signIn(path.join(work, '.claude.json'), null);
    expect(effectiveProfiles(['default'], { home })).toEqual(['default']);
  });
});

// THE WIRING ITSELF, because a rule nothing calls is a rule that does not run.
// The supervisor is what knows which accounts exist, and until 2026-08-31 it
// read the config key straight. If this goes red, the module above is still
// perfect and a second account is still invisible.
//
// WHAT IT IS FOR CHANGED ON w-dac993a554: an account found here is one somebody
// can SEE and PICK, not one the fleet starts spreading work over. Work runs on
// the account in use (`_theOneAccount`).
describe('the fleet asks the disk, not the config file', () => {
  it('knows an account she signed into but never configured, and can be pointed at it', async () => {
    signedIn('.claude', 'you@example.com', PERSONAL);
    const work = signedIn('.claude-work', 'work@example.com', WORK);

    const { Supervisor } = await import('../main/supervisor.mjs');
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-store-'));
    const make = (extra) => new Supervisor(
      { storeRoot: store, maxConcurrentSessions: 3, authProfiles: ['default'], home, ...extra },
      { listItems: () => [], listProducts: () => [] },
      '/nonexistent-app',
    );
    const sup = make();

    expect(sup._profiles()).toEqual(['default', work]);
    // Work goes to the primary login until somebody says otherwise, and then
    // to the one they picked -- which is the found account, really spawnable.
    expect(sup._liveProfiles()).toEqual(['default']);
    const picked = make({ activeAccount: { claude: work } });
    expect(picked._liveProfiles()).toEqual([work]);
    sup.stop?.();
    picked.stop?.();
    fs.rmSync(store, { recursive: true, force: true });
  });
});
