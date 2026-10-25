// THE APP RUNS ON ONE ACCOUNT, AND NOTHING MOVES WORK WHEN IT RUNS OUT.
//
// w-dac993a554. Agentbox had grown three habits nobody had chosen: every login
// signed in on the Mac took a share of the work by round-robin, a task whose
// login hit its usage limit was moved onto a login with room by the app on
// its own, and the row, the trouble lines and the setup walk all offered
// another account as the answer to a limit.
//
// So: one account runs the work -- the one picked, or the primary login when
// nobody has picked -- a project may be tied to another, and a limit is waited
// out and named. Switching to your other plan yourself, at a limit or any
// time, is allowed (tests/switching-to-your-other-plan-at-a-limit-is-allowed). Measured here on the three mechanisms that did the rotating
// (`_profilesFor`, `restingUntil`, `_profileCannotHoldAChat`), on the words
// that offered it, and on the cloud's own pick.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { deadRunSentence, troubleRemedy, causeNext, accountSentence } from '../shared/spawn-trouble.mjs';
import { COPY } from '../renderer/src/plan-setup';
import { pickCloudLogin, recordCloudLogin, markCloudLogin } from '../main/cloud/logins.mjs';

const SECOND = '/Users/her/.claude-second';
const CODEX_SECOND = '/Users/her/.codex-2';
const LIMIT = "You've hit your session limit · resets 6pm";

/** A supervisor with two Claude logins and two Codex logins and no disk. */
const bare = (config = {}) => {
  const s = Object.create(Supervisor.prototype);
  s.config = {
    home: '/nonexistent-home',
    authProfiles: ['default', SECOND],
    codexProfiles: ['default', CODEX_SECOND],
    maxConcurrentSessions: 3,
    engineChoice: '2026-01-01T00:00:00.000Z',
    codexBin: '/opt/homebrew/bin/codex',
    ...config,
  };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
};

describe('the pool of accounts work goes to is one account', () => {
  it('is the primary login when nobody has picked', () => {
    const s = bare();
    expect(s._profilesFor('claude')).toEqual(['default']);
    for (let i = 0; i < 5; i += 1) expect(s._pickProfile('claude')).toBe('default');
  });

  it('is the one picked, once one is picked', () => {
    const s = bare({ activeAccount: { claude: SECOND } });
    expect(s._profilesFor('claude')).toEqual([SECOND]);
    for (let i = 0; i < 5; i += 1) expect(s._pickProfile('claude')).toBe(SECOND);
  });

  // THE CASE THAT MUST NOT MATCH. A pick left over from a login since signed
  // out used to fall back to every account, which is the rotation again. It
  // falls back to the primary instead.
  it('falls back to the primary when the pick names nothing on this computer', () => {
    const s = bare({ activeAccount: { claude: '/Users/her/.claude-gone' } });
    expect(s._profilesFor('claude')).toEqual(['default']);
  });

  it('is one account on Codex too, and its own one', () => {
    const s = bare({ activeAccount: { codex: CODEX_SECOND } });
    expect(s._profilesFor('codex')).toEqual([CODEX_SECOND]);
    expect(s._profilesFor('claude')).toEqual(['default']);
  });

  // THE ONE PERSON WITH TWO REAL PLANS IS WHY ANY OF THIS IS PICKABLE: a
  // project tied to the work plan still runs there, and the tie beats the pool.
  it('still lets a project run on the account it is tied to', () => {
    const s = bare({ projectAccounts: { work: SECOND } });
    s._profiles = () => ['default', SECOND];
    expect(s._projectProfile('work')).toBe(SECOND);
    expect(s._profileFitsProject('default', 'work')).toBe(false);
    expect(s._profileFitsProject(SECOND, 'work')).toBe(true);
  });
});

describe('adding an account buys no extra agents', () => {
  const slots = (profiles) => {
    const s = bare({ authProfiles: profiles, agentsAuto: false, agentsAtOnce: 6 });
    s.engineChoices = () => [{ id: 'claude' }];
    return s._capacityFor('claude');
  };

  it('is the same number with two logins as with one', () => {
    expect(slots(['default'])).toBe(6);
    expect(slots(['default', SECOND])).toBe(6);
  });
});

