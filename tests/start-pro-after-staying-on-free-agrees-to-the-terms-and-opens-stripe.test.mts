// START PRO AFTER STAYING ON FREE AGREES TO THE TERMS AND OPENS STRIPE.
//
// From the first multiplayer onboarding call (2026-11-21): the owner chose Stay
// on Free in the setup, made a team in Settings › Team, and pressed Start Pro
// where Invite would be. "It doesn't do anything." Walked on main at f6b2b4003
// against the real cloud server code: Start Pro's first step makes this
// computer a cloud key from the team sign-in, the server makes one only for
// someone who agreed to its terms, and nobody who stayed on Free ever had, so
// the press ended on the server's words "accept the terms of 2026-10-25 first"
// beside the button with no way to agree. Settings › Plan and Billing sold one
// person's Pro behind a second sign-in, and a person's Pro never lets a team
// invite.
//
// Measured here by pressing the real StartPro and the real Plan and Billing
// page in Chromium, their calls carried to the real main/cloud/account.mts and
// the real cloud server (cloud/gateway), with Stripe stood in for.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudFromTeamSignIn, cloudPlan, payForCloud } from '../main/cloud/account.mts';
import { readCloudKey } from '../main/cloud/config.mts';
import { standinBackend } from '../main/team/standin-backend.mts';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { /* no browser here */ }
const browserAvailable = !!chromium && fs.existsSync(chromium.executablePath());

const P = '77777777-7777-4777-8777-777777777777';
const DB = 'https://db.example';

let browser; let bundle = '';
beforeAll(async () => {
  if (!browserAvailable) return;
  bundle = (await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { StartPro } from './renderer/src/team/StartPro';
      import { CloudPlansPage } from './renderer/src/components/Settings';
      import { startProTrial } from './renderer/src/pro-trial';
      const show = new URLSearchParams(location.search).get('show');
      function Plans() {
        const [signedIn, setSignedIn] = React.useState(false);
        React.useEffect(() => { window.markSignedIn = () => setSignedIn(true); }, []);
        return <CloudPlansPage signedIn={signedIn} onSignIn={() => { window.askedToSignIn = (window.askedToSignIn || 0) + 1; }}
          teamPro={(acceptTerms) => startProTrial({ hasTeam: true, name: 'Dana Whitfield', acceptTerms })} />;
      }
      createRoot(document.getElementById('root')).render(show === 'plans' ? <Plans />
        : <div className="tm-field-row"><span className="tm-leave-ask">Inviting people comes with Pro.</span><StartPro hasTeam={show !== 'no-team'} name="Dana Whitfield" className="tm-btn" /></div>);`,
    resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'empty', '.mp3': 'empty' },
    // Settings reaches look-switch.ts, which reads a folder through Vite's import.meta.glob.
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.glob': 'globalThis.__noGlob' }, banner: { js: 'globalThis.__noGlob = () => ({});' },
  })).outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);
afterAll(async () => { await browser?.close(); });

// One person, the cloud server, and the team they own on the database.
let home: string; let server: ReturnType<typeof gatewayServer>; let gateway: string;
let objects: ReturnType<typeof memoryObjects>;
let team: { id: string; members: string[]; owners: string[] } | null;
let checkouts: { plan: string; team: string | null; trialEnd: number | null }[];
let opened: string[]; let sent: Record<string, unknown>[];
const env = {};
beforeEach(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'start-pro-'));
  objects = memoryObjects();
  team = { id: 'team-1', members: [P], owners: [P] };
  checkouts = []; opened = []; sent = [];
  const stripe = {
    async checkout(o: { plan: string; team?: string | null; trialEnd?: number | null }) {
      checkouts.push({ plan: o.plan, team: o.team ?? null, trialEnd: o.trialEnd ?? null });
      return { id: `cs_${checkouts.length}`, url: `https://checkout.stripe.com/c/pay/cs_${checkouts.length}` };
    },
    async session(id: string) { return { id, status: 'open', url: `https://checkout.stripe.com/c/pay/${id}` }; },
    async expire() { return {}; },
  };
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => k, put: async (k: string) => k, head: async (k: string) => k },
    removeObject: async () => {}, objects, stripe,
    whoIs: async (t: string) => (t === 'team-session' ? { id: P } : null),
    teams: async (person: string) => (team && team.members.includes(person) ? { ...team, createdAt: Date.now(), freeUntil: 0 } : null),
  });
  server = gatewayServer(gw);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  gateway = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(home, { recursive: true, force: true });
});

