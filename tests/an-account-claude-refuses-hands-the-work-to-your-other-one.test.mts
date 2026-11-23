// AN ACCOUNT CLAUDE REFUSES HANDS THE WORK TO YOUR OTHER ONE (w-3e97e1531d, 2026-11-22).
//
// What broke: on 2026-11-20, 23:29 to 23:42 UTC, Claude refused one paid account
// ("Your organization has disabled Claude subscription access for Claude Code").
// Thirteen cloud starts on five threads died of it in 13 minutes, off the run
// logs. Only a usage limit benched a cloud account, so every next thread went to
// the same refused one; the refusal was charged to the thread, so two replies
// spent all three tries and were given up on; and a second account with room,
// signed in to the cloud, took nothing until the Mac was set to it about 23:50. Each thread came to the inbox saying its organization had switched
// Claude Code off and only an admin could turn it back on, about a personal plan.
//
// Now a refusal is treated as a limit is: the cloud account sits out, the try is
// not charged, the work moves to another account with room, and the thread runs
// again there without a word in the inbox. With nowhere to go it says what is
// true of a work account and a personal one alike.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { Supervisor } from '../main/supervisor.mts';
import { waitFor, waitUntilNo } from './waiting.mts';
import { recordCloudLogin, markCloudLogin, cloudLoginFor, cloudLoginState, mayRunOn, pickCloudLogin, noCloudAccountSentence } from '../main/cloud/logins.mts';
import { refusedInResultLine, REFUSED_REST_MS } from '../main/cloud/run.mts';
import { accountRefused, deadRunSentence, deadRunCause } from '../shared/spawn-trouble.mts';
import { cloudFootLine } from '../renderer/src/cloud-menu';
import { cloudAccountState } from '../renderer/src/account-words';
import { whyWords } from '../renderer/src/where-why';

const REFUSAL = 'Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic API key instead, or ask your admin to enable access';
const PAST_DUE = "Claude Code can't use your Claude subscription, usually because a payment is past due · Pay or renew at https://claude.ai/settings/billing";
const LIMIT = "You've hit your weekly limit · resets Nov 25 at 2pm";
const now = Date.now();

let home: string;
let appDir: string;
const login = (dir: string, email: string, accountUuid: string, org: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid, organizationUuid: org, billingType: 'stripe_subscription', organizationType: 'claude_max' } }));
};
beforeEach(() => {
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'refused-switch-')));
  appDir = path.join(home, 'app');
  fs.mkdirSync(appDir);
  login(home, 'work@example.com', 'acct-work', 'org-work');
  login(path.join(home, '.claude-3'), 'me@example.com', 'acct-me', 'org-me');
});
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

const ME = () => path.join(home, '.claude-3');
type Bare = Supervisor & Record<string, any>;
const bare = (active: string, profiles: string[] = [ME(), 'default']): Bare => {
  const s = Object.create(Supervisor.prototype) as Bare;
  s.config = { home, appDir, authProfiles: profiles, activeAccount: { claude: active }, maxConcurrentSessions: 3, engineChoice: '2026-01-01T00:00:00.000Z' };
  s._profiles = () => [...profiles];
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._fruitless = {};
  s._saveState = () => {};
  s.wake = () => {};
  s.onChange = () => {};
  return s;
};
const cloudAccounts = () => {
  recordCloudLogin('claude', 'acct-me-cloud', { id: 'id-me', org: 'org-me', savedAt: 1 }, { home, now });
  recordCloudLogin('claude', 'acct-work-cloud', { id: 'id-work', org: 'org-work', savedAt: 2 }, { home, now });
};
const refusedInCloud = (key = 'acct-me-cloud', id = 'id-me') => markCloudLogin('claude', key, id, { refusedUntil: now + REFUSED_REST_MS }, { home });
const ended = (over = {}) => ({
  itemId: 'w-a', engine: 'claude', profile: ME(), cloudAccount: ME(),
  startedAt: now - 5000, result: REFUSAL, resultIsError: true, tail: [], cloud: true, ...over,
}) as any;

