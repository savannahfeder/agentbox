// ONE PERSON'S CLOUD RUNS ARE OUT OF EVERY OTHER PERSON'S REACH.
//
// Until 2026-10-19 the cloud ran only in its owner's AWS account, so every
// session and every object in it was hers. Releasing it to other people
// (w-6633e825a7) puts everyone's runs, code and Claude sign-ins in one
// account behind one server (cloud/gateway/). A session id or an object key
// that one person could name for another would hand over that person's code,
// their running agent's input, or their Claude sign-in. And a sign-in the Mac
// could read would break Anthropic's rule that a platform never holds one.
//
// So: the server puts the person in every key and every session it passes on,
// refuses names that could climb out of their own space, never gives a Mac a
// link that reads a sign-in, and answers nobody who has not signed in.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { ROOMY_PLANS } from './fixtures/cloud-plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function setup() {
  const sent = [];
  const removed = [];
  const objects = memoryObjects();
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) { sent.push({ sessionId, payload }); return { ok: true }; },
      async stop(sessionId) { sent.push({ sessionId, stop: true }); },
    },
    links: {
      get: async (k) => `https://bucket.test/${k}?read`,
      put: async (k) => `https://bucket.test/${k}?write`,
      head: async (k) => `https://bucket.test/${k}?look`,
    },
    removeObject: async (k) => { removed.push(k); },
    objects,
    whoIs: async (token) => ({ 'session-of-a': { id: A, email: 'a@example.com' }, 'session-of-b': { id: B, email: 'b@example.com' } })[token] ?? null,
    plans: ROOMY_PLANS,
  });
  const call = async (method, path, { key, body } = {}) => gw.handle({ method, path, headers: key ? { authorization: `Bearer ${key}` } : {}, body: body ? JSON.stringify(body) : '' });
  const keyFor = async (session) => (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: `Bearer ${session}` }, body: JSON.stringify({ name: 'Mac', acceptedTerms: TERMS_VERSION }) })).body.key;
  return { gw, objects, sent, removed, call, keyFor };
}

