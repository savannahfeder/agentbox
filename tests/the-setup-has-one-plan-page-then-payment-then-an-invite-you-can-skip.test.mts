// THE SETUP HAS ONE PLAN PAGE, THEN PAYMENT, THEN AN INVITE YOU CAN SKIP (w-1e52420829, 2026-11-12).
//
// Someone went through the setup on a real account and found five things on
// the way to Pro:
//  - two pages offered the upgrade, "Pick a plan." and then "Upgrade to Pro."
//    three steps later: "it already gave the upgrade option so we should get
//    rid of the other upgrade page";
//  - picking Pro and pressing Continue asked them to invite people before it
//    took any payment;
//  - the invite page had no way past it but Continue;
//  - "Try Pro free for 7 days" answered "Sign in to Agentbox Cloud first."
//    one minute after they had made their account on the step before. The
//    setup signed them in to the team and never to the cloud, which is the
//    account the payment asks for. A 12-minute tester hit the same wall;
//  - the plan row said "10 cloud agents at once", a limit that was taken away.
// And the last page said "Open your inbox" with no word that a walkthrough
// came next.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PRO_PITCH, setupSteps, teamNameFor } from '../renderer/src/setup-split.ts';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { cloudFromTeamSignIn, cloudPlan } from '../main/cloud/account.mts';

const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const split = read('renderer/src/components/SetupSplit.tsx');
const show = read('renderer/src/components/ProShowcase.tsx');
const base = { chats: 3, team: true, teammates: false, project: true, signedIn: false };

describe('the order of the steps', () => {
  it('has one plan page and no second purchase page', () => {
    expect(setupSteps({ ...base, plan: 'free' })).toEqual(['chats', 'account', 'plan', 'look']);
    expect(setupSteps({ ...base, plan: 'pro' })).not.toContain('pay');
  });
  it('invites people only once Pro is started, straight after the plan page', () => {
    expect(setupSteps({ ...base, plan: 'pro' })).toEqual(['chats', 'account', 'plan', 'invite', 'look']);
  });
  it('still sends someone already on a team to invite, with no plan asked', () => {
    expect(setupSteps({ ...base, signedIn: true, plan: 'free', onTeam: true })).toEqual(['chats', 'invite', 'look']);
  });
  it('asks for no plan on a build with no team cloud', () => {
    expect(setupSteps({ ...base, team: false, plan: 'pro' })).toEqual(['chats', 'look']);
  });
});

// Walking it, one run in three went from the account straight to the look: the
// sign-in page and the arriving account each moved the setup on, and together
// they skipped the plan page.
describe('leaving the account step', () => {
  it('happens once, whichever of the two says the account is made', () => {
    expect(split).toMatch(/const pastAccount = useCallback\(\(\) => \{ setError\(null\); setAt\(\(i\) => \(stepsNow\.current\[i\] === 'account' \? i \+ 1 : i\)\); \}, \[\]\);/);
    expect(split).toMatch(/if \(step === 'account' && signedIn\) pastAccount\(\);/);
    expect(split).toMatch(/inSetup onSignedIn=\{pastAccount\}/);
    expect(split).not.toMatch(/onSignedIn=\{next\}/);
  });
});

describe('the plan page', () => {
  it('is the page that shows Pro on the right, with Free as the way on', () => {
    expect(split).toMatch(/if \(step === 'plan'\) root\.dataset\.setupPro = ''; else delete root\.dataset\.setupPro;/);
    expect(split).toMatch(/\{step === 'plan' && <ProShowcase /);
    expect(split).toMatch(/quiet\(PRO_PITCH\.free, next\)/);
    expect(PRO_PITCH.free).toBe('Stay on Free');
    expect(split).not.toMatch(/step === 'pay'/);
    expect(split).not.toMatch(/Pick a plan\./);
  });
  it('names no number of cloud agents at once, on either side', () => {
    expect(JSON.stringify(PRO_PITCH)).not.toMatch(/at once|\b10\b/);
    expect(show).not.toMatch(/\d+ at once|agentsPerSeat/);
  });
  it('starts Pro by making the team, then opening its checkout, and goes on to invite once it is paid', () => {
    expect(split).toMatch(/const made = await api\.teamCreate\(teamNameFor\(me\?\.name\)\);/);
    expect(split).toMatch(/await api\.cloudAccountPay\('team'\)/);
    expect(split).toMatch(/if \(live && paid\) \{ live = false; setPayState\('idle'\); setPlan\('pro'\); next\(\); \}/);
  });
  // The first walk that got a payment through was moved on again every three seconds, past the look and the last page.
  it('stops asking the cloud once the payment has landed, so it moves on once', () => {
    expect(split).toMatch(/live = false; setPayState\('idle'\);/);
    expect(split).toMatch(/if \(payState !== 'waiting'\) return undefined;/);
  });
  it('signs the account it just made in to the cloud before it asks for payment', () => {
    expect(split).toMatch(/await api\.cloudAccountFromTeam\(!signedInAtStart\)/);
  });
});

describe('the name a team starts with', () => {
  it('is the person’s first name', () => {
    expect(teamNameFor('Dana Okoro')).toBe('Dana’s team');
    expect(teamNameFor('  theo ')).toBe('theo’s team');
  });
  it('is plain when there is no name', () => {
    expect(teamNameFor('')).toBe('My team');
    expect(teamNameFor(undefined)).toBe('My team');
  });
});

describe('the invite page', () => {
  it('can always be skipped', () => {
    expect(split).toMatch(/'Sending…'\)\}\{quiet\('Skip', next\)\}/);
  });
  it('shows the team’s name, and a changed one renames it', () => {
    expect(split).toMatch(/placeholder="Name your team"/);
    expect(split).toMatch(/await api\.teamRename\(name\)/);
  });
});