// What main/ipc.mts answers each call with, on this person's computer.
const mac = (planMs = 0) => ({
  plan: async () => { if (planMs) await new Promise((r) => setTimeout(r, planMs)); return cloudPlan({ env, home }); },
  fromTeam: async ({ acceptTerms }: { acceptTerms: boolean }) => { sent.push({ acceptTerms }); return cloudFromTeamSignIn({ config: { gateway, supabaseUrl: DB }, teamUrl: DB, token: 'team-session', acceptTerms, env, home }); },
  teamCreate: async () => { team = { id: 'team-1', members: [P], owners: [P] }; return { ok: true }; },
  pay: async ({ plan }: { plan: string }) => payForCloud({ plan, openExternal: (u: string) => { opened.push(u); }, env, home }),
});

async function open(show: string, calls = mac()) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
  page.setDefaultTimeout(8_000);
  await page.exposeFunction('zeroCall', (name: unknown, payload: unknown) => (calls as Record<string, (p: unknown) => unknown>)[String(name)](payload ?? {}));
  await page.route('http://pro.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body><div id="root"></div></body></html>' }));
  await page.goto(`http://pro.test/?show=${show}`);
  // The bridge is there before the app's code reads whether it has one.
  await page.addScriptTag({ content: `window.zero = Object.fromEntries([['cloudAccountPlan', 'plan'], ['cloudAccountFromTeam', 'fromTeam'], ['teamCreate', 'teamCreate'], ['cloudAccountPay', 'pay'], ['teamSignIn', 'none']].map(([k, n]) => [k, (p) => window.zeroCall(n, p)]));` });
  await page.addScriptTag({ content: bundle });
  return page;
}
const agreed = async () => {
  const rec = await objects.get(`ledger/people/${P}.json`);
  return rec ? JSON.parse(String(rec.body)).terms?.version ?? null : null;
};
const days = (ms: number | null) => (ms ? Math.round((ms - Date.now()) / 86_400_000) : 0);

