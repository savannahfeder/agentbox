// A CODEX THREAD ON THE PHONE CARRIES ON IN THE CLOUD WITH THE COMPUTER SHUT.
//
// The founder, 2026-10-24, of what the phone still could not do with the
// laptop shut: "these are all very important to be viable on mobile, esp new
// threads and codex". A Claude Code thread left a kit after each turn and the
// cloud server started her reply from it; a Codex thread left none, because a
// Codex cloud run is `codex app-server` driven over its input by the
// computer's own Codex client (main/codex-app-server.mjs), and a Codex turn
// ended only with the computer.
//
// Now a finished Codex turn leaves a Codex kit: the app-server command, and
// the exact JSON-RPC lines the computer's client would send (initialize,
// initialized, thread/resume rewritten for the cloud) with the turn's
// `turn/start` as a template whose input holds the reply's place. The server
// opens the thread, sends her reply as a turn once the resume is answered,
// relays the answer when `turn/completed` arrives, and sends a follow-up as
// the next turn of the same run. The computer, waking, joins it as a Codex
// run. Measured with the real relay, the real sandbox and a stand-in Codex
// (tests/fixtures/fake-codex-app-server.mjs), the gateway with stand-ins for
// AgentCore and the database, and the real Supervisor.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { cloudRun } from '../main/cloud/run.mjs';
import { readMarker } from '../main/cloud/marker.mjs';
import { markerForCloudRun, readKitCopy, kitCopyPath } from '../main/cloud/kit.mjs';
import { kitFrom } from '../main/cloud/run-cli.mjs';
import {
  KIT_VERSION, REPLY_MARK, kitKey, checkKit, startPayload, replyFrame, runOfClaim,
  codexOpenLines, codexTurnLines, codexReadLines, codexAnswersIn, codexAnswerIn,
} from '../shared/cloud-kit.mjs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { threadSnapshot } from '../shared/phone-snapshot.mjs';
import { ANSWERED_OUTCOME } from '../cloud/gateway/phone.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CODEX = here('./fixtures/fake-codex-app-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const A = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'ExponentPushToken[abcdefghij0123456789AB]';
const line = (o) => JSON.stringify(o);

