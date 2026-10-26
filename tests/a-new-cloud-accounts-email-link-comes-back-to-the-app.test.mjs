// A NEW CLOUD ACCOUNT'S EMAIL LINK COMES BACK TO THE APP.
//
// Launch-day test of a brand-new user, 2026-10-25 (F-59, two accounts out of
// two): Create account, then the link in the confirmation email ended on
// "This site can't be reached. 127.0.0.1 refused to connect", and the app sat
// on "Check your email" for ever. The cloud's sign-up named no return address,
// so the database sent the link to its own default, http://127.0.0.1:54783
// (cloud/supabase/config.toml site_url) with no path: the desktop's sign-in
// listener, which was not running and would have answered 404 if it were.
//
// Now the sign-up names the one address already on the database's allowed list,
// the same listener the Google sign-in uses, and keeps it up while the page
// says to check the inbox. Following the link lands on a real page, and the app
// trades the code for the session with the client that signed up (only it holds
// the proof), gets this Mac its cloud key, and moves on by itself.
//
// Measured against the real listener over a loopback port: fetch the return
// address with a code and the Mac ends up with a cloud key.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { cloudAccountSession, cloudSignIn, waitForEmailConfirmation } from '../main/cloud/account.mjs';
import { readCloudKey } from '../main/cloud/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const P = '77777777-7777-4777-8777-777777777777';

let tmp; let server; let gateway; let returnUrl;

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudconfirm-')));
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'confirmed-session' ? { id: P } : null),
  });
  server = gatewayServer(gw);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  gateway = `http://127.0.0.1:${server.address().port}`;
  returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const config = () => ({ gateway, supabaseUrl: 'https://db.example', anonKey: 'public-key', signInReturn: returnUrl });

