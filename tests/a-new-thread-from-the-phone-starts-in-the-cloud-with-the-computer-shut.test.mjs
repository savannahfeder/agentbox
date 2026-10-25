// A NEW THREAD FROM THE PHONE STARTS IN THE CLOUD WITH THE COMPUTER SHUT.
//
// Replies carried on in the cloud with the lid shut (tests/a-phone-reply-
// carries-on-in-the-cloud-with-the-computer-shut), but a new thread from the
// phone still waited for the computer. The founder, 2026-10-24: "these are all
// very important to be viable on mobile, esp new threads and codex".
//
// Now each project on the phone keeps a new-thread kit beside its threads'
// kits: a fresh thread's own command line and brief, built for a stand-in
// item whose id, title and body are marks, packed from main. The cloud
// server fills it with the id the computer gives a thread the phone started
// (madeHere of the command) and her words, starts it on a branch at that
// main, writes the phone's copy, and relays its turns as it does a reply's.
// The computer, waking, makes the row under that id, its folder on that
// branch, and joins the run, starting nothing of its own.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import {
  KIT_VERSION, NEW_THREAD, NEW_ITEM_MARK, NEW_TITLE_MARK, NEW_BODY_MARK, REPLY_MARK,
  newThreadKitKey, fillNewThreadKit, checkKit, startPayload, runOfClaim, replyPrompt,
} from '../shared/cloud-kit.mjs';
import { madeHere, threadSnapshot, withCloudTurn, newThreadSnapshot } from '../shared/phone-snapshot.mjs';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';
import { TERMS_VERSION } from '../cloud/gateway/terms.mjs';
import { cloudRun } from '../main/cloud/run.mjs';
import { kitFrom } from '../main/cloud/run-cli.mjs';
import { readKitCopy, kitCopyPath } from '../main/cloud/kit.mjs';
import { readMarker } from '../main/cloud/marker.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const DEVICE = 'a1b2c3d4e5f6';
const MIN = 60_000;
const SHA = 'c'.repeat(40);
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

// A project's new-thread kit as the computer writes it.
const projectKit = (t = Date.now(), over = {}) => ({
  v: KIT_VERSION, engine: 'claude', madeAt: t - MIN, device: DEVICE, project: 'alpha', item: NEW_THREAD,
  cwd: `/Users/me/dev/alpha/.claude/worktrees/${NEW_ITEM_MARK}`, branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA,
  argv: ['claude', '-p', '--output-format', 'stream-json'], env: { ZERO_ITEM: NEW_ITEM_MARK, ZERO_PRODUCT: 'alpha' },
  bundleKey: `runs/kits/${DEVICE}/alpha/_new/in.bundle`,
  login: { engine: 'claude', id: 'acct-1', key: 'logins/claude/acct-1.json' },
  bringDirs: [{ name: 'projects.tgz', dir: `/Users/me/.claude/projects/-Users-me-dev-alpha--claude-worktrees-${NEW_ITEM_MARK}` }],
  frame: { before: `Item ${NEW_ITEM_MARK}. They said: `, after: ' [end]' },
  marker: { branch: `agentbox/${NEW_ITEM_MARK}`, startSha: SHA, sent: { branch: `agentbox/${NEW_ITEM_MARK}`, head: SHA, tree: 't', index: 't' }, toolEnv: { ZERO_ITEM: NEW_ITEM_MARK }, engine: 'claude' },
  newThread: { mainSha: SHA, brief: `# Your work item\nWork item id: ${NEW_ITEM_MARK}\nTitle: ${NEW_TITLE_MARK}\n\n${NEW_BODY_MARK}\n`, model: null, effort: null },
  ...over,
});

