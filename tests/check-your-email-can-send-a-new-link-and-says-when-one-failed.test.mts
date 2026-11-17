// CHECK YOUR EMAIL CAN SEND A NEW LINK, AND SAYS WHEN ONE FAILED.
//
// A new user in the setup made an account by email, followed the link, and the
// browser came back with otp_expired ("Email link is invalid or has expired").
// The setup stayed on "Check your email" with no sign anything had gone wrong,
// and offered only Back and Back to sign in. The team sign-up had no resend at
// all (only the Agentbox Cloud card had one), and the failed link was logged
// and dropped. The way on was to guess that signing in with the same password
// would work, which it did, because the address had been confirmed after all.
// Measured below against a stand-in database and the team service.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { supabaseSession } from '../main/team/session.mts';
import { createTeamService } from '../main/team/index.mts';
import * as disk from '../main/store/work-items.mts';
import { Store } from '../main/store.mts';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mts';

const asked: Array<{ url: string; body: string }> = [];
afterEach(() => { vi.unstubAllGlobals(); asked.length = 0; });

const freePort = () => new Promise<number>((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address() as net.AddressInfo; s.close(() => resolve(port)); });
});
// A fresh connection per visit: a resend replaces the listener, and a kept-alive
// socket to the old one fails with ECONNRESET when the next visit reuses it.
const follow = (url: string) => new Promise<{ status: number; page: string }>((resolve, reject) => {
  http.get(url, { agent: false }, (res) => { let page = ''; res.on('data', (d) => { page += d; }); res.on('end', () => resolve({ status: res.statusCode ?? 0, page })); }).on('error', reject);
});
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const tokenAnswer = { access_token: 'a1', refresh_token: 'r1', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: 'u-1', email: 'new@example.com', aud: 'authenticated' } };
const expired = 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

async function signingUp({ resendRefused = false } = {}) {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    asked.push({ url, body: String(init?.body ?? '') });
    if (url.includes('/auth/v1/token?grant_type=pkce')) return json(tokenAnswer);
    // An address not yet confirmed, so the password cannot rescue a failed link.
    if (url.includes('/auth/v1/token?grant_type=password')) return json({ code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400);
    if (url.includes('/auth/v1/resend') && resendRefused) return json({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 42 seconds.' }, 429);
    return json({ id: 'u-1', email: 'new@example.com' });
  });
  const port = await freePort();
  const returnUrl = `http://127.0.0.1:${port}/auth/callback`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resend-link-'));
  const session = supabaseSession({
    cloudConfig: { url: 'https://cloud.example', anonKey: 'public-key', signInReturn: returnUrl },
    sessionFile: path.join(dir, 'session.json'),
    openExternal: () => {},
    packaged: false,
    testLogin: undefined,
  });
  const out = await session.signUp!({ email: 'new@example.com', password: 'pw-123456', name: 'Ada', log: () => {} });
  return { out: out!, returnUrl };
}

describe('a new link, from the same sign-up', () => {
  it('after a link that failed, asks for another to this Mac and signs in when it is followed', async () => {
    const { out, returnUrl } = await signingUp();
    const failed = out.failed!();
    await follow(`${returnUrl}?${expired}`);
    expect(await failed).toMatch(/invalid or has expired/);

    await out.resend!();
    const resend = asked.find((a) => a.url.includes('/auth/v1/resend'))!;
    expect(JSON.parse(resend.body)).toMatchObject({ email: 'new@example.com', type: 'signup', code_challenge_method: expect.stringMatching(/s256/i) });
    expect(new URL(resend.url).searchParams.get('redirect_to')).toBe(returnUrl);

    const second = out.confirmed!();
    const tab = await follow(`${returnUrl}?code=fresh`);
    expect(tab.page).toContain('Your email is confirmed');
    expect(await second).toBeTruthy();
  });

  it('while the first link is still waiting, the new one is the one that signs in', async () => {
    const { out, returnUrl } = await signingUp();
    const first = out.confirmed!();
    first.catch(() => {});
    await out.resend!();
    await expect(first).rejects.toThrow(/cancelled/);
    const second = out.confirmed!();
    await follow(`${returnUrl}?code=fresh`);
    expect(await second).toBeTruthy();
  });

  // The library drops the sign-in code a refused resend made, which was the
  // only one, so the older link confirms the address but cannot sign in here.
  // The screen then signs in with the password instead.
  it('says a refused resend in plain words, and an older link afterwards in plain words too', async () => {
    const { out, returnUrl } = await signingUp({ resendRefused: true });
    await expect(out.resend!()).rejects.toThrow('Too many tries just now. Wait a minute and try again.');
    const failed = out.failed!();
    const tab = await follow(`${returnUrl}?code=abc`);
    expect(tab.page).toContain('That link is from an earlier email');
    expect(tab.page).not.toMatch(/PKCE|verifier/);
    expect(await failed).toContain('That link is from an earlier email');
    out.stopWaiting!();
  });

  it('a failed visit leaves the wait going, so a good link afterwards still signs in', async () => {
    const { out, returnUrl } = await signingUp();
    const signedIn = out.confirmed!();
    const failed = out.failed!();
    await follow(`${returnUrl}?${expired}`);
    await failed;
    await follow(`${returnUrl}?code=good`);
    expect(await signedIn).toBeTruthy();
  });
});

async function aService(session: Parameters<typeof createTeamService>[0]['session']) {
  const storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'resend-team-'));
  const accountRoot = path.join(storeRoot, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  const store = await new Store({ storeRoot, accountId: 'a', accountRoot, products: [] }).init();
  return createTeamService({ session, store, disk, accountRoot, stateFile: path.join(storeRoot, '.team-sync.json'), intervalMs: 3_600_000 });
}