describe('a Claude result that refuses the account', () => {
  const line = (result: string, is_error = true) => JSON.stringify({ type: 'result', is_error, result });
  it('is read off the cloud run, in both wordings', () => {
    expect(refusedInResultLine(line(REFUSAL), now)).toBe(now + REFUSED_REST_MS);
    expect(refusedInResultLine(line(PAST_DUE), now)).toBe(now + REFUSED_REST_MS);
  });
  it('must NOT be read off a limit, a sign-in, a result that worked, or another line', () => {
    expect(refusedInResultLine(line(LIMIT), now)).toBe(null);
    expect(refusedInResultLine(line('Not logged in · Please run /login'), now)).toBe(null);
    expect(refusedInResultLine(line(`The log said "${REFUSAL}"`, false), now)).toBe(null);
    expect(refusedInResultLine(JSON.stringify({ type: 'assistant', message: REFUSAL }), now)).toBe(null);
    expect(refusedInResultLine('not json', now)).toBe(null);
  });
  it('is what the relay marks the cloud login it ran on with', () => {
    const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    expect(read('main/cloud/run.mts')).toMatch(/const refused = refusedInResultLine\(line\);\s*if \(refused\) \{ try \{ onRefused\(\{ until: refused \}\); \}/);
    expect(read('main/cloud/run-cli.mts')).toMatch(/onRefused: \(\{ until \}\) => \{ if \(rec\) markCloudLogin\(engine, dir!, rec\.id, \{ refusedUntil: until \}\); \}/);
  });
  it('names the causes it covers, and no other', () => {
    expect(['org-blocked', 'subscription-ended'].every(accountRefused)).toBe(true);
    expect(['at-limit', 'signed-out', 'no-plan', 'interrupted', 'unknown', null, undefined].some(accountRefused)).toBe(false);
  });
});

describe('the cloud account it refused', () => {
  it('takes no run until its rest is over, then one may try it', () => {
    cloudAccounts();
    refusedInCloud();
    const rec = cloudLoginFor('claude', 'acct-me-cloud', { home })!;
    expect(cloudLoginState(rec, { now })).toBe('refused');
    expect(mayRunOn('refused')).toBe(false);
    expect(pickCloudLogin('claude', { home, now, prefer: 'acct-me-cloud' })).toBe(null);
    expect(pickCloudLogin('claude', { home, now: now + REFUSED_REST_MS + 1, prefer: 'acct-me-cloud' })?.id).toBe('id-me');
  });
  it('is back at once when it is signed in again', () => {
    cloudAccounts();
    refusedInCloud();
    recordCloudLogin('claude', 'acct-me-cloud', { id: 'id-me-2', org: 'org-me' }, { home, now });
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-me-cloud', { home }), { now })).toBe('ready');
  });
  it('is not marked by an old run once a newer sign-in replaced the login it used', () => {
    cloudAccounts();
    expect(refusedInCloud('acct-me-cloud', 'id-old')).toBe(false);
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-me-cloud', { home }), { now })).toBe('ready');
  });
  it('is named in the cloud, not called ready', () => {
    cloudAccounts();
    refusedInCloud();
    expect(noCloudAccountSentence('claude', cloudLoginFor('claude', 'acct-me-cloud', { home }), { now })).toMatch(/Claude is refusing/);
    expect(cloudAccountState({ engine: 'claude', key: 'k', name: null, ready: false, state: 'refused' }, now)).toBe('Claude is refusing it');
  });
});

describe('the work', () => {
  it('moves to the account with room, and the cloud follows', () => {
    cloudAccounts();
    refusedInCloud();
    const s = bare(ME());
    expect(s._moveOffALimitedAccount(now)).toMatchObject({ from: ME(), to: 'default' });
    expect(s._cloudAccountOfThisMac('claude')).toBe('acct-work-cloud');
  });
  it('moves when the refusal was on this Mac', () => {
    const s = bare(ME());
    s._profileTrouble[ME()] = { since: now, at: now, cause: 'subscription-ended', raw: PAST_DUE };
    s._profileCooldown[ME()] = now + 30 * 60_000;
    expect(s._moveOffALimitedAccount(now)?.to).toBe('default');
  });
  it('never moves to an account that is refused too', () => {
    cloudAccounts();
    refusedInCloud();
    refusedInCloud('acct-work-cloud', 'id-work');
    expect(bare(ME())._moveOffALimitedAccount(now)).toBe(null);
  });
  it('stays put for a login that ran out, or a refusal whose rest is over', () => {
    const s = bare(ME());
    s._profileTrouble[ME()] = { since: now, at: now, cause: 'signed-out', raw: 'Not logged in' };
    s._profileCooldown[ME()] = now + 30 * 60_000;
    expect(s._moveOffALimitedAccount(now)).toBe(null);
    s._profileTrouble[ME()] = { since: now, at: now, cause: 'org-blocked', raw: REFUSAL };
    s._profileCooldown[ME()] = now - 1;
    expect(s._moveOffALimitedAccount(now)).toBe(null);
  });
  it('goes back to the account you pick by hand, refused or not', () => {
    cloudAccounts();
    refusedInCloud();
    const s = bare('default');
    s.config.activeAccount = { claude: ME() };
    s.accountChosen('claude', ME());
    expect(cloudLoginState(cloudLoginFor('claude', 'acct-me-cloud', { home }), { now })).toBe('ready');
    expect(s._moveOffALimitedAccount(now)).toBe(null);
  });
  it('is said on the cloud button', () => {
    cloudAccounts();
    refusedInCloud();
    const s = bare(ME());
    s._moveOffALimitedAccount(now);
    const switched = s._accountSwitchNow(now);
    const line = cloudFootLine({ setUp: true, mode: 'all', running: 4, month: { runs: 0, agentHours: 0 } as any, switched }, now);
    expect(line).toBe('Claude is refusing me@example.com, so threads run on work@example.com.');
    expect(s._accountSwitchNow(now + REFUSED_REST_MS + 60_000)).not.toBe(null);
  });
});

describe('with nowhere else to go, the cloud', () => {
  it('still counts the account as signed in, and the thread runs here and says why', () => {
    const was = process.env.AGENTBOX_CLOUD_CONFIG;
    fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
    process.env.AGENTBOX_CLOUD_CONFIG = path.join(home, '.agentbox', 'cloud.json');
    fs.writeFileSync(process.env.AGENTBOX_CLOUD_CONFIG, JSON.stringify({ gateway: 'https://cloud.example.test' }));
    try {
      recordCloudLogin('claude', 'acct-work-cloud', { id: 'id-work', org: 'org-work', savedAt: 2 }, { home, now });
      refusedInCloud('acct-work-cloud', 'id-work');
      const product = { slug: 'p', dir: home, repoPath: '/r' };
      const sup = new Supervisor({ storeRoot: home, home, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns: 'all' } as any,
        { listItems: () => [], listProducts: () => [product], isDue: () => true } as any, home) as Bare;
      sup._cloudVersionGaps = () => [];
      const item = { id: 'w-b', product: 'p', status: 'open' };
      expect(sup._cloudSignedInAtAll('claude')).toBe(true);
      expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-b', engine: 'claude' })).toBe('local');
      const why = sup._whyLocal({ item, product, engine: 'claude' } as any);
      expect(why).toEqual({ why: 'cloud-account-refused' });
      expect(whyWords({ at: 'mac', ...why } as any).body).toBe('Claude is refusing the cloud’s account, so this runs on the account this computer uses.');
    } finally {
      if (was === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = was;
    }
  });
});

describe('the thread that met it', () => {
  it('is not charged a try, and runs again once the work has moved', () => {
    cloudAccounts();
    refusedInCloud();
    const s = bare(ME());
    const session = ended();
    s.noteExitForBackoff(session);
    expect(session.accountFault).toMatchObject({ cause: 'org-blocked', account: ME() });
    s._moveOffALimitedAccount(now);
    s._engineFor = () => 'claude';
    expect(s._runsAgainElsewhere({ id: 'w-a', product: 'p' } as any, session)).toBe(true);
  });
  it('leaves this Mac\'s own login unmarked: the cloud signs in with its own', () => {
    const s = bare(ME());
    s.noteExitForBackoff(ended());
    expect(s._profileTrouble[ME()]).toBeUndefined();
    expect(s._profileCooldown[ME()] ?? 0).toBe(0);
  });
  it('says so on its row when nothing else has room', () => {
    cloudAccounts();
    refusedInCloud();
    refusedInCloud('acct-work-cloud', 'id-work');
    const s = bare(ME());
    const session = ended();
    s.noteExitForBackoff(session);
    s._moveOffALimitedAccount(now);
    s._engineFor = () => 'claude';
    expect(s._runsAgainElsewhere({ id: 'w-a', product: 'p' } as any, session)).toBe(false);
  });
  it('is charged as before for a cloud run that failed some other way', () => {
    const s = bare(ME());
    const session = ended({ result: 'API Error: something else' });
    s.noteExitForBackoff(session);
    expect(session.accountFault).toBeUndefined();
    s._engineFor = () => 'claude';
    expect(s._runsAgainElsewhere({ id: 'w-a', product: 'p' } as any, session)).toBe(false);
  });
});

describe('what the row says', () => {
  const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'org-blocked' });
  it('is true of a personal plan and a work one', () => {
    expect(said).toBe('Claude Code will not run on that account, so nothing has been done on this task. Check its plan at claude.ai, or on a work account ask an admin.');
    expect(said).not.toMatch(/only an admin|by its organization/i);
  });
  it('opens under 112 characters, and reads back as its cause, as the old words on rows already do', () => {
    expect(`${said.split('. ')[0]}.`.length).toBeLessThan(112);
    expect(deadRunCause(said)).toBe('org-blocked');
    expect(deadRunCause('Claude Code is switched off for that account by its organization, so nothing has been done. Only an admin of that Claude workspace can turn it back on.')).toBe('org-blocked');
  });
});

