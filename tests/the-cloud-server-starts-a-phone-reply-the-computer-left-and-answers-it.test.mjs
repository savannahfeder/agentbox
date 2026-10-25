// THE CLOUD SERVER STARTS A PHONE REPLY THE COMPUTER LEFT, AND ANSWERS IT ON THE PHONE.
//
// On 2026-10-24 the founder said the phone must work "with your computer
// completely closed": a reply sent from a bus has to reach an agent then, not
// when the laptop opens. The computer now leaves each phone thread's next turn
// ready in the cloud (shared/cloud-kit.mjs), and this is the server's half
// (cloud/gateway/phone.mjs): every minute it looks for replies no computer
// has claimed for a minute, claims one as `cloud:<run id>`, starts the run
// from the kit through the same path a Mac's start takes (the plan, the
// ledger, the sign-in by name), and hands her words over as the agent's first
// message. When the run's done.json lands, the agent's answer goes into the
// phone's copy of the thread, the command is marked taken and one alert goes
// out headed by the thread's title. A refused start gives the claim back, and
// after three tries the reply is left to the computer, said once in the log.
// Measured here with the gateway's in-memory bucket and a stand-in database.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { supabaseRest, PHONE_TRIES, ANSWERED_OUTCOME, NO_ANSWER } from '../cloud/gateway/phone.mjs';
import { lambdaHandler } from '../cloud/gateway/lambda.mjs';
import { rolePolicy, serviceKeyOf } from '../scripts/cloud-gateway-setup.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { KIT_VERSION, kitKey, serverRunKey, runOfClaim, cloudSessionId } from '../shared/cloud-kit.mjs';
import { threadSnapshot } from '../shared/phone-snapshot.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } };
const REPLY = 'yes, ship it';

const kitFor = (t, over = {}) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: 'abc123',
  argv: ['claude', '--resume', 's-1'], env: { ZERO_ITEM: 'w-1' },
  bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  files: [{ path: '/tmp/settings.json', key: `runs/kits/${DEVICE}/alpha/w-1/files/1` }],
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: '/Users/me/.claude/projects/-x' }],
  frame: { before: 'What they said:\n\n', after: '\n\n# Boundaries' }, note: '# In the cloud',
  ...over,
});

function fakeDb() {
  const commands = [];
  const threads = new Map();
  const devices = [];
  const calls = [];
  const iso = (t) => new Date(t).toISOString();
  return {
    commands, threads, devices, calls,
    add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, kind: 'reply', owner: A, device: DEVICE, project: 'alpha', item: 'w-1', ...c, created_at: iso(c.created_at) }); },
    async waitingReplies({ after, before, limit }) {
      calls.push('list');
      return commands.filter((c) => c.kind === 'reply' && !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) {
      const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at);
      if (!c) return false;
      Object.assign(c, { claimed_at: at, claimed_by: by });
      return true;
    },
    async giveBack(id, by) {
      const c = commands.find((x) => x.id === id && x.claimed_by === by && !x.taken_at);
      if (c) Object.assign(c, { claimed_at: null, claimed_by: null });
    },
    async taken(id, outcome, at) {
      const c = commands.find((x) => x.id === id && !x.taken_at);
      if (c) Object.assign(c, { taken_at: at, outcome });
    },
    async thread(owner, device, project, item) { return threads.get(`${owner}|${device}|${project}|${item}`) ?? null; },
    async writeThread(owner, device, project, item, snapshot) { threads.set(`${owner}|${device}|${project}|${item}`, { snapshot }); },
    async pushDevices(owner) { return devices.filter((d) => d.owner === owner).map((d) => ({ token: d.token })); },
    async dropPushDevice(owner, token) { const i = devices.findIndex((d) => d.owner === owner && d.token === token); if (i >= 0) devices.splice(i, 1); },
  };
}