function waitingSignUp() {
  const cloud = createMemoryCloud();
  const id = signUpMemory(cloud, { email: 'new@example.com', name: 'Ada' });
  let link: { resolve: () => void; reject: (e: Error) => void };
  const newLink = () => new Promise<void>((resolve, reject) => { link = { resolve, reject }; });
  let over = newLink();
  const resends: number[] = [];
  const session = {
    configured: true,
    async restore() { return null; },
    async signIn() { return memoryBackend(cloud, id); },
    async signUp() {
      return {
        confirm: true,
        confirmed: () => over.then(() => memoryBackend(cloud, id)),
        resend: async () => { resends.push(1); link.reject(Object.assign(new Error('Sign-in was cancelled.'), { cancelled: true })); over = newLink(); },
        stopWaiting: () => link.reject(Object.assign(new Error('Sign-in was cancelled.'), { cancelled: true })),
      };
    },
  };
  return { session, fail: (why: string) => link.reject(new Error(why)), land: () => link.resolve(), resends };
}

describe('the team service', () => {
  it('says why the link failed, so the screen can', async () => {
    const t = waitingSignUp();
    const service = await aService(t.session);
    await service.signUp('new@example.com', 'pw-123456', 'Ada');
    const waiting = service.confirmation()!;
    t.fail('Email link is invalid or has expired');
    expect(await waiting).toEqual({ ok: false, error: 'Email link is invalid or has expired' });
    expect(service.state().signedIn).toBe(false);
  });

  it('answers a failed visit at once, while a later good link still signs in', async () => {
    const t = waitingSignUp();
    let tell: (why: string) => void = () => {};
    const session = { ...t.session, async signUp() { return { ...(await t.session.signUp()), failed: () => new Promise<string>((r) => { tell = r; }) }; } };
    const service = await aService(session);
    await service.signUp('new@example.com', 'pw-123456', 'Ada');
    const waiting = service.confirmation()!;
    tell('Email link is invalid or has expired');
    expect(await waiting).toEqual({ ok: false, error: 'Email link is invalid or has expired' });
    t.land();
    await new Promise((r) => setTimeout(r, 20));
    expect(service.state().signedIn).toBe(true);
    await service.signOut();
  });

  it('sends a new link and waits on it, and that link signs in', async () => {
    const t = waitingSignUp();
    const service = await aService(t.session);
    await service.signUp('new@example.com', 'pw-123456', 'Ada');
    t.fail('Email link is invalid or has expired');
    await service.confirmation();
    await service.resendConfirmation();
    expect(t.resends.length).toBe(1);
    const again = service.confirmation()!;
    t.land();
    expect(await again).toEqual({ ok: true });
    expect(service.state().signedIn).toBe(true);
    await service.signOut();
  });

  it('a wait let go is not a failure the screen reports', async () => {
    const t = waitingSignUp();
    const service = await aService(t.session);
    await service.signUp('new@example.com', 'pw-123456', 'Ada');
    const first = service.confirmation()!;
    await service.resendConfirmation();
    expect(await first).toMatchObject({ ok: false, cancelled: true });
  });

  it('with no sign-up waiting, a resend says to make the account again', async () => {
    const service = await aService(waitingSignUp().session);
    await expect(service.resendConfirmation()).rejects.toThrow(/Create the account again/);
  });

  it('signing in with the password stops the wait, so the sign-in address is free again', async () => {
    const t = waitingSignUp();
    const service = await aService({ ...t.session, signInWithPassword: t.session.signIn });
    await service.signUp('new@example.com', 'pw-123456', 'Ada');
    const waiting = service.confirmation()!;
    await service.signInWithEmail('new@example.com', 'pw-123456');
    expect(await waiting).toMatchObject({ ok: false, cancelled: true });
    expect(service.state().signedIn).toBe(true);
    await service.signOut();
  });
});

