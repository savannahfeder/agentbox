// A NEW ACCOUNT'S EMAIL LINK BRINGS YOU BACK TO THE SETUP ON THE MAC.
//
// Making an account by email in the Mac's setup sent a link to the phone
// website, a leftover from when the phone app could make accounts. A tester
// (2026-11-16) first got Safari's "can't connect to the server 127.0.0.1",
// because the address lacked the slash the database's allowed list needs; with
// that mended, the link opened app.agentbox.ac on "Connect your computer",
// which has nothing to do with the setup he was in. Now the link comes back to
// this Mac's own sign-in address, which listens while the setup says "Check
// your email", signs the app in, and the setup moves on by itself, as the
// cloud's own sign-up already did. Measured below against a stand-in database:
// what the sign-up asks for, and what following the link does.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { supabaseSession } from '../main/team/session.mts';

const asked: Array<{ url: string; body: string }> = [];
afterEach(() => { vi.unstubAllGlobals(); asked.length = 0; });

const freePort = () => new Promise<number>((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address() as net.AddressInfo; s.close(() => resolve(port)); });
});
const follow = (url: string) => new Promise<{ status: number; page: string }>((resolve, reject) => {
  http.get(url, (res) => { let page = ''; res.on('data', (d) => { page += d; }); res.on('end', () => resolve({ status: res.statusCode ?? 0, page })); }).on('error', reject);
});

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
const tokenAnswer = { access_token: 'a1', refresh_token: 'r1', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: 'u-1', email: 'new@example.com', aud: 'authenticated' } };

async function signingUp({ phoneSite }: { phoneSite?: string } = {}) {
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    asked.push({ url, body: String(init?.body ?? '') });
    if (url.includes('/auth/v1/token?grant_type=pkce')) return json(tokenAnswer);
    return json({ id: 'u-1', email: 'new@example.com' });
  });
  const port = await freePort();
  const returnUrl = `http://127.0.0.1:${port}/auth/callback`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'signup-link-'));
  const session = supabaseSession({
    cloudConfig: { url: 'https://cloud.example', anonKey: 'public-key', signInReturn: returnUrl, ...(phoneSite ? { phoneSite } : {}) },
    sessionFile: path.join(dir, 'session.json'),
    openExternal: () => {},
    packaged: false,
    testLogin: undefined,
  });
  const out = await session.signUp!({ email: 'new@example.com', password: 'pw-123456', name: 'Ada', log: () => {} });
  const signup = asked.find((a) => a.url.includes('/auth/v1/signup'))!;
  return { out, signup, returnUrl };
}

describe('the sign-up asks for a link back to this Mac', () => {
  it('names this Mac’s sign-in address, not the phone website the team has', async () => {
    const { out, signup, returnUrl } = await signingUp({ phoneSite: 'https://agentbox-phone.pages.dev' });
    expect(out?.confirm).toBe(true);
    expect(new URL(signup.url).searchParams.get('redirect_to')).toBe(returnUrl);
    out?.stopWaiting?.();
  });

  it('asks for a one-time code only this Mac can spend', async () => {
    const { out, signup } = await signingUp();
    expect(JSON.parse(signup.body)).toMatchObject({ code_challenge_method: expect.stringMatching(/s256/i) });
    out?.stopWaiting?.();
  });
});

describe('following the link', () => {
  it('signs this Mac in and tells the browser to go back to the app', async () => {
    const { out, returnUrl } = await signingUp();
    const signedIn = out!.confirmed!();
    const tab = await follow(`${returnUrl}?code=abc`);
    expect(tab.status).toBe(200);
    expect(tab.page).toContain('Your email is confirmed');
    expect(await signedIn).toBeTruthy();
    expect(asked.some((a) => a.url.includes('grant_type=pkce') && JSON.parse(a.body).auth_code === 'abc')).toBe(true);
  });

  it('says why in the browser, and signs nothing in, when the link has run out', async () => {
    const { out, returnUrl } = await signingUp();
    const signedIn = out!.confirmed!();
    signedIn.catch(() => {});
    const tab = await follow(`${returnUrl}?error_description=Email+link+is+invalid+or+has+expired`);
    expect(tab.status).toBe(400);
    expect(tab.page).toContain('Email link is invalid or has expired');
    await expect(signedIn).rejects.toThrow('Email link is invalid or has expired');
  });

  it('leaves other addresses on the port alone', async () => {
    const { out, returnUrl } = await signingUp();
    const signedIn = out!.confirmed!();
    signedIn.catch(() => {});
    expect((await follow(returnUrl.replace('/auth/callback', '/other?code=abc'))).status).toBe(404);
    out?.stopWaiting?.();
    await expect(signedIn).rejects.toThrow(/cancelled/);
  });
});

describe('the setup says so', () => {
  it('the Check your email line says the app carries on by itself, for a team account too', async () => {
    const { checkEmailLede } = await import('../renderer/src/team/SignInPage.tsx');
    expect(checkEmailLede('sam@example.com')).toContain('on this computer');
    expect(checkEmailLede('sam@example.com')).not.toContain('then sign in here');
  });
});
