// THE CLOUD RUNS ON THE ACCOUNT YOU SWITCHED TO (w-63264874c7, 2026-10-23).
//
// What broke: a personal Claude account hit its session limit, so the person
// switched to their work account in Settings. Both were signed in to the
// cloud. Their threads came back held: "it was started 6 times in 10 minutes,
// and every run ended before its agent began. The last one said: agentbox
// cloud: no Claude account is signed in for the cloud yet". Several other
// threads did the same.
//
// Measured off ~/.agentbox/cloud-logins.json and the app's config that day:
// the first cloud Claude account (personal) read 100% of its session, limited
// until 3:40pm; the second (work) read 0%; `activeAccount.claude` named the
// work login. Two rules disagreed. The app's check before sending a thread up
// (`_cloudLoginRunnable`) asked whether ANY cloud account could run, and the
// work one could. The run itself (`pickCloudLogin`) took only the FIRST
// account signed in, found it at its limit, said no account was signed in,
// and exited 77; the app asked its check again and sent the thread straight
// back. Picking an account in Settings never reached the cloud at all.
//
// Now the cloud runs on the same account as this Mac whenever that account is
// signed in to the cloud, the check and the run ask one rule, and a run that
// finds its account at its limit says so.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import {
  recordCloudLogin, markCloudLogin, pickCloudLogin, cloudLoginInUse, cloudAccountFrom,
  noCloudAccountSentence, CLOUD_ACCOUNT_ENV,
} from '../main/cloud/logins.mjs';
import { loginForCloudRun } from '../main/cloud/run-cli.mjs';
import { cloudAccountInUse, cloudFootLine } from '../renderer/src/cloud-menu';