const codexKit = (over = {}) => ({
  v: KIT_VERSION, engine: 'codex', madeAt: Date.now() - MIN, device: DEVICE, project: 'alpha', item: 'w-1',
  cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', branch: 'agentbox/w-1', startSha: 'abc123',
  argv: ['codex', 'app-server'], env: { CODEX_HOME: '/Users/me/.codex' }, bundleKey: `runs/kits/${DEVICE}/alpha/w-1/in.bundle`,
  login: { engine: 'codex', id: 'acct-1', key: 'logins/codex/acct-1.json' },
  bringDirs: [{ name: 'sessions.tgz', dir: '/Users/me/.codex/sessions' }],
  frame: { before: 'Said: ', after: ' [end]' }, note: null,
  codex: {
    open: [
      line({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'agentbox' } } }),
      line({ jsonrpc: '2.0', method: 'initialized' }),
      line({ jsonrpc: '2.0', id: 2, method: 'thread/resume', params: { threadId: 'th-1', cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1' } }),
    ],
    resumeId: 2,
    firstTurnId: 3,
    turn: { threadId: 'th-1', effort: 'high' },
  },
  ...over,
});

describe('a Codex kit the server trusts', () => {
  it('a whole Codex kit passes, with its own sign-in and the lines that open its thread', () => {
    expect(checkKit(codexKit())).toBeNull();
  });
  it('one with no lines to open its thread, a Claude sign-in, or no thread to resume does not', () => {
    expect(checkKit(codexKit({ codex: undefined }))).toMatch(/Codex/);
    expect(checkKit(codexKit({ login: { engine: 'claude', key: 'logins/claude/x' } }))).toMatch(/sign-in/);
    expect(checkKit(codexKit({ codex: { ...codexKit().codex, turn: {} } }))).toMatch(/Codex/);
    expect(checkKit(codexKit({ engine: 'opencode' }))).toMatch(/Claude Code and Codex/);
  });
});

describe('the lines the server sends a Codex run', () => {
  it('open the thread as the computer would, and nothing of her reply yet', () => {
    const open = codexOpenLines(codexKit());
    expect(open.split('\n').filter(Boolean).map((l) => JSON.parse(l).method)).toEqual(['initialize', 'initialized', 'thread/resume']);
    expect(open.endsWith('\n')).toBe(true);
  });
  it('a turn is her reply in the turn\'s prompt, on the thread, with the turn\'s own settings and the id given', () => {
    const msg = JSON.parse(codexTurnLines(codexKit(), 'ship it', { id: 7 }));
    expect(msg).toEqual({ jsonrpc: '2.0', id: 7, method: 'turn/start', params: { threadId: 'th-1', effort: 'high', input: [{ type: 'text', text: 'Said: ship it [end]' }] } });
  });
});

describe('what a Codex run said', () => {
  const ev = (o) => line(o);
  it('the thread opened, and each turn\'s final answer, a progress note never', () => {
    const state = { resumeId: 2, turnIds: [3] };
    const answers = codexReadLines([
      ev({ id: 1, result: {} }),
      ev({ id: 2, result: { thread: { id: 'th-1' } } }),
      ev({ id: 3, result: { turn: { id: 'tu-1' } } }),
      ev({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'Looking now', phase: 'commentary' } } }),
      ev({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'Done. Shipped.', phase: 'final_answer' } } }),
      ev({ method: 'turn/completed', params: { turn: { id: 'tu-1', status: 'completed' } } }),
    ], state);
    expect(state.resumed).toBe(true);
    expect(answers).toEqual([{ text: 'Done. Shipped.', isError: false }]);
  });
  it('a failed turn says why, and a refused resume or turn is said too', () => {
    const state = { resumeId: 2, turnIds: [3, 4] };
    const answers = codexReadLines([
      ev({ id: 2, error: { code: -32600, message: 'thread th-1 already has an active writer' } }),
      ev({ id: 3, error: { message: 'no such thread' } }),
      ev({ method: 'turn/completed', params: { turn: { id: 'tu-2', status: 'failed', error: { message: 'unexpected status 401 Unauthorized' } } } }),
    ], state);
    expect(state.resumed).toMatch(/active writer/);
    expect(answers).toEqual([{ text: 'no such thread', isError: true }, { text: 'unexpected status 401 Unauthorized', isError: true }]);
  });
  it('a turn split across two reads is still one answer', () => {
    const state = { resumeId: 2, turnIds: [3] };
    expect(codexReadLines([ev({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'Half', phase: 'final_answer' } } })], state)).toEqual([]);
    expect(codexReadLines([ev({ method: 'turn/completed', params: { turn: { id: 'tu-1', status: 'completed' } } })], state)).toEqual([{ text: 'Half', isError: false }]);
  });
  it('off a run\'s event log, its last answer', () => {
    const out = [ev({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'One', phase: 'final_answer' } } }), ev({ method: 'turn/completed', params: { turn: { status: 'completed' } } }),
      ev({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'Two', phase: 'final_answer' } } }), ev({ method: 'turn/completed', params: { turn: { status: 'completed' } } })].join('\n') + '\n';
    const log = [line({ seq: 1, kind: 'stdout', data: Buffer.from(out.slice(0, 40)).toString('base64') }), line({ seq: 2, kind: 'stdout', data: Buffer.from(out.slice(40)).toString('base64') })].join('\n');
    expect(codexAnswersIn(log).map((a) => a.text)).toEqual(['One', 'Two']);
    expect(codexAnswerIn(log)).toEqual({ text: 'Two', isError: false });
    expect(codexAnswerIn('')).toBeNull();
  });
});