describe('who may use the cloud server', () => {
  it('a signed-in person gets a cloud key, and a session it does not know gets nothing', async () => {
    const { gw, keyFor } = setup();
    const key = await keyFor('session-of-a');
    expect(key).toMatch(/^abk_[A-Za-z0-9_-]{40,}$/);
    const refused = await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer made-up' }, body: '{}' });
    expect(refused.status).toBe(401);
    const none = await gw.handle({ method: 'POST', path: '/v1/devices', headers: {}, body: '{}' });
    expect(none.status).toBe(401);
  });

  it('no key, a made-up key or a revoked key is answered 401 and reaches nothing', async () => {
    const { call, sent, keyFor } = setup();
    expect((await call('POST', '/v1/invoke', { body: { sessionId: 's1', payload: { action: 'status' } } })).status).toBe(401);
    expect((await call('POST', '/v1/invoke', { key: 'abk_madeupmadeupmadeupmadeupmadeupmadeupmadeup', body: { sessionId: 's1', payload: { action: 'status' } } })).status).toBe(401);
    const key = await keyFor('session-of-a');
    expect((await call('DELETE', '/v1/devices', { key })).status).toBe(200);
    expect((await call('POST', '/v1/invoke', { key, body: { sessionId: 's1', payload: { action: 'status' } } })).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it('the cloud key is kept only as a hash', async () => {
    const { objects, keyFor } = setup();
    const key = await keyFor('session-of-a');
    const stored = JSON.stringify([...objects.dump().entries()]);
    expect(stored).toContain('ledger/devices/');
    expect(stored).not.toContain(key.slice(4));
  });
});

describe('sessions', () => {
  it('two people naming the same session reach two different sessions, each carrying its owner', async () => {
    const { call, sent, keyFor } = setup();
    const a = await keyFor('session-of-a');
    const b = await keyFor('session-of-b');
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'agentbox-w-1-run1', payload: { action: 'start', runId: 'run1' } } });
    await call('POST', '/v1/invoke', { key: b, body: { sessionId: 'agentbox-w-1-run1', payload: { action: 'start', runId: 'run1' } } });
    await call('POST', '/v1/stop', { key: b, body: { sessionId: 'agentbox-w-1-run1' } });
    expect(sent.map((s) => s.sessionId)).toEqual([`u-${A}-agentbox-w-1-run1`, `u-${B}-agentbox-w-1-run1`, `u-${B}-agentbox-w-1-run1`]);
  });

  // Review, 2026-10-20: AgentCore makes a machine for any session id it is
  // asked about, so a call to a session nobody started was a free machine.
  it('a call to a session that was never started, or has ended, starts no machine', async () => {
    const { call, sent, keyFor } = setup();
    const a = await keyFor('session-of-a');
    for (const action of ['events', 'stdin', 'status', 'collect', 'mcp']) {
      const r = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'never-started', payload: { action, runId: 'r1' } } });
      expect(r.body, action).toMatchObject({ ok: false, error: 'no-run' });
    }
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'start', runId: 'r1' } } });
    await call('POST', '/v1/stop', { key: a, body: { sessionId: 'run-1' } });
    const after = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'events', runId: 'r1' } } });
    expect(after.body).toMatchObject({ ok: false, error: 'no-run' });
    expect(sent.filter((s) => !s.stop).map((s) => s.payload.action)).toEqual(['start']);
  });

  it('a live session takes its own calls', async () => {
    const { call, sent, keyFor } = setup();
    const a = await keyFor('session-of-a');
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'start', runId: 'r1' } } });
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'events', runId: 'r1' } } });
    expect(sent.map((s) => s.payload.action)).toEqual(['start', 'events']);
  });

  // Review, 2026-10-20: a sign-in counts against nothing, so a run started
  // on a sign-in's session used to be counted against nothing too.
  it('a sign-in\'s session cannot be turned into a run, and a live run cannot start another', async () => {
    const { call, sent, keyFor } = setup();
    const a = await keyFor('session-of-a');
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'agentbox-signin-claude-s1', payload: { action: 'signin', runId: 's1', engine: 'claude', saveUrl: 'agentbox-login:logins/claude/s1.json' } } });
    const turned = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'agentbox-signin-claude-s1', payload: { action: 'start', runId: 's1' } } });
    expect(turned.body).toMatchObject({ ok: false, error: 'busy' });
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'start', runId: 'r1' } } });
    const second = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'start', runId: 'r2' } } });
    expect(second.body).toMatchObject({ ok: false, error: 'busy' });
    // The same start asked again still goes through: its first answer may have been lost.
    expect((await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'start', runId: 'r1' } } })).body.ok).toBe(true);
    expect(sent.map((s) => s.payload.action)).toEqual(['signin', 'start', 'start']);
  });

  it('a session name that is not plain letters, digits and dashes is refused', async () => {
    const { call, sent, keyFor } = setup();
    const a = await keyFor('session-of-a');
    for (const sessionId of ['', '../x', `u-${B}/x`, 'a b', 'x'.repeat(181)]) {
      const r = await call('POST', '/v1/invoke', { key: a, body: { sessionId, payload: { action: 'status' } } });
      expect(r.status, sessionId).toBe(400);
    }
    expect(sent).toEqual([]);
    // The longest allowed name still goes through.
    expect((await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'x'.repeat(180), payload: { action: 'start', runId: 'r1' } } })).body.ok).toBe(true);
  });
});

describe('objects', () => {
  it('a key is stored under its owner, for reading and writing alike', async () => {
    const { call, keyFor } = setup();
    const a = await keyFor('session-of-a');
    const put = await call('POST', '/v1/link', { key: a, body: { op: 'put', key: 'runs/run1/in.bundle' } });
    const get = await call('POST', '/v1/link', { key: a, body: { op: 'get', key: 'runs/run1/in.bundle' } });
    expect(put.body.url).toBe(`https://bucket.test/runs/u-${A}/run1/in.bundle?write`);
    expect(get.body.url).toBe(`https://bucket.test/runs/u-${A}/run1/in.bundle?read`);
  });

  it('naming another person\'s folder only reaches a folder inside your own', async () => {
    const { call, keyFor } = setup();
    const b = await keyFor('session-of-b');
    const r = await call('POST', '/v1/link', { key: b, body: { op: 'get', key: `runs/u-${A}/run1/in.bundle` } });
    expect(r.body.url).toBe(`https://bucket.test/runs/u-${B}/u-${A}/run1/in.bundle?read`);
  });

  it('a key that climbs, starts elsewhere or is not a run\'s or a sign-in\'s is refused', async () => {
    const { call, keyFor, removed } = setup();
    const b = await keyFor('session-of-b');
    for (const key of ['runs/../ledger/people/x.json', 'runs/./x', '/runs/x', 'runs//x', 'ledger/people/x.json', 'build/source.zip', 'runs/x?y', 'runs/x\\y', 'runs/', 'runs']) {
      expect((await call('POST', '/v1/link', { key: b, body: { op: 'put', key } })).status, key).toBe(400);
      expect((await call('POST', '/v1/delete', { key: b, body: { key } })).status, key).toBe(400);
    }
    expect(removed).toEqual([]);
  });

  it('deleting removes only from your own space', async () => {
    const { call, keyFor, removed } = setup();
    const b = await keyFor('session-of-b');
    await call('POST', '/v1/delete', { key: b, body: { key: 'logins/claude/L1.json' } });
    expect(removed).toEqual([`logins/u-${B}/claude/L1.json`]);
  });
});

