// THE APP REVIEW COMPUTER ALWAYS TURNS ITSELF OFF.
//
// App Review needs the demo account answered for days with no computer of the
// reviewer's: the cloud alone goes quiet 20 minutes after an answer
// (IDLE_CLOSE_MS) and will not start from a project snapshot older than six
// days (KIT_FRESH_MS). So scripts/app-review-computer.mjs keeps a small server
// on, signed in to the demo account. The founder, 2026-11-08: "you have to make
// sure that we eventually turn it off. Otherwise we're going to end up spending
// a lot of compute unintentionally." So every machine it makes has an end date,
// held three ways: the machine shuts itself down then and AWS deletes it
// (counted again at every boot), an AWS schedule deletes it then whatever the
// machine is doing, and `off` deletes it at once. It never makes a second
// machine while one is on, and never keeps one longer than 30 days.
import { describe, it, expect } from 'vitest';
import { CLOUD_ADDRESS } from '../shared/cloud-address.mts';
import { expiryOf, userDataOf, runInstancesArgs, scheduleArgs, envFileOf, hoursLeft, refuseSecond, secretsFrom, retried, KEYCHAIN, CODEX_LOGIN, MAX_DAYS, DEFAULT_DAYS } from '../scripts/app-review-computer.mjs';

const NOW = Date.parse('2026-11-09T12:00:00Z');

describe('the end date', () => {
  it('is two weeks away unless asked otherwise', () => {
    expect(DEFAULT_DAYS).toBe(14);
    expect(expiryOf(NOW)).toBe('2026-11-23T12:00:00.000Z');
  });
  it('is never more than 30 days away, and never none', () => {
    expect(MAX_DAYS).toBe(30);
    expect(expiryOf(NOW, 30)).toBe('2026-12-09T12:00:00.000Z');
    expect(() => expiryOf(NOW, 31)).toThrow(/30 days/);
    expect(() => expiryOf(NOW, 0)).toThrow();
    expect(() => expiryOf(NOW, Number.NaN)).toThrow();
  });
});

describe('guard one: the machine turns itself off, and AWS deletes it', () => {
  const ud = userDataOf({ expiresAt: '2026-11-23T12:00:00.000Z' });
  it('is told to delete itself on shutdown, not just stop', () => {
    expect(runInstancesArgs({ ami: 'ami-1', securityGroup: 'sg-1', keyName: 'k', userData: ud, expiresAt: '2026-11-23T12:00:00.000Z' }).join(' ')).toMatch(/--instance-initiated-shutdown-behavior terminate/);
  });
  it('shuts down at the end date, counted again at every boot', () => {
    expect(ud).toContain(`EXPIRES=${Date.parse('2026-11-23T12:00:00.000Z') / 1000}`);
    expect(ud).toMatch(/shutdown -h \+\$left/);
    expect(ud).toMatch(/shutdown -h now/);
    expect(ud).toMatch(/WantedBy=multi-user\.target/);
    expect(ud).toMatch(/systemctl enable --now agentbox-review-expiry/);
  });
  // The public-repo check refused the first version, which piped NodeSource's script into bash.
  it('runs nothing it downloads without checking it first', () => {
    expect(ud).not.toMatch(/\|\s*(sudo\s+)?(ba)?sh\b/);
    expect(ud).toMatch(/sha256sum -c -/);
  });
  it('carries no password or token: those go over SSH to a file only root reads', () => {
    expect(ud).not.toMatch(/TEST_LOGIN=|OAUTH_TOKEN=/);
    expect(ud).toMatch(/EnvironmentFile=\/etc\/agentbox-review\.env/);
  });
});

describe('guard two: an AWS schedule deletes it at the end date', () => {
  const args = scheduleArgs({ instanceId: 'i-0abc', expiresAt: '2026-11-23T12:00:00.000Z', roleArn: 'arn:aws:iam::1:role/r' });
  it('at the end date, once, and then removes itself', () => {
    const s = args.join(' ');
    expect(s).toMatch(/--schedule-expression at\(2026-11-23T12:00:00\)/);
    expect(s).toMatch(/--schedule-expression-timezone UTC/);
    expect(s).toMatch(/--action-after-completion DELETE/);
  });
  it('deletes exactly that machine', () => {
    const target = JSON.parse(args[args.indexOf('--target') + 1]);
    expect(target.Arn).toBe('arn:aws:scheduler:::aws-sdk:ec2:terminateInstances');
    expect(JSON.parse(target.Input)).toEqual({ InstanceIds: ['i-0abc'] });
  });
});

// The first real `on` (2026-11-08) made the scheduler's role and asked for the
// schedule in the same second; AWS refused ("must allow AWS EventBridge
// Scheduler to assume the role") because a new role takes seconds to take hold.
describe('guard two, with a role made a moment ago', () => {
  it('asks again until the role takes hold', async () => {
    let n = 0;
    const out = await retried(() => { n += 1; if (n < 3) throw new Error('must allow AWS EventBridge Scheduler to assume the role'); return 'made'; }, { tries: 6, sleep: async () => {} });
    expect(out).toBe('made');
    expect(n).toBe(3);
  });
  it('gives up after its tries, saying the last error', async () => {
    await expect(retried(() => { throw new Error('still no'); }, { tries: 3, sleep: async () => {} })).rejects.toThrow('still no');
  });
});