describe('a project\'s kit for a new thread', () => {
  it('is kept beside its threads\' kits', () => {
    expect(newThreadKitKey(DEVICE, 'alpha')).toBe(`runs/kits/${DEVICE}/alpha/_new.json`);
  });

  it('filled, is the same folder, branch, brief and names the computer gives that thread', () => {
    const filled = fillNewThreadKit(projectKit(), { itemId: 'w-0123456789', title: 'Fix the bug', body: 'It crashes on start.' });
    expect(filled.kit).toMatchObject({
      item: 'w-0123456789', cwd: '/Users/me/dev/alpha/.claude/worktrees/w-0123456789', branch: 'agentbox/w-0123456789',
      env: { ZERO_ITEM: 'w-0123456789', ZERO_PRODUCT: 'alpha' },
    });
    expect(filled.kit.bringDirs[0].dir).toBe('/Users/me/.claude/projects/-Users-me-dev-alpha--claude-worktrees-w-0123456789');
    expect(filled.kit.marker).toMatchObject({ branch: 'agentbox/w-0123456789', toolEnv: { ZERO_ITEM: 'w-0123456789' }, sent: { branch: 'agentbox/w-0123456789' } });
    expect(filled.prompt).toBe('# Your work item\nWork item id: w-0123456789\nTitle: Fix the bug\n\nIt crashes on start.\n');
    expect(replyPrompt(filled.kit.frame, 'more')).toBe('Item w-0123456789. They said: more [end]');
    expect(filled.refs).toEqual({ 'refs/heads/agentbox/w-0123456789': SHA });
    expect(JSON.stringify(filled)).not.toContain(NEW_ITEM_MARK);
    expect(filled.kit.newThread).toBeUndefined();
    expect(checkKit(filled.kit)).toBeNull();
  });

  it('her words are put in once, and a mark she happens to type is left as she typed it', () => {
    const filled = fillNewThreadKit(projectKit(), { itemId: 'w-1', title: `a ${NEW_BODY_MARK}`, body: 'b' });
    expect(filled.prompt).toContain(`Title: a ${NEW_BODY_MARK}\n\nb\n`);
  });

  it('is nothing for a kit that is not one, or an id no folder may have', () => {
    expect(fillNewThreadKit({ ...projectKit(), newThread: undefined }, { itemId: 'w-1', title: 't' })).toBeNull();
    expect(fillNewThreadKit(projectKit(), { itemId: '../x', title: 't' })).toBeNull();
  });
});

describe('the start for a new thread', () => {
  const link = async (k) => `L:${k}`;
  it('makes its branch at the main the kit saw', async () => {
    const { kit, refs } = fillNewThreadKit(projectKit(), { itemId: 'w-1', title: 't', body: '' });
    const p = await startPayload(kit, { runId: 'r1', getUrl: link, putUrl: link, loginName: (k) => k, refs });
    expect(p).toMatchObject({ branch: 'agentbox/w-1', cwd: '/Users/me/dev/alpha/.claude/worktrees/w-1', refs: { 'refs/heads/agentbox/w-1': SHA } });
  });
  it('adds its branch to the refs a thin bundle names', async () => {
    const { kit, refs } = fillNewThreadKit(projectKit(Date.now(), { bundleKey: null, base: { key: 'runs/cache/b.bundle', sha: SHA }, refs: { 'refs/heads/main': SHA } }), { itemId: 'w-1', title: 't' });
    const p = await startPayload(kit, { runId: 'r1', getUrl: link, putUrl: link, loginName: (k) => k, refs });
    expect(p.refs).toEqual({ 'refs/heads/main': SHA, 'refs/heads/agentbox/w-1': SHA });
  });
});

describe('the phone\'s copy of a new thread', () => {
  it('opens with her ask, the way the computer\'s copy does', () => {
    const snap = newThreadSnapshot({ itemId: 'w-1', title: 'Fix it', body: 'Now.', at: 1000 });
    expect(snap.item).toMatchObject({ id: 'w-1', title: 'Fix it', body: 'Now.', status: 'claimed', createdAt: 1000 });
    expect(snap.history).toEqual([expect.objectContaining({ id: 'w-1', source: 'founder', patch: expect.objectContaining({ title: 'Fix it', body: 'Now.' }) })]);
  });
  it('its first answer lands with no reply line of hers before it', () => {
    const snap = newThreadSnapshot({ itemId: 'w-1', title: 'Fix it', body: 'Now.', at: 1000 });
    const next = withCloudTurn(snap, { reply: null, answer: 'Fixed.', repliedAt: 1000, answeredAt: 2000 });
    expect(next.history.map((l) => l.source)).toEqual(['founder', 'agent', 'system']);
    expect(next.item).toMatchObject({ result: 'Fixed.', status: 'blocked' });
    expect(next.item.answer).toBeUndefined();
  });
});

/* ------------------------------ the server ------------------------------ */