describe('a Claude or Codex sign-in kept in the cloud', () => {
  // Second review, 2026-10-20: a put link to a sign-in, or a sign-in's save
  // link pointed at runs/, let a Mac have a sign-in written where it could
  // read it. Only the sandbox writes one, on a link the server makes.
  it('can be looked for from a Mac, but never read or written there', async () => {
    const { call, keyFor } = setup();
    const a = await keyFor('session-of-a');
    expect((await call('POST', '/v1/link', { key: a, body: { op: 'head', key: 'logins/claude/L1.json' } })).body.url).toBe(`https://bucket.test/logins/u-${A}/claude/L1.json?look`);
    for (const op of ['get', 'put']) {
      const r = await call('POST', '/v1/link', { key: a, body: { op, key: 'logins/claude/L1.json' } });
      expect(r.status, op).toBe(403);
      expect(JSON.stringify(r.body)).not.toContain('bucket.test');
    }
  });

  it('a sign-in is saved on a writing link the server makes from its name, and only there', async () => {
    const { call, sent, keyFor } = setup();
    const a = await keyFor('session-of-a');
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'agentbox-signin-claude-s1', payload: { action: 'signin', runId: 's1', engine: 'claude', saveUrl: 'agentbox-login:logins/claude/s1.json' } } });
    expect(sent[0].payload.saveUrl).toBe(`https://bucket.test/logins/u-${A}/claude/s1.json?write`);
    for (const saveUrl of ['https://elsewhere.test/x', 'agentbox-login:runs/r1/readable.json']) {
      const r = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'agentbox-signin-claude-s2', payload: { action: 'signin', runId: 's2', engine: 'claude', saveUrl } } });
      expect(r.status, saveUrl).toBe(400);
    }
    expect(sent).toHaveLength(1);
  });

  it('reaches the sandbox as a reading link, swapped in by the server, for its owner\'s copy only', async () => {
    const { call, sent, keyFor } = setup();
    const a = await keyFor('session-of-a');
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'start', runId: 'r1', login: { engine: 'claude', id: 'L1', url: 'agentbox-login:logins/claude/L1.json' } } } });
    expect(sent[0].payload.login.url).toBe(`https://bucket.test/logins/u-${A}/claude/L1.json?read`);
    await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'look-1', payload: { action: 'look', runId: 'look-1', engine: 'claude', loginUrl: 'agentbox-login:logins/claude/L1.json' } } });
    expect(sent[1].payload.loginUrl).toBe(`https://bucket.test/logins/u-${A}/claude/L1.json?read`);
  });

  it('a real link, or a name outside the sign-ins, in a sign-in field is refused', async () => {
    const { call, sent, keyFor } = setup();
    const a = await keyFor('session-of-a');
    for (const url of ['https://elsewhere.test/x', 'agentbox-login:runs/r1/in.bundle', 'agentbox-login:logins/../runs/x']) {
      const r = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'run-1', payload: { action: 'start', runId: 'r1', login: { engine: 'claude', id: 'L1', url } } } });
      expect(r.status, url).toBe(400);
      const look = await call('POST', '/v1/invoke', { key: a, body: { sessionId: 'look-1', payload: { action: 'renew', runId: 'x', engine: 'codex', loginUrl: url } } });
      expect(look.status, url).toBe(400);
    }
    expect(sent).toEqual([]);
  });
});
