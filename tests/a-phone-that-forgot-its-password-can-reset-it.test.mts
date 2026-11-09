// A PHONE THAT FORGOT ITS PASSWORD CAN RESET IT (QA M-27, 2026-11-01 to 11-03).
//
// The Android app's sign-in card held Google, an email, a password, Sign in
// and Sign up, and nothing else: read from its UI tree in two sessions. Someone
// who forgot their password had no way back in from the phone. The computer's
// card got its reset in F-63, through a listener only a computer has.
//
// The phone asks for the reset email with a one-time proof (PKCE), as it does
// for Google, and names the app's own return address. The email's link opens
// the app with a code, the code is traded for a sign-in, and the new password
// is typed in the app. A code that comes back with no reset asked for is left
// alone, so a Google return is never taken for a reset.
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
    asked.push({ url, method: init.method, auth: init.headers?.authorization ?? null, body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = answers.shift() ?? [200, {}];
    return new Response(JSON.stringify(body), { status });
  };
  return { asked, fetchImpl };
}

describe('asking for the reset email', () => {
  it('names the address, the app to come back to, and a proof only this phone can finish', async () => {
    const { asked, fetchImpl } = recording();
    const storage = store();
    const c = cloudClient(CFG, { storage, fetchImpl });
    await c.askPasswordReset(' me@example.com ', BACK);
    expect(asked).toHaveLength(1);
    const url = new URL(asked[0].url);
    expect(url.pathname).toBe('/auth/v1/recover');
    expect(url.searchParams.get('redirect_to')).toBe(BACK);
    expect(asked[0].body).toMatchObject({ email: 'me@example.com', code_challenge_method: 's256' });
    expect(asked[0].body.code_challenge).toMatch(/^[\w-]{43}$/);
    expect(c.resetAsked()).toBe(true);
  });

  it('says why when the database refuses, and leaves no reset waiting', async () => {
    const { fetchImpl } = recording([[429, { msg: 'For security purposes, you can only request this after 30 seconds.' }]]);
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await expect(c.askPasswordReset('me@example.com', BACK)).rejects.toThrow(/30 seconds/);
    expect(c.resetAsked()).toBe(false);
  });

  it('is refused with no address, before anything is sent', async () => {
    const { asked, fetchImpl } = recording();
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await expect(c.askPasswordReset('  ', BACK)).rejects.toThrow(/email/i);
    expect(asked).toHaveLength(0);
  });
});

describe("the email's link coming back", () => {
  it('trades its code with the proof kept from the ask, signs in, and the new password is saved', async () => {
    const { asked, fetchImpl } = recording([[200, {}], [200, tokenAnswer], [200, { id: 'u-9' }]]);
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await c.askPasswordReset('me@example.com', BACK);
    const challenge = asked[0].body.code_challenge;
    await c.finishReset('code-1');
    expect(asked[1].url).toBe('https://cloud.example/auth/v1/token?grant_type=pkce');
    expect(asked[1].body.auth_code).toBe('code-1');
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(asked[1].body.code_verifier))).toString('base64url');
    expect(digest).toBe(challenge);
    expect(c.signedIn()).toBe(true);
    expect(c.resetAsked()).toBe(false);
    await c.setPassword('a new one');
    expect(asked[2]).toMatchObject({ url: 'https://cloud.example/auth/v1/user', method: 'PUT', auth: 'Bearer a2', body: { password: 'a new one' } });
  });

  it('with no reset asked for on this phone, is refused and signs nobody in', async () => {
    const { asked, fetchImpl } = recording();
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    expect(c.resetAsked()).toBe(false);
    await expect(c.finishReset('code-1')).rejects.toThrow();
    expect(asked).toHaveLength(0);
    expect(c.signedIn()).toBe(false);
  });

  it('a password the database refuses says why', async () => {
    const { fetchImpl } = recording([[200, {}], [200, tokenAnswer], [422, { msg: 'Password should be at least 6 characters.' }]]);
    const c = cloudClient(CFG, { storage: store(), fetchImpl });
    await c.askPasswordReset('me@example.com', BACK);
    await c.finishReset('code-1');
    await expect(c.setPassword('abc')).rejects.toThrow(/6 characters/);
  });
});

describe('the phone app', () => {
  const read = (rel) => fs.readFileSync(new URL(`../mobile/src/${rel}`, import.meta.url), 'utf8');
  it('offers the reset on its sign-in screen', () => {
    expect(read('app/sign-in.tsx')).toMatch(/Forgot password\?/);
    expect(read('app/sign-in.tsx')).toMatch(/reset-password/);
  });
  it('takes the link only when a reset was asked for here', () => {
    const back = read('app/signed-in.tsx');
    expect(back).toMatch(/resetAsked\(\)/);
    expect(back).toMatch(/finishReset/);
  });
});