let home;
beforeEach(() => { home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-switch-'))); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const at = (h, m) => new Date(2026, 9, 23, h, m, 0, 0).getTime();
const now = at(15, 0);

// Personal first, work second, as they were signed in that day.
const twoAccounts = () => {
  recordCloudLogin('claude', 'acct-me', { id: 'id-me', org: 'org-me', savedAt: 1 }, { home });
  recordCloudLogin('claude', 'acct-work', { id: 'id-work', org: 'org-work', savedAt: 2 }, { home });
};
const limit = (key, until = at(15, 40)) => markCloudLogin('claude', key, `id-${key.slice(5)}`, { limitedUntil: until }, { home });

describe('the cloud account a run takes', () => {
  beforeEach(twoAccounts);

  it('is the one this Mac runs on, though the first one signed in is at its limit', () => {
    limit('acct-me');
    expect(pickCloudLogin('claude', { home, now, prefer: 'acct-work' })?.key).toBe('acct-work');
  });

  it('is the one this Mac runs on when both have room, every time', () => {
    const picks = [0, 1, 2].map(() => pickCloudLogin('claude', { home, now, prefer: 'acct-work' })?.key);
    expect(picks).toEqual(['acct-work', 'acct-work', 'acct-work']);
  });

  it('is the first one signed in when this Mac\'s account is not in the cloud', () => {
    expect(pickCloudLogin('claude', { home, now, prefer: 'acct-elsewhere' })?.key).toBe('acct-me');
    expect(pickCloudLogin('claude', { home, now })?.key).toBe('acct-me');
  });

  // THE CASE THAT MUST NOT MATCH: a limit on the account you are on is waited
  // out. It is never a reason to take the other one (w-dac993a554).
  it('waits out a limit on the account you switched to rather than reaching for the other', () => {
    limit('acct-work');
    expect(pickCloudLogin('claude', { home, now, prefer: 'acct-work' })).toBe(null);
    expect(cloudLoginInUse('claude', { home, now, prefer: 'acct-work' })?.key).toBe('acct-work');
  });

  it('and still waits out a limit on the first one when this Mac is on it', () => {
    limit('acct-me');
    expect(pickCloudLogin('claude', { home, now, prefer: 'acct-me' })).toBe(null);
    expect(pickCloudLogin('claude', { home, now })).toBe(null);
  });

  it('passes over the account you are on when its cloud sign-in has stopped working, as for any other', () => {
    markCloudLogin('claude', 'acct-work', 'id-work', { broken: 'signed out' }, { home });
    expect(pickCloudLogin('claude', { home, now, prefer: 'acct-work' })?.key).toBe('acct-me');
  });

  it('is narrowed by a test copy\'s list before anything is preferred', () => {
    expect(pickCloudLogin('claude', { home, now, only: ['acct-me'], prefer: 'acct-work' })?.key).toBe('acct-me');
  });
});

describe('a run that finds no account to take', () => {
  beforeEach(twoAccounts);

  it('says the account it runs on is at its limit, and until when', () => {
    limit('acct-work');
    const inUse = cloudLoginInUse('claude', { home, now, prefer: 'acct-work' });
    expect(noCloudAccountSentence('claude', inUse, { now })).toBe('the Claude account the cloud runs on is at its usage limit until 3:40pm');
  });

  it('says none is signed in only when none is', () => {
    expect(noCloudAccountSentence('claude', null, { now })).toBe('no Claude account is signed in for the cloud yet (the cloud button)');
    expect(noCloudAccountSentence('codex', null, { now })).toBe('no Codex account is signed in for the cloud yet (the cloud button)');
  });

  it('reads the account to prefer from its own environment, one variable per engine', () => {
    limit('acct-me');
    const env = { [CLOUD_ACCOUNT_ENV.claude]: ' acct-work ' };
    expect(cloudAccountFrom(env, 'claude')).toBe('acct-work');
    expect(cloudAccountFrom(env, 'codex')).toBe(null);
    expect(cloudAccountFrom({}, 'claude')).toBe(null);
    expect(loginForCloudRun('claude', env, { home, now })).toMatchObject({ rec: { key: 'acct-work' }, trouble: null });
  });

  it('without that variable keeps the old answer and the honest sentence', () => {
    limit('acct-me');
    expect(loginForCloudRun('claude', {}, { home, now })).toEqual({
      rec: null, trouble: 'the Claude account the cloud runs on is at its usage limit until 3:40pm',
    });
  });
});

/* -------------------------- the app's side of it -------------------------- */
const login = (dir, email, org) => {
  fs.mkdirSync(path.join(home, dir), { recursive: true });
  fs.writeFileSync(path.join(home, dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: `u-${dir}`, organizationUuid: org } }));
};
const make = (activeAccount = {}) => {
  login('.claude', 'me@example.test', 'org-me');
  login('.claude-2', 'work@example.test', 'org-work');
  login('.claude-5', 'work@example.test', 'org-work');
  const sup = new Supervisor(
    { storeRoot: home, home, maxConcurrentSessions: 3, cloudHost: false, activeAccount },
    { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {}, recordSessionResult() {} },
    home,
  );
  // This Mac's logins, as discovery would list them, without reading the shell.
  sup._profiles = () => ['default', path.join(home, '.claude-2'), path.join(home, '.claude-5')];
  return sup;
};