describe('the last page', () => {
  it('says the walkthrough is next', () => {
    expect(split).toMatch(/go\('Start the walkthrough', \(\) => p\.onDone\(done\.chats\)\)/);
    expect(split).not.toMatch(/Open your inbox/);
  });
});

// The same tester picked Codex on the agent step and the first thread's box still
// said Claude Code: the box is open behind the setup and had read the agent already.
describe('the agent picked in the setup', () => {
  it('is told to the new-thread box that is already open behind it', () => {
    expect(split).toMatch(/writeLastEngine\(engine === 'codex' \? 'codex' : null\); dispatchEvent\(new Event\(ENGINE_CHOSEN\)\); next\(\);/);
    const compose = read('renderer/src/components/Compose.tsx');
    expect(compose).toMatch(/addEventListener\(ENGINE_CHOSEN, chosen\);\n    return \(\) => removeEventListener\(ENGINE_CHOSEN, chosen\);/);
    expect(compose).toMatch(/const chosen = \(\) => \{\n      const id = engineThisMacOffers\(readLastEngine\(undefined, workspaceEngine\), engineRows\);/);
  });
});

describe('the cloud sign-in the payment needs', () => {
  const P = '77777777-7777-4777-8777-777777777777';
  let home: string; let server: ReturnType<typeof gatewayServer>; let gateway: string; const env = {};
  beforeEach(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-from-team-'));
    const gw = createGateway({
      agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
      links: { get: async (k: string) => k, put: async (k: string) => k, head: async (k: string) => k },
      removeObject: async () => {},
      objects: memoryObjects(),
      whoIs: async (t: string) => (t === 'team-session' ? { id: P } : null),
      plans: PLANS,
    });
    server = gatewayServer(gw);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    gateway = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => { await new Promise((r) => server.close(r)); fs.rmSync(home, { recursive: true, force: true }); });
  const config = () => ({ gateway, supabaseUrl: 'https://one.example', anonKey: 'k' });

  it('is made from the team sign-in when both are the one account', async () => {
    const out = await cloudFromTeamSignIn({ config: config(), teamUrl: 'https://one.example/', token: 'team-session', acceptTerms: true, env, home });
    expect(out.ok).toBe(true);
    expect((await cloudPlan({ env, home })).signedIn).toBe(true);
  });
  it('is left alone when this computer is already signed in', async () => {
    await cloudFromTeamSignIn({ config: config(), teamUrl: 'https://one.example', token: 'team-session', acceptTerms: true, env, home });
    const again = await cloudFromTeamSignIn({ config: config(), teamUrl: 'https://one.example', token: null, acceptTerms: false, env, home });
    expect(again.ok).toBe(true);
  });
  it('is not made from a team on another database, or with no team sign-in', async () => {
    const other = await cloudFromTeamSignIn({ config: config(), teamUrl: 'https://two.example', token: 'team-session', acceptTerms: true, env, home });
    expect(other).toMatchObject({ ok: false, error: 'signed-out' });
    const none = await cloudFromTeamSignIn({ config: config(), teamUrl: 'https://one.example', token: null, acceptTerms: true, env, home });
    expect(none).toMatchObject({ ok: false, error: 'signed-out' });
    expect((await cloudPlan({ env, home })).signedIn).toBe(false);
  });
  it('agrees to the terms only for an account made on the setup’s own page, which names them', async () => {
    const out = await cloudFromTeamSignIn({ config: config(), teamUrl: 'https://one.example', token: 'team-session', acceptTerms: false, env, home });
    expect(out.ok).toBe(false);
    expect((await cloudPlan({ env, home })).signedIn).toBe(false);
  });
});
