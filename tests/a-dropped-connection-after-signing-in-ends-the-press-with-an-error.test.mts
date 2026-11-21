// A DROPPED CONNECTION AFTER SIGNING IN ENDS THE PRESS WITH AN ERROR.
//
// Investigating issue #63 (sign-in behind Cloudflare WARP) found that once the
// database had accepted an email and password, or Google's sign-in, the three
// calls to the cloud server that follow (the terms, registering this Mac, its
// profile) could throw, and `cloudSignIn` let the throw out. The page awaits
// that call before it clears its busy state, so the press never ended: the
// email button stayed busy and Google stayed on "Finish in your browser".
// Measured with a server that resets the connection on one route in front of
// the real gateway: each of the three rejected instead of resolving.
//
// This is not the cause of #63, which is still unknown.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { cloudFromTeamSignIn, cloudSignIn } from '../main/cloud/account.mts';
import { readCloudKey } from '../main/cloud/config.mts';

const P = '77777777-7777-4777-8777-777777777777';

describe('a sign-in whose cloud server drops the connection', () => {
  let tmp: string; let server: http.Server; let gateway: string;
  let cut: string | null;
  const seen: string[] = [];
  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dropped-')));
    cut = null;
    seen.length = 0;
    const gw = createGateway({
      agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
      links: { get: async (k: string) => k, put: async (k: string) => k, head: async (k: string) => k },
      removeObject: async () => {},
      objects: memoryObjects(),
      whoIs: async (t: string) => (t === 'valid-session' ? { id: P } : null),
    });
    const real = gatewayServer(gw).listeners('request')[0] as http.RequestListener;
    server = http.createServer((req, res) => {
      const route = new URL(req.url ?? '/', 'http://x').pathname;
      seen.push(`${req.method} ${route}`);
      if (route === cut) { req.socket.destroy(); return; }
      real(req, res);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    gateway = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const config = () => ({ gateway, supabaseUrl: 'https://db.example', anonKey: 'public-key' });
  const ways = {
    email: { method: 'email' as const, session: () => ({ email: async () => 'valid-session' }) },
    google: { method: 'google' as const, session: () => ({ google: async () => 'valid-session' }) },
  };
  const press = (way: keyof typeof ways, acceptTerms = true) =>
    cloudSignIn({ config: config(), session: ways[way].session(), method: ways[way].method, email: 'tester@example.com', password: 'not-a-real-password', acceptTerms, env: {}, home: tmp });

  for (const way of ['email', 'google'] as const) {
    describe(way, () => {
      it('signs in as before when nothing is dropped', async () => {
        const out = await press(way);
        expect(out).toMatchObject({ ok: true, plan: 'none' });
        expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
      });

      it('ends with an error, and no key, when registering this Mac is reset', async () => {
        cut = '/v1/devices';
        const out = await press(way);
        expect(out).toEqual({ ok: false, error: 'fetch failed' });
        expect(readCloudKey({}, tmp)).toBe(null);
      });

      it('ends with an error, and no key, when reading the terms is reset', async () => {
        cut = '/v1/terms';
        const out = await press(way);
        expect(out).toEqual({ ok: false, error: 'fetch failed' });
        expect(seen).not.toContain('POST /v1/devices');
        expect(readCloudKey({}, tmp)).toBe(null);
      });

      it('stays signed in, with the key it was given, when only reading the profile is reset', async () => {
        cut = '/v1/me';
        const out = await press(way);
        expect(out).toEqual({ ok: true });
        expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
      });

      it('a sign-in tab press that never reads the terms still asks for them', async () => {
        cut = '/v1/terms';
        const out = await press(way, false);
        expect(out).toMatchObject({ ok: false, needsTerms: true });
        expect(seen).not.toContain('GET /v1/terms');
      });
    });
  }

  it('a sign-in carried over from the team keeps its key too when only the profile is reset', async () => {
    cut = '/v1/me';
    const out = await cloudFromTeamSignIn({ config: config(), teamUrl: 'https://db.example', token: 'valid-session', acceptTerms: true, env: {}, home: tmp });
    expect(out).toEqual({ ok: true });
    expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
  });

  it('a wrong password is still its own error, and the cloud server is never asked', async () => {
    cut = '/v1/devices';
    const session = { email: async () => { throw new Error('Wrong email or password.'); } };
    const out = await cloudSignIn({ config: config(), session, method: 'email', email: 'tester@example.com', password: 'wrong', env: {}, home: tmp });
    expect(out).toEqual({ ok: false, error: 'Wrong email or password.' });
    expect(seen).toEqual([]);
    expect(readCloudKey({}, tmp)).toBe(null);
  });

  it('a Google sign-in that did not finish is still its own error, and the cloud server is never asked', async () => {
    cut = '/v1/devices';
    const session = { google: async () => { throw Object.assign(new Error('Google sign-in was cancelled.'), { cancelled: true }); } };
    const out = await cloudSignIn({ config: config(), session, method: 'google', env: {}, home: tmp });
    expect(out).toEqual({ ok: false, error: 'Google sign-in was cancelled.', cancelled: true });
    expect(seen).toEqual([]);
  });
});
