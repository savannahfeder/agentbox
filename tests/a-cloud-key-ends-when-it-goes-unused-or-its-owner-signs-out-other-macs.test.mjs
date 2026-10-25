// A CLOUD KEY ENDS WHEN IT GOES UNUSED, OR WHEN ITS OWNER SIGNS OUT OTHER MACS.
//
// What was wrong (2026-10-22, before Agentbox Cloud opened to strangers): a
// cloud key (`POST /v1/devices`, kept at ~/.agentbox/cloud-key) lasted for
// ever. Only the Mac holding it could end it (`DELETE /v1/devices`), or the
// owner, by turning the whole person off. A key copied off a lost or sold Mac,
// or out of a backup, could start runs on its owner's plan, read their runs'
// code, and run agents on their saved Claude and Codex sign-ins, with nothing
// the owner of the key could do from another Mac. Measured by reading
// cloud/gateway/gateway.mjs: the device record was `{ person, name, at }`
// and nothing read `at`.
//
// Now a key unused for 30 days is refused, its use noted at most once a day
// so a relay that polls for hours never ends its own key; a person can end
// every key but this Mac's, on its own or as they sign in; and the owner can
// sign a person out everywhere without turning them off. And a Mac told its
// key is not known forgets it, so nothing keeps sending it to the cloud: it
// is signed out, and the cloud menu asks it to sign in again.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createGateway, gatewayServer, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudClients } from '../main/cloud/clients.mjs';
import { cloudPlan, signOutOtherMacs } from '../main/cloud/account.mjs';
import { cloudConfigPath, readCloudConfig, readCloudKey, writeCloudKey } from '../main/cloud/config.mjs';
import { adminEvent } from '../scripts/cloud-gateway-admin.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

function setup() {
  let t = Date.UTC(2026, 9, 22, 12);
  const objects = memoryObjects();
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects,
    whoIs: async (token) => ({ 'session-of-a': { id: A }, 'session-of-b': { id: B } })[token] ?? null,
    now: () => t,
  });
  const call = async (method, p, { key, body } = {}) => gw.handle({ method, path: p, headers: key ? { authorization: `Bearer ${key}` } : {}, body: body ? JSON.stringify(body) : '' });
  const keyFor = async (session, extra = {}) => (await call('POST', '/v1/devices', { key: session, body: { name: 'Mac', acceptedTerms: TERMS_VERSION, ...extra } })).body.key;
  const me = (key) => call('GET', '/v1/me', { key });
  return { gw, objects, call, keyFor, me, later: (ms) => { t += ms; }, at: () => t };
}

describe('a key nobody uses', () => {
  it('works through its 30th idle day and is refused as signed out after it, its record gone', async () => {
    const s = setup();
    const kept = await s.keyFor('session-of-a');
    const lapsed = await s.keyFor('session-of-a');
    s.later(30 * DAY);
    expect((await s.me(kept)).status).toBe(200);
    s.later(1);
    const refused = await s.me(lapsed);
    expect(refused.status).toBe(401);
    expect(refused.body).toMatchObject({ error: 'signed-out' });
    expect(refused.body.message).toMatch(/30 days.*sign in again/);
    expect([...s.objects.dump().keys()].filter((k) => k.startsWith('ledger/devices/'))).toHaveLength(1);
  });

  it('one made before its use was noted counts from when it was made', async () => {
    const s = setup();
    const old = await s.keyFor('session-of-a');
    const young = await s.keyFor('session-of-a');
    const [oldRec, youngRec] = [...s.objects.dump().entries()].filter(([k]) => k.startsWith('ledger/devices/'));
    await s.objects.put(oldRec[0], JSON.stringify({ person: A, name: 'Mac', at: s.at() - 31 * DAY }));
    await s.objects.put(youngRec[0], JSON.stringify({ person: A, name: 'Mac', at: s.at() - 29 * DAY }));
    const keys = Object.fromEntries([[oldRec[0], old], [youngRec[0], young]]);
    expect((await s.me(keys[oldRec[0]])).status).toBe(401);
    expect((await s.me(keys[youngRec[0]])).status).toBe(200);
    s.later(29 * DAY);
    expect((await s.me(keys[youngRec[0]])).status).toBe(200);
  });
});

describe('a key in use', () => {
  it('never ends, however long, and its use costs one write a day', async () => {
    const s = setup();
    const key = await s.keyFor('session-of-a');
    const writes = [];
    const put = s.objects.put;
    s.objects.put = async (k, ...rest) => { if (k.startsWith('ledger/devices/')) writes.push(k); return put(k, ...rest); };
    // A relay polling every six hours for 90 days, through sleep and all.
    for (let i = 0; i < 90 * 4; i += 1) {
      expect((await s.me(key)).status).toBe(200);
      s.later(6 * HOUR);
    }
    expect(writes.length).toBeGreaterThanOrEqual(89);
    expect(writes.length).toBeLessThanOrEqual(90);
  });
});