// A real Store, a real Supervisor ticking, and a real child process standing in
// for `claude`: it refuses on the account in use and works on the other one.
describe('start to finish, with a real claude process', () => {
  const PRODUCT = 'myproduct';
  let store: any;
  let sup: Bare;
  let log: string;
  let said: { id: string; result: string }[];
  const savedPerson = process.env.AGENTBOX_PERSON_ID;
  afterEach(() => {
    try { sup?.stop(); } catch { /* never started */ }
    if (savedPerson !== undefined) process.env.AGENTBOX_PERSON_ID = savedPerson;
  });

  const build = async ({ others = ['default'] as string[], refuses = [] as string[] } = {}) => {
    delete process.env.AGENTBOX_PERSON_ID;
    const root = path.join(home, 'store');
    log = path.join(home, 'runs.log');
    const fake = path.join(home, 'claude');
    fs.mkdirSync(path.join(root, PRODUCT), { recursive: true });
    fs.mkdirSync(path.join(home, 'data'));
    fs.writeFileSync(path.join(root, PRODUCT, 'project.json'), JSON.stringify({ schemaVersion: 1, id: PRODUCT, name: 'My Product' }));
    fs.writeFileSync(fake, `#!/usr/bin/env node
const fs = require('fs');
if (!process.argv.includes('stream-json')) { process.stdout.write('A short name'); process.exit(0); }
const account = process.env.CLAUDE_CONFIG_DIR || 'default';
const refused = ${JSON.stringify(refuses)}.includes(account);
fs.appendFileSync(${JSON.stringify(log)}, account + '\\n');
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const session_id = 'sess-' + process.pid;
out({ type: 'system', subtype: 'init', session_id });
if (refused) {
  setTimeout(() => {
    out({ type: 'result', subtype: 'success', is_error: true, result: ${JSON.stringify(REFUSAL)}, session_id });
    setTimeout(() => process.exit(1), 50);
  }, 400);
} else {
  let buf = '';
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let at;
    while ((at = buf.indexOf('\\n')) >= 0) {
      const line = buf.slice(0, at); buf = buf.slice(at + 1);
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.type !== 'user') continue;
      out({ ...msg, session_id });
      out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done. The toggle is in.' }] }, session_id });
      out({ type: 'result', subtype: 'success', is_error: false, result: 'Done. The toggle is in.', session_id });
    }
  });
  process.stdin.on('end', () => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}
`, { mode: 0o755 });
    const config = {
      home, accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: fake, storeMcpCommand: null,
      authProfiles: [ME(), ...others], activeAccount: { claude: ME() }, maxConcurrentSessions: 3, sessionArgs: [], autonomousProducts: [PRODUCT],
    };
    store = await new Store(config as any).init();
    said = [];
    const write = store.recordSessionResult.bind(store);
    store.recordSessionResult = (slug: string, id: string, patch: any) => { said.push({ id, result: String(patch.result ?? '') }); return write(slug, id, patch); };
    sup = new Supervisor(config as any, store, appDir, path.join(home, 'data')) as Bare;
    sup._profiles = () => [ME(), ...others];
    sup.nameTheRows = () => {};
    sup.sortTheMessages = () => {};
  };
  const runs = () => { try { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean); } catch { return []; } };
  const row = (id: string) => store.readItem(PRODUCT, id, Date.now());
  const idle = () => waitUntilNo('the runs to be reaped', () => sup._preparing?.size || sup.sessions.size);
  const file = () => store.fileItem(PRODUCT, { title: 'Add a dark mode toggle', kind: 'task', body: 'Please add a toggle.', labels: ['founder'] });
  const everSaid = (id: string) => said.filter((s) => s.id === id && /will not run on that account/.test(s.result)).length;

  it('a run refused in the cloud finishes on the other account, and its row never says it failed', async () => {
    await build({ refuses: [ME()] });
    cloudAccounts();
    const made = file();
    await sup.tick();
    const session: any = await waitFor('the first run to be up', () => [...sup.sessions.values()].find((s: any) => s.sessionId));
    // What the cloud's relay does as it passes the refusal on (main/cloud/run-cli.mts).
    session.cloud = true;
    session.cloudAccount = ME();
    refusedInCloud();
    await idle();
    expect(runs()).toEqual([ME()]);
    expect(row(made.id).result ?? null).toBe(null);
    for (let i = 0; i < 5 && runs().length < 2; i++) { await sup.tick(); await idle(); }
    expect(runs()).toEqual([ME(), 'default']);
    await waitFor('the answer to land', () => /toggle is in/.test(row(made.id).result ?? ''));
    expect(everSaid(made.id)).toBe(0);
  });

  it('a run refused on this Mac does the same', async () => {
    await build({ refuses: [ME()] });
    const made = file();
    await sup.tick();
    await idle();
    for (let i = 0; i < 5 && runs().length < 2; i++) { await sup.tick(); await idle(); }
    expect(runs()).toEqual([ME(), 'default']);
    await waitFor('the answer to land', () => /toggle is in/.test(row(made.id).result ?? ''));
    expect(everSaid(made.id)).toBe(0);
  });

  it('with no other account it says so once, and does not start over and over', async () => {
    await build({ others: [], refuses: [ME()] });
    const made = file();
    await sup.tick();
    await idle();
    for (let i = 0; i < 5; i++) { await sup.tick(); await idle(); }
    expect(runs()).toEqual([ME()]);
    expect(row(made.id).result).toMatch(/^Claude Code will not run on that account/);
    expect(everSaid(made.id)).toBe(1);
  });
});
