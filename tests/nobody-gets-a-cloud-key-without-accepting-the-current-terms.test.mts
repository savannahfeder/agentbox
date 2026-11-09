// NOBODY GETS A CLOUD KEY WITHOUT ACCEPTING THE CURRENT TERMS.
//
// Codex's review of the cloud release (w-6633e825a7, 2026-10-20): the plan
// let people sign up and run in our cloud before any terms covered it, and
// with no record that they had agreed to anything. So the cloud server, not
// the Mac, holds the line: a cloud key is made only for someone who accepted
// the terms dated as the server's current version, the acceptance is kept on
// their record, and when the terms change every key of theirs stops working
// until they accept the new ones. A Mac cannot skip it by not drawing the
// step, because the server is what refuses.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { ROOMY_PLANS } from './fixtures/cloud-plans.mjs';

const A = '11111111-1111-4111-8111-111111111111';

function setup(termsVersion = '2026-10-20') {
  const objects = memoryObjects();
  const sent = [];
  const make = (version) => createGateway({
    agentcore: { async invoke(s, p) { sent.push(p); return { ok: true }; }, async stop() {} },
    links: { get: async (k) => k, put: async (k) => k, head: async (k) => k },
    removeObject: async () => {},
    objects,
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    plans: ROOMY_PLANS,
    now: () => Date.UTC(2026, 9, 20, 12),
    termsVersion: version,
  });
  let gw = make(termsVersion);
  const device = (body) => gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify(body) });
  const as = (key, method, path, body) => gw.handle({ method, path, headers: { authorization: `Bearer ${key}` }, body: body ? JSON.stringify(body) : '' });
  return { objects, sent, device, as, newTerms: (v) => { gw = make(v); } };
}

describe('getting a cloud key', () => {
  it('is refused without accepting the terms, or for terms that are not the current ones, and nothing is kept', async () => {
    const { device, objects } = setup();
    for (const body of [{}, { acceptedTerms: '2026-10-05' }, { acceptedTerms: true }, { acceptedTerms: '' }]) {
      const r = await device(body);
      expect(r.status, JSON.stringify(body)).toBe(403);
      expect(r.body).toMatchObject({ error: 'terms', terms: '2026-10-20' });
    }
    expect([...objects.dump().keys()]).toEqual([]);
  });

  it('with the current terms accepted, makes the key and keeps when they were accepted', async () => {
    const { device, objects, as } = setup();
    const r = await device({ acceptedTerms: '2026-10-20' });
    expect(r.status).toBe(200);
    expect(JSON.parse(objects.dump().get(`ledger/people/${A}.json`)).terms).toEqual({ version: '2026-10-20', at: Date.UTC(2026, 9, 20, 12) });
    expect((await as(r.body.key, 'GET', '/v1/me')).status).toBe(200);
  });

  it('a sign-in that is not one still gets nothing, whatever it accepted', async () => {
    const { as } = setup();
    const r = await as('made-up', 'POST', '/v1/devices', { acceptedTerms: '2026-10-20' });
    expect(r.status).toBe(401);
  });
});

describe('when the terms change', () => {
  // A run already going finishes and comes home: refusing its calls would
  // strand its work in the cloud. Only what begins something new waits.
  it('nothing new starts until the new terms are accepted, while a run already going finishes', async () => {
    const { device, as, newTerms, sent } = setup();
    const key = (await device({ acceptedTerms: '2026-10-20' })).body.key;
    await as(key, 'POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'start', runId: 'r1' } });
    newTerms('2026-12-01');
    const start = await as(key, 'POST', '/v1/invoke', { sessionId: 'run-2', payload: { action: 'start', runId: 'r2' } });
    expect(start.body).toMatchObject({ ok: false, error: 'terms', terms: '2026-12-01' });
    const signin = await as(key, 'POST', '/v1/invoke', { sessionId: 'agentbox-signin-claude-s1', payload: { action: 'signin', runId: 's1', engine: 'claude', saveUrl: 'agentbox-login:logins/claude/s1.json' } });
    expect(signin.body).toMatchObject({ ok: false, error: 'terms' });
    expect((await as(key, 'POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'events', runId: 'r1' } })).body.ok).toBe(true);
    expect((await as(key, 'POST', '/v1/link', { op: 'get', key: 'runs/r1/done.json' })).status).toBe(200);
    expect((await as(key, 'GET', '/v1/me')).body).toMatchObject({ terms: { accepted: '2026-10-20', current: '2026-12-01' } });
    expect(sent.map((p) => p.action)).toEqual(['start', 'events']);
    expect((await as(key, 'POST', '/v1/terms', { acceptedTerms: '2026-10-20' })).status).toBe(403);
    expect((await as(key, 'POST', '/v1/terms', { acceptedTerms: '2026-12-01' })).status).toBe(200);
    expect((await as(key, 'POST', '/v1/invoke', { sessionId: 'run-2', payload: { action: 'start', runId: 'r2' } })).body.ok).toBe(true);
  });

  it('a key that is not known cannot accept anything', async () => {
    const { as } = setup();
    expect((await as('abk_notakeynotakeynotakeynotakeynotakeynotakey', 'POST', '/v1/terms', { acceptedTerms: '2026-10-20' })).status).toBe(401);
  });
});
