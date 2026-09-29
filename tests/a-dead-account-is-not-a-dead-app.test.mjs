// A DEAD ACCOUNT IS NOT A DEAD APP, AND NEITHER OF THEM SHOUTS EARLY.
//
// The inbox once read "Agents are failing to start: done: Failed to
// authenticate: OAuth session expired and could not be refreshed".
//
// What was actually happening, measured on the machine that showed it: two
// Claude subscriptions, and the supervisor round-robins spawns across them.
// The second one, /Users/you/.claude-second, was signed out. Running the CLI
// against it by hand printed that exact sentence. So roughly half of every
// spawn died in about two seconds, and each death (a) lit a fleet-wide banner
// claiming all agents were failing, and (b) put a fleet-wide brake on the
// account that was working, one minute doubling to thirty.
//
// These tests pin all three halves of the fix: the trouble stays on the
// account, the app waits a really long time before saying anything at all, and
// the tool's own words never reach a screen.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { troubleCause, troubleSentence, troubleRemedy, accountSentence, needsHerHands } from '../shared/spawn-trouble.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT. Since 2026-08-31 the fleet's account list
// is what is signed in on the disk and not only what the config names
// (main/account-discovery.mjs), so a Supervisor built with no `home` reads
// whoever is signed in on the machine running the suite — and a developer with
// a second subscription would silently get twice the capacity these tests are
// about. A home with nothing in it is the machine every one of them means.
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';


// The words the CLI actually printed into her session log, kept verbatim so a
// future rewording of our matcher is caught by the thing it exists to catch.
const HER_WORDS = 'Failed to authenticate: OAuth session expired and could not be refreshed';

let root;
let sup;

const SECOND = '/second-account';

const start = (profiles) => new Supervisor(
  { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: profiles },
  { listItems: () => [], listProducts: () => [] },
  '/nonexistent-app',
);

// A session that died on arrival on a named account, with the CLI's last words
// in its tail exactly as the real one carries them.
const deadOnArrival = (profile, words = HER_WORDS) => ({
  itemId: 'w-test',
  product: 'agentbox',
  profile,
  startedAt: Date.now() - 2_000,
  tail: [`stderr: ${words}`, 'session exited (1)'],
});

const survived = (profile) => ({
  itemId: 'w-test',
  product: 'agentbox',
  profile,
  startedAt: Date.now() - 10 * 60_000,
  tail: ['done: filed the review'],
});

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-trouble-'));
  sup = start(['default', SECOND]);
});

afterEach(() => {
  try { sup.stop?.(); } catch {}
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the words the tool printed never reach her screen', () => {
  it('reads her own screenshot as a signed-out account', () => {
    expect(troubleCause(HER_WORDS)).toBe('signed-out');
  });

  it('says nothing anywhere about OAuth, sessions or refreshing', () => {
    // The three words she named. Every sentence the app can print for every
    // cause it knows, checked in one place, because the failure mode is one of
    // them creeping back in through a new branch of a switch.
    const causes = ['signed-out', 'at-limit', 'workspace', 'unknown'];
    const everything = causes
      .flatMap((c) => [troubleSentence(c), troubleRemedy(c), accountSentence(c)])
      .join(' ');
    expect(everything).not.toMatch(/oauth/i);
    expect(everything).not.toMatch(/refresh/i);
    expect(everything).not.toMatch(/token|subprocess|spawn|stderr|profile/i);
    // And it is not empty for any of them: a cause with no sentence would come
    // out as a blank line, which is a worse notice than a bad one.
    for (const c of causes) {
      expect(troubleSentence(c).length).toBeGreaterThan(10);
      expect(troubleRemedy(c).length).toBeGreaterThan(10);
    }
  });

  it('still knows a usage limit from a signed-out login', () => {
    expect(troubleCause('Claude usage limit reached')).toBe('at-limit');
    expect(troubleCause('Failed to authenticate: OAuth session expired')).toBe('signed-out');
    expect(troubleCause('some new thing nobody has seen')).toBe('unknown');
  });

  // THIS LINE USED TO ASSERT 'signed-out', AND THAT ASSERTION WAS THE BUG. It
  // is her second account's real refusal, and an organization that has switched
  // Claude Code off is not a login that has run out: she was told to type
  // /login, did it twice in one afternoon, and the login succeeded both times
  // while the row stayed dead. It has its own cause and its own remedy now, and
  // the whole of that afternoon is written up in
  // tests/an-account-her-admin-turned-off-is-not-signed-out.test.mjs.
  it('knows an organization that blocks Claude Code from a login that has run out', () => {
    expect(troubleCause('organization has disabled Claude subscription access')).toBe('org-blocked');
  });

  it('only calls for her hands when trying again cannot possibly help', () => {
    expect(needsHerHands('signed-out')).toBe(true);
    expect(needsHerHands('at-limit')).toBe(false);
    expect(needsHerHands('unknown')).toBe(false);
  });
});

