// A PERMISSION REQUEST FROM A CLOUD RUN IS ANSWERED ON THE PHONE WITH THE COMPUTER SHUT.
//
// The founder, 2026-10-24, of what still waited for the laptop: "these are all
// very important to be viable on mobile", permission requests among them. A
// cloud run does not ask by default, but a person can set cloud runs to ask.
// While the computer was away the sandbox answered every call to the app's
// tools "not made" (cloud/sandbox/server.mjs), the approvals server's
// included, so a card could never reach the phone and the agent was told its
// action was not allowed.
//
// Now a start may name servers whose calls are HELD while the computer is
// away: the call waits, and an `ask` event says what it wants. The cloud
// server (cloud/gateway/phone.mjs) puts it on the phone as the computer puts
// a card (phoneApproval, with its fingerprint), alerts once, and answers the
// held call with what the app's approvals server would have said when the
// phone's answer carries that card. The first answer wins: a computer that
// joins later has a held call it has not answered handed to its own server,
// and its late answer to one already answered is dropped. The handshake for
// the approvals server, for a run the computer never spoke to, is answered
// from what the start carried. Measured with the real sandbox server and the
// gateway with stand-ins for AgentCore, the database and Expo.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import {
  KIT_VERSION, kitKey, runOfClaim, APPROVALS_SERVER, askId, approvalAnswerLine, DECLINED, startPayload,
} from '../shared/cloud-kit.mjs';
import { cardDigest } from '../shared/approval-card.mjs';
import { cardDigest as appCardDigest } from '../main/approvals.mjs';
import { threadSnapshot, checkCommand } from '../shared/phone-snapshot.mjs';
import { approvalsHandshakes, asksPermission } from '../main/cloud/kit.mjs';
import { serveApprovals } from '../main/approval-prompt-core.mjs';

const STUB = fileURLToPath(new URL('../cloud/sandbox/mcp-stub.mjs', import.meta.url));
const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

describe('what the computer and the server agree on', () => {
  it('the approvals server is the one the app runs, by its name in the run\'s tools', () => {
    expect(APPROVALS_SERVER).toBe('zero-approvals');
    expect(read('main/supervisor.mjs')).toContain("'mcp__zero-approvals__approval_prompt'");
  });
  it('a card\'s fingerprint is the one the app takes, from one place', () => {
    const request = { id: 'cloud-r-c1-9', at: 1, tool: 'Bash', input: { b: 2, a: 1 } };
    expect(cardDigest(request)).toBe(appCardDigest(request));
    expect(cardDigest({ ...request, input: { a: 1, b: 2 } })).toBe(cardDigest(request));
  });
  it('a held call\'s card id is one the phone may send back', () => {
    const id = askId('6f1c2a5e-0b1d-4c2e-9a7f-1234567890ab', 'c12', 9);
    expect(id).toMatch(/^cloud-[\w-]{1,74}$/);
    expect(checkCommand({ kind: 'approve', device: 'a1b2c3d4e5f6', project: 'alpha', item: 'w-1', payload: { approval: id, allow: true, card: cardDigest({ id }) } }, { projects: ['alpha'], hasItem: () => true })).toBeNull();
    expect(askId('r', 'c1', 'a b/c')).toMatch(/^cloud-[\w-]+$/);
  });
  it('the answer is what the app\'s approvals server says for yes and for no', () => {
    const yes = JSON.parse(approvalAnswerLine(9, { allow: true, input: { command: 'ls' } }));
    expect(yes).toEqual({ jsonrpc: '2.0', id: 9, result: { content: [{ type: 'text', text: JSON.stringify({ behavior: 'allow', updatedInput: { command: 'ls' } }) }] } });
    const no = JSON.parse(approvalAnswerLine(9, { allow: false, note: 'not now' }));
    expect(JSON.parse(no.result.content[0].text)).toEqual({ behavior: 'deny', message: 'not now' });
    expect(JSON.parse(JSON.parse(approvalAnswerLine(9, { allow: false })).result.content[0].text).message).toBe(DECLINED);
    expect(read('main/approval-prompt-core.mjs')).toContain(DECLINED);
  });
});

