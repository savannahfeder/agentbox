// A GOOGLE ACCOUNT SIGNS IN ON THE IPHONE BY AN EMAILED LINK (2026-11-08).
//
// Google came off the iPhone's sign-in for App Review 4.8, and most accounts
// were made with Google on the computer, so those people had no password and
// had to invent one through "Forgot password?" first. Trying App Store build 20
// with the demo account, the person called the app half-baked over it.
//
// The iPhone now offers "Email me a sign-in link": the account database emails
// a one-time link, asked for with a proof (PKCE) only this phone can finish,
// and the link opens the app signed in. It never makes an account, because
// accounts are made on the computer. A code that comes back with no link asked
// for is left alone, as a reset's is.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudClient } from '../renderer/src/cloud-rest';

const CFG = { url: 'https://cloud.example', anonKey: 'public-key' };
const BACK = 'agentbox://signed-in';
const store = () => { const m = new Map(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const tokenAnswer = { access_token: 'a2', refresh_token: 'r2', expires_in: 3600, user: { id: 'u-9', email: 'me@example.com' } };

function recording(answers = []) {
  const asked = [];
  const fetchImpl = async (url, init) => {
    asked.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = answers.shift() ?? [200, {}];
    return new Response(JSON.stringify(body), { status });
  };
  return { asked, fetchImpl };
}

describe('asking for the link', () => {
  it('names the address, the app to come back to, a proof only this phone can finish, and makes no account', async () => {
    const { asked, fetchImpl } = recording();
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await c.askSignInLink(' me@example.com ', BACK);
    expect(asked).toHaveLength(1);
    const url = new URL(asked[0].url);
    expect(url.pathname).toBe('/auth/v1/otp');
    expect(url.searchParams.get('redirect_to')).toBe(BACK);
    expect(asked[0].body).toMatchObject({ email: 'me@example.com', create_user: false, code_challenge_method: 's256' });
    expect(asked[0].body.code_challenge).toMatch(/^[\w-]{43}$/);
    expect(c.linkAsked()).toBe(true);
    expect(c.resetAsked()).toBe(false);
  });

  it('an address with no account says so in words, and leaves no link waiting', async () => {
    const { fetchImpl } = recording([[422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' }]]);
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    const err = await c.askSignInLink('nobody@example.com', BACK).catch((e) => e);
    expect(err.message).toBe('No account uses that email.');
    expect(err.code).toBe('no_account');
    expect(c.linkAsked()).toBe(false);
  });

  it('any other refusal says why, unchanged', async () => {
    const { fetchImpl } = recording([[429, { msg: 'For security purposes, you can only request this after 30 seconds.' }]]);
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    const err = await c.askSignInLink('me@example.com', BACK).catch((e) => e);
    expect(err.message).toMatch(/30 seconds/);
    expect(err.code).toBeUndefined();
  });

  it('is refused with no address, before anything is sent', async () => {
    const { asked, fetchImpl } = recording();
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await expect(c.askSignInLink('  ', BACK)).rejects.toThrow(/email/i);
    expect(asked).toHaveLength(0);
  });
});

describe("the email's link coming back", () => {
  it('trades its code with the proof kept from the ask and signs in', async () => {
    const { asked, fetchImpl } = recording([[200, {}], [200, tokenAnswer]]);
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await c.askSignInLink('me@example.com', BACK);
    const challenge = asked[0].body.code_challenge;
    await c.finishSignInLink('code-1');
    expect(asked[1].url).toBe('https://cloud.example/auth/v1/token?grant_type=pkce');
    expect(asked[1].body.auth_code).toBe('code-1');
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(asked[1].body.code_verifier))).toString('base64url');
    expect(digest).toBe(challenge);
    expect(c.signedIn()).toBe(true);
    expect(c.linkAsked()).toBe(false);
  });

  it('with no link asked for on this phone, is refused and signs nobody in', async () => {
    const { asked, fetchImpl } = recording();
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await expect(c.finishSignInLink('code-1')).rejects.toThrow();
    expect(asked).toHaveLength(0);
    expect(c.signedIn()).toBe(false);
  });

  it('asking for a link forgets a reset asked for earlier, and the other way round, so one code is never taken for the other', async () => {
    const { fetchImpl } = recording();
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await c.askPasswordReset('me@example.com', BACK);
    await c.askSignInLink('me@example.com', BACK);
    expect(c.resetAsked()).toBe(false);
    expect(c.linkAsked()).toBe(true);
    await c.askPasswordReset('me@example.com', BACK);
    expect(c.linkAsked()).toBe(false);
    expect(c.resetAsked()).toBe(true);
  });
});

describe('the phone app', () => {
  const read = (rel) => fs.readFileSync(new URL(`../mobile/src/${rel}`, import.meta.url), 'utf8');
  it('offers the link on the sign-in screen wherever Google is not offered', () => {
    const page = read('app/sign-in.tsx');
    expect(page).toMatch(/\{GOOGLE\s*\?[^}]*Continue with Google[\s\S]*?:\s*<Btn label="Email me a sign-in link"[^\n]*'\/sign-in-link'/);
  });
  it('takes the link when it comes back, only when one was asked for here', () => {
    const back = read('app/signed-in.tsx');
    expect(back).toMatch(/linkAsked\(\)/);
    expect(back).toMatch(/finishSignInLink/);
  });
  it('reads the link mark back after iOS ends the app while you are in Mail', () => {
    expect(read('platform/persist.ts')).toMatch(/'agentbox-cloud-link'/);
  });
});

describe('the Help page', () => {
  it('sends a Google account to the sign-in link, not to making a password', () => {
    const help = fs.readFileSync(new URL('../phone-legal/support.html', import.meta.url), 'utf8');
    expect(help).toMatch(/Google, choose Email me a sign-in link/);
    expect(help).not.toMatch(/Forgot password\? on the iPhone/);
  });
});