// The listener comes up a tick after the wait starts, as it does while the
// page draws "Check your email"; a browser arriving then would be refused.
async function untilItAnswers(url, until = Date.now() + 5000) {
  for (;;) {
    try {
      const res = await fetch(url);
      return { status: res.status, text: await res.text() };
    } catch (err) {
      if (Date.now() > until) throw err;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

// A stand-in for the database's client. It records what the sign-up asked for
// and hands out a session only once the code from the link has been spent.
function fakeClient(asked) {
  let signedUp = false;
  return () => ({
    auth: {
      async signUp(args) { asked.push({ what: 'signUp', ...args }); signedUp = true; return { data: { session: null }, error: null }; },
      async resend(args) { asked.push({ what: 'resend', ...args }); return { data: {}, error: null }; },
      async exchangeCodeForSession(code) {
        if (!signedUp) return { error: { message: 'invalid flow state' } };
        asked.push({ what: 'exchange', code });
        signedUp = 'done';
        return { error: null };
      },
      async getSession() { return { data: signedUp === 'done' ? { session: { access_token: 'confirmed-session' } } : {} }; },
    },
  });
}

describe('where the confirmation email\'s link goes', () => {
  it('is named by the sign-up, so it never falls back to the database\'s dead default', async () => {
    const asked = [];
    const session = cloudAccountSession({ config: config(), createClient: fakeClient(asked) });
    const out = await cloudSignIn({ config: config(), session, method: 'sign-up', name: 'Me', email: 'new@example.com', password: 'pw-123456', env: {}, home: tmp });
    expect(out).toMatchObject({ ok: true, confirm: true });
    expect(asked[0]).toMatchObject({ what: 'signUp', email: 'new@example.com' });
    expect(asked[0].options.emailRedirectTo).toBe(returnUrl);
  });

  it('is a path the listener answers, not the bare address it used to be', () => {
    expect(new URL(returnUrl).pathname).toBe('/auth/callback');
    const toml = read('cloud/supabase/config.toml');
    expect(toml).toContain('additional_redirect_urls = ["http://127.0.0.1:54783/auth/callback"]');
    expect(read('main/cloud/account.mjs')).toContain("const RETURN_URL = 'http://127.0.0.1:54783/auth/callback'");
  });
});

describe('following the link', () => {
  it('lands on a page that says so, and signs this Mac in with no further press', async () => {
    const session = cloudAccountSession({ config: config(), createClient: fakeClient([]) });
    await cloudSignIn({ config: config(), session, method: 'sign-up', name: 'Me', email: 'new@example.com', password: 'pw-123456', env: {}, home: tmp });
    const waiting = waitForEmailConfirmation({ config: config(), session, env: {}, home: tmp });
    const page = await untilItAnswers(`${returnUrl}?code=abc`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Your email is confirmed');
    expect(await waiting).toMatchObject({ ok: true });
    expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
  });

  it('says why when the link comes back with no code, and leaves the Mac signed out', async () => {
    const session = cloudAccountSession({ config: config(), createClient: fakeClient([]) });
    await cloudSignIn({ config: config(), session, method: 'sign-up', name: 'Me', email: 'new@example.com', password: 'pw-123456', env: {}, home: tmp });
    const waiting = waitForEmailConfirmation({ config: config(), session, env: {}, home: tmp });
    const page = await untilItAnswers(`${returnUrl}?error_description=Email+link+is+invalid+or+has+expired`);
    expect(page.status).toBe(400);
    expect(page.text).toContain('Email link is invalid or has expired');
    expect(await waiting).toMatchObject({ ok: false });
    expect(readCloudKey({}, tmp)).toBe(null);
  });

  it('nothing is waiting when no account was made here', async () => {
    const session = cloudAccountSession({ config: config(), createClient: fakeClient([]) });
    expect(await waitForEmailConfirmation({ config: config(), session, env: {}, home: tmp })).toMatchObject({ ok: false, error: 'nothing-waiting' });
  });

  // NOTHING WAITS FOR EVER: the listener holds the one loopback address the
  // whole app signs in through, so it lets it go rather than keep it for good.
  it('gives up after a deadline instead of holding the address for ever', async () => {
    const session = cloudAccountSession({ config: config(), createClient: fakeClient([]), confirmWaitMs: 60 });
    await cloudSignIn({ config: config(), session, method: 'sign-up', name: 'Me', email: 'new@example.com', password: 'pw-123456', env: {}, home: tmp });
    expect(await waitForEmailConfirmation({ config: config(), session, env: {}, home: tmp })).toMatchObject({ ok: false });
    expect(readCloudKey({}, tmp)).toBe(null);
  });
});

describe('a link that never arrives', () => {
  it('can be sent again, to the same address and the same return address', async () => {
    const asked = [];
    const session = cloudAccountSession({ config: config(), createClient: fakeClient(asked) });
    await cloudSignIn({ config: config(), session, method: 'sign-up', name: 'Me', email: 'new@example.com', password: 'pw-123456', env: {}, home: tmp });
    const out = await cloudSignIn({ config: config(), session, method: 'resend', env: {}, home: tmp });
    expect(out).toMatchObject({ ok: true, sent: true });
    expect(asked.at(-1)).toMatchObject({ what: 'resend', type: 'signup', email: 'new@example.com' });
    expect(asked.at(-1).options.emailRedirectTo).toBe(returnUrl);
  });

  it('asking for another before an account was made here says what to do', async () => {
    const session = cloudAccountSession({ config: config(), createClient: fakeClient([]) });
    expect(await cloudSignIn({ config: config(), session, method: 'resend', env: {}, home: tmp })).toMatchObject({ ok: false });
  });
});

describe('the check your email screen', () => {
  const page = () => read('renderer/src/team/SignInPage.tsx');

  it('offers a way to send the link again and a way to fix the address', () => {
    expect(page()).toContain("method: 'resend'");
    expect(page()).toContain('Send it again');
    expect(page()).toContain('Use a different address');
  });

  // F-62: Create account came up holding the password typed on Sign in, so an
  // account could be made with it without anyone noticing.
  it('does not carry a password typed on one tab over to the other', () => {
    expect(page()).toContain("setMode('sign-in'); setPassword('');");
    expect(page()).toContain("setMode('sign-up'); setPassword('');");
  });
});