describe('the kit', () => {
  it('carries the approvals server\'s own handshake, read off the server itself', async () => {
    const shakes = await approvalsHandshakes();
    expect(shakes.initialize.serverInfo.name).toBe('zero-approvals');
    expect(shakes['tools/list'].tools.map((t) => t.name)).toEqual(['approval_prompt']);
    // The same answers the server gives a run that asks.
    const input = new PassThrough(); const output = new PassThrough();
    const s = serveApprovals({ env: {}, input, output });
    const got = new Promise((r) => output.once('data', (d) => r(JSON.parse(String(d)))));
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })}\n`);
    expect((await got).result).toEqual(shakes['tools/list']);
    s.close();
  });
  it('holds the approvals server only for a run that asks', () => {
    const asks = ['claude', '--mcp-config', '/m.json', '--permission-prompt-tool', 'mcp__zero-approvals__approval_prompt', '--permission-mode', 'default'];
    expect(asksPermission(asks)).toBe(true);
    expect(asksPermission(asks.map((a) => (a === 'default' ? 'bypassPermissions' : a)))).toBe(false);
    expect(asksPermission([...asks, '--dangerously-skip-permissions'])).toBe(false);
    expect(asksPermission(['claude', '--permission-mode', 'default'])).toBe(false);
    expect(read('main/cloud/run.mjs')).toMatch(/asksPermission\(/);
  });
  it('a start from a kit that asks holds that server, from the start, with its handshake', async () => {
    const kit = {
      v: KIT_VERSION, engine: 'claude', cwd: '/w', branch: 'b', argv: ['claude'], bundleKey: 'runs/k/in.bundle',
      login: { engine: 'claude', key: 'logins/claude/a' }, bringDirs: [{ name: 'projects.tgz', dir: '/p' }], frame: { before: '', after: '' },
      hold: ['zero-approvals'], handshakes: { 'zero-approvals': { initialize: { a: 1 } } },
    };
    const p = await startPayload(kit, { runId: 'r', getUrl: async (k) => k, putUrl: async (k) => k, loginName: (k) => k, endTurn: null, away: true });
    expect(p.offline).toMatchObject({ hold: ['zero-approvals'], handshakes: { 'zero-approvals': { initialize: { a: 1 } } }, away: true });
    const plain = await startPayload({ ...kit, hold: undefined, handshakes: undefined }, { runId: 'r', getUrl: async (k) => k, putUrl: async (k) => k, loginName: (k) => k });
    expect(plain.offline.hold).toBeUndefined();
    expect(plain.offline.away).toBeUndefined();
  });
});

// ---------------------------------------------------------------- the sandbox
let tmp; let sandbox; let fileServer;
afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  if (fileServer) { fileServer.closeAllConnections(); await new Promise((r) => fileServer.close(r)); fileServer = null; }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

const AWAY = 300;
const SHAKES = {
  initialize: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'zero-approvals', version: '1.0.0' } },
  'tools/list': { tools: [{ name: 'approval_prompt', inputSchema: { type: 'object' } }] },
};

async function startWith(script, offline) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'held-ask-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  const git = (...a) => execFileSync('git', a, { cwd: repo });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'x');
  git('checkout', '-q', '-b', 'agentbox/w-1');
  git('bundle', 'create', path.join(tmp, 'b'), 'agentbox/w-1');
  const body = fs.readFileSync(path.join(tmp, 'b'));
  fileServer = http.createServer((q, s) => { s.writeHead(200); s.end(body); });
  await new Promise((r) => fileServer.listen(0, '127.0.0.1', r));
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  return sandbox.handle({
    action: 'start', runId: 'r', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1',
    bundleUrl: `http://127.0.0.1:${fileServer.address().port}/b`,
    argv: [process.execPath, '-e', script], env: { STUB }, offline,
  });
}
async function peekUntil(pred, what, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    const { events } = await sandbox.handle({ action: 'events', since: 0, peek: true });
    const hit = events.find(pred);
    if (hit) return { hit, events };
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}; saw ${JSON.stringify(events.map((e) => e.kind))}`);
    await new Promise((r) => setTimeout(r, 40));
  }
}
const said = (events) => events.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('');

// A stand-in for Claude Code asking permission through the app's approvals
// server: it opens the server, asks for `rm -rf build`, prints each answer
// it hears, and also calls another server's tool after `other` ms.
const asker = ({ other = null } = {}) => `
  const { spawn } = require('child_process');
  const open = (name) => { const s = spawn(process.execPath, [process.env.STUB, name], { stdio: ['pipe', 'pipe', 'inherit'] }); let b = ''; s.stdout.on('data', (d) => { b += d; let i; while ((i = b.indexOf('\\n')) >= 0) { const l = b.slice(0, i); b = b.slice(i + 1); process.stdout.write(name + ':' + l + '\\n'); } }); return s; };
  const a = open('zero-approvals');
  a.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }) + '\\n');
  setTimeout(() => a.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'approval_prompt', arguments: { tool_name: 'Bash', input: { command: 'rm -rf build', description: 'Clean the build' }, tool_use_id: 't1' } } }) + '\\n'), 50);
  ${other ? `setTimeout(() => { const o = open('agentbox'); o.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_document', arguments: {} } }) + '\\n'); }, ${other});` : ''}
  process.stdin.on('data', () => {});
  process.stdin.on('end', () => process.exit(0));
