// FILES IN THE CLOUD ARE A PAID PLAN'S, AND STOP AT ITS CAP.
//
// Agents' films and pictures filled people's disks (w-439393243c). The owner
// chose to keep files in the cloud for Pro, Plus and Max only (100 GB, 500 GB,
// 2 TB), so a free account costs nothing to store. The cloud server signed
// links only for `runs/` and `logins/`, so there was nowhere to put a file.
// Measured on createGateway with memory objects: a person on each plan asks
// for a link to write `files/<hash>`, and the sweep weighs what they hold.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects, scopedKey } from '../cloud/gateway/gateway.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { FILES_LAPSE_DAYS, PLANS, TEAM } from '../cloud/gateway/plans.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DAY = 24 * 60 * 60_000;
const GB = 2 ** 30;
const HASH = 'a'.repeat(64);

function setup({ teams = null } = {}) {
  let t = Date.UTC(2026, 10, 10, 12);
  const objects = memoryObjects();
  const removed: string[] = [];
  const gw = createGateway({
    agentcore: { async invoke() { return { ok: true }; }, async stop() {} },
    links: { get: async (k) => `get:${k}`, put: async (k) => `put:${k}`, head: async (k) => `head:${k}` },
    removeObject: async (k) => { removed.push(k); await objects.del(k); },
    objects,
    whoIs: async (token) => (token === 'session-of-a' ? { id: A } : null),
    now: () => t,
    ...(teams ? { teams } : {}),
  });
  const call = async (method: string, p: string, { key, body }: { key?: string; body?: unknown } = {}) => gw.handle({ method, path: p, headers: key ? { authorization: `Bearer ${key}` } : {}, body: body ? JSON.stringify(body) : '' });
  const keyOf = async () => (await call('POST', '/v1/devices', { key: 'session-of-a', body: { name: 'Mac', acceptedTerms: TERMS_VERSION } })).body.key;
  const hold = (bytes: number, hash = HASH) => objects.put(`files/u-${A}/${hash}`, 'x'.repeat(0)).then(() => {
    // memoryObjects weighs a body by its length; a GB body would be a GB of memory, so its size is set on its entry.
    const sizes = objects.sizes.bind(objects);
    objects.sizes = async (prefix, o) => {
      const out = await sizes(prefix, o);
      return { ...out, items: out.items.map((i) => (i.key.endsWith(hash) ? { ...i, size: bytes } : i)) };
    };
  });
  return { gw, objects, removed, call, keyOf, hold, later: (ms: number) => { t += ms; } };
}

describe('the plans', () => {
  it('give 100 GB, 500 GB and 2 TB, a team seat 100 GB, and nothing to no plan', () => {
    expect([PLANS.none.filesGB, PLANS.pro.filesGB, PLANS.plus.filesGB, PLANS.max.filesGB]).toEqual([0, 100, 500, 2048]);
    expect(TEAM.filesGBPerSeat).toBe(100);
  });
});

