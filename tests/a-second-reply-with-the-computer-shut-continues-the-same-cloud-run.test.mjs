// A SECOND REPLY WITH THE COMPUTER SHUT CONTINUES THE SAME CLOUD RUN.
//
// The cloud server started a phone reply from the thread's kit and ended the
// run after one turn (tests/the-cloud-server-starts-a-phone-reply-the-
// computer-left-and-answers-it). A conversation on a bus is more than one
// message: a second reply would have started a fresh run from the same kit,
// which holds the thread as it was BEFORE the first cloud turn, so the agent
// would have forgotten what it had just done. Now a run the server starts
// keeps its input open; each minute the server reads the run's new output
// without counting as the computer (`peek`), writes each finished turn into
// the phone's copy and alerts once for it, and a new reply on that thread
// goes to the same run as its next input. Twenty minutes after its last
// answer with nothing new, the run's input is closed and it ends. A run the
// computer has joined is the computer's, and a thread whose run ended but has
// not come home leaves new replies to the computer.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { KIT_VERSION, kitKey, runOfClaim } from '../shared/cloud-kit.mjs';
import { threadSnapshot } from '../shared/phone-snapshot.mjs';
import { ANSWERED_OUTCOME } from '../cloud/gateway/phone.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } };
const TOKEN = 'ExponentPushToken[abcdefghij0123456789AB]';

const kitFor = (t) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: 'abc123',
  argv: ['claude', '--resume', 's-1'], env: {}, bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: '/Users/me/.claude/projects/-x' }],
  frame: { before: 'Said: ', after: ' [end]' }, note: '# In the cloud',
});

function fakeDb() {
  const commands = [];
  const threads = new Map();
  const iso = (t) => new Date(t).toISOString();
  return {
    commands, threads, devices: [{ owner: A, token: TOKEN }],
    add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, kind: 'reply', owner: A, device: DEVICE, project: 'alpha', item: 'w-1', ...c, created_at: iso(c.created_at) }); },
    async waitingReplies({ after, before, limit }) {
      return commands.filter((c) => !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) { const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at); if (!c) return false; Object.assign(c, { claimed_at: at, claimed_by: by }); return true; },
    async giveBack(id, by) { const c = commands.find((x) => x.id === id && x.claimed_by === by && !x.taken_at); if (c) Object.assign(c, { claimed_at: null, claimed_by: null }); },
    async taken(id, outcome, at) { const c = commands.find((x) => x.id === id && !x.taken_at); if (c) Object.assign(c, { taken_at: at, outcome }); },
    async thread(o, d, p, i) { return threads.get(`${o}|${d}|${p}|${i}`) ?? null; },
    async writeThread(o, d, p, i, snapshot) { threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
    async pushDevices(owner) { return this.devices.filter((d) => d.owner === owner).map((d) => ({ token: d.token })); },
    async dropPushDevice() {},
  };
}

async function setup() {
  let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
  const sent = [];
  const pushed = [];
  const logs = [];
  const out = new Map(); // runId -> events the sandbox has
  const objects = memoryObjects();
  const db = fakeDb();
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        sent.push({ sessionId, payload });
        if (payload.action === 'events') {
          const all = out.get(payload.runId) ?? [];
          return { ok: true, state: 'running', events: all.slice(payload.since), more: false };
        }
        return { ok: true };
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
      sendPush: async (messages) => { pushed.push(messages); return messages.map(() => ({ status: 'ok' })); },
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  await objects.put(`runs/u-${A}/${kitKey(DEVICE, 'alpha', 'w-1').slice('runs/'.length)}`, JSON.stringify(kitFor(clock)));
  db.threads.set(`${A}|${DEVICE}|alpha|w-1`, { snapshot: threadSnapshot({ id: 'w-1', title: 'Ship it', status: 'blocked', updatedAt: clock - 3600_000 }, []) });
  const t = {
    gw, objects, db, sent, pushed, logs,
    now: () => clock, tick: (ms) => { clock += ms; },
    starts: () => sent.filter((s) => s.payload?.action === 'start'),
    inputs: () => sent.filter((s) => s.payload?.action === 'stdin'),
    said: (s) => JSON.parse(Buffer.from(s.payload.data, 'base64').toString('utf8')).message.content,
    // The agent finishes a turn: its result line, in the sandbox's output.
    answer(runId, text) {
      const line = `${JSON.stringify({ type: 'assistant' })}\n${JSON.stringify({ type: 'result', result: text, is_error: false })}\n`;
      const list = out.get(runId) ?? [];
      list.push({ kind: 'stdout', data: Buffer.from(line.slice(0, 15)).toString('base64') }, { kind: 'stdout', data: Buffer.from(line.slice(15)).toString('base64') });
      out.set(runId, list);
    },
    async end(runId) {
      const lines = (out.get(runId) ?? []).map((e, i) => JSON.stringify({ seq: i + 1, ...e })).join('\n');
      await objects.put(`runs/u-${A}/${runId}/events.jsonl`, lines);
      await objects.put(`runs/u-${A}/${runId}/done.json`, '{}');
      await gw.objectCreated(`runs/u-${A}/${runId}/done.json`);
    },
    copy: () => db.threads.get(`${A}|${DEVICE}|alpha|w-1`).snapshot,
    run: () => runOfClaim(db.commands[0].claimed_by),
  };
  return t;
}

