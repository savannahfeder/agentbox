// AN ACCOUNT AT ITS LIMIT HANDS THE WORK TO YOUR OTHER ONE (w-eef182b53dcf, 2026-11-10).
//
// What broke: on 2026-11-09 the Claude account the Mac was set to reached 100%
// of its weekly limit at 6:28pm (the cloud's usage reading in
// ~/.agentbox/cloud-logins.json; the Mac's own login filed the limit at 6:41pm,
// reset Nov 12). The cloud runs only on the Mac's account, so from 6:28 it took
// no Claude threads, while another login on the same Mac, signed in to the
// cloud, sat at 19% of its week. Replies waited up to 18 minutes, and the
// memory log showed 20 local agents at 6:51pm as they all came back to the Mac.
// The cloud ran again only once the account was switched by hand (37-39 runs
// from 7:01pm).
//
// Their decision, 2026-11-10: "Build the switch: your Mac and the cloud move to
// your account with room by themselves." So when the account in use is at its
// limit, the app picks another of their Claude logins with room, preferring one
// the cloud can run on, and the cloud follows it. Never another folder holding
// the same subscription, never an account that is itself out, and never over
// their own pick made after the limit was read.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { recordCloudLogin } from '../main/cloud/logins.mts';
import { cloudFootLine } from '../renderer/src/cloud-menu';

let home: string;
let appDir: string;
const now = new Date(2026, 10, 9, 18, 30, 0, 0).getTime();
const reset = new Date(2026, 10, 12, 14, 0, 0, 0).getTime();
const LIMIT = "You've hit your weekly limit · resets Nov 12 at 2pm";

const login = (dir: string, email: string, accountUuid: string, org: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid, organizationUuid: org } }));
};

beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'limit-switch-')));
  appDir = path.join(home, 'app');
  fs.mkdirSync(appDir);
  login(home, 'work@example.com', 'acct-work', 'org-work');
  login(path.join(home, '.claude-3'), 'me@example.com', 'acct-me', 'org-me');
  login(path.join(home, '.claude-second'), 'me@example.com', 'acct-me', 'org-me');
  login(path.join(home, '.claude-2'), 'other@example.com', 'acct-other', 'org-other');
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const ME = () => path.join(home, '.claude-3');
const ME_TOO = () => path.join(home, '.claude-second');
const OTHER = () => path.join(home, '.claude-2');

type Bare = Supervisor & Record<string, any>;
const bare = (active: string, profiles: string[] = [OTHER(), ME(), ME_TOO(), 'default']): Bare => {
  const s = Object.create(Supervisor.prototype) as Bare;
  s.config = { home, appDir, authProfiles: profiles, activeAccount: { claude: active }, maxConcurrentSessions: 3, engineChoice: '2026-01-01T00:00:00.000Z' };
  s._profiles = () => [...profiles];
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  s.wake = () => {};
  s.onChange = () => {};
  return s;
};

const atLimit = (s: Bare, profile: string) => {
  s._profileTrouble[profile] = { since: now - 60_000, at: now - 60_000, cause: 'at-limit', raw: LIMIT, resetsAt: reset };
  s._profileCooldown[profile] = reset;
};

const cloudAccounts = ({ meRead = null as null | { percent: number; at: number } } = {}) => {
  recordCloudLogin('claude', 'acct-me-cloud', { id: 'id-me', org: 'org-me', savedAt: 1, ...(meRead ? { limits: [{ span: 'week', percent: meRead.percent, resetsAt: reset }] } : {}) }, { home, now: meRead?.at ?? now });
  recordCloudLogin('claude', 'acct-work-cloud', { id: 'id-work', org: 'org-work', savedAt: 2, limits: [{ span: 'week', percent: 19, resetsAt: reset + 3 * 86_400_000 }] }, { home, now });
};

const savedActive = () => JSON.parse(fs.readFileSync(path.join(appDir, 'zero.config.json'), 'utf8')).activeAccount?.claude;