`;
const held = { afterMs: AWAY, endTurn: null, hold: ['zero-approvals'], handshakes: { 'zero-approvals': SHAKES }, away: true };

describe('the sandbox, with the computer away', () => {
  it('says it can hold calls', async () => {
    const started = await startWith(asker(), held);
    expect(started.caps).toContain('hold');
  });

  it('opens the approvals server from the start\'s own handshake, for a run the computer never spoke to', async () => {
    await startWith(asker(), held);
    const { events } = await peekUntil((e) => e.kind === 'stdout' && said([e]).includes('"id":1'), 'the handshake answered');
    const answer = JSON.parse(said(events).match(/zero-approvals:(\{"jsonrpc":"2.0","id":1.*\})/)[1]);
    expect(answer.result.serverInfo.name).toBe('zero-approvals');
  });

  it('holds a permission request and says what it wants, instead of answering it "not made"', async () => {
    await startWith(asker(), held);
    const { hit, events } = await peekUntil((e) => e.kind === 'ask', 'the held request');
    expect(hit).toMatchObject({ id: 9, server: 'zero-approvals', tool: 'approval_prompt', input: { tool_name: 'Bash', input: { command: 'rm -rf build', description: 'Clean the build' } } });
    expect(events.some((e) => e.kind === 'mcp-offline')).toBe(false);
    await new Promise((r) => setTimeout(r, AWAY * 3));
    const later = await sandbox.handle({ action: 'events', since: 0, peek: true });
    expect(said(later.events)).not.toMatch(/"id":9/);
  });

  it('the first answer reaches the agent, and a second one is dropped', async () => {
    await startWith(asker(), held);
    const { hit } = await peekUntil((e) => e.kind === 'ask', 'the held request');
    const first = await sandbox.handle({ action: 'mcp', runId: 'r', n: 1, server: true, conn: hit.conn, line: approvalAnswerLine(9, { allow: true, input: { command: 'rm -rf build' } }) });
    expect(first).toMatchObject({ ok: true });
    expect(first.dropped).toBeFalsy();
    const { events } = await peekUntil((e) => e.kind === 'stdout' && said([e]).includes('"id":9'), 'the answer to the agent');
    expect(said(events)).toContain('\\"behavior\\":\\"allow\\"');
    expect(events.find((e) => e.kind === 'ask-answered')).toMatchObject({ conn: hit.conn, id: 9 });
    const second = await sandbox.handle({ action: 'mcp', runId: 'r', n: 2, conn: hit.conn, line: approvalAnswerLine(9, { allow: false }) });
    expect(second).toMatchObject({ ok: true, dropped: true });
  });

  it('a computer that joins is handed a held request nobody has answered, and not one already answered', async () => {
    await startWith(asker(), held);
    const { hit } = await peekUntil((e) => e.kind === 'ask', 'the held request');
    expect((await sandbox.handle({ action: 'mcp-claim', runId: 'r', calls: [{ conn: hit.conn, id: 9 }] })).calls).toEqual([{ conn: hit.conn, id: 9, go: true }]);
    await sandbox.handle({ action: 'mcp', runId: 'r', n: 1, server: true, conn: hit.conn, line: approvalAnswerLine(9, { allow: false }) });
    expect((await sandbox.handle({ action: 'mcp-claim', runId: 'r', calls: [{ conn: hit.conn, id: 9 }] })).calls).toEqual([{ conn: hit.conn, id: 9, go: false }]);
  });

  it('another server\'s call is still answered "not made", and the server\'s own input never counts as the computer being there', async () => {
    await startWith(asker({ other: 150 }), held);
    await sandbox.handle({ action: 'stdin', runId: 'r', n: 1, server: true, data: Buffer.from('{}\n').toString('base64') });
    const { events } = await peekUntil((e) => e.kind === 'mcp-offline', 'the other call answered here');
    expect(events.find((e) => e.kind === 'mcp-offline')).toMatchObject({ id: 3 });
  });

  it('a start whose held servers are not a list of names is refused', async () => {
    const out = await startWith(asker(), { ...held, hold: 'zero-approvals' });
    expect(out).toMatchObject({ ok: false, error: 'bad-start' });
  });
});

// ----------------------------------------------------------------- the server
const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const TOKEN = 'ExponentPushToken[abcdefghij0123456789AB]';
const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } };
const askingKit = (t) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: 'abc123',
  argv: ['claude', '--resume', 's-1'], env: {}, bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: '/Users/me/.claude/projects/-x' }],
  frame: { before: 'Said: ', after: '' }, hold: ['zero-approvals'], handshakes: { 'zero-approvals': SHAKES },
});

function fakeDb() {
  const commands = [];
  const threads = new Map();
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
    async newThread() {},
    async pushDevices(owner) { return owner === A ? [{ token: TOKEN }] : []; },
    async dropPushDevice() {},
  };
}

async function server() {
  let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
  const sent = []; const pushed = []; const logs = [];
  const out = new Map();
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
    now: () => clock, plans: SET, log: (m) => logs.push(m),
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => { pushed.push(messages); return messages.map(() => ({ status: 'ok' })); },
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  await objects.put(`runs/u-${A}/${kitKey(DEVICE, 'alpha', 'w-1').slice('runs/'.length)}`, JSON.stringify(askingKit(clock)));
  db.threads.set(`${A}|${DEVICE}|alpha|w-1`, { snapshot: threadSnapshot({ id: 'w-1', title: 'Ship it', status: 'blocked', updatedAt: clock - 3600_000 }, []) });
  return {
    gw, db, sent, pushed, logs,
    tick: (ms) => { clock += ms; }, now: () => clock,
    event(runId, e) { const list = out.get(runId) ?? []; list.push(e); out.set(runId, list); },
    copy: () => db.threads.get(`${A}|${DEVICE}|alpha|w-1`).snapshot,
    inputs: () => sent.filter((s) => ['stdin', 'mcp'].includes(s.payload?.action)),
  };
}

async function asking() {
  const t = await server();
  t.db.add({ id: 'cmd-1', text: undefined, payload: { text: 'clean it up' }, created_at: t.now() - 2 * MIN });
  await t.gw.phoneSweep();
  const runId = runOfClaim(t.db.commands[0].claimed_by);
  t.event(runId, { kind: 'ask', conn: 'c1', id: 9, server: 'zero-approvals', tool: 'approval_prompt', input: { tool_name: 'Bash', input: { command: 'rm -rf build', description: 'Clean the build' } } });
  t.tick(MIN);
  await t.gw.phoneSweep();
  return { ...t, runId };
}

describe('the cloud server, with the computer shut', () => {
  it('starts a run that asks with its approvals server held, from the start, and its input never counting as the computer', async () => {
    const t = await asking();
    const start = t.sent.find((s) => s.payload?.action === 'start').payload;
    expect(start.offline).toMatchObject({ hold: ['zero-approvals'], away: true, handshakes: { 'zero-approvals': SHAKES } });
    expect(t.inputs().every((s) => s.payload.server === true)).toBe(true);
  });

  it('puts the request on the phone as the computer puts a card, and alerts once headed by the thread', async () => {
    const t = await asking();
    const cards = t.copy().approvals;
    expect(cards).toHaveLength(1);
    const id = askId(t.runId, 'c1', 9);
    expect(cards[0]).toMatchObject({ id, tool: 'Bash', input: { command: 'rm -rf build', description: 'Clean the build' } });
    expect(cards[0].card).toBe(cardDigest({ id, at: cards[0].at, product: 'alpha', item: 'w-1', tool: 'Bash', input: { command: 'rm -rf build', description: 'Clean the build' } }));
    const alerts = t.pushed.flat().filter((m) => /Waiting on you/.test(m.body));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ title: 'Ship it', body: 'Waiting on you: Clean the build', data: { product: `alpha@${DEVICE}`, id: 'w-1' } });
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.pushed.flat().filter((m) => /Waiting on you/.test(m.body))).toHaveLength(1);
  });

  it('her yes on that card answers the held call as the app would, takes the card away and marks her answer taken', async () => {
    const t = await asking();
    const card = t.copy().approvals[0];
    t.db.add({ id: 'cmd-2', kind: 'approve', payload: { approval: card.id, allow: true, card: card.card }, created_at: t.now() });
    await t.gw.phoneSweep();
    const answer = t.inputs().find((s) => s.payload.action === 'mcp');
    expect(answer.payload).toMatchObject({ conn: 'c1', server: true, line: approvalAnswerLine(9, { allow: true, input: { command: 'rm -rf build', description: 'Clean the build' } }) });
    expect(answer.payload.n).toBe(2);
    expect(t.copy().approvals ?? []).toEqual([]);
    expect(t.db.commands.find((c) => c.id === 'cmd-2')).toMatchObject({ claimed_by: `cloud:${t.runId}`, outcome: expect.stringMatching(/Agentbox Cloud/) });
  });

  it('her no carries her note', async () => {
    const t = await asking();
    const card = t.copy().approvals[0];
    t.db.add({ id: 'cmd-2', kind: 'approve', payload: { approval: card.id, allow: false, note: 'use git clean', card: card.card }, created_at: t.now() });
    await t.gw.phoneSweep();
    const answer = t.inputs().find((s) => s.payload.action === 'mcp');
    expect(answer.payload.line).toBe(approvalAnswerLine(9, { allow: false, note: 'use git clean' }));
  });

  it('an answer for another card, or for a request no longer waiting, allows nothing and says so', async () => {
    const t = await asking();
    const card = t.copy().approvals[0];
    t.db.add({ id: 'cmd-2', kind: 'approve', payload: { approval: card.id, allow: true, card: 'AAAAAAAAAAAA' }, created_at: t.now() });
    t.db.add({ id: 'cmd-3', kind: 'approve', payload: { approval: askId(t.runId, 'c1', 77), allow: true, card: card.card }, created_at: t.now() });
    await t.gw.phoneSweep();
    expect(t.inputs().some((s) => s.payload.action === 'mcp')).toBe(false);
    expect(t.db.commands.find((c) => c.id === 'cmd-2').outcome).toMatch(/nothing was allowed/i);
    expect(t.db.commands.find((c) => c.id === 'cmd-3').outcome).toMatch(/no longer waiting/i);
  });

  it('a request answered elsewhere leaves the phone', async () => {
    const t = await asking();
    t.event(t.runId, { kind: 'ask-answered', conn: 'c1', id: 9 });
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.copy().approvals ?? []).toEqual([]);
  });

  it('a run waiting on her card is not closed for being quiet', async () => {
    const t = await asking();
    t.tick(45 * MIN);
    await t.gw.phoneSweep();
    expect(t.inputs().some((s) => s.payload.end === true)).toBe(false);
  });
});

describe('the computer', () => {
  it('leaves an answer to a card the cloud put on the phone to the cloud, and still does its own', async () => {
    const { createMemoryCloud, signUpMemory, memoryBackend } = await import('../main/team/memory-cloud.mjs');
    const { createPhoneInbox } = await import('../main/phone-inbox.mjs');
    const cloud = createMemoryCloud();
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const phone = memoryBackend(cloud, me);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-card-'));
    const applied = [];
    const inbox = createPhoneInbox({
      backend: mac, owner: me, device: DEVICE, projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => [{ id: 'w-1', title: 'Ship it', status: 'blocked', updatedAt: Date.now() - 5000 }],
      historyOf: () => [], apply: async (cmd) => { applied.push(cmd); return { ok: true }; },
      stateFile: path.join(dir, 's.json'),
    });
    const theirs = await phone.addPhoneCommand({ device: DEVICE, project: 'alpha', item: 'w-1', kind: 'approve', payload: { approval: askId('r1', 'c1', 9), allow: true, card: 'AAAAAAAAAAAAAAAA' } });
    await phone.addPhoneCommand({ device: DEVICE, project: 'alpha', item: 'w-1', kind: 'approve', payload: { approval: 'a1b2c3', allow: true, card: 'BBBBBBBBBBBBBBBB' } });
    await inbox.syncOnce();
    expect(applied.map((c) => c.payload.approval)).toEqual(['a1b2c3']);
    const row = (await phone.phoneCommands()).find((c) => c.id === theirs.id);
    expect(row).toMatchObject({ takenAt: null, claimedAt: null });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
