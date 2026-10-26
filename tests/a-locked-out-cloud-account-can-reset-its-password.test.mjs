// A CLOUD ACCOUNT WHOSE PASSWORD IS WRONG CAN BE OPENED AGAIN (F-63, 2026-10-25).
//
// QA made an Agentbox Cloud account on the Linux box, confirmed the email, and
// then could not sign in: "That email and password do not match an account.",
// twice. Measured on the screen it filed: the sign-in card held Google, an
// email and a password and nothing else, with no forgot or reset link; the
// Create account card held one password field with no way to see what was
// typed and nothing to type it into twice. The address stayed registered to an
// account nobody could open.
//
// So the password field can be shown, and the sign-in card offers a reset.
// The reset email's link comes back to the address the app already listens on
// for a Google sign-in, which trades it for a recovery session, and the new
// password is typed in the app.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { cloudAccountSession, cloudSignIn } from '../main/cloud/account.mjs';
import { readCloudKey } from '../main/cloud/config.mjs';
import { sendPasswordReset, cancelGoogleSignIn, signInWithGoogle } from '../main/team/sign-in.mjs';
import { plainAuthError } from '../main/team/session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const P = '77777777-7777-4777-8777-777777777777';

const freePort = () => new Promise((resolve) => {
  const s = http.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const comeBack = (returnUrl, query) => fetch(`${returnUrl}?${query}`);

describe('the reset email and the link it sends back', () => {
  afterEach(() => { cancelGoogleSignIn(); });

  function fakeClient({ sendError = null, exchangeError = null } = {}) {
    const asked = [];
    return {
      asked,
      auth: {
        resetPasswordForEmail: async (email, options) => { asked.push({ email, options }); return { error: sendError }; },
        exchangeCodeForSession: async () => ({ error: exchangeError }),
      },
    };
  }

  it('asks for the email, and the link comes back to the address this app listens on', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const client = fakeClient();
    const { opened } = await sendPasswordReset({ client, email: ' Me@Example.com ', returnUrl });
    expect(client.asked).toEqual([{ email: 'Me@Example.com', options: { redirectTo: returnUrl } }]);

    const res = await comeBack(returnUrl, 'code=abc');
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/new password/i);
    await expect(opened).resolves.toBeUndefined();
  });

  // The boundary on the other side: a link that brings no code, or one the
  // database will not trade, leaves the person where they were, told why.
  it('a link the database refuses says so, in the app and in the browser', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const { opened } = await sendPasswordReset({ client: fakeClient({ exchangeError: new Error('Email link is invalid or has expired') }), email: 'me@example.com', returnUrl });
    opened.catch(() => {});
    const res = await comeBack(returnUrl, 'code=abc');
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Password reset did not finish/);
    await expect(opened).rejects.toThrow(/invalid or has expired/);
  });

  it('an email the database would not send is said in words, and the address is freed', async () => {
    const port = await freePort();
    const returnUrl = `http://127.0.0.1:${port}/auth/callback`;
    await expect(sendPasswordReset({ client: fakeClient({ sendError: { message: 'For security purposes, you can only request this after 60 seconds. rate limit' } }), email: 'me@example.com', returnUrl }))
      .rejects.toThrow(/Too many tries just now/);
    const probe = http.createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
    await new Promise((r) => probe.close(r));
  });

  // One return address, one attempt: whichever was waiting is let go, never
  // left holding the port (tests/team-google-sign-in-can-be-tried-again).
  it('a Google sign-in started while a reset waits replaces it rather than failing on the address', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const { opened } = await sendPasswordReset({ client: fakeClient(), email: 'me@example.com', returnUrl });
    opened.catch(() => {});
    const google = signInWithGoogle({
      client: { auth: { signInWithOAuth: async () => ({ data: { url: 'https://cloud.test/authorize' }, error: null }), exchangeCodeForSession: async () => ({ error: null }) } },
      openExternal: async () => {}, returnUrl,
    });
    await expect(opened).rejects.toMatchObject({ cancelled: true });
    await new Promise((r) => setTimeout(r, 50));
    expect((await comeBack(returnUrl, 'code=abc')).status).toBe(200);
    await expect(google).resolves.toBeUndefined();
  });

  it('a reset waiting can be let go, and frees the address at once', async () => {
    const port = await freePort();
    const returnUrl = `http://127.0.0.1:${port}/auth/callback`;
    const { opened } = await sendPasswordReset({ client: fakeClient(), email: 'me@example.com', returnUrl });
    opened.catch(() => {});
    expect(cancelGoogleSignIn()).toBe(true);
    await expect(opened).rejects.toMatchObject({ cancelled: true });
    const probe = http.createServer();
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
    await new Promise((r) => probe.close(r));
  });
});

