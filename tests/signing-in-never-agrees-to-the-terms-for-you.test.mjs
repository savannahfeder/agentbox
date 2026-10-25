// SIGNING IN NEVER AGREES TO THE TERMS FOR YOU.
//
// The terms line moved to the Create account tab only (the owner, w-2c627fdea8,
// 2026-10-23: "It's usually only on the sign-up page that you're accepting the
// Terms"). But the app sent the current terms with every sign-in, so a person
// who pressed Continue with Google on the Sign in tab, with no account yet,
// would have been recorded as agreeing to terms they were never shown. Courts
// hold a sign-in-wrap to what the screen said next to the button the person
// pressed (Berman v. Freedom Financial, 9th Cir. 2022).
//
// So the Sign in tab sends no agreement. The cloud server gives a key without
// one only to someone whose record already holds the current terms; anyone
// else is refused with `terms`, and the page asks once, "Agree and continue",
// which finishes with the same sign-in rather than a second Google round.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudSignIn } from '../main/cloud/account.mjs';
import { readCloudKey } from '../main/cloud/config.mjs';

const P = '88888888-8888-4888-8888-888888888888';

describe('the cloud server', () => {
  let objects; let gw;
  beforeEach(() => {
    objects = memoryObjects();
    gw = createGateway({
      agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
      links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
      removeObject: async () => {},
      objects,
      whoIs: async (t) => (t === 'session' ? { id: P } : null),
    });
  });
  const device = (body) => gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session' }, body: JSON.stringify(body) });

  it('refuses a key with no agreement to someone who never agreed', async () => {
    const out = await device({ name: 'Mac' });
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ error: 'terms', terms: TERMS_VERSION });
  });
  it('gives one with the current agreement, and records it', async () => {
    const out = await device({ name: 'Mac', acceptedTerms: TERMS_VERSION });
    expect(out.status).toBe(200);
    expect(out.body.key).toMatch(/^abk_/);
  });
  it('then gives a later key with no agreement, since the record already holds it', async () => {
    await device({ name: 'Mac', acceptedTerms: TERMS_VERSION });
    const out = await device({ name: 'Second Mac' });
    expect(out.status).toBe(200);
    expect(out.body.key).toMatch(/^abk_/);
  });
  it('but not once the terms have changed since', async () => {
    await device({ name: 'Mac', acceptedTerms: TERMS_VERSION });
    const later = createGateway({
      agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
      links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
      removeObject: async () => {},
      objects,
      whoIs: async () => ({ id: P }),
      termsVersion: '2099-01-01',
    });
    const out = await later.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session' }, body: JSON.stringify({ name: 'Mac' }) });
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ error: 'terms', terms: '2099-01-01' });
  });
  it('and an agreement to some other version is refused, whatever the record holds', async () => {
    await device({ name: 'Mac', acceptedTerms: TERMS_VERSION });
    const out = await device({ name: 'Mac', acceptedTerms: '2000-01-01' });
    expect(out.status).toBe(403);
  });
});

describe('the Mac', () => {
  let tmp; let server; let gateway;
  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agree-')));
    const gw = createGateway({
      agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
      links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
      removeObject: async () => {},
      objects: memoryObjects(),
      whoIs: async (t) => (t === 'google-session' ? { id: P } : null),
    });
    server = gatewayServer(gw);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    gateway = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  const config = () => ({ gateway, supabaseUrl: 'https://db.example', anonKey: 'public-key' });

  it('Google on the Sign in tab, for someone new, asks for the agreement and gets no key', async () => {
    let rounds = 0;
    const session = { google: async () => { rounds += 1; return 'google-session'; } };
    const out = await cloudSignIn({ config: config(), session, method: 'google', env: {}, home: tmp });
    expect(out).toMatchObject({ ok: false, needsTerms: true });
    expect(readCloudKey({}, tmp)).toBe(null);
    expect(rounds).toBe(1);
  });
  it('Agree and continue finishes that same sign-in, with no second trip to Google', async () => {
    let rounds = 0;
    const session = { google: async () => { rounds += 1; return 'google-session'; } };
    await cloudSignIn({ config: config(), session, method: 'google', env: {}, home: tmp });
    const out = await cloudSignIn({ config: config(), session, method: 'agree', env: {}, home: tmp });
    expect(out).toMatchObject({ ok: true });
    expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
    expect(rounds).toBe(1);
  });
  it('agreeing with no sign-in waiting is refused, not sent', async () => {
    const out = await cloudSignIn({ config: config(), session: {}, method: 'agree', env: {}, home: tmp });
    expect(out).toMatchObject({ ok: false });
    expect(readCloudKey({}, tmp)).toBe(null);
  });
  it('Google on the Create account tab agrees, since that tab shows the terms', async () => {
    const session = { google: async () => 'google-session' };
    const out = await cloudSignIn({ config: config(), session, method: 'google', acceptTerms: true, env: {}, home: tmp });
    expect(out).toMatchObject({ ok: true });
    expect(readCloudKey({}, tmp)).toMatch(/^abk_/);
  });
});