const page = fs.readFileSync(new URL('../renderer/src/team/SignInPage.tsx', import.meta.url), 'utf8');
const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../preload.cjs', import.meta.url), 'utf8');

describe('the Check your email screen', () => {
  it('offers a new link and a different email on the team sign-up, not only the cloud card', () => {
    const screen = page.slice(page.indexOf("mode === 'check-email' ? ("), page.indexOf(") : mode === 'reset' ? ("));
    expect(screen).toContain('Resend email');
    expect(screen).toContain('Use a different email');
    expect(screen).not.toMatch(/\{cloud && <div className="si-wait-row">/);
  });
  it('in the setup is drawn as a setup step, with Resend email on ↵', () => {
    const step = page.slice(page.indexOf("if (inSetup && mode === 'check-email') {"), page.indexOf("if (primaryRef) primaryRef.current = inSetup && mode === 'sign-in'"));
    expect(step).toMatch(/primaryRef\.current = \(\) => \{ if \(!busy\) void resend\(\); \}/);
    expect(step).toMatch(/className="ss-go"[\s\S]*'Resend email'[\s\S]*ss-key">↵/);
    expect(step).toMatch(/className="ss-quiet"[^>]*onClick=\{differentEmail\}>Use a different email/);
  });
  it('waits on the link and, when it fails, first tries the password just typed', () => {
    expect(page).toMatch(/api\.teamConfirmation\(\)/);
    expect(page).toMatch(/linkFailed/);
    expect(page).toMatch(/api\.teamSignInEmail\(email, password\)/);
  });
  it('tries the password again when you come back to the window, for a link confirmed in another browser', () => {
    expect(page).toMatch(/addEventListener\('focus'/);
  });
  it('says what went wrong with the link in its own words', async () => {
    const { linkFailed } = await import('../renderer/src/team/SignInPage.tsx');
    expect(linkFailed('Email link is invalid or has expired')).toBe('That link has expired or was already used. Resend the email for a new one.');
    expect(linkFailed('That link is from an earlier email. Go back to the app to carry on.')).toMatch(/^That link was from an earlier email\. Open the newest one/);
    expect(linkFailed('That confirmation link was not opened in time. Ask for a new one.')).toBe('That confirmation link was not opened in time. Ask for a new one.');
    expect(linkFailed(undefined)).toBe('That link did not work. Resend the email for a new one.');
  });
  it('has the doors for both, in main and the bridge', () => {
    expect(ipc).toContain("'zero:team-confirmation'");
    expect(ipc).toContain("'zero:team-resend-confirmation'");
    expect(preload).toContain("'zero:team-confirmation'");
    expect(preload).toContain("'zero:team-resend-confirmation'");
  });
});