async function setup({ plan = 'test', startAnswer = () => ({ ok: true }), tickets = null } = {}) {
  let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
  const sent = [];
  const pushed = [];
  const logs = [];
  const objects = memoryObjects();
  const db = fakeDb();
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        sent.push({ sessionId, payload });
        return payload.action === 'start' ? startAnswer(payload) : { ok: true };
      },
      async stop(sessionId) { sent.push({ sessionId, stop: true }); },
    },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => clock,
    plans: SET,
    log: (m) => logs.push(m),
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => { pushed.push(messages); return messages.map((m) => tickets?.[m.to] ?? { status: 'ok' }); },
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  if (plan) await gw.admin({ do: 'plan', person: A, plan });
  const putKit = (kit = kitFor(clock)) => objects.put(`runs/u-${A}/kits/${kitKey(DEVICE, 'alpha', 'w-1').slice('runs/kits/'.length)}`, JSON.stringify(kit));
  const starts = () => sent.filter((s) => s.payload?.action === 'start');
  const inputs = () => sent.filter((s) => s.payload?.action === 'stdin');
  db.threads.set(`${A}|${DEVICE}|alpha|w-1`, { snapshot: threadSnapshot({ id: 'w-1', title: 'Ship it', status: 'blocked', result: 'Ready to ship?', updatedAt: clock - 3600_000 }, []) });
  return { gw, objects, db, sent, pushed, logs, starts, inputs, putKit, now: () => clock, tick: (ms) => { clock += ms; } };
}

const runIdOf = (t) => runOfClaim(t.db.commands[0].claimed_by);
const endRun = async (t, runId, result = 'Shipped it.') => {
  const line = `${JSON.stringify({ type: 'result', result, is_error: false })}\n`;
  const events = result === null ? '' : JSON.stringify({ seq: 1, kind: 'stdout', data: Buffer.from(line).toString('base64') });
  await t.objects.put(`runs/u-${A}/${runId}/events.jsonl`, events);
  await t.objects.put(`runs/u-${A}/${runId}/done.json`, '{}');
};

describe('a reply the computer left for a minute', () => {
  it('is claimed for a cloud run, started from its kit, and her words are the agent\'s first message', async () => {
    const t = await setup();
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    const runId = runIdOf(t);
    expect(runId).toBeTruthy();
    const start = t.starts()[0];
    expect(start.sessionId).toBe(`u-${A}-${cloudSessionId('w-1', runId)}`);
    expect(start.payload).toMatchObject({ action: 'start', runId, cwd: kitFor(0).cwd, argv: kitFor(0).argv, bundleUrl: `https://b/get/runs/u-${A}/kits/${DEVICE}/alpha/w-1/in.bundle` });
    // The sign-in is swapped for a link only inside the call, as for a Mac's start.
    expect(start.payload.login.url).toBe(`https://b/get/logins/u-${A}/claude/acct-1.json`);
    expect(start.payload.results.doneUrl).toBe(`https://b/put/runs/u-${A}/${runId}/done.json`);
    const [input] = t.inputs();
    expect(input.payload).toMatchObject({ action: 'stdin', runId, n: 1 });
    const msg = JSON.parse(Buffer.from(input.payload.data, 'base64').toString('utf8'));
    expect(msg.message.content).toBe(`# In the cloud\n\nWhat they said:\n\n${REPLY}\n\n# Boundaries`);
    const rec = JSON.parse((await t.objects.get(`runs/u-${A}/${serverRunKey(runId).slice('runs/'.length)}`)).body);
    expect(rec).toMatchObject({ runId, command: 'c1', device: DEVICE, project: 'alpha', item: 'w-1', reply: REPLY, sessionId: cloudSessionId('w-1', runId) });
  });

  it('is started once, however many sweeps see it', async () => {
    const t = await setup();
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
  });
});