describe('the app', () => {
  beforeEach(twoAccounts);

  it('knows the cloud account that is the one it runs on, by who it is and not by folder', () => {
    expect(make({ claude: path.join(home, '.claude-2') })._cloudAccountOfThisMac('claude')).toBe('acct-work');
    expect(make({ claude: path.join(home, '.claude-5') })._cloudAccountOfThisMac('claude')).toBe('acct-work');
    expect(make({})._cloudAccountOfThisMac('claude')).toBe('acct-me');
  });

  it('sends a thread up when the account you switched to has room, though the first is at its limit', () => {
    limit('acct-me', Date.now() + 3_600_000);
    expect(make({ claude: path.join(home, '.claude-2') })._cloudLoginRunnable('claude')).toBe(true);
  });

  // THE LOOP ITSELF: the check said yes while the run could take nothing.
  it('does not send a thread up when the account it would run on is at its limit, however many others have room', () => {
    limit('acct-me', Date.now() + 3_600_000);
    expect(make({})._cloudLoginRunnable('claude')).toBe(false);
    limit('acct-work', Date.now() + 3_600_000);
    expect(make({ claude: path.join(home, '.claude-2') })._cloudLoginRunnable('claude')).toBe(false);
  });

  it('marks that account in use for the screen, and no other', () => {
    const marks = (sup) => sup._cloudAccounts().filter((a) => a.engine === 'claude').map((a) => [a.key, a.inUse]);
    expect(marks(make({ claude: path.join(home, '.claude-2') }))).toEqual([['acct-me', false], ['acct-work', true]]);
    expect(marks(make({}))).toEqual([['acct-me', true], ['acct-work', false]]);
  });

  it('asks its check again the moment you pick an account', () => {
    const sup = make({});
    sup._cloudConfigAt = Date.now();
    sup.accountChosen('claude', path.join(home, '.claude-2'));
    expect(sup._cloudConfigAt).toBe(0);
  });

  it('hands that account to the cloud run it starts, and no inherited one', async () => {
    const sup = make({ claude: path.join(home, '.claude-2') });
    const script = path.join(home, 'say-env.mjs');
    fs.writeFileSync(script, `process.stdout.write(JSON.stringify({ claude: process.env.${CLOUD_ACCOUNT_ENV.claude} ?? null, codex: process.env.${CLOUD_ACCOUNT_ENV.codex} ?? null }));`);
    sup._cloudRunPath = () => script;
    const child = sup._spawnCloudRelay([], { cwd: home, env: { PATH: process.env.PATH, [CLOUD_ACCOUNT_ENV.codex]: 'acct-inherited' } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    await new Promise((resolve) => child.on('exit', resolve));
    expect(JSON.parse(out)).toEqual({ claude: 'acct-work', codex: null });
  });
});

describe('a Codex account', () => {
  const codexLogin = (dir, email) => {
    fs.mkdirSync(path.join(home, dir), { recursive: true });
    const part = Buffer.from(JSON.stringify({ email })).toString('base64url');
    fs.writeFileSync(path.join(home, dir, 'auth.json'), JSON.stringify({ tokens: { id_token: `h.${part}.s` } }));
  };

  it('is matched by its email', () => {
    codexLogin('.codex', 'me@example.test');
    codexLogin('.codex-2', 'work@example.test');
    recordCloudLogin('codex', 'acct-cme', { id: 'c-me', email: 'me@example.test', savedAt: 1 }, { home });
    recordCloudLogin('codex', 'acct-cwork', { id: 'c-work', email: 'Work@Example.test', savedAt: 2 }, { home });
    const sup = make({ codex: path.join(home, '.codex-2') });
    sup.config.codexHome = path.join(home, '.codex');
    sup.config.codexProfiles = ['default', path.join(home, '.codex-2')];
    expect(sup._cloudAccountOfThisMac('codex')).toBe('acct-cwork');
  });
});

describe('the screen', () => {
  const account = (key, over = {}) => ({ engine: 'claude', key, name: null, ready: true, state: 'ready', limitedUntil: null, ...over });
  const cloud = (accounts) => ({ setUp: true, mode: 'full', whenOn: 'full', running: 2, accounts, signIns: [], month: { runs: 0, agentHours: 0 } });

  it('names the account the app marks in use, not the first one signed in', () => {
    const accounts = [account('acct-me', { state: 'limited', ready: false, limitedUntil: at(15, 40), inUse: false }), account('acct-work', { inUse: true })];
    expect(cloudAccountInUse(accounts, 'claude')?.key).toBe('acct-work');
    expect(cloudFootLine(cloud(accounts), now)).toBe('2 running in the cloud now');
  });

  it('still says the account in use is out when it is', () => {
    const accounts = [account('acct-me', { inUse: false }), account('acct-work', { state: 'limited', ready: false, limitedUntil: at(15, 40), inUse: true })];
    expect(cloudFootLine(cloud(accounts), now)).toBe('Your cloud account is at its usage limit until 3:40pm. Threads run on this Mac until then.');
  });

  it('names none when the app marks none', () => {
    expect(cloudAccountInUse([account('acct-me', { state: 'broken', ready: false, inUse: false })], 'claude')).toBe(null);
  });
});
