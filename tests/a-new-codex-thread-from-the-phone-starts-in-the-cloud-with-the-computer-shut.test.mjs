// A NEW CODEX THREAD FROM THE PHONE STARTS IN THE CLOUD WITH THE COMPUTER SHUT.
//
// A new thread from the phone started in the cloud only on Claude Code: one
// she asked to run on Codex, or one in a project whose new threads run on
// Codex, was left for the computer ("it is for another coding agent"). The
// founder, 2026-10-24: "these are all very important to be viable on mobile,
// esp new threads and codex".
//
// Now a project on the phone also keeps a Codex new-thread kit, when this
// computer has a Codex sign-in for the cloud: the app-server lines that start
// a thread for the stand-in item (thread/start, the folder and names marked),
// the turn's settings, and the new thread's own brief. The server picks the
// kit by the engine she chose, or by the one the project gives a new thread;
// it starts the thread, learns its id from the start's answer, sends the
// brief as the first turn and relays the answer. Waking, the computer adopts
// it as a Codex run under the phone's id.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import {
  KIT_VERSION, NEW_THREAD, NEW_THREAD_CODEX, NEW_ITEM_MARK, NEW_TITLE_MARK, NEW_BODY_MARK,
  newThreadKitKey, fillNewThreadKit, checkKit, codexReadLines, codexTurnLines, runOfClaim,
} from '../shared/cloud-kit.mjs';
import { madeHere } from '../shared/phone-snapshot.mjs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { kitFrom } from '../main/cloud/run-cli.mjs';
import { codexKitOpen } from '../main/cloud/run.mjs';
import { kitCopyPath } from '../main/cloud/kit.mjs';
import { readMarker } from '../main/cloud/marker.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const SHA = 'c'.repeat(40);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

const startLine = (cwd) => JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'thread/start', params: { cwd, model: 'gpt-6-luna', config: { mcp_servers: { store: { command: 'node', args: ['stub', 'store'], env: { ZERO_ITEM: NEW_ITEM_MARK } } } } } });

// A project's Codex new-thread kit as the computer writes it.
const codexProjectKit = (t = Date.now(), over = {}) => ({
  v: KIT_VERSION, engine: 'codex', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: NEW_THREAD_CODEX,
  cwd: `/Users/me/dev/alpha/.claude/worktrees/${NEW_ITEM_MARK}`, branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA,
  argv: ['codex', 'app-server'], env: { ZERO_ITEM: NEW_ITEM_MARK, ZERO_PRODUCT: 'alpha', CODEX_HOME: '/Users/me/.codex' },
  bundleKey: `runs/kits/${DEVICE}/alpha/_new-codex/in.bundle`,
  login: { engine: 'codex', id: 'acct-c', key: 'logins/codex/acct-c.json' },
  bringDirs: [{ name: 'sessions.tgz', dir: '/Users/me/.codex/sessions' }],
  frame: { before: `Item ${NEW_ITEM_MARK}. They said: `, after: ' [end]' },
  marker: { branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA, engine: 'codex', bringDirs: [{ name: 'sessions.tgz', dir: '/Users/me/.codex/sessions' }], toolEnv: { ZERO_ITEM: NEW_ITEM_MARK } },
  codex: {
    open: [JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }), startLine(`/Users/me/dev/alpha/.claude/worktrees/${NEW_ITEM_MARK}`)],
    startId: 2, firstTurnId: 3, turn: { effort: 'high' },
  },
  newThread: { mainSha: SHA, brief: `# Your work item\nWork item id: ${NEW_ITEM_MARK}\nTitle: ${NEW_TITLE_MARK}\n\n${NEW_BODY_MARK}\n`, model: 'gpt-6-luna', effort: 'high', defaultEngine: 'claude' },
  ...over,
});

const claudeProjectKit = (t = Date.now(), over = {}) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: NEW_THREAD,
  cwd: `/Users/me/dev/alpha/.claude/worktrees/${NEW_ITEM_MARK}`, branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA,
  argv: ['claude', '-p'], env: { ZERO_ITEM: NEW_ITEM_MARK },
  bundleKey: `runs/kits/${DEVICE}/alpha/_new/in.bundle`,
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: `/Users/me/.claude/projects/x-${NEW_ITEM_MARK}` }],
  frame: { before: 'said: ', after: '' },
  newThread: { mainSha: SHA, brief: `Title: ${NEW_TITLE_MARK}\n${NEW_BODY_MARK}`, model: null, effort: null, defaultEngine: 'claude' },
  ...over,
});