describe('the account your Mac is set to reaches its limit', () => {
  it('moves the work to your other account with room, and the cloud follows', () => {
    cloudAccounts();
    const s = bare(ME());
    atLimit(s, ME());
    expect(s._cloudAccountOfThisMac('claude')).toBe('acct-me-cloud');
    expect(s._moveOffALimitedAccount(now)).toMatchObject({ from: ME(), to: 'default' });
    expect(s._profilesFor('claude')).toEqual(['default']);
    expect(savedActive()).toBe('default');
    expect(s._cloudAccountOfThisMac('claude')).toBe('acct-work-cloud');
  });

  it('prefers an account the cloud can run on over one listed first that it cannot', () => {
    cloudAccounts();
    const s = bare(ME());
    atLimit(s, ME());
    expect(s._moveOffALimitedAccount(now)?.to).toBe('default');
  });

  it('takes a login the cloud has no sign-in for when that is the only one with room', () => {
    const s = bare(ME());
    atLimit(s, ME());
    atLimit(s, 'default');
    expect(s._moveOffALimitedAccount(now)?.to).toBe(OTHER());
  });

  it('moves when the cloud read the account at 100% before any run here hit it', () => {
    cloudAccounts({ meRead: { percent: 100, at: now - 120_000 } });
    const s = bare(ME());
    expect(s._moveOffALimitedAccount(now)?.to).toBe('default');
  });

  it('says what it did, for the cloud button', () => {
    cloudAccounts();
    const s = bare(ME());
    atLimit(s, ME());
    s._moveOffALimitedAccount(now);
    const switched = s._accountSwitchNow(now);
    expect(switched).toEqual({ from: 'me@example.com', to: 'work@example.com', until: reset });
    const line = cloudFootLine({ setUp: true, mode: 'all', running: 4, month: { runs: 0, agentHours: 0 } as any, switched }, now);
    expect(line).toBe('me@example.com is at its limit until Thu 2pm, so threads run on work@example.com.');
  });
});

describe('what it never does', () => {
  it('never moves to another folder holding the same subscription', () => {
    const s = bare(ME(), [ME(), ME_TOO(), 'default']);
    atLimit(s, ME());
    atLimit(s, 'default');
    expect(s._moveOffALimitedAccount(now)).toBe(null);
    expect(s._profilesFor('claude')).toEqual([ME()]);
  });

  it('waits out the limit when every other account is out too', () => {
    const s = bare(ME());
    atLimit(s, ME());
    atLimit(s, 'default');
    s._profileTrouble[OTHER()] = { since: now, at: now, cause: 'signed-out', raw: 'not logged in' };
    expect(s._moveOffALimitedAccount(now)).toBe(null);
  });

  it('does not move off an account that is not at its limit', () => {
    cloudAccounts({ meRead: { percent: 99, at: now - 60_000 } });
    const s = bare(ME());
    s._profileTrouble[ME()] = { since: now, at: now, cause: 'unknown', raw: 'network' };
    expect(s._moveOffALimitedAccount(now)).toBe(null);
  });

  it('does not move off a limit that has already reset', () => {
    const s = bare(ME());
    atLimit(s, ME());
    expect(s._moveOffALimitedAccount(reset + 86_400_000)).toBe(null);
  });

  it('leaves your own pick alone until something newer says it is out', () => {
    cloudAccounts({ meRead: { percent: 100, at: now - 120_000 } });
    const s = bare('default');
    s.config.activeAccount = { claude: ME() };
    s.accountChosen('claude', ME());
    s._accountChosenAt = now - 60_000;
    expect(s._moveOffALimitedAccount(now)).toBe(null);
    atLimit(s, ME());
    expect(s._moveOffALimitedAccount(now)?.to).toBe('default');
  });

  it('leaves Codex accounts as they are', () => {
    const s = bare(ME());
    s.config.activeAccount = { claude: ME(), codex: 'default' };
    atLimit(s, ME());
    s._moveOffALimitedAccount(now);
    expect(s.config.activeAccount.codex).toBe('default');
  });
});