describe.skipIf(!browserAvailable)('Start Pro on the Team page, for someone who stayed on Free', () => {
  it('names the terms under the button, and one press agrees, makes the key and opens the team’s checkout with its free week', async () => {
    const page = await open('team');
    await page.locator('.st-terms', { hasText: 'By starting Pro, you agree to the Terms and the Privacy policy.' }).waitFor();
    await page.locator('button.tm-btn', { hasText: 'Start Pro' }).click();
    await page.locator('.st-problem', { hasText: 'Finish in your browser.' }).waitFor();
    expect(sent).toEqual([{ acceptTerms: true }]);
    expect(await agreed()).toBe(TERMS_VERSION);
    expect(readCloudKey(env, home)).toMatch(/^abk_/);
    expect(opened).toEqual(['https://checkout.stripe.com/c/pay/cs_1']);
    expect(checkouts).toHaveLength(1);
    expect(checkouts[0]).toMatchObject({ plan: 'team', team: 'team-1' });
    expect(days(checkouts[0].trialEnd)).toBe(7);
    expect(await page.textContent('body')).not.toMatch(/accept the terms/);
    expect(await page.locator('.st-terms').count()).toBe(0);
    await page.close();
  });

  it('makes the team first when there is none, as the setup does', async () => {
    team = null;
    const page = await open('no-team');
    await page.locator('.st-terms').waitFor();
    await page.locator('button.tm-btn').click();
    await page.locator('.st-problem', { hasText: 'Finish in your browser.' }).waitFor();
    expect(checkouts[0]).toMatchObject({ plan: 'team', team: 'team-1' });
    await page.close();
  });

  it('a press before it knows whether this computer agreed asks for the terms, and the next press agrees', async () => {
    const page = await open('team', mac(1500));
    await page.locator('button.tm-btn').click();
    await page.locator('.st-terms').waitFor();
    expect(await page.textContent('body')).not.toMatch(/accept the terms|Finish in your browser/);
    expect(opened).toEqual([]);
    await page.locator('button.tm-btn').click();
    await page.locator('.st-problem', { hasText: 'Finish in your browser.' }).waitFor();
    expect(sent.at(-1)).toEqual({ acceptTerms: true });
    expect(opened).toHaveLength(1);
    await page.close();
  });

  it('says nothing about the terms to a computer already signed in to the cloud, and agrees to nothing for it', async () => {
    await cloudFromTeamSignIn({ config: { gateway, supabaseUrl: DB }, teamUrl: DB, token: 'team-session', acceptTerms: true, env, home });
    const page = await open('team');
    await page.locator('button.tm-btn', { hasText: /Try Pro free for 7 days|Start Pro/ }).waitFor();
    await page.waitForTimeout(300);
    expect(await page.locator('.st-terms').count()).toBe(0);
    await page.locator('button.tm-btn').click();
    await page.locator('.st-problem', { hasText: 'Finish in your browser.' }).waitFor();
    expect(sent).toEqual([{ acceptTerms: false }]);
    expect(opened).toHaveLength(1);
    await page.close();
  });

  it('another refusal is still said in words', async () => {
    team = { id: 'team-1', members: [P, 'someone-else'], owners: ['someone-else'] };
    const page = await open('team');
    await page.locator('.st-terms').waitFor();
    await page.locator('button.tm-btn').click();
    await page.locator('.st-problem', { hasText: 'Only your team\'s owner can pay for the team.' }).waitFor();
    expect(opened).toEqual([]);
    await page.close();
  });
});

describe.skipIf(!browserAvailable)('Pro in Settings › Plan and Billing, signed in to a team', () => {
  it('is the team’s Pro: no second sign-in, the terms named under the cards, and the team’s checkout opens', async () => {
    const page = await open('plans');
    await page.locator('.cloud-plans-terms', { hasText: 'By choosing Pro, you agree to the Terms and the Privacy policy.' }).waitFor();
    await page.locator('.cloud-plan-go', { hasText: 'Choose Pro' }).click();
    await page.locator('.cloud-plans-say', { hasText: 'Finish paying in your browser.' }).waitFor();
    expect(await page.evaluate(() => (window as unknown as { askedToSignIn?: number }).askedToSignIn ?? 0)).toBe(0);
    expect(sent).toEqual([{ acceptTerms: true }]);
    expect(await agreed()).toBe(TERMS_VERSION);
    expect(checkouts).toEqual([expect.objectContaining({ plan: 'team', team: 'team-1' })]);
    expect(opened).toEqual(['https://checkout.stripe.com/c/pay/cs_1']);
    await page.close();
  });

  it('Plus is still one person’s plan, asked for with its own sign-in', async () => {
    const page = await open('plans');
    await page.locator('.cloud-plan-go', { hasText: 'Choose Plus' }).click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { askedToSignIn?: number }).askedToSignIn ?? 0)).toBe(1);
    expect(checkouts).toEqual([]);
    await page.close();
  });
});

describe('the stand-in team cloud', () => {
  it('hands the cloud sign-in its token, which is the person’s id, as the real one hands its session', async () => {
    const backend = standinBackend('http://127.0.0.1:9', { token: P, personId: P, kind: 'standin', methods: [] });
    expect(await backend.liveToken?.()).toBe(P);
  });
});
