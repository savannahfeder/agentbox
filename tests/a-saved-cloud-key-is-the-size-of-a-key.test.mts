// Weekly security audit, 2026-11-16. A Mac saves a key for cloud runs through
// a link the gateway signs for logins/u-<person>/keys/<id>.json. The link bound
// no size, so it took any body, and the storage sweep weighed only runs/, so
// bytes there never counted toward the person's cap. Measured with the real
// gateway in memory: 20 times the cap under keys/ left the sweep at 0 bytes and
// still issued links that write.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const MIN = 60_000;

function setup(storageBytes = 1000) {
  let t = Date.UTC(2026, 10, 16, 12);
  const signed: unknown[][] = [];
  const objects = memoryObjects();
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k: string) => `https://b/${k}`, put: async (...a: unknown[]) => { signed.push(a); return `https://b/${a[0]}`; }, head: async (k: string) => `https://b/${k}` },
    removeObject: async (k: string) => objects.del(k),
    objects,
    whoIs: async (token: string) => (token === 'session-of-a' ? { id: A } : null),
    now: () => t,
    storageBytes,
  });
  const call = (p: string, key: string, body: unknown) => gw.handle({ method: 'POST', path: p, headers: key ? { authorization: `Bearer ${key}` } : {}, body: JSON.stringify(body) });
  return { gw, objects, signed, call, later: (ms: number) => { t += ms; } };
}

describe('a saved cloud key is the size of a key', () => {
  it('the link that saves one is signed for the size the Mac said, and a size no key has is refused', async () => {
    const s = setup();
    const a = (await s.call('/v1/devices', 'session-of-a', { name: 'Mac', acceptedTerms: TERMS_VERSION })).body.key;
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    expect((await s.call('/v1/link', a, { op: 'put', key: 'logins/keys/abcd1234.json', size: 300 })).status).toBe(200);
    expect(s.signed.at(-1)).toEqual([`logins/u-${A}/keys/abcd1234.json`, expect.any(Number), 300]);
    expect((await s.call('/v1/link', a, { op: 'put', key: 'logins/keys/abcd1234.json', size: 5 * 1024 * 1024 })).status).toBe(400);
  });

  it('what is saved there counts toward the storage cap', async () => {
    const s = setup(1000);
    const a = (await s.call('/v1/devices', 'session-of-a', { name: 'Mac', acceptedTerms: TERMS_VERSION })).body.key;
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    expect((await s.call('/v1/link', a, { op: 'put', key: 'runs/r1/out.bundle' })).status).toBe(200);
    await s.objects.put(`logins/u-${A}/keys/abcd1234.json`, 'x'.repeat(5000));
    s.later(20 * MIN);
    await s.gw.sweep();
    const full = await s.call('/v1/link', a, { op: 'put', key: 'runs/r1/out.bundle' });
    expect(full.status).toBe(403);
    expect(full.body.error).toBe('storage');
  });
});