describe('a link to keep a file', () => {
  it('is a file of the person\'s own, named by its bytes and nothing else', () => {
    expect(scopedKey(A, `files/${HASH}`)).toBe(`files/u-${A}/${HASH}`);
  });

  it('is refused with no plan, and says files come with Pro', async () => {
    const s = setup();
    const key = await s.keyOf();
    const out = await s.call('POST', '/v1/link', { key, body: { op: 'put', key: `files/${HASH}` } });
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ error: 'files-plan' });
    expect(out.body.message).toMatch(/Pro/);
  });

  it('is given on Pro, and a name that is not a hash is refused', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    const out = await s.call('POST', '/v1/link', { key, body: { op: 'put', key: `files/${HASH}` } });
    expect(out.status).toBe(200);
    expect(out.body.url).toBe(`put:files/u-${A}/${HASH}`);
    for (const k of ['files/../ledger/people/x.json', 'files/abc', `files/${HASH}/more`, `files/${'A'.repeat(64)}`]) {
      expect((await s.call('POST', '/v1/link', { key, body: { op: 'put', key: k } })).status).toBe(400);
    }
  });

  it('reads a file back with no plan at all, so a lapsed plan\'s files can come home', async () => {
    const s = setup();
    const key = await s.keyOf();
    const out = await s.call('POST', '/v1/link', { key, body: { op: 'get', key: `files/${HASH}` } });
    expect(out.status).toBe(200);
    expect((await s.call('POST', '/v1/delete', { key, body: { key: `files/${HASH}` } })).status).toBe(200);
    expect(s.removed).toEqual([`files/u-${A}/${HASH}`]);
  });

  it('a team\'s paid seat keeps 100 GB, and its trial keeps none', async () => {
    const team = async () => ({ id: 't1', createdAt: Date.UTC(2026, 10, 9), members: [A], owners: [A] });
    const trial = setup({ teams: team });
    const trialKey = await trial.keyOf();
    expect((await trial.call('GET', '/v1/files', { key: trialKey })).body.cap).toBe(0);
    expect((await trial.call('POST', '/v1/link', { key: trialKey, body: { op: 'put', key: `files/${HASH}` } })).body.error).toBe('files-plan');
    const paid = setup({ teams: team });
    await paid.objects.put('ledger/teams/t1.json', JSON.stringify({ plan: 'team', seats: 3, stripe: { status: 'active' } }));
    const key = await paid.keyOf();
    expect((await paid.call('GET', '/v1/files', { key })).body.cap).toBe(100 * GB);
    expect((await paid.call('POST', '/v1/link', { key, body: { op: 'put', key: `files/${HASH}` } })).status).toBe(200);
  });
});

describe('what a person holds', () => {
  it('is weighed and said with the cap, and at the cap a write is refused while a read still works', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    await s.hold(100 * GB - 1);
    let usage = await s.call('GET', '/v1/files', { key });
    expect(usage.body).toMatchObject({ bytes: 100 * GB - 1, cap: 100 * GB, full: false });
    expect((await s.call('POST', '/v1/link', { key, body: { op: 'put', key: `files/${'b'.repeat(64)}` } })).status).toBe(200);
    await s.hold(100 * GB);
    s.later(2 * 60_000);
    usage = await s.call('GET', '/v1/files', { key });
    expect(usage.body).toMatchObject({ bytes: 100 * GB, full: true });
    const refused = await s.call('POST', '/v1/link', { key, body: { op: 'put', key: `files/${'c'.repeat(64)}` } });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe('files-full');
    expect((await s.call('POST', '/v1/link', { key, body: { op: 'get', key: `files/${HASH}` } })).status).toBe(200);
  });

  it('is in /v1/me as the plan\'s cap', async () => {
    const s = setup();
    const key = await s.keyOf();
    expect((await s.call('GET', '/v1/me', { key })).body.filesCap).toBe(0);
    await s.gw.admin({ do: 'plan', person: A, plan: 'plus' });
    expect((await s.call('GET', '/v1/me', { key })).body.filesCap).toBe(500 * GB);
  });
});

describe('a plan that ends', () => {
  it('keeps its files for 30 days, then the sweep deletes them; a plan back in time keeps them', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    await s.hold(5 * GB);
    await s.call('GET', '/v1/files', { key });
    await s.gw.admin({ do: 'plan', person: A, plan: 'none' });
    await s.gw.sweep();
    s.later(FILES_LAPSE_DAYS * DAY - 60_000);
    await s.gw.sweep();
    expect([...s.objects.dump().keys()].filter((k) => k.startsWith('files/'))).toHaveLength(1);
    s.later(2 * 60_000);
    await s.gw.sweep();
    expect([...s.objects.dump().keys()].filter((k) => k.startsWith('files/'))).toHaveLength(0);
  });

  it('a plan taken again before the 30 days are up keeps every file', async () => {
    const s = setup();
    const key = await s.keyOf();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    await s.hold(5 * GB);
    await s.call('GET', '/v1/files', { key });
    await s.gw.admin({ do: 'plan', person: A, plan: 'none' });
    await s.gw.sweep();
    s.later(20 * DAY);
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    await s.gw.sweep();
    s.later(20 * DAY);
    await s.gw.sweep();
    expect([...s.objects.dump().keys()].filter((k) => k.startsWith('files/'))).toHaveLength(1);
  });
});