const SET = { ...PLANS, test: { agents: 2, hoursPerMonth: 5 } };
const TOKEN = 'ExponentPushToken[abcdefghij0123456789AB]';

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
    async pushDevices() { return [{ token: TOKEN }]; },
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
      async stop() {},
    },
    links: { get: async (k) => `https://b/get/${k}`, put: async (k) => `https://b/put/${k}`, head: async (k) => `https://b/head/${k}` },
    removeObject: async () => {}, objects,
    whoIs: async (tok) => (tok === 'session-of-a' ? { id: A } : null),
    now: () => clock, plans: SET, log: (m) => logs.push(m),
    phone: {
      db,
      runFiles: { get: async (k) => (await objects.get(k))?.body ?? null, put: (k, body) => objects.put(k, body) },
      sendPush: async (messages) => { pushed.push(messages); return messages.map(() => ({ status: 'ok' })); },
    },
  });
  await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: JSON.stringify({ acceptedTerms: TERMS_VERSION }) });
  await gw.admin({ do: 'plan', person: A, plan: 'test' });
  await objects.put(`runs/u-${A}/${newThreadKitKey(DEVICE, 'alpha').slice('runs/'.length)}`, JSON.stringify(projectKit(clock)));
  return {
    gw, db, sent, pushed, logs, objects,
    now: () => clock, tick: (ms) => { clock += ms; },
    starts: () => sent.filter((s) => s.payload?.action === 'start'),
    inputs: () => sent.filter((s) => s.payload?.action === 'stdin'),
    said: (s) => JSON.parse(Buffer.from(s.payload.data, 'base64').toString('utf8')).message.content,
    answer(runId, text) {
      const line = `${JSON.stringify({ type: 'result', result: text, is_error: false })}\n`;
      out.set(runId, [...(out.get(runId) ?? []), { kind: 'stdout', data: Buffer.from(line).toString('base64') }]);
    },
  };
}