describe('what the cloud account does with it', () => {
  let tmp; let server; let gateway; let configBefore;

  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudreset-')));
    configBefore = process.env.AGENTBOX_CLOUD_CONFIG;
    process.env.AGENTBOX_CLOUD_CONFIG = path.join(tmp, '.agentbox', 'cloud.json');
    const gw = createGateway({
      agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
      links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
      removeObject: async () => {},
      objects: memoryObjects(),
      whoIs: async (t) => (t === 'reset-session' ? { id: P } : null),
    });
    server = gatewayServer(gw);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    gateway = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    cancelGoogleSignIn();
    if (configBefore === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = configBefore;
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // The client that sent the email is the one that holds the code's other
  // half, so the whole reset is one client from the email to the new password.
  function fakeClient({ updateError = null } = {}) {
    const made = [];
    return {
      made,
      create: () => {
        const c = {
          signedIn: false,
          auth: {
            resetPasswordForEmail: async () => ({ error: null }),
            exchangeCodeForSession: async () => { c.signedIn = true; return { error: null }; },
            updateUser: async ({ password }) => {
              if (updateError) return { error: { message: updateError } };
              if (!c.signedIn) return { error: { message: 'Auth session missing!' } };
              c.password = password;
              return { error: null };
            },
            getSession: async () => ({ data: c.signedIn ? { session: { access_token: 'reset-session' } } : {} }),
          },
        };
        made.push(c);
        return c;
      },
    };
  }

  const configFor = (returnUrl) => ({ gateway, supabaseUrl: 'https://db.example', anonKey: 'public-key', signInReturn: returnUrl });

  it('takes a new password after the link, and gets this Mac its cloud key', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const config = configFor(returnUrl);
    const fake = fakeClient();
    const session = cloudAccountSession({ config, createClient: fake.create });

    expect(await cloudSignIn({ config, session, method: 'reset', email: 'me@example.com', env: {}, home: tmp })).toMatchObject({ ok: true, sent: true });
    const waiting = cloudSignIn({ config, session, method: 'reset-wait', env: {}, home: tmp });
    expect((await comeBack(returnUrl, 'code=abc')).status).toBe(200);
    expect(await waiting).toMatchObject({ ok: true, opened: true });

    const out = await cloudSignIn({ config, session, method: 'new-password', password: 'a-new-one', acceptTerms: true, env: {}, home: tmp });
    expect(out).toMatchObject({ ok: true });
    expect(fake.made[0].password).toBe('a-new-one');
    expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
  });

  it('a new password typed before the link was opened keeps nothing', async () => {
    const returnUrl = `http://127.0.0.1:${await freePort()}/auth/callback`;
    const config = configFor(returnUrl);
    const session = cloudAccountSession({ config, createClient: fakeClient().create });
    const out = await cloudSignIn({ config, session, method: 'new-password', password: 'a-new-one', env: {}, home: tmp });
    expect(out.ok).toBe(false);
    expect(readCloudKey({}, tmp)).toBe(null);
  });

  it('the same password as before is said the way the page says everything else', () => {
    expect(plainAuthError('New password should be different from the old password.')).toMatch(/different from the one you had/i);
  });
});

describe('the sign-in card', () => {
  const page = () => read('renderer/src/team/SignInPage.tsx');

  it('lets you see the password you are typing, on both tabs', () => {
    expect(page()).toContain("type={showPassword ? 'text' : 'password'}");
    expect(page()).toContain('{showPassword ? \'Hide\' : \'Show\'}');
  });

  // A password shown by default would be one read over a shoulder.
  it('hides it until you ask', () => {
    expect(page()).toMatch(/useState\(false\)[^\n]*\/\/ a password is hidden until/);
  });

  it('offers a way out of a password that does not work, and asks for the new one here', () => {
    const p = page();
    expect(p).toContain('Forgot password?');
    expect(p).toContain("method: 'reset'");
    expect(p).toContain("method: 'reset-wait'");
    expect(p).toContain("method: 'new-password'");
  });

  it('the main process has the three doors the card presses', () => {
    const ipc = read('main/ipc.mjs');
    expect(ipc).toContain("ipcMain.handle('zero:cloud-account-sign-in'");
    const account = read('main/cloud/account.mjs');
    for (const m of ["method === 'reset'", "method === 'reset-wait'", "method === 'new-password'"]) expect(account).toContain(m);
  });
});
