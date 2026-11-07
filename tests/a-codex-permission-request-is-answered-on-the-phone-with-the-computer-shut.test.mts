// A CODEX PERMISSION REQUEST IS ANSWERED ON THE PHONE WITH THE COMPUTER SHUT.
//
// The founder, 2026-10-24, of a Codex thread set to ask permission: "If we can
// handle that though, that's better." A Claude Code run asks through the app's
// approvals server, which the cloud machine holds while the computer is away,
// so its cards reached the phone. Codex asks its own client, on the run's
// output, and the cloud server driving a run with the laptop shut answered
// nothing: a command approval, measured here against the server before this
// change, sat with no card on the phone and no answer on the run's input, and
// so its turn waited until the run's eight-hour ceiling. Any other request
// Codex sends its client (a typed question, a permissions grant, one this app
// has never heard of) hung the turn the same way.
//
// Now each approval goes on the phone as the computer's Codex client cards it
// (main/codex-approvals.mjs), her answer goes back on the run's input in
// Codex's own words, and whatever no card can answer is refused at once in the
// words the computer's client refuses it with.
import { describe, it, expect } from 'vitest';
import { KIT_VERSION, kitKey, runOfClaim, askId } from '../shared/cloud-kit.mjs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { threadSnapshot } from '../shared/phone-snapshot.mjs';
import { cardDigest } from '../shared/approval-card.mjs';
import { LEGACY_DECISIONS, refusalTo } from '../main/codex-app-server.mjs';

const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const A = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'ExponentPushToken[abcdefghij0123456789AB]';
const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } };
const line = (o) => JSON.stringify(o);

const codexKit = (t) => ({
  v: KIT_VERSION, engine: 'codex', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: 'abc123',
  argv: ['codex', 'app-server'], env: { CODEX_HOME: '/Users/me/.codex' }, bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  login: { engine: 'codex', id: 'acct-1', key: 'logins/codex/acct-1.json' },
  bringDirs: [{ name: 'sessions.tgz', dir: '/Users/me/.codex/sessions' }],
  frame: { before: 'Said: ', after: '' }, note: null,
  codex: {
    open: [
      line({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'agentbox' } } }),
      line({ jsonrpc: '2.0', method: 'initialized' }),
      line({ jsonrpc: '2.0', id: 2, method: 'thread/resume', params: { threadId: 'th-1', approvalPolicy: 'on-request' } }),
    ],
    resumeId: 2, firstTurnId: 3, turn: { threadId: 'th-1' },
  },
});

function fakeDb() {
  const commands = []; const threads = new Map();
  const iso = (t) => new Date(t).toISOString();
  return {
    commands, threads,
    add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, kind: 'reply', owner: A, device: DEVICE, project: 'alpha', item: 'w-1', ...c, created_at: iso(c.created_at) }); },
    async waitingReplies({ after, before, limit }) {
      return commands.filter((c) => ['reply', 'new'].includes(c.kind) && !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async waitingApprovals({ limit }) {
      return commands.filter((c) => c.kind === 'approve' && !c.taken_at && !c.claimed_at && String(c.payload?.approval).startsWith('cloud-')).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) { const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at); if (!c) return false; Object.assign(c, { claimed_at: at, claimed_by: by }); return true; },
    async giveBack(id, by) { const c = commands.find((x) => x.id === id && x.claimed_by === by && !x.taken_at); if (c) Object.assign(c, { claimed_at: null, claimed_by: null }); },
    async taken(id, outcome, at) { const c = commands.find((x) => x.id === id && !x.taken_at); if (c) Object.assign(c, { taken_at: at, outcome }); },
    async thread(o, d, p, i) { return threads.get(`${o}|${d}|${p}|${i}`) ?? null; },
    async writeThread(o, d, p, i, snapshot) { threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
    async pushDevices() { return [{ token: TOKEN }]; },
    async dropPushDevice() {},
  };
}

