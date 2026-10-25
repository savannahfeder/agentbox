// THE PHONE APP SIGNS IN WITH APPLE AND STAYS SIGNED IN (docs/mobile/PLAN.md).
//
// The app signs in through the phone site's own client (renderer/src/cloud-rest.ts),
// which reads its session synchronously, while a phone keeps secrets in the
// keychain, which answers asynchronously. So the app reads the keychain once
// at launch and writes every change back (mobile/src/lib/kept.ts). Sign in with
// Apple, which App Review asks for beside Google (guideline 4.8), trades the
// token Apple gave the app for a session, with the nonce it was asked under.
// And every request the app makes carries a deadline that ends it, as the
// desktop's do (tests/no-network-call-in-the-app-can-wait-forever).
import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { cloudClient } from '../renderer/src/cloud-rest';
import { keptStore } from '../mobile/src/lib/kept';
import { withDeadline } from '../mobile/src/lib/deadline';

const CFG = { url: 'https://cloud.example', anonKey: 'public-key' };
const tokenAnswer = { access_token: 'a1', refresh_token: 'r1', expires_in: 3600, user: { id: 'u-1', email: 'me@example.com' } };

function fakePersist(start = {}) {
  const kept = { ...start };
  return { kept, read: async () => ({ ...kept }), write: async (key, value) => { if (value === null) delete kept[key]; else kept[key] = value; } };
}

describe('Sign in with Apple', () => {
  it('trades the token Apple gave for a session, with the nonce it was asked under', async () => {
    const asked = [];
    const fetchImpl = async (url, init) => { asked.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify(tokenAnswer), { status: 200 }); };
    const client = cloudClient(CFG, { storage: { getItem: () => null, setItem() {}, removeItem() {} }, fetchImpl });
    const s = await client.signInWithIdToken('apple', 'apple-id-token', 'raw-nonce');
    expect(asked).toEqual([{ url: 'https://cloud.example/auth/v1/token?grant_type=id_token', body: { provider: 'apple', id_token: 'apple-id-token', nonce: 'raw-nonce' } }]);
    expect(s.user.id).toBe('u-1');
    expect(client.signedIn()).toBe(true);
  });

  it('a refused token leaves you signed out and says why', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ msg: 'Bad ID token' }), { status: 400 });
    const client = cloudClient(CFG, { storage: { getItem: () => null, setItem() {}, removeItem() {} }, fetchImpl });
    await expect(client.signInWithIdToken('apple', 'bad', 'n')).rejects.toThrow('Bad ID token');
    expect(client.signedIn()).toBe(false);
  });
});

describe('the sign-in kept on the phone', () => {
  it('survives a restart of the app', async () => {
    const persist = fakePersist();
    const fetchImpl = async () => new Response(JSON.stringify(tokenAnswer), { status: 200 });
    const first = cloudClient(CFG, { storage: await keptStore(persist), fetchImpl });
    await first.signInWithPassword('me@example.com', 'pw');
    await new Promise((r) => setTimeout(r, 0));
    const again = cloudClient(CFG, { storage: await keptStore(persist), fetchImpl });
    expect(again.signedIn()).toBe(true);
    expect(again.session().user.id).toBe('u-1');
  });

  it('signing out takes it off the phone', async () => {
    const persist = fakePersist();
    const fetchImpl = async () => new Response(JSON.stringify(tokenAnswer), { status: 200 });
    const client = cloudClient(CFG, { storage: await keptStore(persist), fetchImpl });
    await client.signInWithPassword('me@example.com', 'pw');
    client.signOut();
    await new Promise((r) => setTimeout(r, 0));
    expect(persist.kept).toEqual({});
    expect(cloudClient(CFG, { storage: await keptStore(persist), fetchImpl }).signedIn()).toBe(false);
  });

  it('a keychain that cannot be read starts signed out instead of failing to open', async () => {
    const storage = await keptStore({ read: async () => { throw new Error('locked'); }, write: async () => {} });
    expect(storage.getItem('agentbox-cloud-session')).toBeNull();
  });
});

describe('the deadline on every request the app makes', () => {
  it('ends a request that never answers, and leaves one that answers alone', async () => {
    const server = http.createServer((req, res) => { if (req.url === '/ok') res.end('fine'); });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const f = withDeadline(fetch, 300);
      expect(await (await f(`${base}/ok`)).text()).toBe('fine');
      const at = Date.now();
      await expect(f(`${base}/never`)).rejects.toThrow();
      expect(Date.now() - at).toBeLessThan(3000);
      const own = new AbortController();
      const p = f(`${base}/never`, { signal: own.signal });
      own.abort();
      await expect(p).rejects.toThrow();
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });
});