describe('the server, with the computer shut', () => {
  const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } };
  function fakeDb() {
    const commands = []; const threads = new Map();
    const iso = (t) => new Date(t).toISOString();
    return {
      commands, threads,
      add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, kind: 'reply', owner: A, device: DEVICE, project: 'alpha', item: 'w-1', ...c, created_at: iso(c.created_at) }); },
      async waitingReplies({ after, before, limit }) { return commands.filter((c) => !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c })); },
      async claim(id, by, at) { const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at); if (!c) return false; Object.assign(c, { claimed_at: at, claimed_by: by }); return true; },
      async giveBack(id, by) { const c = commands.find((x) => x.id === id && x.claimed_by === by && !x.taken_at); if (c) Object.assign(c, { claimed_at: null, claimed_by: null }); },
      async taken(id, outcome, at) { const c = commands.find((x) => x.id === id && !x.taken_at); if (c) Object.assign(c, { taken_at: at, outcome }); },
      async thread(o, d, p, i) { return threads.get(`${o}|${d}|${p}|${i}`) ?? null; },
      async writeThread(o, d, p, i, snapshot) { threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
      async pushDevices() { return [{ token: TOKEN }]; },
      async dropPushDevice() {},
    };
  }
  async function setup() {
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
      removeObject: async () => {}, objects,
      whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
      now: () => clock, plans: SET, log: () => {},
      phone: {
        db,
        runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
        sendPush: async (messages) => { pushed.push(messages); return messages.map(() => ({ status: 'ok' })); },
      },
    });
    await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
    await gw.admin({ do: 'plan', person: A, plan: 'test' });
    await objects.put(`runs/u-${A}/${kitKey(DEVICE, 'alpha', 'w-1').slice('runs/'.length)}`, JSON.stringify(codexKit({ madeAt: clock - MIN })));
    db.threads.set(`${A}|${DEVICE}|alpha|w-1`, { snapshot: threadSnapshot({ id: 'w-1', title: 'Fix checkout', status: 'blocked', updatedAt: clock - 3600_000 }, []) });
    const say = (runId, ...msgs) => {
      const list = out.get(runId) ?? [];
      const text = msgs.map((m) => `${line(m)}\n`).join('');
      list.push({ kind: 'stdout', data: Buffer.from(text.slice(0, 9)).toString('base64') }, { kind: 'stdout', data: Buffer.from(text.slice(9)).toString('base64') });
      out.set(runId, list);
    };
    return {
      gw, db, sent, pushed, say,
      now: () => clock, tick: (ms) => { clock += ms; },
      starts: () => sent.filter((s) => s.payload?.action === 'start'),
      inputs: () => sent.filter((s) => s.payload?.action === 'stdin'),
      text: (s) => Buffer.from(s.payload.data, 'base64').toString('utf8'),
      copy: () => db.threads.get(`${A}|${DEVICE}|alpha|w-1`).snapshot,
      run: () => runOfClaim(db.commands[0].claimed_by),
    };
  }
  const answered = (id, text) => [
    { method: 'item/completed', params: { item: { type: 'agentMessage', text, phase: 'final_answer' } } },
    { method: 'turn/completed', params: { turn: { id, status: 'completed' } } },
  ];

  it('opens the thread, sends her reply as a turn once it is open, and relays the answer when the turn completes', async () => {
    const t = await setup();
    t.db.add({ id: 'c1', payload: { text: 'make the button blue' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    expect(t.starts()[0].payload.offline.endTurn).toBeNull();
    expect(t.starts()[0].payload.argv).toEqual(['codex', 'app-server']);
    // Opened, and her words not sent before the thread is.
    expect(t.inputs().map((s) => s.payload.n)).toEqual([1]);
    expect(t.text(t.inputs()[0]).split('\n').filter(Boolean).map((l) => JSON.parse(l).method)).toEqual(['initialize', 'initialized', 'thread/resume']);
    const runId = t.run();

    t.say(runId, { id: 1, result: {} }, { id: 2, result: { thread: { id: 'th-1' } } });
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.inputs().map((s) => s.payload.n)).toEqual([1, 2]);
    const turn = JSON.parse(t.text(t.inputs()[1]));
    expect(turn).toMatchObject({ id: 3, method: 'turn/start', params: { threadId: 'th-1', input: [{ type: 'text', text: 'Said: make the button blue [end]' }] } });

    t.say(runId, { id: 3, result: { turn: { id: 'tu-1' } } }, ...answered('tu-1', 'Done. The button is blue.'));
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.copy().item).toMatchObject({ answer: 'make the button blue', result: 'Done. The button is blue.', status: 'blocked' });
    expect(t.db.commands[0]).toMatchObject({ outcome: ANSWERED_OUTCOME });
    expect(t.pushed).toHaveLength(1);
    expect(t.pushed[0][0]).toMatchObject({ title: 'Fix checkout' });
  });

  it('a follow-up is the next turn of the same run, and its answer is relayed in turn', async () => {
    const t = await setup();
    t.db.add({ id: 'c1', payload: { text: 'one' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const runId = t.run();
    t.say(runId, { id: 2, result: {} });
    t.tick(MIN);
    await t.gw.phoneSweep();
    t.say(runId, ...answered('tu-1', 'Answer one'));
    t.tick(MIN);
    await t.gw.phoneSweep();
    t.db.add({ id: 'c2', payload: { text: 'two' }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    expect(t.inputs().map((s) => s.payload.n)).toEqual([1, 2, 3]);
    expect(JSON.parse(t.text(t.inputs()[2]))).toMatchObject({ id: 4, method: 'turn/start', params: { threadId: 'th-1', input: [{ type: 'text', text: 'Said: two [end]' }] } });
    expect(runOfClaim(t.db.commands[1].claimed_by)).toBe(runId);
    t.say(runId, ...answered('tu-2', 'Answer two'));
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.copy().item.result).toBe('Answer two');
    expect(t.pushed).toHaveLength(2);
  });

  it('a thread the cloud cannot open is said on the phone, and its run is closed', async () => {
    const t = await setup();
    t.db.add({ id: 'c1', payload: { text: 'one' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    t.say(t.run(), { id: 2, error: { message: 'thread th-1 already has an active writer' } });
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.copy().item.result).toMatch(/could not open this thread.*active writer/);
    expect(t.inputs().at(-1).payload.end).toBe(true);
  });
});

describe('the computer, end to end with a real sandbox', () => {
  let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac; let storage; let codexHome;
  const LOGIN = { engine: 'codex', id: 'C1', key: 'logins/codex/C1.json' };
  const jwt = () => `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.sig`;
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-kit-')));
    objects = new Map();
    s3 = http.createServer((req, res) => {
      const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
      if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
      const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
    });
    await new Promise((r) => s3.listen(0, '127.0.0.1', r));
    s3Url = `http://127.0.0.1:${s3.address().port}`;
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
    sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
    objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'codex', auth: { status: 'signed-in', tokens: { access_token: jwt(), refresh_token: 'r' } } })));
    mac = path.join(tmp, 'mac', 'repo');
    fs.mkdirSync(mac, { recursive: true });
    git(mac, 'init', '-q', '-b', 'main');
    git(mac, 'config', 'user.email', 'dev@example.com');
    git(mac, 'config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
    git(mac, 'add', '.');
    git(mac, 'commit', '-q', '-m', 'first');
    git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
    codexHome = path.join(tmp, 'mac', 'codex-home');
    const day = path.join(codexHome, 'sessions', '2026', '10', '20');
    fs.mkdirSync(day, { recursive: true });
    fs.writeFileSync(path.join(day, 'rollout-2026-10-20T00-00-00-th-1.jsonl'), '{}\n');
    // The stand-in Codex reads its home at the path the run names, which a test sandbox does not move.
    fs.writeFileSync(path.join(codexHome, 'auth.json'), '{"state":"signed-in"}');
    storage = {
      async put(k, body) { objects.set(k, Buffer.from(body)); },
      async get(k) { return objects.get(k) ?? null; },
      async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
      async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
    };
  });
  afterEach(async () => {
    await sandbox?.close();
    s3.closeAllConnections();
    await new Promise((r) => s3.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const sandboxCall = async (payload) => (await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } })).json();
  const frame = replyFrame(`The founder replied:\n\n${REPLY_MARK}\n\nCarry on.`);
  const resume = { threadId: 'th-1', cwd: '', approvalPolicy: 'never', sandbox: 'workspace-write', config: { mcp_servers: { agentbox: { command: '/app/mcp/agentbox-mcp.sh', env: { ZERO_ITEM: 'w-1' } } } } };

  it('a finished Codex turn leaves a Codex kit, the cloud runs her reply from it alone, and waking makes it a Codex run here', async () => {
    const err = new PassThrough(); let said = ''; err.on('data', (d) => { said += d; });
    const copy = path.join(tmp, 'mac', 'kits', 'alpha--w-1.json');
    const code = await cloudRun({
      argv: [FAKE_CODEX, 'app-server'], engine: 'codex',
      env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'alpha', CODEX_HOME: codexHome, AGENTBOX_HOME: path.join(tmp, 'mac', 'store') },
      cwd: mac, transport: { async invoke() { throw new Error('a kit starts nothing'); }, async stop() {} }, storage, login: LOGIN,
      stdout: new PassThrough(), stderr: err, remoteCommand: process.execPath, stubPath: STUB, watchParent: false, signals: new EventEmitter(),
      homeDir: path.join(tmp, 'home'),
      kit: { device: DEVICE, project: 'alpha', item: 'w-1', frame, copy, codex: { resume: { ...resume, cwd: mac }, turn: { threadId: 'th-1' } } },
    });
    expect(code, said).toBe(0);
    const kit = JSON.parse(objects.get(kitKey(DEVICE, 'alpha', 'w-1')));
    expect(checkKit(kit)).toBeNull();
    expect(kit).toMatchObject({ engine: 'codex', login: LOGIN, frame, note: null, argv: [process.execPath, FAKE_CODEX, 'app-server'] });
    expect(kit.env.CODEX_HOME).toBe(codexHome);
    expect(kit.bringDirs).toEqual([{ name: 'sessions.tgz', dir: path.join(codexHome, 'sessions') }]);
    // The thread's rollout goes with the pack, and the store server is the sandbox's stub there.
    expect(kit.files.some((f) => f.path.endsWith('rollout-2026-10-20T00-00-00-th-1.jsonl'))).toBe(true);
    const opened = JSON.parse(kit.codex.open[2]);
    expect(opened.params.config.mcp_servers.agentbox.args).toEqual([STUB, 'agentbox']);
    expect(opened.params.developerInstructions).toMatch(/cloud machine/);
    expect(kit.marker).toMatchObject({ engine: 'codex', mcp: { agentbox: { command: '/app/mcp/agentbox-mcp.sh' } } });

    // THE SERVER: the kit and her reply, nothing of this computer's.
    const runId = crypto.randomUUID();
    const link = async (k) => `${s3Url}/${encodeURIComponent(k)}`;
    const start = await startPayload(kit, { runId, getUrl: link, putUrl: link, loginName: (k) => `${s3Url}/${encodeURIComponent(k)}`, offlineAfterMs: 300, kept: kit.kept, endTurn: null });
    expect((await sandboxCall(start)).ok, JSON.stringify(start)).toBe(true);
    expect((await sandboxCall({ action: 'stdin', runId, n: 1, data: Buffer.from(codexOpenLines(kit)).toString('base64') })).ok).toBe(true);
    const outOf = async () => {
      const page = await sandboxCall({ action: 'events', runId, since: 0, peek: true });
      return (page.events ?? []).filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('');
    };
    let resumed;
    for (let i = 0; i < 200 && resumed === undefined; i += 1) {
      const s = { resumeId: kit.codex.resumeId, turnIds: [] };
      codexReadLines((await outOf()).split('\n'), s);
      resumed = s.resumed;
      if (resumed === undefined) await new Promise((r) => setTimeout(r, 50));
    }
    expect(resumed).toBe(true);
    expect((await sandboxCall({ action: 'stdin', runId, n: 2, data: Buffer.from(codexTurnLines(kit, 'fix the checkout', { id: kit.codex.firstTurnId })).toString('base64') })).ok).toBe(true);
    let answers = [];
    for (let i = 0; i < 200 && !answers.length; i += 1) { answers = codexReadLines((await outOf()).split('\n'), { resumeId: kit.codex.resumeId, turnIds: [kit.codex.firstTurnId] }); if (!answers.length) await new Promise((r) => setTimeout(r, 50)); }
    expect(answers).toEqual([{ text: 'Done. The checkout button works now.', isError: false }]);
    // Her words reached Codex in the turn's own prompt.
    expect(fs.readFileSync(path.join(codexHome, 'fake.log'), 'utf8')).toMatch(/method turn\/start/);

    // THE COMPUTER WAKES: a Codex run of this thread, from its own copy of the kit.
    const marker = markerForCloudRun(readKitCopy(copy), runId);
    expect(marker).toMatchObject({ runId, engine: 'codex', state: 'detached', bringDirs: [{ name: 'sessions.tgz' }] });
    expect(readMarker(mac)).toBeNull();
  }, 90_000);

  it('the supervisor names the Codex thread to resume and the turn to start, read once', () => {
    const f = path.join(tmp, 'frame.json');
    const c = path.join(tmp, 'codex.json');
    fs.writeFileSync(f, JSON.stringify(frame));
    fs.writeFileSync(c, JSON.stringify({ resume: { threadId: 'th-1', cwd: mac }, turn: { threadId: 'th-1', effort: 'low' } }));
    const kit = kitFrom({ AGENTBOX_KIT_DEVICE: DEVICE, ZERO_PRODUCT: 'alpha', ZERO_ITEM: 'w-1', AGENTBOX_KIT_FRAME: f, AGENTBOX_KIT_CODEX: c });
    expect(kit.codex).toEqual({ resume: { threadId: 'th-1', cwd: mac }, turn: { threadId: 'th-1', effort: 'low' } });
    expect(fs.existsSync(c)).toBe(false);
  });
});