describe('a project\'s Codex kit for a new thread', () => {
  it('is kept beside its Claude Code one', () => {
    expect(newThreadKitKey(DEVICE, 'alpha', 'codex')).toBe(`runs/kits/${DEVICE}/alpha/_new-codex.json`);
    expect(newThreadKitKey(DEVICE, 'alpha')).toBe(`runs/kits/${DEVICE}/alpha/_new.json`);
  });

  it('is trusted with the lines that start a thread and no thread to resume', () => {
    expect(checkKit(codexProjectKit())).toBeNull();
    const { codex } = codexProjectKit();
    expect(checkKit(codexProjectKit(Date.now(), { codex: { ...codex, startId: undefined } }))).toMatch(/Codex kit/);
    expect(checkKit(codexProjectKit(Date.now(), { codex: { ...codex, firstTurnId: 2 } }))).toMatch(/Codex kit/);
  });

  it('filled, names the thread inside the lines that start it, and they stay whole JSON', () => {
    const filled = fillNewThreadKit(codexProjectKit(), { itemId: 'w-0123456789', title: 'Fix it', body: 'Now.' });
    const start = JSON.parse(filled.kit.codex.open[2]);
    expect(start.params.cwd).toBe('/Users/me/dev/alpha/.claude/worktrees/w-0123456789');
    expect(start.params.config.mcp_servers.store.env.ZERO_ITEM).toBe('w-0123456789');
    expect(filled.prompt).toBe('# Your work item\nWork item id: w-0123456789\nTitle: Fix it\n\nNow.\n');
    expect(JSON.stringify(filled)).not.toContain(NEW_ITEM_MARK);
    expect(checkKit(filled.kit)).toBeNull();
  });
});

describe('a new Codex thread\'s lines', () => {
  it('the start\'s answer names the thread, and a refused start says why', () => {
    const state = { resumeId: 2, turnIds: [] };
    codexReadLines([JSON.stringify({ jsonrpc: '2.0', id: 2, result: { thread: { id: 'th-9' } } })], state);
    expect(state).toMatchObject({ resumed: true, threadId: 'th-9' });
    const refused = { resumeId: 2, turnIds: [] };
    codexReadLines([JSON.stringify({ jsonrpc: '2.0', id: 2, error: { message: 'no model' } })], refused);
    expect(refused.resumed).toBe('no model');
  });

  it('its first turn is its brief as it stands, in the thread the start named', () => {
    const line = JSON.parse(codexTurnLines(codexProjectKit(), null, { id: 3, raw: 'the brief', threadId: 'th-9' }));
    expect(line).toEqual({ jsonrpc: '2.0', id: 3, method: 'turn/start', params: { threadId: 'th-9', effort: 'high', input: [{ type: 'text', text: 'the brief' }] } });
  });

  it('a reply after it goes in the reply\'s place, in the same thread', () => {
    const line = JSON.parse(codexTurnLines(codexProjectKit(), 'more', { id: 4, threadId: 'th-9' }));
    expect(line.params).toMatchObject({ threadId: 'th-9', input: [{ type: 'text', text: `Item ${NEW_ITEM_MARK}. They said: more [end]` }] });
  });
});

/* ------------------------------ the server ------------------------------ */

const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } };

