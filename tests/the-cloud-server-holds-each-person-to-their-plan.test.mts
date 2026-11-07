// THE CLOUD SERVER HOLDS EACH PERSON TO THEIR PLAN.
//
// The cloud is sold as extra agents running at once, with a monthly hour
// limit behind each plan, and a free 5 hours (docs/cloud/PLAN.md, Plans). In
// the owner's own AWS account nothing needed holding: the bill was hers.
// Once strangers run in our account (w-6633e825a7), every machine they start
// is ours to pay for, and a free machine with root and a network is what
// people mine on. So the server, not the Mac, counts: how many agents are
// running, how long each ran, and when a run has ended. The Mac chooses where
// a run reports its end, so a run that never reports one is charged the
// whole 8 hours AgentCore allows it, never nothing.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const HOUR = 60 * 60_000;

// Nothing runs without a plan, and the paid plans' hours are not set yet
// (plans.mjs): a small test plan, which each person here is put on, and a
// pro plan with hours stand in for them.
const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 }, pro: { agents: 10, hoursPerMonth: 100 } };

function setup({ startAnswer = { ok: true }, answer = () => ({ ok: true }), plans = SET } = {}) {
  let clock = Date.UTC(2026, 9, 19, 12, 0, 0);
  const sent = [];
  const objects = memoryObjects();
  const ctl = { gate: null, stopFails: 0, stopGone: 0 };
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        sent.push({ sessionId, payload });
        if (payload.action === 'start' && ctl.gate) await ctl.gate;
        if (payload.action === 'start' && startAnswer instanceof Error) throw startAnswer;
        return payload.action === 'start' ? startAnswer : answer(payload);
      },
      async stop(sessionId) {
        if (ctl.stopFails > 0) { ctl.stopFails -= 1; throw new Error('AgentCore is not answering'); }
        if (ctl.stopGone > 0) { ctl.stopGone -= 1; throw Object.assign(new Error('no such session'), { name: 'ResourceNotFoundException', $metadata: { httpStatusCode: 404 } }); }
        sent.push({ sessionId, stop: true });
      },
    },
    links: { get: async (k) => `https://b/${k}`, put: async (k) => `https://b/${k}`, head: async (k) => `https://b/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => clock,
    plans,
  });
  let key;
  const call = async (method, path, body) => {
    if (!key) {
      key = (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
      if (plans.test) await gw.admin({ do: 'plan', person: A, plan: 'test' });
    }
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}` }, body: body ? JSON.stringify(body) : '' });
  };
  const start = (n, extra = {}) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}`, ...extra } });
  const poll = (n) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'events', runId: `r${n}`, since: 0 } });
  const signin = (n) => call('POST', '/v1/invoke', { sessionId: `agentbox-signin-claude-s${n}`, payload: { action: 'signin', runId: `s${n}`, engine: 'claude', saveUrl: `agentbox-login:logins/claude/s${n}.json` } });
  const finish = (n) => gw.objectCreated(`runs/u-${A}/r${n}/done.json`);
  const me = async () => (await call('GET', '/v1/me')).body;
  const stopped = () => sent.filter((s) => s.stop).map((s) => s.sessionId);
  const runs = () => [...objects.dump().entries()].filter(([k]) => k.startsWith(`ledger/runs/${A}/`)).map(([, v]) => JSON.parse(v));
  return { gw, objects, sent, ctl, call, start, poll, signin, finish, me, stopped, runs, tick: (ms) => { clock += ms; } };
}

describe('agents running at once', () => {
  it('free runs its agents up to its number and refuses the next, saying why', async () => {
    const { start, sent } = setup();
    const n = SET.test.agents;
    for (let i = 1; i <= n; i += 1) expect((await start(i)).body.ok).toBe(true);
    const over = await start(n + 1);
    expect(over.status).toBe(200);
    expect(over.body).toMatchObject({ ok: false, error: 'agents' });
    expect(over.body.message).toMatch(new RegExp(`${n}`));
    expect(sent.filter((s) => s.payload?.action === 'start')).toHaveLength(n);
  });

  it('a start asked again, because its answer was lost, is one agent, not two', async () => {
    const { start, me } = setup();
    await start(1); await start(1); await start(1);
    expect((await me()).running).toBe(1);
  });

  it('a run whose done.json lands frees its place and is charged the time it ran', async () => {
    const { start, finish, me, tick } = setup();
    for (let i = 1; i <= SET.test.agents; i += 1) await start(i);
    tick(30 * 60_000);
    await finish(1);
    const now = await me();
    expect(now.running).toBe(SET.test.agents - 1);
    expect(now.usedSeconds).toBe(30 * 60);
    expect((await start(9)).body.ok).toBe(true);
  });

  it('a done.json for a run the person never started, or in someone else\'s space, changes nothing', async () => {
    const { gw, start, me } = setup();
    await start(1);
    await gw.objectCreated(`runs/u-${A}/r-unknown/done.json`);
    await gw.objectCreated('runs/u-22222222-2222-4222-8222-222222222222/r1/done.json');
    await gw.objectCreated(`runs/u-${A}/r1/events.jsonl`);
    expect((await me()).running).toBe(1);
  });

  it('stopping a run ends it and charges it', async () => {
    const { call, start, me, tick, sent } = setup();
    await start(1);
    tick(10 * 60_000);
    await call('POST', '/v1/stop', { sessionId: 'run-1' });
    expect(sent.at(-1)).toEqual({ sessionId: `u-${A}-run-1`, stop: true });
    expect(await me()).toMatchObject({ running: 0, usedSeconds: 600 });
  });

  it('a run nothing ended is ended at 8 hours and charged all 8', async () => {
    const { gw, start, me, tick } = setup();
    // On a plan with more than 8 hours, so the ceiling ends it, not the hours.
    await me();
    await gw.admin({ do: 'plan', person: A, plan: 'pro' });
    await start(1);
    tick(8 * HOUR - 1000);
    expect((await me()).running).toBe(1);
    tick(2 * HOUR);
    expect(await me()).toMatchObject({ running: 0, usedSeconds: 8 * 3600 });
  });

  // Review, 2026-10-20: the Mac holds a link that writes its run's done.json,
  // so a run could be marked ended while its machine kept going, unmetered.
  // Whatever ends a run's metering now ends its machine too.
  it('every way a run ends also stops its machine', async () => {
    const { start, finish, signin, tick, me, stopped } = setup();
    await start(1);
    await finish(1);
    expect(stopped()).toEqual([`u-${A}-run-1`]);
    await start(2);
    await signin(1);
    tick(31 * 60_000);
    await me();
    expect(stopped()).toContain(`u-${A}-agentbox-signin-claude-s1`);
    tick(8 * HOUR);
    await me();
    expect(stopped()).toContain(`u-${A}-run-2`);
  });

  it('a start the sandbox refused, or that failed, takes no place and costs nothing', async () => {
    for (const answer of [{ ok: false, error: 'busy' }, new Error('network')]) {
      const { start, me } = setup({ startAnswer: answer });
      await start(1).catch(() => {});
      expect(await me()).toMatchObject({ running: 0, usedSeconds: 0 });
    }
  });

  it('a paid plan runs its own number', async () => {
    const { gw, start, me } = setup();
    await me();
    await gw.admin({ do: 'plan', person: A, plan: 'pro' });
    for (let i = 1; i <= SET.pro.agents; i += 1) expect((await start(i)).body.ok, `run ${i}`).toBe(true);
    expect((await start(SET.pro.agents + 1)).body.error).toBe('agents');
  });

  it('an unknown plan name is refused rather than given anything', async () => {
    const { gw } = setup();
    await expect(gw.admin({ do: 'plan', person: A, plan: 'unlimited' })).rejects.toThrow(/plan/);
  });

  it('two starts racing for the last place: one wins, the other is refused', async () => {
    const { start, me } = setup();
    for (let i = 1; i < SET.test.agents; i += 1) await start(i);
    const [x, y] = await Promise.all([start(50), start(51)]);
    expect([x.body.ok, y.body.ok].sort()).toEqual([false, true]);
    expect((await me()).running).toBe(SET.test.agents);
  });
});

describe('hours in a month', () => {
  it('free stops at its hours: just under, a run starts; at the limit, it is refused', async () => {
    const { start, finish, tick } = setup();
    const limit = SET.test.hoursPerMonth * 3600;
    await start(1);
    tick((limit - 60) * 1000);
    await finish(1);
    expect((await start(2)).body.ok).toBe(true);
    tick(60 * 1000);
    await finish(2);
    const refused = await start(3);
    expect(refused.body).toMatchObject({ ok: false, error: 'hours' });
  });

  it('time a run is still running counts against the hours', async () => {
    const { start, tick } = setup();
    await start(1);
    tick(SET.test.hoursPerMonth * HOUR);
    expect((await start(2)).body.error).toBe('hours');
  });

  it('a new month starts again from nothing', async () => {
    const { start, finish, tick, me } = setup();
    await start(1);
    tick(SET.test.hoursPerMonth * HOUR);
    await finish(1);
    tick(14 * 24 * HOUR);
    expect((await me()).usedSeconds).toBe(0);
    expect((await start(2)).body.ok).toBe(true);
  });
});

describe('signing in', () => {
  // 30 minutes, not the sandbox's 20: checking the new sign-in takes up to
  // 4 more, and a code pasted late must not find its session gone.
  it('takes no agent and no hours, three at once at most, each ended after 30 minutes', async () => {
    const { start, signin, tick, me, stopped } = setup();
    for (let i = 1; i <= SET.test.agents; i += 1) await start(i);
    for (let i = 1; i <= 3; i += 1) expect((await signin(i)).body.ok).toBe(true);
    expect((await signin(4)).body.error).toBe('signins');
    tick(29 * 60_000);
    expect((await signin(4)).body.error).toBe('signins');
    expect(stopped()).toEqual([]);
    tick(2 * 60_000);
    expect((await signin(5)).body.ok).toBe(true);
    expect((await me()).usedSeconds).toBe(0);
  });
});

// The owner's call, 2026-10-20 (w-6633e825a7): no free cloud hours. Five
// hours go in half an hour with ten agents, which sells the cloud short, and
// the moment someone reaches for the cloud is the moment they will pay. The
// app itself is the free part.
describe('someone with no plan', () => {
  it('is asked to choose a plan before any run starts, and nothing is started', async () => {
    const { gw, sent } = setup();
    const key = (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    const r = await gw.handle({ method: 'POST', path: '/v1/invoke', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ sessionId: 'run-1', payload: { action: 'start', runId: 'r1' } }) });
    expect(r.body).toMatchObject({ ok: false, error: 'plan' });
    expect(sent).toEqual([]);
    const me = await gw.handle({ method: 'GET', path: '/v1/me', headers: { authorization: `Bearer ${key}` } });
    expect(me.body).toMatchObject({ plan: 'none', agents: 0, hoursPerMonth: 0 });
  });

  it('can still sign in Claude or Codex, so the cloud is ready the moment they pay', async () => {
    const { gw, sent } = setup();
    const key = (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).body.key;
    const r = await gw.handle({ method: 'POST', path: '/v1/invoke', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ sessionId: 'agentbox-signin-claude-s1', payload: { action: 'signin', runId: 's1', engine: 'claude', saveUrl: 'agentbox-login:logins/claude/s1.json' } }) });
    expect(r.body.ok).toBe(true);
    expect(sent.map((s) => s.payload?.action)).toEqual(['signin']);
  });

  it('the real plans have no free cloud', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['max', 'none', 'plus', 'pro']);
    expect(PLANS.none).toEqual({ agents: 0, hoursPerMonth: 0 });
  });

  // The owner's numbers, 2026-10-20: Pro 400, Plus 1,200, Max 3,000, so each
  // step up gives more hours a dollar (10, 12, 15), against a measured $0.07
  // an agent-hour.
  it('the paid plans carry the owner\'s hours, so each one can be given', async () => {
    expect([PLANS.pro.hoursPerMonth, PLANS.plus.hoursPerMonth, PLANS.max.hoursPerMonth]).toEqual([400, 1200, 3000]);
    const { gw } = setup({ plans: PLANS });
    for (const plan of ['pro', 'plus', 'max']) await gw.admin({ do: 'plan', person: A, plan });
  });
});

// The owner, 2026-10-20: Max runs unlimited agents at once. The hours already
// bound what it costs; a ceiling of 200, never shown, keeps one runaway loop
// from taking the AWS session limit every customer shares.
describe('Max runs unlimited agents at once', () => {
  async function onMax() {
    const s = setup({ plans: PLANS });
    await s.me();
    await s.gw.admin({ do: 'plan', person: A, plan: 'max' });
    return s;
  }

  it('says unlimited, and never shows the ceiling', async () => {
    const { me } = await onMax();
    const said = await me();
    expect(said).toMatchObject({ plan: 'max', unlimited: true, agents: null, hoursPerMonth: 3000 });
    expect(JSON.stringify(said)).not.toMatch(/200/);
  });

  it('starts the 200th agent and refuses the 201st, saying why', async () => {
    const { start, sent } = await onMax();
    for (let i = 1; i <= 200; i += 1) expect((await start(i)).body.ok).toBe(true);
    const over = await start(201);
    expect(over.body).toMatchObject({ ok: false, error: 'agents' });
    expect(over.body.message).not.toMatch(/of your/);
    expect(over.body.message).toMatch(/200/);
    expect(sent.filter((s) => s.payload?.action === 'start')).toHaveLength(200);
  });

  it('a counted plan still says its number and is not unlimited', async () => {
    const s = setup({ plans: PLANS });
    await s.me();
    await s.gw.admin({ do: 'plan', person: A, plan: 'pro' });
    expect(await s.me()).toMatchObject({ plan: 'pro', unlimited: false, agents: 10 });
  });
});

describe('what the person is told', () => {
  it('names the plan, its agents and hours, and what is used', async () => {
    const { start, me } = setup();
    await start(1);
    expect(await me()).toEqual({ plan: 'test', unlimited: false, agents: SET.test.agents, hoursPerMonth: SET.test.hoursPerMonth, running: 1, usedSeconds: 0, month: '2026-10', billing: 'given', terms: { accepted: TERMS_VERSION, current: TERMS_VERSION } });
  });
});

// Second review, 2026-10-20 (w-6633e825a7). Each of these let a machine run
// that nothing counted, charged a run it should not have, or left no way to
// stop someone.
describe('a stop or a finish that lands while a start is on its way', () => {
  it('still stops the machine the start makes, and leaves nothing counted', async () => {
    const { start, call, ctl, stopped, me } = setup();
    let open;
    ctl.gate = new Promise((r) => { open = r; });
    const starting = start(1);
    await new Promise((r) => setTimeout(r, 5));
    await call('POST', '/v1/stop', { sessionId: 'run-1' });
    open();
    await starting;
    expect(stopped().filter((s) => s === `u-${A}-run-1`).length).toBeGreaterThanOrEqual(2);
    expect(stopped().at(-1)).toBe(`u-${A}-run-1`);
    expect((await me()).running).toBe(0);
  });

  it('a start nothing interrupted is left running', async () => {
    const { start, stopped, me } = setup();
    await start(1);
    expect(stopped()).toEqual([]);
    expect((await me()).running).toBe(1);
  });
});

describe('a run that fails', () => {
  it('is ended, stopped and charged only its time, the moment the sandbox says so', async () => {
    let failed = false;
    const { start, poll, tick, stopped, me } = setup({ answer: (p) => (p.action === 'events' && failed ? { ok: true, events: [{ seq: 3, kind: 'state', state: 'failed', error: 'no login' }] } : { ok: true, events: [] }) });
    await start(1);
    tick(60_000);
    await poll(1);
    expect((await me()).running).toBe(1);
    failed = true;
    await poll(1);
    expect(stopped()).toEqual([`u-${A}-run-1`]);
    expect(await me()).toMatchObject({ running: 0, usedSeconds: 60 });
  });

  it('a status saying failed counts the same, and one saying it is still going does not', async () => {
    let state = 'running';
    const { start, call, stopped } = setup({ answer: (p) => (p.action === 'status' ? { ok: true, runId: 'r1', state } : { ok: true }) });
    await start(1);
    await call('POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'status', runId: 'r1' } });
    expect(stopped()).toEqual([]);
    state = 'failed';
    await call('POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'status', runId: 'r1' } });
    expect(stopped()).toEqual([`u-${A}-run-1`]);
  });

  it('"exited" is not the end: the sandbox is still saving the results', async () => {
    const { start, poll, stopped } = setup({ answer: () => ({ ok: true, events: [{ seq: 4, kind: 'state', state: 'exited' }, { seq: 5, kind: 'state', state: 'collected' }] }) });
    await start(1);
    await poll(1);
    expect(stopped()).toEqual([]);
  });
});

describe('hours that run out while runs are going', () => {
  it('end every run at the next call, not only at the next start', async () => {
    const { start, finish, poll, tick, stopped, me } = setup();
    const limit = SET.test.hoursPerMonth * HOUR;
    await start(1);
    tick(limit - 60_000);
    await finish(1);
    await start(2); await start(3);
    // Two runs for 20 s each: 40 s of the 60 left.
    tick(20_000);
    await poll(2);
    expect(stopped()).not.toContain(`u-${A}-run-2`);
    tick(60_000);
    await poll(2);
    expect(stopped()).toEqual(expect.arrayContaining([`u-${A}-run-2`, `u-${A}-run-3`]));
    expect((await me()).running).toBe(0);
  });
});

describe('the sweep, which runs on a clock whether anyone calls or not', () => {
  it('ends runs past their ceiling or past the hours, and runs whose done.json landed unnoticed', async () => {
    const { gw, objects, start, tick, stopped, me } = setup({ plans: { ...SET, test: { agents: 3, hoursPerMonth: 5 } } });
    await start(1); await start(2);
    await objects.put(`runs/u-${A}/r1/done.json`, '{}');
    tick(3 * 60_000);
    await gw.sweep();
    expect(stopped()).toEqual([`u-${A}-run-1`]);
    tick(5 * HOUR);
    await gw.sweep();
    expect(stopped()).toContain(`u-${A}-run-2`);
    expect((await me()).running).toBe(0);
  });

  it('retries a stop AWS did not take, until it does', async () => {
    const { gw, start, finish, ctl, stopped } = setup();
    await start(1);
    ctl.stopFails = 1;
    await finish(1);
    expect(stopped()).toEqual([]);
    await gw.sweep();
    expect(stopped()).toEqual([`u-${A}-run-1`]);
    await gw.sweep();
    expect(stopped()).toEqual([`u-${A}-run-1`]);
  });
});

describe('plans that are not ready', () => {
  it('a plan whose hours are not set cannot be given to anyone', async () => {
    const { gw } = setup({ plans: PLANS });
    if (PLANS.pro.hoursPerMonth == null) await expect(gw.admin({ do: 'plan', person: A, plan: 'pro' })).rejects.toThrow(/hours/);
    await gw.admin({ do: 'plan', person: A, plan: 'none' });
  });
});

describe('stopping one person', () => {
  it('a person turned off is refused everywhere, every key of theirs, and their runs stop', async () => {
    const { gw, start, call, stopped } = setup();
    await start(1);
    await gw.admin({ do: 'disable', person: A });
    expect(stopped()).toEqual([`u-${A}-run-1`]);
    for (const [m, p, b] of [['GET', '/v1/me'], ['POST', '/v1/invoke', { sessionId: 'run-2', payload: { action: 'start', runId: 'r2' } }], ['POST', '/v1/link', { op: 'put', key: 'runs/x' }]]) {
      expect((await call(m, p, b)).status, p).toBe(403);
    }
    // Signing in again gets no new key either.
    expect((await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) })).status).toBe(403);
    await gw.admin({ do: 'enable', person: A });
    expect((await call('GET', '/v1/me')).status).toBe(200);
  });
});

describe('the whole cloud', () => {
  it('a pause refuses every new run, and lets running ones and sign-ins carry on', async () => {
    const { gw, start, poll, signin } = setup();
    await start(1);
    await gw.admin({ do: 'pause' });
    expect((await start(2)).body).toMatchObject({ ok: false, error: 'paused' });
    expect((await poll(1)).body.ok).toBe(true);
    expect((await signin(1)).body.ok).toBe(true);
    await gw.admin({ do: 'resume' });
    expect((await start(2)).body.ok).toBe(true);
  });
});

describe('what each run cost', () => {
  it('is kept, one record per run, with how it ended', async () => {
    const { start, finish, call, tick, runs } = setup();
    await start(1);
    tick(90_000);
    await finish(1);
    await start(2);
    tick(30_000);
    await call('POST', '/v1/stop', { sessionId: 'run-2' });
    expect(runs().map((r) => [r.sessionId, r.runId, r.seconds, r.why]).sort()).toEqual([['run-1', 'r1', 90, 'done'], ['run-2', 'r2', 30, 'stopped']]);
  });
});

// Re-review, 2026-10-20: the sweep stopped at the first person whose run had
// no done.json yet (S3 answers 403 there, not 404), a stop of a session that
// no longer existed was retried for ever, and a failed run's last page of
// output could be cut off.
describe('the sweep, when things go wrong', () => {
  it('one person it cannot read does not stop it reaching the rest', async () => {
    const { gw, objects, start, tick, stopped } = setup({ plans: { ...SET, test: { agents: 3, hoursPerMonth: 5 } } });
    await start(1);
    const head = objects.head;
    objects.head = async (k) => { if (k.includes('/r1/')) throw Object.assign(new Error('Forbidden'), { $metadata: { httpStatusCode: 403 } }); return head(k); };
    const other = '99999999-9999-4999-8999-999999999999';
    await objects.put(`ledger/people/${other}.json`, JSON.stringify({ plan: 'test', live: { 'run-x': { kind: 'run', runId: 'rx', at: 0, nonce: 'n' } }, used: {}, stopping: [] }));
    tick(3 * 60_000);
    await gw.sweep();
    expect(stopped()).toContain(`u-${other}-run-x`);
  });

  it('a person whose record it cannot write is passed, and the sweep finishes', async () => {
    const { gw, objects, start, tick, stopped } = setup();
    await start(1);
    const other = '99999999-9999-4999-8999-999999999999';
    await objects.put(`ledger/people/${other}.json`, JSON.stringify({ plan: 'test', live: { 'run-x': { kind: 'run', runId: 'rx', at: 0, nonce: 'n' } }, used: {}, stopping: [] }));
    const put = objects.put;
    objects.put = async (k, body, o) => { if (k === `ledger/people/${other}.json`) throw new Error('S3 is down'); return put(k, body, o); };
    tick(9 * HOUR);
    await gw.sweep();
    expect(stopped()).toContain(`u-${A}-run-1`);
  });

  it('a person with nothing going is read, not written', async () => {
    const { gw, objects, start, finish } = setup();
    await start(1);
    await finish(1);
    const before = await objects.get(`ledger/people/${A}.json`);
    await gw.sweep();
    expect((await objects.get(`ledger/people/${A}.json`)).etag).toBe(before.etag);
  });

  it('a session AWS says is not there counts as stopped', async () => {
    const { gw, start, finish, ctl, objects } = setup();
    await start(1);
    ctl.stopGone = 1;
    await finish(1);
    expect(JSON.parse(objects.dump().get(`ledger/people/${A}.json`)).stopping).toEqual([]);
    await gw.sweep();
  });

  it('a stop that keeps failing is given up after 12 sweeps, not tried for ever', async () => {
    const { gw, start, finish, ctl, objects } = setup();
    await start(1);
    ctl.stopFails = 100;
    await finish(1);
    const stopping = () => JSON.parse(objects.dump().get(`ledger/people/${A}.json`)).stopping;
    for (let i = 0; i < 11; i += 1) await gw.sweep();
    expect(stopping()).toHaveLength(1);
    await gw.sweep();
    expect(stopping()).toEqual([]);
  });
});

// Codex's review, 2026-10-20: a run left the ledger before its stop was
// written anywhere, so a function that died in between left a machine
// nothing would ever stop; the late stop after a start race was not kept
// either; and a run across a month's end was charged to one month.
describe('a stop that has not happened yet', () => {
  it('is written in the same write that ends the run, so a server that dies next still has it', async () => {
    const { objects, start, finish } = setup();
    await start(1);
    const writes = [];
    const put = objects.put;
    objects.put = async (k, body, o) => { if (k === `ledger/people/${A}.json`) writes.push(JSON.parse(body)); return put(k, body, o); };
    await finish(1);
    const ending = writes.find((r) => !r.live['run-1']);
    expect(ending.stopping.map((e) => e.sid)).toEqual(['run-1']);
    expect(ending.unrecorded.map((e) => e.sessionId)).toEqual(['run-1']);
    // Once the stop and the record are made, both are let go.
    const last = writes.at(-1);
    expect(last.stopping).toEqual([]);
    expect(last.unrecorded).toEqual([]);
  });

  it('the stop after a start race, if AWS does not take it, is kept for the sweep', async () => {
    const { gw, start, call, ctl, stopped, objects } = setup();
    let open;
    ctl.gate = new Promise((r) => { open = r; });
    const starting = start(1);
    await new Promise((r) => setTimeout(r, 5));
    await call('POST', '/v1/stop', { sessionId: 'run-1' });
    ctl.stopFails = 1;
    open();
    await starting;
    expect(JSON.parse(objects.dump().get(`ledger/people/${A}.json`)).stopping.map((e) => e.sid)).toEqual(['run-1']);
    await gw.sweep();
    expect(stopped().at(-1)).toBe(`u-${A}-run-1`);
    expect(JSON.parse(objects.dump().get(`ledger/people/${A}.json`)).stopping).toEqual([]);
  });

  // Codex's second look: the sweep's late stop would kill a new run started
  // on the same session meanwhile.
  it('a session still owed a stop takes no new start until the stop is made', async () => {
    const { gw, start, finish, ctl, stopped, tick } = setup();
    await start(1);
    ctl.stopFails = 100;
    await finish(1);
    // Past the hour an ended session is held, the owed stop still holds it.
    tick(61 * 60_000);
    expect((await start(1)).body).toMatchObject({ ok: false, error: 'busy' });
    ctl.stopFails = 0;
    await gw.sweep();
    expect(stopped()).toEqual([`u-${A}-run-1`]);
    expect((await start(1)).body.ok).toBe(true);
    await gw.sweep();
    expect(stopped()).toEqual([`u-${A}-run-1`]);
  });

  // Codex's third look: a start whose answer came back late, after a stop,
  // stopped the session again, and by then a second run could be on it.
  it('a session that has ended takes no new start for an hour, so a late stop can only reach what ended', async () => {
    const { start, call, ctl, tick, me } = setup();
    let open;
    ctl.gate = new Promise((r) => { open = r; });
    const first = start(1);
    await new Promise((r) => setTimeout(r, 5));
    await call('POST', '/v1/stop', { sessionId: 'run-1' });
    ctl.gate = null;
    expect((await start(1)).body).toMatchObject({ ok: false, error: 'busy' });
    open();
    await first;
    expect((await me()).running).toBe(0);
    tick(59 * 60_000);
    expect((await start(1)).body.error).toBe('busy');
    tick(2 * 60_000);
    expect((await start(1)).body.ok).toBe(true);
  });

  it('a run record that could not be written is written by the sweep', async () => {
    const { gw, objects, start, finish, runs } = setup();
    await start(1);
    const put = objects.put;
    let refuse = true;
    objects.put = async (k, body, o) => { if (refuse && k.startsWith('ledger/runs/')) throw new Error('S3 is down'); return put(k, body, o); };
    await finish(1);
    expect(runs()).toEqual([]);
    refuse = false;
    await gw.sweep();
    expect(runs().map((r) => r.sessionId)).toEqual(['run-1']);
    expect(JSON.parse(objects.dump().get(`ledger/people/${A}.json`)).unrecorded).toEqual([]);
  });
});

describe('a run across the end of a month', () => {
  it('is charged to each month for the time it ran in it', async () => {
    const { gw, start, finish, me, tick } = setup();
    await me();
    await gw.admin({ do: 'plan', person: A, plan: 'pro' });
    // From 12:00 on 19 October to 23:00 on 31 October is 12 days 11 hours.
    tick((12 * 24 + 11) * HOUR);
    await start(1);
    tick(2 * HOUR);
    await finish(1);
    expect((await me()).usedSeconds).toBe(3600);
    tick(-2 * HOUR + 30 * 60_000);
    expect(await me()).toMatchObject({ month: '2026-10', usedSeconds: 3600 });
  });

  it('a run still going counts only its time in this month against this month', async () => {
    const { start, tick, poll, stopped } = setup({ plans: { ...SET, test: { agents: 2, hoursPerMonth: 1 } } });
    tick((12 * 24 + 11) * HOUR + 30 * 60_000);
    await start(1);
    tick(60 * 60_000);
    await poll(1);
    expect(stopped()).toEqual([]);
  });
});

describe('a failed run\'s output', () => {
  it('is read to its end before its machine is stopped', async () => {
    let more = true;
    const { start, poll, stopped } = setup({ answer: () => ({ ok: true, state: 'failed', more, events: [{ seq: 2, kind: 'stdout', data: 'x' }] }) });
    await start(1);
    await poll(1);
    expect(stopped()).toEqual([]);
    more = false;
    await poll(1);
    expect(stopped()).toEqual([`u-${A}-run-1`]);
  });
});

describe('a run\'s name', () => {
  it('is plain letters, digits, dots and dashes, or the start is refused', async () => {
    const { call, sent } = setup();
    for (const runId of ['../x', 'a/b', 'x'.repeat(121), '']) {
      const r = await call('POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'start', runId } });
      expect(r.status, runId).toBe(400);
    }
    expect(sent).toEqual([]);
    expect((await call('POST', '/v1/invoke', { sessionId: 'run-1', payload: { action: 'start', runId: 'run.1_a-B' } })).body.ok).toBe(true);
  });
});