describe('the machine it makes', () => {
  const args = runInstancesArgs({ ami: 'ami-1', securityGroup: 'sg-1', keyName: 'k', userData: 'x', expiresAt: '2026-11-23T12:00:00.000Z' });
  it('is labelled with its end date, so status and off can find it', () => {
    const tags = args[args.indexOf('--tag-specifications') + 1];
    expect(tags).toMatch(/Key=agentbox:purpose,Value=app-review/);
    expect(tags).toMatch(/Key=agentbox:expires,Value=2026-11-23T12:00:00.000Z/);
  });
  it('is one small machine', () => {
    expect(args.join(' ')).toMatch(/--instance-type t3\.medium/);
    expect(args.join(' ')).toMatch(/--count 1/);
  });
});

describe('one at a time', () => {
  it('refuses a second while one is on or starting', () => {
    expect(() => refuseSecond([{ InstanceId: 'i-1', State: { Name: 'running' } }])).toThrow(/already on: i-1/);
    expect(() => refuseSecond([{ InstanceId: 'i-1', State: { Name: 'pending' } }])).toThrow(/already on/);
  });
  it('a machine already shutting down or gone does not count', () => {
    expect(() => refuseSecond([{ InstanceId: 'i-1', State: { Name: 'terminated' } }, { InstanceId: 'i-2', State: { Name: 'shutting-down' } }])).not.toThrow();
  });
});

describe('the sign-in file', () => {
  it('holds the demo login and nothing else', () => {
    expect(envFileOf({ email: 'r@x.ac', password: 'p:w' })).toBe('AGENTBOX_TEAM_TEST_LOGIN=r@x.ac:p:w\n');
  });
  it('refuses a value that would break the file', () => {
    expect(() => envFileOf({ email: 'r@x.ac', password: 'p\nX=1' })).toThrow();
    expect(() => envFileOf({ email: '', password: 'p' })).toThrow();
  });
});

// The founder, 2026-11-08: "why are we signing in? we're not giving other people
// access to my account? if we need an account best to just use a $30 codex one".
// So the agents run on Codex, signed in on the machine itself by a code typed
// into a browser: no Claude token, and no token carried from the Mac.
describe('whose account the agents run on', () => {
  const ud = userDataOf({ expiresAt: '2026-11-23T12:00:00.000Z' });
  it('Codex is installed, and Claude Code is not', () => {
    expect(ud).toMatch(/npm install -g @openai\/codex/);
    expect(ud).not.toMatch(/claude-code/);
  });
  // The first machine (2026-11-08) ran `npx agentbox-app`, the headless copy,
  // and nothing reached the demo account's phone: only the desktop app
  // (main/main.mts) runs the phone pass. So it runs the desktop app, built from
  // the public repository, on a virtual screen.
  it('runs the desktop app on a virtual screen, not the headless copy', () => {
    expect(ud).toMatch(/git clone -q --depth 1 https:\/\/github\.com\/savannahfeder\/agentbox app/);
    expect(ud).toMatch(/npm ci --no-audit --no-fund && npm run build && node scripts\/brand-electron\.mjs/);
    expect(ud).toMatch(/ExecStart=\/usr\/bin\/xvfb-run -a \/home\/agentbox\/app\/node_modules\/\.bin\/electron \/home\/agentbox\/app --no-sandbox/);
    expect(ud).not.toMatch(/agentbox-app --no-open/);
  });
  it('points the app at Agentbox Cloud, which is what signs it in to the demo account', () => {
    expect(ud).toContain(CLOUD_ADDRESS.supabaseUrl);
    expect(ud).toMatch(/\/home\/agentbox\/\.agentbox\/team\.config\.json/);
  });
  it('Codex signs in on the machine with a device code, as the user the app runs as', () => {
    expect(CODEX_LOGIN).toBe('sudo -u agentbox -H codex login --device-auth');
  });
  it('no Claude token is asked for anywhere', () => {
    expect(envFileOf({ email: 'r@x.ac', password: 'p' })).not.toMatch(/CLAUDE/);
    expect(KEYCHAIN).toEqual({ password: 'AGENTBOX_APP_REVIEW' });
  });
});

describe('where the demo password comes from', () => {
  const keychain = (service, account) => `${service}/${account}`;
  it('the Keychain, when the environment has none', () => {
    expect(secretsFrom({}, keychain)).toEqual({ email: 'appreview@agentbox.ac', password: `${KEYCHAIN.password}/appreview@agentbox.ac` });
  });
  it('the environment first', () => {
    expect(secretsFrom({ REVIEW_EMAIL: 'b@x.ac', REVIEW_PASSWORD: 'p' }, keychain)).toEqual({ email: 'b@x.ac', password: 'p' });
  });
  it('nothing in either is refused before any machine is made', () => {
    expect(() => envFileOf(secretsFrom({}, () => ''))).toThrow(/missing/);
  });
});

describe('status', () => {
  it('says how long is left, and nothing below zero', () => {
    expect(hoursLeft('2026-11-23T12:00:00.000Z', NOW)).toBe(336);
    expect(hoursLeft('2026-11-01T12:00:00.000Z', NOW)).toBe(0);
  });
});