function fakeDb() {
  const commands = [];
  const threads = new Map();
  const iso = (t) => new Date(t).toISOString();
  return {
    commands, threads,
    add(c) { commands.push({ claimed_at: null, claimed_by: null, taken_at: null, outcome: null, kind: 'new', owner: A, device: DEVICE, project: 'alpha', item: null, ...c, created_at: iso(c.created_at) }); },
    async waitingReplies({ after, before, limit }) {
      return commands.filter((c) => ['reply', 'new'].includes(c.kind) && !c.taken_at && !c.claimed_at && Date.parse(c.created_at) > after && Date.parse(c.created_at) < before).slice(0, limit).map((c) => ({ ...c }));
    },
    async claim(id, by, at) { const c = commands.find((x) => x.id === id && !x.claimed_at && !x.taken_at); if (!c) return false; Object.assign(c, { claimed_at: at, claimed_by: by }); return true; },
    async giveBack(id, by) { const c = commands.find((x) => x.id === id && x.claimed_by === by && !x.taken_at); if (c) Object.assign(c, { claimed_at: null, claimed_by: null }); },
    async taken(id, outcome, at) { const c = commands.find((x) => x.id === id && !x.taken_at); if (c) Object.assign(c, { taken_at: at, outcome }); },
    async thread(o, d, p, i) { return threads.get(`${o}|${d}|${p}|${i}`) ?? null; },
    async writeThread(o, d, p, i, snapshot) { threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
    async newThread(o, d, p, i, snapshot) { if (!threads.has(`${o}|${d}|${p}|${i}`)) threads.set(`${o}|${d}|${p}|${i}`, { snapshot }); },
    async pushDevices() { return []; },
    async dropPushDevice() {},
  };
}

async function server({ kits = { codex: codexProjectKit, claude: null } } = {}) {
  let clock = Date.UTC(2026, 9, 24, 12, 0, 0);
  const sent = []; const logs = [];
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
      async stop() {},
    },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {}, objects,
    whoIs: async (tok) => (tok === 'session-of-a' ? { id: A } : null),
    now: () => clock, plans: SET, log: (m) => logs.push(m),
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => messages.map(() => ({ status: 'ok' })),
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  const put = (engine, kit) => objects.put(`runs/u-${A}/${newThreadKitKey(DEVICE, 'alpha', engine).slice('runs/'.length)}`, JSON.stringify(kit));
  if (kits.codex) await put('codex', kits.codex(clock));
  if (kits.claude) await put('claude', kits.claude(clock));
  const lines = (s) => Buffer.from(s.payload.data, 'base64').toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return {
    gw, db, sent, logs,
    now: () => clock, tick: (ms) => { clock += ms; },
    starts: () => sent.filter((s) => s.payload?.action === 'start'),
    inputs: () => sent.filter((s) => s.payload?.action === 'stdin' && s.payload.data),
    lines,
    say(runId, ...msgs) {
      const text = msgs.map((m) => `${JSON.stringify(m)}\n`).join('');
      out.set(runId, [...(out.get(runId) ?? []), { kind: 'stdout', data: Buffer.from(text).toString('base64') }]);
    },
  };
}

const finalAnswer = (text) => [
  { jsonrpc: '2.0', method: 'item/completed', params: { threadId: 'th-9', item: { type: 'agentMessage', phase: 'final_answer', text } } },
  { jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'th-9', turn: { status: 'completed' } } },
];