describe('the cloud server and a new thread from the phone', () => {
  it('starts it from the project\'s kit under the id the computer will give it, and writes the phone\'s copy', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000001', payload: { title: 'Fix the bug', body: 'It crashes on start.' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const itemId = madeHere('c0ffee00-0000-4000-8000-000000000001');
    expect(t.starts()).toHaveLength(1);
    const start = t.starts()[0].payload;
    expect(start).toMatchObject({ branch: `agentbox/${itemId}`, cwd: `/Users/me/dev/alpha/.claude/worktrees/${itemId}`, refs: { [`refs/heads/agentbox/${itemId}`]: SHA }, env: { ZERO_ITEM: itemId } });
    expect(start.offline.endTurn).toBeNull();
    expect(t.starts()[0].sessionId).toContain(itemId);
    // Her ask, in the new thread's own brief, with no cloud note (the kit's command line carries it).
    expect(t.said(t.inputs()[0])).toBe(`# Your work item\nWork item id: ${itemId}\nTitle: Fix the bug\n\nIt crashes on start.\n`);
    const runId = runOfClaim(t.db.commands[0].claimed_by);
    expect(runId).toBeTruthy();
    expect(t.db.threads.get(`${A}|${DEVICE}|alpha|${itemId}`).snapshot.item).toMatchObject({ id: itemId, title: 'Fix the bug' });
    // Its first answer, relayed as a reply's is: on the copy, the command taken, one alert headed by its title.
    t.answer(runId, 'Fixed it.');
    t.tick(MIN);
    await t.gw.phoneSweep();
    const copy = t.db.threads.get(`${A}|${DEVICE}|alpha|${itemId}`).snapshot;
    expect(copy.item).toMatchObject({ result: 'Fixed it.', status: 'blocked' });
    expect(copy.history.filter((l) => l.source === 'founder')).toHaveLength(1);
    expect(t.db.commands[0].taken_at).toBeTruthy();
    expect(t.pushed.flat()).toEqual([expect.objectContaining({ title: 'Fix the bug', data: { product: `alpha@${DEVICE}`, id: itemId } })]);
  });

  it('a reply to it on the phone goes to the same run', async () => {
    const t = await server();
    t.db.add({ id: 'c0ffee00-0000-4000-8000-000000000002', payload: { title: 'Plan it', body: '' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    const itemId = madeHere('c0ffee00-0000-4000-8000-000000000002');
    const runId = runOfClaim(t.db.commands[0].claimed_by);
    t.answer(runId, 'Here is a plan.');
    t.tick(MIN);
    await t.gw.phoneSweep();
    t.db.add({ id: 'c3', kind: 'reply', item: itemId, payload: { text: 'go' }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(1);
    expect(t.inputs().map((s) => s.payload.n)).toEqual([1, 2]);
    expect(t.said(t.inputs()[1])).toBe(`Item ${itemId}. They said: go [end]`);
    expect(t.db.commands[1].claimed_by).toBe(`cloud:${runId}`);
  });

  it('leaves to the computer one it cannot start as asked, and says why once', async () => {
    const t = await server();
    const asks = [
      { start: 'later' }, { runAt: Date.UTC(2026, 10, 1) }, { engine: 'codex' }, { model: 'some-other-model' },
      { effort: 'high' }, { assignee: 'p-2' }, { visibility: 'private' },
    ];
    asks.forEach((p, i) => t.db.add({ id: `n${i}`, payload: { title: 'x', body: '', ...p }, created_at: t.now() - 2 * MIN }));
    // A file from the phone it cannot read (tests/a-file-sent-from-the-phone-goes-with-its-words-into-the-cloud).
    t.db.add({ id: 'nf', payload: { title: 'x', body: `see ![a](phone-files/${'a'.repeat(64)}.png)` }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(0);
    expect(t.db.commands.every((c) => !c.claimed_at)).toBe(true);
    expect(t.logs.filter((l) => /a new thread is left to its computer/.test(l)).length).toBeLessThanOrEqual(asks.length + 1);
  });

  it('leaves a fresh one, and one with no kit, to the computer', async () => {
    const t = await server();
    t.db.add({ id: 'young', payload: { title: 'x' }, created_at: t.now() - 5_000 });
    await t.gw.phoneSweep();
    t.db.add({ id: 'elsewhere', project: 'beta', payload: { title: 'x' }, created_at: t.now() - 2 * MIN });
    await t.gw.phoneSweep();
    expect(t.starts()).toHaveLength(0);
  });
});

/* ------------------------------ the computer ----------------------------- */

describe('the computer packs a project\'s new-thread kit from main', () => {
  let tmp; let repo; let objects; let storage;
  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'new-kit-')));
    repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo, { recursive: true });
    git(repo, 'init', '-q', '-b', 'main');
    git(repo, 'config', 'user.email', 'dev@example.com');
    git(repo, 'config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-q', '-m', 'first');
    // The checkout is on another branch, with work of its own lying about: none of it is a new thread's.
    git(repo, 'checkout', '-q', '-b', 'scratch');
    fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
    fs.writeFileSync(path.join(repo, 'loose.txt'), 'loose\n');
    objects = new Map();
    storage = {
      async put(k, body) { objects.set(k, Buffer.from(body)); },
      async get(k) { return objects.get(k) ?? null; },
      async getUrl(k) { return `https://s3/${k}`; },
      async putUrl(k) { return `https://s3/${k}`; },
    };
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('names its folder, branch and transcripts by the mark, carries main and none of the checkout\'s own work', async () => {
    const configDir = path.join(tmp, 'claude-home');
    fs.mkdirSync(configDir, { recursive: true });
    const folder = path.join(repo, '.claude', 'worktrees', NEW_ITEM_MARK);
    const err = new PassThrough(); let said = ''; err.on('data', (d) => { said += d; });
    const code = await cloudRun({
      argv: ['claude', '-p', '--output-format', 'stream-json'],
      env: { ...process.env, ZERO_ITEM: NEW_ITEM_MARK, ZERO_PRODUCT: 'alpha', CLAUDE_CONFIG_DIR: configDir },
      cwd: repo, transport: { async invoke() { throw new Error('a kit starts nothing'); }, async stop() {} }, storage,
      login: { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' },
      stdout: new PassThrough(), stderr: err, watchParent: false, signals: new EventEmitter(), homeDir: path.join(tmp, 'home'),
      kit: {
        device: DEVICE, project: 'alpha', item: NEW_THREAD, frame: { before: 'b ', after: ' a' }, copy: path.join(tmp, 'kits', 'alpha--_new.json'),
        newThread: { cwd: folder, brief: `Title: ${NEW_TITLE_MARK}`, model: null, effort: null },
      },
    });
    expect(code, said).toBe(0);
    const kit = JSON.parse(objects.get(newThreadKitKey(DEVICE, 'alpha')));
    const main = git(repo, 'rev-parse', 'refs/heads/main');
    expect(kit).toMatchObject({ item: NEW_THREAD, cwd: folder, branch: `agentbox/${NEW_ITEM_MARK}`, startSha: main });
    expect(kit.newThread).toMatchObject({ mainSha: main, brief: `Title: ${NEW_TITLE_MARK}` });
    expect(kit.changesRef).toBeUndefined();
    expect(kit.marker.sent).toEqual({ branch: `agentbox/${NEW_ITEM_MARK}`, head: main, tree: git(repo, 'rev-parse', `${main}^{tree}`), index: git(repo, 'rev-parse', `${main}^{tree}`) });
    for (const b of kit.bringDirs) expect(b.dir).toContain(NEW_ITEM_MARK);
    expect(checkKit(kit)).toBeNull();
    // The bundle holds main.
    const bundle = path.join(tmp, 'in.bundle');
    fs.writeFileSync(bundle, objects.get(kit.bundleKey));
    expect(git(repo, 'bundle', 'list-heads', bundle)).toContain(`${main} refs/heads/main`);
    // And the checkout is as it was.
    expect(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('scratch');
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('changed\n');
  }, 60_000);

  it('the supervisor names a new thread\'s kit for the writer', () => {
    const f = path.join(tmp, 'frame.json');
    fs.writeFileSync(f, JSON.stringify({ before: 'b ', after: ' a' }));
    const n = path.join(tmp, 'new.json');
    fs.writeFileSync(n, JSON.stringify({ cwd: '/r/.claude/worktrees/x', brief: 'B', model: null, effort: null }));
    const kit = kitFrom({ AGENTBOX_KIT_DEVICE: DEVICE, ZERO_PRODUCT: 'alpha', ZERO_ITEM: NEW_ITEM_MARK, AGENTBOX_KIT_FRAME: f, AGENTBOX_KIT_NEW: n });
    expect(kit).toMatchObject({ item: NEW_THREAD, newThread: { cwd: '/r/.claude/worktrees/x', brief: 'B' } });
    expect(fs.existsSync(n)).toBe(false);
  });
});

describe('the supervisor and a new thread', () => {
  let tmp; let store; let sup; let repo; let relays; let homecomings; let joins;
  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'new-thread-')));
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
    // Claude Code only here; the Codex kit beside it is tests/a-new-codex-thread-from-the-phone-...
    sup._cloudReady = (engine = 'claude') => engine !== 'codex';
    sup._cloudConfig = { gateway: 'https://cloud.example' };
    sup.phoneCarrying({ device: DEVICE, slugs: ['team'] });
    homecomings = [];
    sup._bringCloudHome = (place) => homecomings.push(place);
    joins = [];
    sup._cloudStorage = async () => ({ put: async (k, body) => { joins.push({ k, body: JSON.parse(body) }); } });
  });
  afterEach(() => { sup?.stop?.(); fs.rmSync(tmp, { recursive: true, force: true }); });

  const writers = () => relays.filter((r) => r.args[0] === '--agentbox-kit');

  it('leaves a project\'s new-thread kit, a fresh thread\'s own brief with the marks, packed from the project\'s checkout', async () => {
    await sup._leaveNewThreadKit('team');
    expect(writers()).toHaveLength(1);
    const { args, opts } = writers()[0];
    expect(opts.cwd).toBe(fs.realpathSync(repo));
    expect(opts.env).toMatchObject({ AGENTBOX_KIT_DEVICE: DEVICE, ZERO_PRODUCT: 'team', ZERO_ITEM: NEW_ITEM_MARK, AGENTBOX_KIT_COPY: kitCopyPath(tmp, 'team', NEW_THREAD) });
    expect(args.join(' ')).not.toContain(NEW_TITLE_MARK);
    expect(args.join(' ')).not.toContain('--resume');
    const brief = JSON.parse(fs.readFileSync(opts.env.AGENTBOX_KIT_NEW, 'utf8'));
    expect(brief.cwd).toBe(path.join(fs.realpathSync(repo), '.claude', 'worktrees', NEW_ITEM_MARK));
    expect(brief.brief).toContain(`Work item id: ${NEW_ITEM_MARK}`);
    expect(brief.brief).toContain(`Title: ${NEW_TITLE_MARK}`);
    expect(brief.brief).toContain(NEW_BODY_MARK);
    const frame = JSON.parse(fs.readFileSync(opts.env.AGENTBOX_KIT_FRAME, 'utf8'));
    expect(frame.before + frame.after).not.toContain(REPLY_MARK);
  });

  it('is left once in a while, not after every turn', async () => {
    await sup._leaveNewThreadKit('team');
    writers()[0].emit('exit', 0);
    await sup._leaveNewThreadKit('team');
    expect(writers()).toHaveLength(1);
  });

  it('none for a project not on her phone, or a computer not on the managed cloud', async () => {
    await sup._leaveNewThreadKit('other');
    sup._cloudConfig = { bucket: 'her-own-aws' };
    await sup._leaveNewThreadKit('team');
    expect(writers()).toHaveLength(0);
  });

  it('waking, makes the row under the cloud\'s id, its folder on a branch at the kit\'s main, and joins the run, starting nothing here', async () => {
    const main = git(repo, 'rev-parse', 'refs/heads/main');
    const realRepo = fs.realpathSync(repo);
    const kit = {
      ...projectKit(Date.now(), {
        project: 'team', cwd: path.join(realRepo, '.claude', 'worktrees', NEW_ITEM_MARK), startSha: main,
        marker: { branch: `agentbox/${NEW_ITEM_MARK}`, startSha: main, configDir: path.join(tmp, '.claude'), engine: 'claude', bringDirs: [{ name: 'projects.tgz', dir: path.join(tmp, '.claude', 'projects', `x-${NEW_ITEM_MARK}`) }] },
      }),
    };
    kit.newThread = { ...kit.newThread, mainSha: main };
    fs.mkdirSync(path.join(tmp, 'cloud-kits'), { recursive: true });
    fs.writeFileSync(kitCopyPath(tmp, 'team', NEW_THREAD), JSON.stringify(kit));
    // The folder is made the way the app makes one; here, on the branch it was told to use.
    sup._makeTaskFolder = async (base, id) => {
      const folder = path.join(fs.realpathSync(base), '.claude', 'worktrees', id);
      git(base, 'worktree', 'add', '-q', folder, `agentbox/${id}`);
      return folder;
    };
    const itemId = madeHere('c0ffee00-0000-4000-8000-000000000009');
    const out = await sup.adoptCloudNewThread({ product: 'team', itemId, runId: 'r-1', title: 'Fix the bug', body: 'It crashes.', command: 'c0ffee00-0000-4000-8000-000000000009', replies: [] });
    expect(out).toBe('adopted');
    const row = store.readItem('team', itemId);
    expect(row).toMatchObject({ id: itemId, title: 'Fix the bug', body: 'It crashes.', fromPhone: 'c0ffee00-0000-4000-8000-000000000009' });
    const folder = path.join(realRepo, '.claude', 'worktrees', itemId);
    expect(git(folder, 'rev-parse', 'HEAD')).toBe(main);
    expect(git(folder, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(`agentbox/${itemId}`);
    expect(readMarker(folder)).toMatchObject({ runId: 'r-1', branch: `agentbox/${itemId}`, state: 'detached' });
    expect(readKitCopy(kitCopyPath(tmp, 'team', itemId))).toMatchObject({ item: itemId, cwd: folder });
    expect(homecomings).toEqual([folder]);
    expect(joins.map((j) => j.k)).toEqual(['runs/server/r-1.joined.json']);
    expect(sup.sessions.size).toBe(0);
    // Asked again (a second pass before it is home), nothing is made twice.
    expect(await sup.adoptCloudNewThread({ product: 'team', itemId, runId: 'r-1', title: 'Fix the bug', body: 'It crashes.', command: 'c0ffee00-0000-4000-8000-000000000009', replies: [] })).toBe('busy');
    expect(store.listItems('team').filter((i) => i.id === itemId)).toHaveLength(1);
  });

  it('with no project kit here, makes the row and leaves it for this computer to run', async () => {
    const itemId = madeHere('c0ffee00-0000-4000-8000-00000000000a');
    expect(await sup.adoptCloudNewThread({ product: 'team', itemId, runId: 'r-2', title: 'Plan', body: '', command: 'c0ffee00-0000-4000-8000-00000000000a', replies: [] })).toBe('no-kit');
    expect(store.readItem('team', itemId)).toMatchObject({ title: 'Plan', fromPhone: 'c0ffee00-0000-4000-8000-00000000000a' });
  });
});

/* ------------------------ the phone's pass, waking ----------------------- */

describe('the phone\'s pass, waking to a new thread the cloud started', () => {
  async function inboxWorld({ adoptNewAs = () => 'adopted', home = () => true } = {}) {
    const { createMemoryCloud, signUpMemory, memoryBackend, claimForTheCloud } = await import('../main/team/memory-cloud.mjs');
    const { createPhoneInbox } = await import('../main/phone-inbox.mjs');
    const cloud = createMemoryCloud();
    let clock = Date.parse('2026-10-24T12:00:00Z');
    cloud.now = () => clock;
    const me = signUpMemory(cloud, { email: `o-${Math.random()}@example.com` });
    const mac = memoryBackend(cloud, me);
    const phone = memoryBackend(cloud, me);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-new-'));
    const applied = []; const adoptedNew = []; const kitsAsked = [];
    const inbox = createPhoneInbox({
      backend: mac, owner: me, device: DEVICE, projects: () => [{ slug: 'alpha', name: 'Alpha' }],
      listItems: () => [], historyOf: () => [],
      apply: async (cmd) => { applied.push(cmd); return { ok: true, id: 'w-local' }; },
      stateFile: path.join(dir, 's.json'), now: () => clock,
      carrying: () => {}, kitsFor: () => true,
      adopt: async () => 'adopted', cloudReplies: async () => {}, runHome: (a) => home(a),
      newThreadKits: (c) => kitsAsked.push(c),
      adoptNew: async (a) => { adoptedNew.push(a); return adoptNewAs(a); },
    });
    return { cloud, mac, phone, inbox, applied, adoptedNew, kitsAsked, claimForTheCloud };
  }

  it('hands it over once, under the id the phone gave it, with her words and choices, and never makes it here itself', async () => {
    const w = await inboxWorld();
    const cmd = await w.phone.addPhoneCommand({ device: DEVICE, project: 'alpha', kind: 'new', payload: { title: 'Fix the bug', body: 'It crashes.', priority: 3 } });
    w.claimForTheCloud(w.cloud, cmd.id, 'run-n');
    await w.inbox.syncOnce();
    await w.inbox.syncOnce();
    expect(w.applied).toEqual([]);
    expect(w.adoptedNew).toEqual([{ project: 'alpha', item: madeHere(cmd.id), runId: 'run-n', title: 'Fix the bug', body: 'It crashes.', command: cmd.id, replies: [], choices: { priority: 3 } }]);
    // Once home, the command is marked taken.
    expect((await w.phone.phoneCommands()).find((c) => c.id === cmd.id).takenAt).toBeTruthy();
  });

  it('asks each pass for the projects\' new-thread kits', async () => {
    const w = await inboxWorld();
    await w.inbox.syncOnce();
    expect(w.kitsAsked).toEqual([{ device: DEVICE, slugs: ['alpha'] }]);
  });
});

describe('the phone\'s screen', () => {
  it('a new thread the cloud started is the cloud\'s copy, not one waiting for the computer', async () => {
    const { phoneView } = await import('../renderer/src/phone-rows.ts');
    const id = 'c0ffee00-0000-4000-8000-0000000000aa';
    const made = madeHere(id);
    const at = new Date().toISOString();
    const rows = (threads) => ({
      projects: [{ device: DEVICE, project: 'alpha', name: 'Alpha', updated_at: at, cloud: true }],
      threads,
      commands: [{ id, device: DEVICE, project: 'alpha', item: null, kind: 'new', payload: { title: 'Fix the bug', body: '' }, created_at: at, claimed_at: at, claimed_by: 'cloud:r1', taken_at: null, outcome: null }],
    });
    const before = phoneView(rows([])).items.find((i) => i.id === made);
    expect(before).toMatchObject({ title: 'Fix the bug', status: 'claimed' });
    expect(before.waitsForMac).toBeUndefined();
    const copy = { device: DEVICE, project: 'alpha', item: made, updated_at: at, snapshot: newThreadSnapshot({ itemId: made, title: 'Fix the bug', at: Date.now() }) };
    const after = phoneView(rows([copy])).items.filter((i) => i.id === made);
    expect(after).toHaveLength(1);
    expect(after[0].waitsForMac).toBeUndefined();
  });
});

/* ------------------------------ end to end ------------------------------ */
// The computer's real relay writes the project's kit, the server's own start
// is made from it filled, the real sandbox runs a stand-in Claude Code with
// the computer away, and the computer, waking, makes the thread's folder on
// its branch and brings the work home onto it.
describe('end to end, through the real sandbox', () => {
  it('a new thread runs in the cloud on its own branch and its work comes home onto that branch', async () => {
    const http = await import('node:http');
    const crypto = await import('node:crypto');
    const { fileURLToPath } = await import('node:url');
    const { createSandbox } = await import('../cloud/sandbox/server.mjs');
    const { writeMarker } = await import('../main/cloud/marker.mjs');
    const { markerForCloudRun } = await import('../main/cloud/kit.mjs');
    const { cloudUserLine, lastAnswerIn } = await import('../shared/cloud-kit.mjs');
    const here = (p) => fileURLToPath(new URL(p, import.meta.url));
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'new-e2e-')));
    const objects = new Map();
    const s3 = http.createServer((req, res) => {
      const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
      if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
      const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
    });
    await new Promise((r) => s3.listen(0, '127.0.0.1', r));
    const s3Url = `http://127.0.0.1:${s3.address().port}`;
    const sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
    const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
    objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok' })));
    const sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
    const call = async (payload) => (await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } })).json();
    try {
      const repo = path.join(tmp, 'mac', 'repo');
      fs.mkdirSync(repo, { recursive: true });
      git(repo, 'init', '-q', '-b', 'main');
      git(repo, 'config', 'user.email', 'dev@example.com');
      git(repo, 'config', 'user.name', 'Dev');
      fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
      git(repo, 'add', '.');
      git(repo, 'commit', '-q', '-m', 'first');
      const main = git(repo, 'rev-parse', 'HEAD');
      const configDir = path.join(tmp, 'mac', 'claude-home');
      fs.mkdirSync(configDir, { recursive: true });
      const mcpFile = path.join(tmp, 'mac', 'mcp.json');
      fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [here('./fixtures/cloud/fake-store-server.mjs')], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
      const storage = {
        async put(k, body) { objects.set(k, Buffer.from(body)); }, async get(k) { return objects.get(k) ?? null; },
        async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; }, async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
      };
      const env = (item) => ({ ...process.env, ZERO_ITEM: item, ZERO_PRODUCT: 'alpha', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac', 'store') });
      const common = { stdout: new PassThrough(), remoteCommand: process.execPath, stubPath: here('../cloud/sandbox/mcp-stub.mjs'), watchParent: false, signals: new EventEmitter(), homeDir: path.join(tmp, 'home') };
      const folderMark = path.join(repo, '.claude', 'worktrees', NEW_ITEM_MARK);
      const err1 = new PassThrough(); let said1 = ''; err1.on('data', (d) => { said1 += d; });
      expect(await cloudRun({
        ...common, stderr: err1,
        argv: [here('./fixtures/cloud/fake-claude.mjs'), '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
        env: env(NEW_ITEM_MARK), cwd: repo, transport: { async invoke() { throw new Error('a kit starts nothing'); }, async stop() {} }, storage, login: LOGIN,
        kit: { device: DEVICE, project: 'alpha', item: NEW_THREAD, frame: { before: 'Re: ', after: '' }, copy: path.join(tmp, 'mac', 'kits', 'alpha--_new.json'), newThread: { cwd: folderMark, brief: `Item ${NEW_ITEM_MARK}: ${NEW_TITLE_MARK}` } },
      }), said1).toBe(0);

      // THE SERVER: the project's kit, filled for the id the phone gave the thread.
      const kit = JSON.parse(objects.get(newThreadKitKey(DEVICE, 'alpha')));
      const itemId = 'w-00000000aa';
      const filled = fillNewThreadKit(kit, { itemId, title: 'Fix the bug', body: '' });
      const runId = crypto.randomUUID();
      const link = async (k) => `${s3Url}/${encodeURIComponent(k)}`;
      const start = await startPayload(filled.kit, { runId, getUrl: link, putUrl: link, loginName: (k) => `${s3Url}/${encodeURIComponent(k)}`, offlineAfterMs: 300, kept: filled.kit.kept, refs: filled.refs });
      expect((await call(start)).ok).toBe(true);
      expect((await call({ action: 'stdin', runId, n: 1, data: Buffer.from(cloudUserLine(filled.prompt, { uuid: crypto.randomUUID() })).toString('base64') })).ok).toBe(true);
      for (let i = 0; i < 400 && !objects.has(`runs/${runId}/done.json`); i += 1) await new Promise((r) => setTimeout(r, 50));
      const events = objects.get(`runs/${runId}/events.jsonl`)?.toString() ?? '';
      expect(lastAnswerIn(events)).toMatchObject({ isError: false });
      expect(events.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('')).toContain(`Item ${itemId}: Fix the bug`);

      // THE COMPUTER WAKES: the thread's branch at the kit's main, its folder, the run's marker, the import.
      git(repo, 'branch', filled.kit.branch, filled.mainSha);
      const folder = path.join(repo, '.claude', 'worktrees', itemId);
      git(repo, 'worktree', 'add', '-q', folder, filled.kit.branch);
      writeMarker(folder, markerForCloudRun(filled.kit, runId));
      const err2 = new PassThrough(); let said2 = ''; err2.on('data', (d) => { said2 += d; });
      expect(await cloudRun({
        ...common, stderr: err2, importOnly: true, argv: [], env: env(itemId), cwd: folder,
        transport: { invoke: async (_s, payload) => call(payload), async stop() {} }, storage, login: null, resultsWaitMs: 8000,
      }), said2).toBe(0);
      expect(git(folder, 'log', '-1', '--format=%s')).toBe('From the cloud');
      expect(git(folder, 'rev-parse', `${filled.kit.branch}~1`)).toBe(main);
      expect(git(repo, 'rev-parse', 'main')).toBe(main);
    } finally {
      await sandbox.close();
      s3.closeAllConnections();
      await new Promise((r) => s3.close(r));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 90_000);
});