describe('the supervisor', () => {
  let tmp; let sup; let row; let folder; let relays; let store;
  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-phone-kit-')));
    const root = path.join(tmp, 'store');
    const repo = path.join(tmp, 'repo');
    folder = path.join(repo, '.claude', 'worktrees', 'w-1');
    fs.mkdirSync(folder, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: folder });
    fs.mkdirSync(path.join(root, 'team'), { recursive: true });
    fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
    store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
    row = { ...store.fileItem('team', { title: 'Fix checkout', kind: 'task', body: 'Fix it.' }), product: 'team' };
    const storeMcp = path.join(tmp, 'store-mcp.sh');
    fs.writeFileSync(storeMcp, '#!/bin/sh\n');
    sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, storeMcpCommand: storeMcp }, store, tmp);
    sup.writeMcpConfig = () => null;
    sup._workerEnv = () => ({});
    relays = [];
    sup._spawnCloudRelay = (args, opts) => {
      const c = new EventEmitter();
      c.stdout = new PassThrough(); c.stderr = new PassThrough(); c.kill = () => true; c.args = args; c.opts = opts;
      relays.push(c);
      return c;
    };
    sup._cloudReady = () => true;
    sup._cloudConfig = { gateway: 'https://cloud.example' };
    sup.phoneCarrying({ device: 'a1b2c3d4e5f6', slugs: ['team'] });
    // A Codex thread with a conversation to resume, as a reply would be planned.
    sup.spawnPlan = (item, _p, opts) => ({ prompt: `The founder replied:\n\n${item.answer}\n\nGo.`, resumeId: 'th-9', engine: opts.engine, args: [], effort: 'medium' });
  });
  afterEach(() => { sup?.stop?.(); fs.rmSync(tmp, { recursive: true, force: true }); });
  const finished = (over = {}) => ({ engine: 'codex', cwd: folder, profile: 'default', result: 'Ready?', resultIsError: false, exitFailed: false, child: { ranToTheEnd: () => true }, ...over });
  const kitWriters = () => relays.filter((r) => r.args[0] === '--agentbox-kit');

  it('after a clean Codex turn, starts the kit writer for a Codex app-server with the thread to resume and the reply\'s place in its turn', () => {
    sup._leaveKitForThePhone(row, finished());
    expect(kitWriters()).toHaveLength(1);
    const { args, opts } = kitWriters()[0];
    expect(args).toEqual(['--agentbox-kit', '--agentbox-codex', 'app-server']);
    expect(opts.env).toMatchObject({ ZERO_PRODUCT: 'team', ZERO_ITEM: row.id, AGENTBOX_KIT_COPY: kitCopyPath(tmp, 'team', row.id) });
    expect(opts.env.CODEX_HOME).toBeTruthy();
    const asked = JSON.parse(fs.readFileSync(opts.env.AGENTBOX_KIT_CODEX, 'utf8'));
    expect(asked.resume).toMatchObject({ threadId: 'th-9', cwd: folder });
    expect(asked.resume.ephemeral).toBeUndefined();
    expect(asked.turn).toEqual({ threadId: 'th-9', effort: 'medium' });
    const f = JSON.parse(fs.readFileSync(opts.env.AGENTBOX_KIT_FRAME, 'utf8'));
    expect(`${f.before}yes${f.after}`).toBe('The founder replied:\n\nyes\n\nGo.');
  });

  it('none for a Codex conversation with nothing to resume, or a computer with no Codex sign-in for the cloud', () => {
    sup.spawnPlan = () => ({ prompt: `x ${REPLY_MARK}`, resumeId: null, args: [] });
    sup._leaveKitForThePhone(row, finished());
    sup.spawnPlan = (item) => ({ prompt: `x ${item.answer}`, resumeId: 'th-9', args: [] });
    sup._cloudReady = (engine) => engine !== 'codex';
    sup._leaveKitForThePhone(row, finished());
    expect(kitWriters()).toHaveLength(0);
  });

  it('a Codex run the cloud started is adopted as a Codex run, her reply on the row, no run here', async () => {
    const kit = { ...codexKit(), cwd: folder, item: row.id, project: 'team', marker: { engine: 'codex', branch: 'agentbox/w-1', startSha: 'abc', bringDirs: [{ name: 'sessions.tgz', dir: path.join(tmp, '.codex', 'sessions') }] } };
    fs.mkdirSync(path.dirname(kitCopyPath(tmp, 'team', row.id)), { recursive: true });
    fs.writeFileSync(kitCopyPath(tmp, 'team', row.id), JSON.stringify(kit));
    sup._bringCloudHome = () => {};
    sup._cloudStorage = async () => ({ put: async () => {} });
    expect(await sup.adoptCloudRun({ product: 'team', itemId: row.id, runId: 'r-1', replies: ['fix it'] })).toBe('adopted');
    expect(readMarker(folder)).toMatchObject({ runId: 'r-1', engine: 'codex' });
    expect(sup._liveSessions[row.id]).toMatchObject({ engine: 'codex', cloud: true });
    expect(store.readItem('team', row.id).answer).toBe('fix it');
  });

  it('a returning Codex run\'s answer reaches its row through Codex\'s own readers', () => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => true;
    const rec = { product: 'team', cwd: folder, engine: 'codex', cloud: true, startedAt: Date.now() };
    sup._liveSessions[row.id] = rec;
    const follow = sup._followComingHome({ itemId: row.id, rec }, child);
    child.stdout.write(`${line({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'Fixed it.', phase: 'final_answer' } } })}\n${line({ method: 'turn/completed', params: { turn: { id: 'tu', status: 'completed' } } })}\n`);
    follow.end(0);
    expect(store.readItem('team', row.id).result).toBe('Fixed it.');
  });
});