describe('the cloud server and a new Codex thread from the phone', () => {
  it('starts the thread, sends its brief as the first turn once the thread is named, and relays the answer', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000001', payload: { title: 'Fix the bug', body: 'It crashes.', engine: 'codex' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const itemId = madeHere('c0ffee00-0000-4000-8000-000000000001');
    expect(t.starts()).toHaveLength(1);
    expect(t.starts()[0].payload).toMatchObject({ argv: ['codex', 'app-server'], branch: `agentbox/${itemId}`, refs: { [`refs/heads/agentbox/${itemId}`]: SHA } });
    // The lines that open it: the start names the thread's own folder.
    const open = t.lines(t.inputs()[0]);
    expect(open.map((l) => l.method)).toEqual(['initialize', 'initialized', 'thread/start']);
    expect(open[2].params.cwd).toBe(`/Users/me/dev/alpha/.claude/worktrees/${itemId}`);
    const runId = runOfClaim(t.db.commands[0].claimed_by);
    // No turn before the start has answered.
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.inputs()).toHaveLength(1);
    t.say(runId, { jsonrpc: '2.0', id: 2, result: { thread: { id: 'th-9' } } });
    t.tick(MIN);
    await t.gw.phoneSweep();
    const turn = t.lines(t.inputs()[1])[0];
    expect(turn).toMatchObject({ id: 3, method: 'turn/start', params: { threadId: 'th-9', effort: 'high', input: [{ type: 'text', text: `# Your work item\nWork item id: ${itemId}\nTitle: Fix the bug\n\nIt crashes.\n` }] } });
    t.say(runId, ...finalAnswer('Fixed it.'));
    t.tick(MIN);
    await t.gw.phoneSweep();
    expect(t.db.threads.get(`${A}|${DEVICE}|alpha|${itemId}`).snapshot.item).toMatchObject({ result: 'Fixed it.', status: 'blocked' });
    expect(t.db.commands[0].taken_at).toBeTruthy();
  });

  it('a reply to it is the next turn of the same thread', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000002', payload: { title: 'Plan it', engine: 'codex' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const itemId = madeHere('c0ffee00-0000-4000-8000-000000000002');
    const runId = runOfClaim(t.db.commands[0].claimed_by);
    t.say(runId, { jsonrpc: '2.0', id: 2, result: { thread: { id: 'th-9' } } });
    t.tick(MIN);
    await t.gw.phoneSweep();
    t.say(runId, ...finalAnswer('A plan.'));
    t.tick(MIN);
    await t.gw.phoneSweep();
    t.db.add({ id: 'r2', kind: 'reply', item: itemId, payload: { text: 'go' }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    const next = t.lines(t.inputs()[2])[0];
    expect(next).toMatchObject({ id: 4, method: 'turn/start', params: { threadId: 'th-9', input: [{ type: 'text', text: `Item ${itemId}. They said: go [end]` }] } });
  });

  it('with no engine chosen, takes the engine the project gives a new thread', async () => {
    const t = await server({ kits: { codex: (c) => codexProjectKit(c, { newThread: { ...codexProjectKit().newThread, defaultEngine: 'codex' } }), claude: (c) => claudeProjectKit(c, { newThread: { ...claudeProjectKit().newThread, defaultEngine: 'codex' } }) } });
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000003', payload: { title: 'Do it' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()[0].payload.argv).toEqual(['codex', 'app-server']);
  });

  it('with no engine chosen in a Claude Code project, starts Claude Code', async () => {
    const t = await server({ kits: { codex: codexProjectKit, claude: claudeProjectKit } });
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000004', payload: { title: 'Do it' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()[0].payload.argv).toEqual(['claude', '-p']);
  });

  it('a Codex thread with no Codex kit, or a model its kit does not run, is left to the computer', async () => {
    const t = await server({ kits: { codex: null, claude: claudeProjectKit } });
    t.db.add({ id: 'c1', payload: { title: 'x', engine: 'codex' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(0);
    const u = await server();
    u.db.add({ id: 'c2', payload: { title: 'x', engine: 'codex', model: 'gpt-other' }, created_at: u.now() - 2 * MIN });
    await u.gw.phoneSweep();
    expect(u.starts()).toHaveLength(0);
    expect(u.db.commands[0].claimed_at).toBeNull();
  });
});

/* ------------------------------ the computer ----------------------------- */

describe('the computer\'s side of a new Codex thread', () => {
  let tmp;
  beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'new-codex-'))); });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('the kit writer is told to start a thread, and names the kit for Codex', () => {
    const asked = path.join(tmp, 'codex.json');
    fs.writeFileSync(asked, JSON.stringify({ start: { cwd: '/x', model: 'gpt-6-luna' }, turn: { effort: 'high' } }));
    const brief = path.join(tmp, 'new.json');
    fs.writeFileSync(brief, JSON.stringify({ cwd: '/x', brief: 'b', model: 'gpt-6-luna', effort: 'high', defaultEngine: 'codex' }));
    const frame = path.join(tmp, 'frame.json');
    fs.writeFileSync(frame, JSON.stringify({ before: 'a', after: 'b' }));
    const kit = kitFrom({ AGENTBOX_KIT_DEVICE: DEVICE, ZERO_PRODUCT: 'alpha', ZERO_ITEM: NEW_ITEM_MARK, AGENTBOX_KIT_FRAME: frame, AGENTBOX_KIT_CODEX: asked, AGENTBOX_KIT_NEW: brief });
    expect(kit).toMatchObject({ item: NEW_THREAD_CODEX, codex: { start: { cwd: '/x' }, turn: { effort: 'high' } }, newThread: { defaultEngine: 'codex' } });
  });

  it('opens a new thread with thread/start, as the computer\'s own client does', () => {
    const open = codexKitOpen({ start: { cwd: '/x', config: { mcp_servers: { store: { command: 'node', args: ['s'], env: {} } } } } }, { codexHome: '/h', keep: {} });
    const lines = open.lines.map((l) => JSON.parse(l));
    expect(lines.map((l) => l.method)).toEqual(['initialize', 'initialized', 'thread/start']);
    expect(lines[2]).toMatchObject({ id: 2, params: { cwd: '/x', ephemeral: false } });
    expect(lines[2].params.config.mcp_servers.store.args[1]).toBe('store');
  });

  describe('the supervisor', () => {
    let store; let sup; let repo; let relays; let homecomings;
    beforeEach(async () => {
      const root = path.join(tmp, 'store');
      repo = path.join(tmp, 'repo');
      fs.mkdirSync(repo, { recursive: true });
      git(repo, 'init', '-q', '-b', 'main');
      git(repo, 'config', 'user.email', 'dev@example.com');
      git(repo, 'config', 'user.name', 'Dev');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
      git(repo, 'add', '.');
      git(repo, 'commit', '-q', '-m', 'first');
      fs.mkdirSync(path.join(root, 'team'), { recursive: true });
      fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
      store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
      const storeMcp = path.join(tmp, 'store-mcp.sh');
      fs.writeFileSync(storeMcp, '#!/bin/sh\n');
      sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, storeMcpCommand: storeMcp }, store, tmp);
      sup.writeMcpConfig = () => null;
      sup._workerEnv = () => ({});
      relays = [];
      sup._spawnCloudRelay = (args, opts) => {
        const c = new EventEmitter();
        c.stdout = new PassThrough(); c.stderr = new PassThrough();
        c.kill = () => true; c.args = args; c.opts = opts;
        relays.push(c);
        return c;
      };
      sup._cloudReady = () => true;
      sup._cloudConfig = { gateway: 'https://cloud.example' };
      sup.codexThreadParamsFor = (plan, cwd) => ({ cwd, model: 'gpt-6-luna', instructions: plan.system ?? null });
      sup.codexTurnParamsFor = (plan) => ({ input: [{ type: 'text', text: plan.prompt }], effort: 'high' });
      sup.phoneCarrying({ device: DEVICE, slugs: ['team'] });
      homecomings = [];
      sup._bringCloudHome = (place) => homecomings.push(place);
      sup._cloudStorage = async () => ({ put: async () => {} });
    });
    afterEach(() => sup?.stop?.());

    const writers = () => relays.filter((r) => r.args[0] === '--agentbox-kit');

    it('leaves a Codex new-thread kit beside the Claude Code one, starting a thread for the stand-in', async () => {
      await sup._leaveNewThreadKit('team');
      const codex = writers().find((w) => w.args.includes('--agentbox-codex'));
      expect(codex).toBeTruthy();
      expect(codex.opts.env).toMatchObject({ ZERO_ITEM: NEW_ITEM_MARK, AGENTBOX_KIT_COPY: kitCopyPath(tmp, 'team', NEW_THREAD_CODEX) });
      const asked = JSON.parse(fs.readFileSync(codex.opts.env.AGENTBOX_KIT_CODEX, 'utf8'));
      expect(asked.start.cwd).toBe(path.join(fs.realpathSync(repo), '.claude', 'worktrees', NEW_ITEM_MARK));
      expect(asked.turn).toEqual({ effort: 'high' });
      const brief = JSON.parse(fs.readFileSync(codex.opts.env.AGENTBOX_KIT_NEW, 'utf8'));
      expect(brief.brief).toContain(`Title: ${NEW_TITLE_MARK}`);
      expect(['claude', 'codex']).toContain(brief.defaultEngine);
    });

    it('none for Codex when this computer has no Codex sign-in for the cloud', async () => {
      sup._cloudReady = (engine) => engine !== 'codex';
      await sup._leaveNewThreadKit('team');
      expect(writers().some((w) => w.args.includes('--agentbox-codex'))).toBe(false);
      expect(writers()).toHaveLength(1);
    });

    it('waking, adopts a new Codex thread as a Codex run under the phone\'s id', async () => {
      const main = git(repo, 'rev-parse', 'refs/heads/main');
      const realRepo = fs.realpathSync(repo);
      const kit = codexProjectKit(Date.now(), {
        project: 'team', cwd: path.join(realRepo, '.claude', 'worktrees', NEW_ITEM_MARK), startSha: main,
        marker: { branch: `agentbox/${NEW_ITEM_MARK}`, startSha: main, engine: 'codex', bringDirs: [{ name: 'sessions.tgz', dir: path.join(tmp, '.codex', 'sessions') }] },
      });
      kit.newThread = { ...kit.newThread, mainSha: main };
      fs.mkdirSync(path.join(tmp, 'cloud-kits'), { recursive: true });
      fs.writeFileSync(kitCopyPath(tmp, 'team', NEW_THREAD_CODEX), JSON.stringify(kit));
      sup._makeTaskFolder = async (base, id) => {
        const folder = path.join(fs.realpathSync(base), '.claude', 'worktrees', id);
        git(base, 'worktree', 'add', '-q', folder, `agentbox/${id}`);
        return folder;
      };
      const command = 'c0ffee00-0000-4000-8000-000000000009';
      const itemId = madeHere(command);
      const out = await sup.adoptCloudNewThread({ product: 'team', itemId, runId: 'r-1', title: 'Fix it', body: 'Now.', command, replies: [], choices: { engine: 'codex' } });
      expect(out).toBe('adopted');
      const folder = path.join(realRepo, '.claude', 'worktrees', itemId);
      expect(readMarker(folder)).toMatchObject({ runId: 'r-1', engine: 'codex', state: 'detached' });
      expect(sup._liveSessions[itemId]).toMatchObject({ engine: 'codex', cloud: true });
      expect(homecomings).toEqual([folder]);
      expect(sup.sessions.size).toBe(0);
    });
  });
});