describe('what the cloud leaves to the computer', () => {
  it('a reply still fresh, one with no kit, one with a file from the phone, and one the computer claimed', async () => {
    const t = await setup();
    t.db.add({ id: 'fresh', payload: { text: REPLY }, created_at: t.now() - 10_000 });
    t.db.add({ id: 'nokit', item: 'w-2', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.putKit();
    t.db.add({ id: 'file', payload: { text: `look ![a](phone-files/${'a'.repeat(64)}.png)` }, created_at: t.now() - 2 * MIN });
    t.db.add({ id: 'mac', payload: { text: REPLY }, created_at: t.now() - 2 * MIN, claimed_at: new Date(t.now()).toISOString() });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(0);
    expect(t.db.commands.filter((c) => c.claimed_by)).toHaveLength(0);
  });

  it('a kit made for another thread, or one too old, is not started from', async () => {
    const t = await setup();
    await t.putKit(kitFor(t.now(), { item: 'w-9' }));
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    await t.putKit(kitFor(t.now(), { madeAt: t.now() - 8 * 24 * 3600_000 }));
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(0);
  });

  it('someone with no plan, or with every agent running, is not claimed for', async () => {
    const t = await setup({ plan: null });
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.db.commands[0].claimed_by).toBeNull();
    expect(t.starts()).toHaveLength(0);
  });
});

describe('a start the cloud refuses', () => {
  it('gives the claim back for the computer, and after three tries leaves the reply to it, said once', async () => {
    const t = await setup({ startAnswer: () => ({ ok: false, error: 'bad-start', message: 'no image' }) });
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    for (let i = 0; i < PHONE_TRIES + 2; i += 1) {
      await t.gw.phoneSweep();
      expect(t.db.commands[0].claimed_by).toBeNull();
      t.tick(6 * MIN);
    }
    expect(t.starts()).toHaveLength(PHONE_TRIES);
    expect(t.logs.filter((l) => /bad-start/.test(l))).toHaveLength(1);
    expect(t.logs.some((l) => /left to the computer/.test(l))).toBe(true);
  });

  it('is not tried again within minutes', async () => {
    const t = await setup({ startAnswer: () => ({ ok: false, error: 'bad-start' }) });
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
  });
});

describe('when the cloud run ends', () => {
  it('her reply and the agent\'s answer reach the phone\'s copy, the command is taken, and one alert names the thread', async () => {
    const t = await setup();
    t.db.devices.push({ owner: A, token: 'ExponentPushToken[abcdefghij0123456789AB]' });
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const runId = runIdOf(t);
    t.tick(10 * MIN);
    await endRun(t, runId, 'Shipped it.');
    await t.gw.objectCreated(`runs/u-${A}/${runId}/done.json`);
    const snap = t.db.threads.get(`${A}|${DEVICE}|alpha|w-1`).snapshot;
    expect(snap.item).toMatchObject({ answer: REPLY, result: 'Shipped it.', status: 'blocked' });
    expect(snap.history.slice(-3).map((l) => l.source)).toEqual(['founder', 'agent', 'system']);
    expect(t.db.commands[0]).toMatchObject({ outcome: ANSWERED_OUTCOME });
    expect(t.pushed).toHaveLength(1);
    expect(t.pushed[0][0]).toMatchObject({ to: 'ExponentPushToken[abcdefghij0123456789AB]', title: 'Ship it', body: 'An agent is ready', sound: 'default', data: { product: `alpha@${DEVICE}`, id: 'w-1' } });
    await t.gw.objectCreated(`runs/u-${A}/${runId}/done.json`);
    await t.gw.phoneSweep();
    expect(t.pushed).toHaveLength(1);
  });

  it('a run that never answered says so on the phone', async () => {
    const t = await setup();
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const runId = runIdOf(t);
    await endRun(t, runId, null);
    await t.gw.objectCreated(`runs/u-${A}/${runId}/done.json`);
    expect(t.db.threads.get(`${A}|${DEVICE}|alpha|w-1`).snapshot.item.result).toBe(NO_ANSWER);
  });

  it('an end whose notice was missed is caught by a later sweep', async () => {
    const t = await setup();
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const runId = runIdOf(t);
    await endRun(t, runId, 'Done.');
    t.tick(3 * MIN);
    await t.gw.phoneSweep();
    expect(t.db.commands[0].outcome).toBe(ANSWERED_OUTCOME);
  });

  it('a phone Expo says is gone is forgotten', async () => {
    const gone = 'ExponentPushToken[zyxwvutsrq9876543210ZY]';
    const t = await setup({ tickets: { [gone]: { status: 'error', details: { error: 'DeviceNotRegistered' } } } });
    t.db.devices.push({ owner: A, token: gone });
    await t.putKit();
    t.db.add({ id: 'c1', payload: { text: REPLY }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const runId = runIdOf(t);
    await endRun(t, runId);
    await t.gw.objectCreated(`runs/u-${A}/${runId}/done.json`);
    expect(t.db.devices).toHaveLength(0);
  });
});

describe('the database client', () => {
  function recording(answer = []) {
    const asked = [];
    const fetchImpl = async (url, init) => { asked.push({ url: decodeURIComponent(url), init }); return new Response(JSON.stringify(answer), { status: 200 }); };
    return { asked, db: supabaseRest({ url: 'https://db.test/', serviceKey: 'svc', fetchImpl }) };
  }
  it('asks only for unclaimed, untaken replies in the window, oldest first', async () => {
    const { asked, db } = recording();
    await db.waitingReplies({ after: Date.UTC(2026, 9, 23), before: Date.UTC(2026, 9, 24), limit: 50 });
    const u = asked[0].url;
    expect(u).toMatch(/^https:\/\/db\.test\/rest\/v1\/phone_commands\?/);
    for (const f of ['kind=in.(reply,new)', 'taken_at=is.null', 'claimed_at=is.null', 'created_at=gt.2026-10-23', 'created_at=lt.2026-10-24', 'order=created_at.asc', 'limit=50']) expect(u).toContain(f);
    expect(asked[0].init.headers.authorization).toBe('Bearer svc');
  });
  it('claims only an unclaimed command, and gives back only its own claim', async () => {
    const { asked, db } = recording([{ id: 'c1' }]);
    expect(await db.claim('c1', 'cloud:r1', '2026-10-24T00:00:00Z')).toBe(true);
    await db.giveBack('c1', 'cloud:r1');
    expect(asked[0].url).toContain('id=eq.c1&claimed_at=is.null&taken_at=is.null');
    expect(asked[0].init.headers.prefer).toBe('return=representation');
    expect(JSON.parse(asked[0].init.body)).toEqual({ claimed_at: '2026-10-24T00:00:00Z', claimed_by: 'cloud:r1' });
    expect(asked[1].url).toContain('claimed_by=eq.cloud:r1');
    expect(JSON.parse(asked[1].init.body)).toEqual({ claimed_at: null, claimed_by: null });
  });
  it('a claim the computer won is no claim', async () => {
    const { db } = recording([]);
    expect(await db.claim('c1', 'cloud:r1', '2026-10-24T00:00:00Z')).toBe(false);
  });
  it('every call has a deadline', async () => {
    const { asked, db } = recording();
    await db.waitingReplies({ after: 0, before: 1, limit: 1 });
    await db.taken('c1', 'x', '2026-10-24T00:00:00Z');
    await db.pushDevices(A);
    for (const a of asked) expect(a.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('where it runs', () => {
  it('the clock\'s phone sweep reaches it', async () => {
    const handler = lambdaHandler({ phoneSweep: async () => ({ swept: 'phone' }), sweep: async () => ({ swept: 'all' }) });
    expect(await handler({ phoneSweep: true })).toEqual({ swept: 'phone' });
  });
  it('the function may read the database\'s service key, and only the secrets it names', () => {
    const base = { bucket: 'b', runtimeArn: 'arn:r', region: 'us-east-1', account: '000000000000', signerSecretArn: 'arn:signer' };
    const read = (p) => p.Statement.find((s) => s.Action.includes('secretsmanager:GetSecretValue')).Resource;
    expect(read(rolePolicy(base))).toBe('arn:signer');
    expect(read(rolePolicy({ ...base, supabaseSecretArn: 'arn:db' }))).toEqual(['arn:signer', 'arn:db']);
  });
  it('the service key is the one named service_role', () => {
    expect(serviceKeyOf([{ name: 'anon', api_key: 'a' }, { name: 'service_role', api_key: 's' }])).toBe('s');
    expect(serviceKeyOf([{ name: 'anon', api_key: 'a' }])).toBeNull();
    expect(serviceKeyOf(null)).toBeNull();
  });
});