describe('one signed-out account does not stop the one that works', () => {
  it('leaves the healthy account running at full speed', () => {
    sup.noteExitForBackoff(deadOnArrival(SECOND), { personal: false });
    // THE BUG SHE PHOTOGRAPHED. This used to be a cooldown tick refuses to run
    // through, so her good subscription sat idle because her bad one died.
    expect(sup._spawnCooldownUntil ?? 0).toBe(0);
    expect(sup._fastExits ?? 0).toBe(0);
    expect(sup._healthyProfiles()).toEqual(['default']);
  });

  it('takes the signed-out account out of the rotation on the first death', () => {
    // Three strikes is right for an ambiguous death. A login that has run out
    // is not ambiguous, and the two extra spawns it would take are two real
    // pieces of her work handed to an account that cannot do them.
    sup.noteExitForBackoff(deadOnArrival(SECOND), { personal: false });
    expect(sup._profileCooldown[SECOND]).toBeGreaterThan(Date.now());
    expect(sup._liveProfiles()).toEqual(['default']);
  });

  it('says nothing on the inbox at all while one account still works', () => {
    for (let i = 0; i < 5; i += 1) sup.noteExitForBackoff(deadOnArrival(SECOND), { personal: false });
    sup._fleetTroubleSince = 0;
    expect(sup._spawnTrouble(['w-a', 'w-b'])).toBe(null);
  });

  it('puts the fact on the account, where the Accounts page reads it', () => {
    sup.noteExitForBackoff(deadOnArrival(SECOND), { personal: false });
    expect(sup._profileTrouble[SECOND].cause).toBe('signed-out');
    expect(sup._profileTrouble.default).toBeUndefined();
    expect(accountSentence('signed-out')).toMatch(/^Signed out\./);
  });

  // Both sentences that ever tell her to sign in have to name the command,
  // and the account one has to carry the folder, because on that row the
  // sentence REPLACES the line the folder was on.
  it('names /login wherever it tells her to sign in', () => {
    expect(troubleRemedy('signed-out')).toContain('/login');
    expect(accountSentence('signed-out')).toContain('/login');
    expect(accountSentence('signed-out', SECOND)).toContain('/login');
  });

  it('puts the folder in the sentence for a second account, and not for the first', () => {
    expect(accountSentence('signed-out', SECOND)).toContain(`CLAUDE_CONFIG_DIR=${SECOND}`);
    expect(accountSentence('signed-out', null)).not.toMatch(/CLAUDE_CONFIG_DIR/);
    // Home shortened the way every other folder on her screen is drawn, so the
    // sentence fits its row rather than wrapping through the middle of a path.
    expect(accountSentence('signed-out', '/Users/you/.claude-second'))
      .toContain('CLAUDE_CONFIG_DIR=~/.claude-second');
  });

  it('forgets the trouble the moment a session on that account survives', () => {
    sup.noteExitForBackoff(deadOnArrival(SECOND), { personal: false });
    sup.noteExitForBackoff(survived(SECOND), { personal: false });
    expect(sup._profileTrouble[SECOND]).toBeUndefined();
    expect(sup._profileCooldown[SECOND]).toBe(0);
    expect(sup._healthyProfiles()).toEqual(['default', SECOND]);
  });
});

describe('a really long time means a really long time', () => {
  beforeEach(() => {
    sup = start(['default']);
  });

  it('says nothing on the first dead spawn, which is the restart she described', () => {
    sup.noteExitForBackoff(deadOnArrival('default'), { personal: false });
    // The brake is right: the only account there is has just died. The NOTICE
    // is not, and this is the whole of her third complaint.
    expect(sup._spawnCooldownUntil).toBeGreaterThan(Date.now());
    expect(sup._spawnTrouble(['w-a'])).toBe(null);
  });

  it('still says nothing nineteen minutes in', () => {
    sup.noteExitForBackoff(deadOnArrival('default'), { personal: false });
    sup._fleetTroubleSince = Date.now() - 19 * 60_000;
    expect(sup._spawnTrouble(['w-a'])).toBe(null);
  });

  it('speaks at twenty, in its own words, with somewhere to go', () => {
    sup.noteExitForBackoff(deadOnArrival('default'), { personal: false });
    sup._fleetTroubleSince = Date.now() - 21 * 60_000;
    const trouble = sup._spawnTrouble(['w-a']);
    expect(trouble).not.toBe(null);
    expect(trouble.message).toBe('No agents can start. Your Claude login has run out.');
    expect(trouble.remedy).toMatch(/\/login/);
    expect(trouble.cause).toBe('signed-out');
    // The raw text is kept for the trace log and is not on the payload.
    expect(JSON.stringify(trouble)).not.toMatch(/oauth/i);
  });

  it('stays quiet when nothing is waiting on it', () => {
    // Twenty minutes of not spawning is not a problem at 3am with an empty
    // queue, and a notice about it would be the app complaining to itself.
    sup.noteExitForBackoff(deadOnArrival('default'), { personal: false });
    sup._fleetTroubleSince = Date.now() - 21 * 60_000;
    expect(sup._spawnTrouble([])).toBe(null);
  });

  it('drops the whole thing the moment one session survives', () => {
    sup.noteExitForBackoff(deadOnArrival('default'), { personal: false });
    sup._fleetTroubleSince = Date.now() - 21 * 60_000;
    expect(sup._spawnTrouble(['w-a'])).not.toBe(null);
    sup.noteExitForBackoff(survived('default'), { personal: false });
    expect(sup._fleetTroubleSince).toBe(0);
    expect(sup._spawnTrouble(['w-a'])).toBe(null);
  });

  it('does not start the clock over on every fresh death', () => {
    // Otherwise twenty minutes is never reached: each new dead spawn would
    // reset the timer and the notice would never arrive at all.
    sup.noteExitForBackoff(deadOnArrival('default'), { personal: false });
    const first = sup._fleetTroubleSince;
    expect(first).toBeGreaterThan(0);
    sup.noteExitForBackoff(deadOnArrival('default'), { personal: false });
    expect(sup._fleetTroubleSince).toBe(first);
  });
});