// A Codex thread on the phone, its reply started in the cloud and its turn
// begun: everything up to the moment Codex asks.
async function turnBegun() {
  let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
  const sent = []; const pushed = []; const out = new Map();
  const objects = memoryObjects();
  const db = fakeDb();
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        sent.push({ sessionId, payload });
        if (payload.action === 'events') return { ok: true, state: 'running', events: (out.get(payload.runId) ?? []).slice(payload.since), more: false };
        return { ok: true };
      },
      async stop(sessionId) { sent.push({ sessionId, stop: true }); },
    },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {}, objects, whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => clock, plans: SET, log: () => {},
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => { pushed.push(messages); return messages.map(() => ({ status: 'ok' })); },
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  await objects.put(`runs/u-${A}/${kitKey(DEVICE, 'alpha', 'w-1').slice('runs/'.length)}`, JSON.stringify(codexKit(clock)));
  db.threads.set(`${A}|${DEVICE}|alpha|w-1`, { snapshot: threadSnapshot({ id: 'w-1', title: 'Publish it', status: 'blocked', updatedAt: clock - 3600_000 }, []) });
  const t = {
    gw, db, sent, pushed,
    now: () => clock, tick: (ms) => { clock += ms; },
    // Split mid-line, as a run's output arrives.
    say(runId, ...msgs) {
      const list = out.get(runId) ?? [];
      const text = msgs.map((m) => `${line(m)}\n`).join('');
      list.push({ kind: 'stdout', data: Buffer.from(text.slice(0, 9)).toString('base64') }, { kind: 'stdout', data: Buffer.from(text.slice(9)).toString('base64') });
      out.set(runId, list);
    },
    async look() { clock += MIN; await gw.phoneSweep(); },
    inputs: () => sent.filter((s) => s.payload?.action === 'stdin'),
    // What went on the run's input after its turn began, one message a line.
    answers: () => sent.filter((s) => s.payload?.action === 'stdin' && s.payload.n > 2 && s.payload.data)
      .flatMap((s) => Buffer.from(s.payload.data, 'base64').toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))),
    copy: () => db.threads.get(`${A}|${DEVICE}|alpha|w-1`).snapshot,
    cards: () => db.threads.get(`${A}|${DEVICE}|alpha|w-1`).snapshot.approvals ?? [],
    asked: () => pushed.flat().filter((m) => /Waiting on you/.test(m.body)),
    yes: (card, over = {}) => db.add({ id: `ans-${Math.random()}`, kind: 'approve', payload: { approval: card.id, allow: true, card: card.card, ...over }, created_at: clock }),
  };
  db.add({ id: 'c1', payload: { text: 'publish the package' }, created_at: clock - 2 * MIN });
  await gw.phoneSweep();
  t.runId = runOfClaim(db.commands[0].claimed_by);
  t.say(t.runId, { id: 1, result: {} }, { id: 2, result: { thread: { id: 'th-1' } } });
  await t.look();
  t.say(t.runId, { id: 3, result: { turn: { id: 'tu-1' } } });
  return t;
}

// Codex's first server request on a connection has id 0.
const command = (id = 0, over = {}) => ({
  jsonrpc: '2.0', id, method: 'item/commandExecution/requestApproval',
  params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'it-1', command: 'npm publish', cwd: '/work/alpha', reason: 'Publish needs the network', ...over },
});
const finished = (text) => [
  { method: 'item/completed', params: { item: { type: 'agentMessage', text, phase: 'final_answer' } } },
  { method: 'turn/completed', params: { turn: { id: 'tu-1', status: 'completed' } } },
];

