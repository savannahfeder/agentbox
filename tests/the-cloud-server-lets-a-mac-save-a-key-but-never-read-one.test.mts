// THE CLOUD SERVER LETS A MAC SAVE A KEY, BUT NEVER READ ONE.
//
// Keys saved for cloud runs (main/cloud/keys.mts) live beside the sign-ins,
// under logins/, which the server refused to link for a Mac at all. So a Mac
// on the managed cloud could not save one, and a run's keys, named rather
// than linked, would have reached the sandbox as names it cannot fetch.
//
// Measured on the same server: the Codex sign-in a Claude run carries
// (`also`) was named and never linked either, so on the managed cloud Codex
// was signed out in every Claude run. Both are linked now, inside the start.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function setup() {
  const sent = [];
  const gw = createGateway({
    agentcore: { async invoke(sessionId, payload) { sent.push(payload); return { ok: true }; }, async stop() {} },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {},
    objects: memoryObjects(),
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => Date.UTC(2026, 10, 3, 12),
    plans: { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } },
  });
  let key;
  const call = async (method, path, body) => {
    if (!key) {
      key = (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
      await gw.admin({ do: 'plan', person: A, plan: 'test' });
    }
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}` }, body: body ? JSON.stringify(body) : '' });
  };
  return { sent, call };
}

describe('a key saved from a Mac', () => {
  it('may be written, in the person\'s own space', async () => {
    const { call } = setup();
    const out = await call('POST', '/v1/link', { op: 'put', key: 'logins/keys/0b7a9c1e-1111-4111-8111-111111111111.json' });
    expect(out.status).toBe(200);
    expect(out.body.url).toBe(`https://b/put/logins/u-${A}/keys/0b7a9c1e-1111-4111-8111-111111111111.json`);
  });

  it.each([
    ['read back', 'get', 'logins/keys/0b7a9c1e-1111-4111-8111-111111111111.json'],
    ['written over a sign-in', 'put', 'logins/claude/L1.json'],
    ['written under a name that is not a key', 'put', 'logins/keys/x.json'],
    ['written in a folder below the keys', 'put', 'logins/keys/a/0b7a9c1e-1111.json'],
  ])('may never be %s', async (_, op, key) => {
    const { call } = setup();
    const out = await call('POST', '/v1/link', { op, key });
    expect(out.status).toBe(403);
  });
});

describe('a run\'s start', () => {
  it('has each key and the carried Codex sign-in linked, in the person\'s own space', async () => {
    const { sent, call } = setup();
    await call('POST', '/v1/invoke', { sessionId: 'run-1', payload: {
      action: 'start', runId: 'r1',
      login: { engine: 'claude', id: 'L1', url: 'agentbox-login:logins/claude/L1.json' },
      also: [{ engine: 'codex', id: 'C1', url: 'agentbox-login:logins/codex/C1.json' }],
      keys: [{ name: 'SUPABASE_ACCESS_TOKEN', url: 'agentbox-login:logins/keys/k1-aaaaaaaa.json' }],
    } });
    const start = sent.find((p) => p.action === 'start');
    expect(start.also).toEqual([{ engine: 'codex', id: 'C1', url: `https://b/get/logins/u-${A}/codex/C1.json` }]);
    expect(start.keys).toEqual([{ name: 'SUPABASE_ACCESS_TOKEN', url: `https://b/get/logins/u-${A}/keys/k1-aaaaaaaa.json` }]);
  });

  it('leaves out a key named as a plain link or outside logins, and still starts', async () => {
    const { sent, call } = setup();
    const out = await call('POST', '/v1/invoke', { sessionId: 'run-1', payload: {
      action: 'start', runId: 'r1',
      login: { engine: 'claude', id: 'L1', url: 'agentbox-login:logins/claude/L1.json' },
      keys: [
        { name: 'A_KEY', url: `https://b/get/logins/u-${B}/keys/theirs.json` },
        { name: 'B_KEY', url: 'agentbox-login:runs/r1/out.bundle' },
        { name: 'C_KEY', url: 'agentbox-login:logins/keys/k2-bbbbbbbb.json' },
      ],
    } });
    expect(out.body.ok).toBe(true);
    expect(sent.find((p) => p.action === 'start').keys.map((k) => k.name)).toEqual(['C_KEY']);
  });
});

// A key the person allows while a run waits (main/cloud/key-asks.mts) goes as
// a file delivery to a run already going. Stand-in power test, 2026-11-08: it
// reached the sandbox as a bare name, and the run said the key "did not reach
// this machine".
describe('a key handed to a run while it goes', () => {
  const hand = (url, key = 'POSTHOG_PERSONAL_KEY') => ({ sessionId: 'run-1', payload: { action: 'files', resource: true, runId: 'r1', n: 3, files: [{ key, url, path: `/tmp/agentbox-resources/x/keys/${key}` }] } });
  async function going() {
    const s = setup();
    await s.call('POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'start', runId: 'r1', login: { engine: 'claude', id: 'L1', url: 'agentbox-login:logins/claude/L1.json' } } });
    s.sent.length = 0;
    return s;
  }

  it('is linked in the person\'s own space, like a run\'s keys at its start', async () => {
    const { sent, call } = await going();
    await call('POST', '/v1/invoke', hand('agentbox-login:logins/keys/0b7a9c1e-1111-4111-8111-111111111111.json'));
    expect(sent.at(-1).files).toEqual([{ key: 'POSTHOG_PERSONAL_KEY', url: `https://b/get/logins/u-${A}/keys/0b7a9c1e-1111-4111-8111-111111111111.json`, path: '/tmp/agentbox-resources/x/keys/POSTHOG_PERSONAL_KEY' }]);
  });

  it('is never a sign-in, a plain link or anything outside the saved keys', async () => {
    for (const url of ['agentbox-login:logins/claude/L1.json', `https://b/get/logins/u-${B}/keys/theirs.json`, 'agentbox-login:runs/r1/out.bundle']) {
      const { sent, call } = await going();
      const out = await call('POST', '/v1/invoke', hand(url));
      expect(out.status).toBe(400);
      expect(sent).toEqual([]);
    }
  });

  it('leaves every other file delivery as it was', async () => {
    const { sent, call } = await going();
    const files = [{ path: '/tmp/agentbox-resources/x/abc/notes.md', url: 'https://b/get/cache/abc' }];
    await call('POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'files', resource: true, runId: 'r1', n: 1, files } });
    expect(sent.at(-1).files).toEqual(files);
  });
});