// The first reply, started and answered.
async function firstTurn(t) {
  t.db.add({ id: 'c1', payload: { text: 'one' }, created_at: t.now() - 2 * MIN });
  await t.gw.phoneSweep();
  const runId = t.run();
  t.answer(runId, 'Answer one');
  t.tick(MIN);
  await t.gw.phoneSweep();
  return runId;
}

describe('two replies in a row', () => {
  it('reach the same run as its inputs 1 and 2, the cloud\'s note only on the first, and no second run starts', async () => {
    const t = await setup();
    const runId = await firstTurn(t);
    t.db.add({ id: 'c2', payload: { text: 'two' }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    expect(t.inputs().map((s) => s.payload.n)).toEqual([1, 2]);
    expect(t.inputs().every((s) => s.payload.runId === runId)).toBe(true);
    expect(t.said(t.inputs()[0])).toBe('# In the cloud\n\nSaid: one [end]');
    expect(t.said(t.inputs()[1])).toBe('Said: two [end]');
    expect(t.db.commands[1].claimed_by).toBe(`cloud:${runId}`);
  });

  it('each turn\'s answer lands in the phone\'s copy and alerts once, as it finishes', async () => {
    const t = await setup();
    const runId = await firstTurn(t);
    expect(t.copy().item).toMatchObject({ answer: 'one', result: 'Answer one' });
    expect(t.pushed).toHaveLength(1);
    expect(t.db.commands[0].outcome).toBe(ANSWERED_OUTCOME);
    t.db.add({ id: 'c2', payload: { text: 'two' }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    t.answer(runId, 'Answer two');
    t.tick(MIN);
    await t.gw.phoneSweep();
    await t.gw.phoneSweep();
    expect(t.copy().item).toMatchObject({ answer: 'two', result: 'Answer two' });
    expect(t.copy().history.filter((l) => l.source === 'agent').map((l) => l.patch.result)).toEqual(['Answer one', 'Answer two']);
    expect(t.pushed).toHaveLength(2);
    expect(t.pushed[1][0]).toMatchObject({ title: 'Ship it', data: { id: 'w-1' } });
  });

  it('a reply sent while the agent is still answering waits for that turn to end', async () => {
    const t = await setup();
    t.db.add({ id: 'c1', payload: { text: 'one' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const runId = t.run();
    t.db.add({ id: 'c2', payload: { text: 'two' }, created_at: t.now() - 5_000 });
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.inputs()).toHaveLength(1);
    t.answer(runId, 'Answer one');
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.inputs().map((s) => s.payload.n)).toEqual([1, 2]);
  });
});

describe('a run with nothing more to do', () => {
  it('has its input closed twenty minutes after its last answer, not before', async () => {
    const t = await setup();
    const runId = await firstTurn(t);
    t.tick(19 * MIN);
    await t.gw.phoneSweep();
    expect(t.inputs().some((s) => s.payload.end)).toBe(false);
    t.tick(2 * MIN);
    await t.gw.phoneSweep();
    const closing = t.inputs().find((s) => s.payload.end);
    expect(closing.payload).toMatchObject({ runId, n: 2, end: true });
    await t.gw.phoneSweep();
    expect(t.inputs().filter((s) => s.payload.end)).toHaveLength(1);
  });

  it('when it ends, every command is taken and no turn is written or alerted twice', async () => {
    const t = await setup();
    const runId = await firstTurn(t);
    t.db.add({ id: 'c2', payload: { text: 'two' }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    t.answer(runId, 'Answer two');
    await t.end(runId);
    expect(t.db.commands.map((c) => c.outcome)).toEqual([ANSWERED_OUTCOME, ANSWERED_OUTCOME]);
    expect(t.copy().history.filter((l) => l.source === 'agent').map((l) => l.patch.result)).toEqual(['Answer one', 'Answer two']);
    expect(t.pushed).toHaveLength(2);
    await t.gw.phoneSweep();
    expect(t.pushed).toHaveLength(2);
  });
});

describe('the computer\'s part', () => {
  it('a run the computer joined is left alone: no input, no close, and the phone\'s copy is the computer\'s', async () => {
    const t = await setup();
    const runId = await firstTurn(t);
    await t.objects.put(`runs/u-${A}/server/${runId}.joined.json`, '{}');
    t.db.add({ id: 'c2', payload: { text: 'two' }, created_at: t.now() - 2 * MIN });
    t.answer(runId, 'Answer from the computer\'s turn');
    t.tick(25 * MIN);
    await t.gw.phoneSweep();
    expect(t.inputs()).toHaveLength(1);
    expect(t.db.commands[1].claimed_by).toBeNull();
    expect(t.pushed).toHaveLength(1);
    expect(t.copy().item.result).toBe('Answer one');
  });

  it('a thread whose cloud run ended but has not come home leaves a new reply to the computer, said once', async () => {
    const t = await setup();
    const runId = await firstTurn(t);
    await t.end(runId);
    t.db.add({ id: 'c2', payload: { text: 'two' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    expect(t.db.commands[1].claimed_by).toBeNull();
    expect(t.logs.filter((l) => /not come home/.test(l))).toHaveLength(1);
  });

  it('once the computer has brought it home, the next reply starts afresh', async () => {
    const t = await setup();
    const runId = await firstTurn(t);
    await t.end(runId);
    await t.objects.put(`runs/u-${A}/server/${runId}.joined.json`, '{}');
    t.db.add({ id: 'c2', payload: { text: 'two' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(2);
  });
});