describe('a Codex run in the cloud that asks, with the computer shut', () => {
  it('puts a command it asks to run on the phone as the computer cards it, with one alert headed by the thread', async () => {
    const t = await turnBegun();
    t.say(t.runId, command());
    await t.look();
    const id = askId(t.runId, 'codex', 0);
    expect(t.cards()).toHaveLength(1);
    const input = { command: 'npm publish', cwd: '/work/alpha', description: 'Publish needs the network' };
    expect(t.cards()[0]).toMatchObject({ id, tool: 'Bash', input });
    expect(t.cards()[0].card).toBe(cardDigest({ id, at: t.cards()[0].at, product: 'alpha', item: 'w-1', tool: 'Bash', input }));
    expect(t.asked()).toHaveLength(1);
    expect(t.asked()[0]).toMatchObject({ title: 'Publish it', body: 'Waiting on you: Publish needs the network' });
    // Nothing is answered for her.
    expect(t.answers()).toEqual([]);
    await t.look();
    expect(t.asked()).toHaveLength(1);
  });

  it('her yes goes back on the run\'s input in Codex\'s own words, once, and the card leaves the phone', async () => {
    const t = await turnBegun();
    t.say(t.runId, command());
    await t.look();
    t.yes(t.cards()[0]);
    await t.look();
    expect(t.answers()).toEqual([{ jsonrpc: '2.0', id: 0, result: { decision: 'accept' } }]);
    expect(t.cards()).toEqual([]);
    const taken = t.db.commands.find((c) => c.kind === 'approve');
    expect(taken).toMatchObject({ claimed_by: `cloud:${t.runId}`, outcome: expect.stringMatching(/Agentbox Cloud/) });
    // The turn then ends and its answer reaches the phone.
    t.say(t.runId, ...finished('Published.'));
    await t.look();
    expect(t.copy().item.result).toBe('Published.');
  });

  it('her no declines, which lets the agent carry on with something else', async () => {
    const t = await turnBegun();
    t.say(t.runId, command(4));
    await t.look();
    t.yes(t.cards()[0], { allow: false, note: 'not today' });
    await t.look();
    expect(t.answers()).toEqual([{ jsonrpc: '2.0', id: 4, result: { decision: 'decline' } }]);
  });

  it('a file change is carded from the change Codex started, with every file on it', async () => {
    const t = await turnBegun();
    t.say(t.runId,
      { method: 'item/started', params: { item: { type: 'fileChange', id: 'fc-1', changes: [{ path: '/work/alpha/a.txt', kind: { type: 'update' }, diff: '-one\n+two\n' }, { path: '/work/alpha/b.txt', kind: { type: 'add' }, diff: 'new\n' }] } } },
      { jsonrpc: '2.0', id: 1, method: 'item/fileChange/requestApproval', params: { threadId: 'th-1', turnId: 'tu-1', itemId: 'fc-1', reason: 'Outside the folder' } });
    await t.look();
    expect(t.cards()).toHaveLength(1);
    expect(t.cards()[0]).toMatchObject({ tool: 'Edit', input: { description: 'Outside the folder' } });
    expect(t.cards()[0].input.changes).toMatch(/Edit \/work\/alpha\/a\.txt[\s\S]*\+two[\s\S]*Write \/work\/alpha\/b\.txt/);
    t.yes(t.cards()[0]);
    await t.look();
    expect(t.answers()).toEqual([{ jsonrpc: '2.0', id: 1, result: { decision: 'accept' } }]);
  });

  it('a file change it never saw, or one already finished, is refused at once with no card', async () => {
    const t = await turnBegun();
    t.say(t.runId,
      { method: 'item/started', params: { item: { type: 'fileChange', id: 'fc-1', changes: [{ path: '/work/alpha/a.txt', kind: { type: 'update' }, diff: '+x\n' }] } } },
      { method: 'item/completed', params: { item: { type: 'fileChange', id: 'fc-1' } } },
      { jsonrpc: '2.0', id: 1, method: 'item/fileChange/requestApproval', params: { threadId: 'th-1', itemId: 'fc-1' } },
      { jsonrpc: '2.0', id: 2, method: 'item/fileChange/requestApproval', params: { threadId: 'th-1', itemId: 'fc-never' } });
    await t.look();
    expect(t.cards()).toEqual([]);
    expect(t.asked()).toEqual([]);
    expect(t.answers()).toEqual([
      { jsonrpc: '2.0', id: 1, result: { decision: 'decline' } },
      { jsonrpc: '2.0', id: 2, result: { decision: 'decline' } },
    ]);
  });

  it('a tool call to another MCP server gets a card and an accept in an elicitation\'s words; the store\'s own goes ahead with none', async () => {
    const t = await turnBegun();
    const mcp = (id, serverName) => ({
      jsonrpc: '2.0', id, method: 'mcpServer/elicitation/request',
      params: { threadId: 'th-1', serverName, message: `Allow ${serverName} to run search?`, _meta: { codex_approval_kind: 'mcp_tool_call', tool_params: { q: 'x' } } },
    });
    t.say(t.runId, mcp(5, 'agentbox'), mcp(6, 'linear'));
    await t.look();
    expect(t.answers()).toEqual([{ jsonrpc: '2.0', id: 5, result: { action: 'accept' } }]);
    expect(t.cards()).toHaveLength(1);
    expect(t.cards()[0]).toMatchObject({ id: askId(t.runId, 'codex', 6), tool: 'Mcp', input: { server: 'linear', description: 'Allow linear to run search?' } });
    t.yes(t.cards()[0]);
    await t.look();
    expect(t.answers().at(-1)).toEqual({ jsonrpc: '2.0', id: 6, result: { action: 'accept' } });
  });

  it('a request no card can answer is refused at once in the words the computer\'s own client uses, so the turn never waits on it', async () => {
    const t = await turnBegun();
    t.say(t.runId,
      { jsonrpc: '2.0', id: 7, method: 'item/permissions/requestApproval', params: { threadId: 'th-1', permissions: {} } },
      { jsonrpc: '2.0', id: 8, method: 'item/tool/requestUserInput', params: { threadId: 'th-1', questions: [] } },
      { jsonrpc: '2.0', id: 9, method: 'mcpServer/elicitation/request', params: { threadId: 'th-1', serverName: 'linear', message: 'Your API key?' } },
      { jsonrpc: '2.0', id: 10, method: 'execCommandApproval', params: { conversationId: 'th-1', command: ['ls'] } },
      { jsonrpc: '2.0', id: 11, method: 'something/new', params: {} },
      { jsonrpc: '2.0', id: 12, method: 'item/commandExecution/requestApproval', params: { threadId: 'th-1' } });
    await t.look();
    expect(t.cards()).toEqual([]);
    expect(t.answers()).toEqual([
      { jsonrpc: '2.0', id: 7, ...refusalTo('item/permissions/requestApproval') },
      { jsonrpc: '2.0', id: 8, ...refusalTo('item/tool/requestUserInput') },
      { jsonrpc: '2.0', id: 9, result: { action: 'decline' } },
      { jsonrpc: '2.0', id: 10, result: { decision: LEGACY_DECISIONS.decline } },
      { jsonrpc: '2.0', id: 11, ...refusalTo('something/new') },
      { jsonrpc: '2.0', id: 12, result: { decision: 'decline' } },
    ]);
    expect(t.answers()[1].error.message).toMatch(/ask it in your reply/);
    expect(t.answers()[4].error.message).toMatch(/does not recognise/);
  });

  it('a card answered elsewhere, or whose turn ended, leaves the phone, and a late yes allows nothing', async () => {
    const t = await turnBegun();
    t.say(t.runId, command(0), command(1, { command: 'npm test' }));
    await t.look();
    expect(t.cards()).toHaveLength(2);
    const [first, second] = t.cards();
    t.say(t.runId, { method: 'serverRequest/resolved', params: { threadId: 'th-1', requestId: 0 } });
    await t.look();
    expect(t.cards().map((c) => c.id)).toEqual([second.id]);
    t.say(t.runId, { method: 'turn/completed', params: { turn: { id: 'tu-1', status: 'interrupted' } } });
    await t.look();
    expect(t.cards()).toEqual([]);
    t.yes(first);
    await t.look();
    expect(t.answers()).toEqual([]);
    expect(t.db.commands.find((c) => c.kind === 'approve').outcome).toMatch(/already answered/i);
  });

  it('an answer carrying another card\'s fingerprint allows nothing', async () => {
    const t = await turnBegun();
    t.say(t.runId, command());
    await t.look();
    t.yes(t.cards()[0], { card: 'AAAAAAAAAAAA' });
    await t.look();
    expect(t.answers()).toEqual([]);
    expect(t.db.commands.find((c) => c.kind === 'approve').outcome).toMatch(/nothing was allowed/i);
    expect(t.cards()).toHaveLength(1);
  });

  it('a run waiting on her card is not closed for being quiet', async () => {
    const t = await turnBegun();
    t.say(t.runId, command());
    await t.look();
    t.tick(45 * MIN);
    await t.gw.phoneSweep();
    expect(t.inputs().some((s) => s.payload.end === true)).toBe(false);
  });
});