describe('signing out other Macs', () => {
  it('ends every other key of that person at once, keeps this one and nobody else\'s, and lets a new sign-in in', async () => {
    const s = setup();
    const [a1, a2, a3] = [await s.keyFor('session-of-a'), await s.keyFor('session-of-a'), await s.keyFor('session-of-a')];
    const b1 = await s.keyFor('session-of-b');
    s.later(1000);
    expect((await s.call('DELETE', '/v1/devices', { key: a1, body: { others: true } })).status).toBe(200);
    for (const k of [a2, a3]) {
      const r = await s.me(k);
      expect(r.status).toBe(401);
      expect(r.body.message).toMatch(/another Mac.*sign in again/);
    }
    expect((await s.me(a1)).status).toBe(200);
    expect((await s.me(b1)).status).toBe(200);
    s.later(1000);
    const a4 = await s.keyFor('session-of-a');
    expect((await s.me(a4)).status).toBe(200);
    // And from that one, the first is ended in its turn.
    s.later(1000);
    await s.call('DELETE', '/v1/devices', { key: a4, body: { others: true } });
    expect((await s.me(a1)).status).toBe(401);
    expect((await s.me(a4)).status).toBe(200);
  });

  it('can be done as a Mac signs in', async () => {
    const s = setup();
    const a1 = await s.keyFor('session-of-a');
    s.later(1000);
    const a2 = await s.keyFor('session-of-a', { signOutOthers: true });
    expect((await s.me(a1)).status).toBe(401);
    expect((await s.me(a2)).status).toBe(200);
  });

  it('a plain sign-out still ends only this Mac\'s key', async () => {
    const s = setup();
    const [a1, a2] = [await s.keyFor('session-of-a'), await s.keyFor('session-of-a')];
    expect((await s.call('DELETE', '/v1/devices', { key: a1 })).status).toBe(200);
    expect((await s.me(a1)).status).toBe(401);
    expect((await s.me(a2)).status).toBe(200);
  });

  it('the owner can sign a person out of every Mac without turning them off', async () => {
    const s = setup();
    const [a1, a2] = [await s.keyFor('session-of-a'), await s.keyFor('session-of-a')];
    const b1 = await s.keyFor('session-of-b');
    s.later(1000);
    await s.gw.admin({ do: 'sign-out', person: A });
    expect((await s.me(a1)).status).toBe(401);
    expect((await s.me(a2)).status).toBe(401);
    expect((await s.me(b1)).status).toBe(200);
    s.later(1000);
    expect((await s.me(await s.keyFor('session-of-a'))).status).toBe(200);    expect(adminEvent(['sign-out', A])).toEqual({ admin: { do: 'sign-out', person: A } });
    expect(() => adminEvent(['sign-out'])).toThrow(/usage/);
  });
});

describe('the Mac, told its key is not known', () => {
  let home; let server; let gateway; let gw; const env = {};
  beforeEach(async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudkeyend-'));
    gw = setup();
    server = gatewayServer({ handle: (r) => gw.gw.handle(r) });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    gateway = `http://127.0.0.1:${server.address().port}`;
    fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
    fs.writeFileSync(cloudConfigPath(env, home), JSON.stringify({ gateway }));
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('forgets it, so it is signed out and sends nothing more to the cloud', async () => {
    writeCloudKey('abk_endedendedendedendedendedendedendedended', env, home);
    const { transport } = await cloudClients(readCloudConfig(env, home), { env, home });
    expect(await transport.invoke('s1', { action: 'status' })).toMatchObject({ ok: false, error: 'signed-out' });
    expect(readCloudKey(env, home)).toBe(null);
    expect(readCloudConfig(env, home)).toBe(null);
  });

  it('leaves alone a key a newer sign-in put in its place', async () => {
    writeCloudKey('abk_endedendedendedendedendedendedendedended', env, home);
    const { transport } = await cloudClients(readCloudConfig(env, home), { env, home });
    writeCloudKey('abk_newernewernewernewernewernewernewernewer', env, home);
    await transport.invoke('s1', { action: 'status' });
    expect(readCloudKey(env, home)).toBe('abk_newernewernewernewernewernewernewernewer');
    expect(readCloudConfig(env, home)).toEqual({ gateway });
  });

  it('forgets nothing for a refusal that is not about the key', async () => {
    const key = await gw.keyFor('session-of-a');
    writeCloudKey(key, env, home);
    await gw.gw.admin({ do: 'disable', person: A });
    const { transport } = await cloudClients(readCloudConfig(env, home), { env, home });
    expect(await transport.invoke('s1', { action: 'status' })).toMatchObject({ ok: false, error: 'disabled' });
    expect(readCloudKey(env, home)).toBe(key);
    const down = http.createServer((req, res) => { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"error":"server"}'); });
    await new Promise((r) => down.listen(0, '127.0.0.1', r));
    try {
      const { transport: t2 } = await cloudClients({ gateway: `http://127.0.0.1:${down.address().port}` }, { env, home });
      await expect(t2.invoke('s1', { action: 'status' })).rejects.toThrow(/500/);
      expect(readCloudKey(env, home)).toBe(key);
    } finally { down.closeAllConnections(); await new Promise((r) => down.close(r)); }
  });

  it('the cloud menu says signed out, and the key is forgotten', async () => {
    writeCloudKey('abk_endedendedendedendedendedendedendedended', env, home);
    expect(await cloudPlan({ env, home })).toMatchObject({ signedIn: false, error: 'signed-out' });
    expect(readCloudKey(env, home)).toBe(null);
  });

  it('a Mac can sign out every other Mac and stay signed in itself', async () => {
    const mine = await gw.keyFor('session-of-a');
    const other = await gw.keyFor('session-of-a');
    writeCloudKey(mine, env, home);
    gw.later(1000);
    expect(await signOutOtherMacs({ env, home })).toMatchObject({ ok: true });
    expect((await gw.me(other)).status).toBe(401);
    expect((await gw.me(mine)).status).toBe(200);
    expect(readCloudKey(env, home)).toBe(mine);
  });
});