describe('a login at its usage limit keeps its work and waits', () => {
  const ranOut = (s, profile = 'default') => s.noteExitForBackoff({
    engine: 'claude', profile, startedAt: Date.now() - 300_000, result: LIMIT, resultIsError: true, tail: [],
  });

  it('marks the login, as it always did', () => {
    const s = bare();
    ranOut(s);
    expect(s._profileTrouble.default?.cause).toBe('at-limit');
    expect(s._profileResting('default')).toBe(true);
  });

  it('keeps the chat on it instead of moving it to the other login', () => {
    const s = bare();
    ranOut(s);
    expect(s._profileCannotHoldAChat('default', 'claude')).toBe(false);
  });

  // A chat on the account in use is kept whatever is wrong with it: there is
  // nowhere else for it to be.
  it('keeps the chat even when the account in use is signed out', () => {
    const s = bare();
    s._profileTrouble.default = { since: 1, at: 1, cause: 'signed-out' };
    expect(s._profileCannotHoldAChat('default', 'claude')).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH: a chat left on the OTHER login, which this
  // person signed out of, is given up rather than dying on every reply. That
  // is the one move still worth making, and a limit is not it.
  it('still gives up a chat on the other login when that one is signed out', () => {
    const s = bare();
    s._profileTrouble[SECOND] = { since: 1, at: 1, cause: 'signed-out' };
    expect(s._profileCannotHoldAChat(SECOND, 'claude')).toBe(true);
    s._profileTrouble[SECOND] = { since: 1, at: 1, cause: 'at-limit' };
    expect(s._profileCannotHoldAChat(SECOND, 'claude')).toBe(false);
  });
});

describe('a task whose login ran out rests until the reset', () => {
  const T0 = new Date(2026, 9, 21, 15, 48, 0).getTime();
  const TONIGHT = new Date(2026, 9, 21, 23, 59, 0).getTime();
  let root, home, second;

  const start = (profiles) => new Supervisor(
    { home, storeRoot: root, maxConcurrentSessions: 3, authProfiles: profiles },
    { listItems: () => [], listProducts: () => [] },
    '/nonexistent-app',
  );
  const item = () => ({ id: 'w-0a1b2c3d4e', product: 'sandbox', title: 'Do it', labels: ['founder'] });

  const ranOutOn = (sup, account) => {
    sup._fruitless = { 'sandbox:w-0a1b2c3d4e': { runs: 1, endedAt: T0, founderAt: T0 - 1000, account, saidAt: T0, saidTs: T0, saidWhy: 'at-limit' } };
    sup._profileCooldown = { ...(sup._profileCooldown ?? {}), [account]: TONIGHT };
    sup._profileTrouble = { ...(sup._profileTrouble ?? {}), [account]: { since: T0, at: T0, cause: 'at-limit', resetsAt: TONIGHT } };
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + 30_000);
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'one-account-'));
    home = path.join(root, 'home');
    second = path.join(home, '.claude-second');
    fs.mkdirSync(second, { recursive: true });
    fs.writeFileSync(path.join(second, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'second@example.com', accountUuid: 'uuid-second' } }));
  });
  afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

  it('does not wake early because the other login is free', () => {
    const sup = start(['default', second]);
    ranOutOn(sup, 'default');
    expect(sup.restingUntil(item())).toBeGreaterThan(Date.now());
  });

  // The boundary either side: the same row is awake the moment its own
  // account is, which is the one thing that always woke it.
  it('is awake as soon as its own account is', () => {
    const sup = start(['default', second]);
    ranOutOn(sup, 'default');
    sup._profileCooldown.default = 0;
    expect(sup.restingUntil(item())).toBe(0);
  });
});

describe('nothing in the words offers another account', () => {
  it('names the hour a limit resets, and no account, however many there are', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', resetsAt: '6pm' });
    expect(said).toContain('starts again on its own at 6pm');
    expect(said).not.toContain('another account');
  });

  it('says the same thing when a second login is sitting there with room', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', resetsAt: '6pm', elsewhere: true });
    expect(said).toContain('6pm');
    expect(said).not.toContain('another account');
  });

  it('answers an ended subscription with renewing it, not with switching', () => {
    for (const said of [
      troubleRemedy('subscription-ended'),
      causeNext('subscription-ended'),
      deadRunSentence({ engineWord: 'Claude Code', cause: 'subscription-ended' }),
      accountSentence('subscription-ended', null),
    ]) {
      expect(said).toContain('claude.ai');
      expect(said).not.toMatch(/another account|pick another account/);
    }
  });

  it('answers a model no plan has with another model, not another login', () => {
    for (const said of [
      causeNext('model-not-on-plan'),
      deadRunSentence({ engineWord: 'Codex', cause: 'model-not-on-plan', model: 'gpt-6.1-sol' }),
    ]) {
      expect(said).toMatch(/another model/);
      expect(said).not.toMatch(/sign in a Codex account|another account/);
    }
  });

  it('offers no spare room as the reason to set up both plans', () => {
    expect(COPY.bothPlans).not.toMatch(/room|limit|turn/i);
  });
});

describe('the cloud runs on one account too', () => {
  let home;
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-one-')); });
  afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

  const add = (key, savedAt) => recordCloudLogin('claude', key, { id: `obj-${key}`, savedAt }, { home });

  it('hands every run the same account rather than spreading them', () => {
    add('a', 1000);
    add('b', 2000);
    const picks = [0, 1, 2, 3].map(() => pickCloudLogin('claude', { home })?.key);
    expect(picks).toEqual(['a', 'a', 'a', 'a']);
  });

  // THE CASE THAT MUST NOT MATCH: an account that cannot run at all is not
  // the account, so a second one signed in is still reachable.
  it('skips a login that has stopped working', () => {
    add('a', 1000);
    add('b', 2000);
    markCloudLogin('claude', 'a', 'obj-a', { broken: 'sign in again' }, { home });
    expect(pickCloudLogin('claude', { home })?.key).toBe('b');
  });

  it('runs nothing while that account is at its usage limit', () => {
    add('a', 1000);
    add('b', 2000);
    markCloudLogin('claude', 'a', 'obj-a', { limitedUntil: Date.now() + 3_600_000 }, { home });
    expect(pickCloudLogin('claude', { home })).toBe(null);
  });
});
