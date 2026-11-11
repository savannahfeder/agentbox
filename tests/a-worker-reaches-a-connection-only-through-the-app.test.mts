// A WORKER REACHES A CONNECTION ONLY THROUGH THE APP.
//
// What this guards (2026-10-31, Codex's review of the plan): the first plan had
// a proxy fetch the token from the app and call the vendor itself, and any
// process a worker starts can read what its children are handed. So the proxy
// here is a real child process that holds no token and decides nothing. These
// tests drive it over its real stdio and real socket against the fixture, and
// count what actually reached the tool: an unlisted tool reaches it 0 times, a
// write 0 times before her yes and exactly 1 after, and the token appears in no
// environment, file, log or answer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startToolsFixture } from '../cloud/standin/tools-mcp.mjs';
import { createConnections } from '../main/connections/index.mts';
import { createBroker, WRITE_CARD_TOOL } from '../main/connections/broker.mts';
import { connectionVault } from '../main/connections/vault.mts';
import { answer, listPending, spoolDir } from '../main/approvals.mts';
import { catalogFor, connectionServerName, STATES } from '../shared/connections-catalog.mts';

const PROXY = path.resolve(import.meta.dirname, '../mcp/connection-proxy.mts');
const key = crypto.randomBytes(32);
const cipher = {
  available: () => true,
  encrypt: (t) => { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const out = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), out]); },
  decrypt: (b) => { const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); },
};
const browser = async (url) => {
  const allowed = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000) });
  await fetch(allowed.headers.get('location'), { signal: AbortSignal.timeout(5000) });
};

let fx; let dir; let store; let conn; let broker; let children; let person;
const NAME = connectionServerName('test-tracker');
const ITEM = { id: 'w-1', product: 'p' };

function service(opts = {}) {
  return createConnections({
    vaultFile: path.join(dir, 'connections.enc'), cipher,
    catalog: catalogFor({ env: { AGENTBOX_TOOLS_FIXTURE: fx.mcpUrl }, packaged: false }),
    openExternal: browser, personId: () => person, ...opts,
  });
}

function newBroker(connections = conn) {
  return createBroker({ connections, storeRoot: store, socketPath: path.join(dir, 'b.sock'), proxyFile: PROXY, runtime: process.execPath });
}

beforeEach(async () => {
  fx = await startToolsFixture();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brk-'));
  store = path.join(dir, 'store');
  fs.mkdirSync(store, { recursive: true });
  children = [];
  person = null;
  conn = service();
  broker = newBroker();
  await broker.listen();
});
afterEach(async () => {
  for (const c of children) c.kill('SIGKILL');
  await broker.stop();
  await conn.stop();
  await fx.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** The proxy as a worker starts it, spoken to as an engine does. */
function startProxy(entry, { env = {} } = {}) {
  const child = spawn(entry.command, entry.args, { env: { PATH: process.env.PATH, ...entry.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  children.push(child);
  let buf = '';
  const waiting = new Map();
  const heard = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      heard.push(line);
      const m = JSON.parse(line);
      waiting.get(m.id)?.(m);
    }
  });
  let n = 0;
  const ask = (method, params = {}) => new Promise((resolve) => {
    n += 1;
    waiting.set(n, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`);
  });
  return { child, ask, heard, call: (name, args = {}) => ask('tools/call', { name, arguments: args }).then((m) => m.result) };
}

const textOf = (r) => r.content.map((c) => c.text).join('\n');
async function until(fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('never happened');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('which connections a run is handed', () => {
  it('none until one has worked', () => {
    expect(broker.openRun({ runId: 'r', item: ITEM }).servers).toEqual({});
  });

  it('one that worked, under a name with no run in it', async () => {
    await conn.connect('test-tracker');
    const a = broker.openRun({ runId: 'r1', item: ITEM });
    const b = broker.openRun({ runId: 'r2', item: ITEM });
    expect(Object.keys(a.servers)).toEqual([NAME]);
    expect(Object.keys(b.servers)).toEqual([NAME]);
    expect(a.servers[NAME].env.AGENTBOX_CONNECTION_RUN).not.toBe(b.servers[NAME].env.AGENTBOX_CONNECTION_RUN);
  });

  it('keeps a connection that is temporarily down, because a failed check does not remove it', async () => {
    await conn.connect('test-tracker');
    fx.switches.errors = true;
    expect((await conn.check('test-tracker')).state).toBe(STATES.DOWN);
    expect(Object.keys(broker.openRun({ runId: 'r', item: ITEM }).servers)).toEqual([NAME]);
  });

  it('leaves out one whose sign-in is gone, and one disconnected', async () => {
    await conn.connect('test-tracker');
    fx.switches.revoked = true;
    await conn.check('test-tracker');
    expect(broker.openRun({ runId: 'r', item: ITEM }).servers).toEqual({});
    fx.switches.revoked = false;
    await conn.connect('test-tracker');
    await conn.disconnect('test-tracker');
    expect(broker.openRun({ runId: 'r2', item: ITEM }).servers).toEqual({});
  });

  it('is one person\'s: a run under somebody else is not handed it', async () => {
    person = 'maya';
    await conn.connect('test-tracker');
    expect(Object.keys(broker.openRun({ runId: 'r', item: ITEM }).servers)).toEqual([NAME]);
    person = 'dev';
    expect(broker.openRun({ runId: 'r2', item: ITEM }).servers).toEqual({});
  });
});

describe('what the app lets through', () => {
  let p;
  beforeEach(async () => {
    await conn.connect('test-tracker');
    p = startProxy(broker.openRun({ runId: 'r', item: ITEM }).servers[NAME]);
  });

  it('answers the handshake, and lists only what the catalog names', async () => {
    const hello = await p.ask('initialize', { protocolVersion: '2025-06-18' });
    expect(hello.result.capabilities.tools).toBeTruthy();
    const names = (await p.ask('tools/list')).result.tools.map((t) => t.name).sort();
    expect(names).toEqual(['create_issue', 'get_issue', 'get_page', 'list_issues', 'search_pages']);
  });

  it('a listed read comes back with the tool\'s own answer', async () => {
    const out = await p.call('list_issues');
    expect(out.isError).toBeFalsy();
    expect(textOf(out)).toContain('Group bookings');
  });

  it('a tool on no list is denied with a plain reason, and never reaches the tool', async () => {
    const out = await p.call('export_workspace');
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/not on the list/i);
    expect(fx.calls.filter((c) => c === 'export_workspace')).toEqual([]);
  });

  it('flags a changed tool list on the tile when a worker\'s list finds it', async () => {
    fx.switches.changed = true;
    const names = (await p.ask('tools/list')).result.tools.map((t) => t.name);
    expect(names).not.toContain('list_everything');
    const tile = await until(async () => { const t = (await conn.list()).tiles.find((x) => x.id === 'test-tracker'); return t.changed.length ? t : null; });
    expect(tile.changed).toEqual(['list_everything']);
  });

  it('refreshes an expired token out of sight', async () => {
    fx.switches.expired = true;
    expect(textOf(await p.call('list_issues'))).toContain('Group bookings');
  });

  it('a revoked sign-in says so, and turns the tile', async () => {
    fx.switches.revoked = true;
    const out = await p.call('list_issues');
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/sign in again/i);
    expect((await conn.list()).tiles.find((t) => t.id === 'test-tracker').state).toBe(STATES.NOT_SIGNED_IN);
  });

  it('a tool that is down says so, and the sign-in stays', async () => {
    fx.switches.errors = true;
    const out = await p.call('list_issues');
    expect(textOf(out)).toMatch(/connected but down since/i);
    expect((await conn.list()).tiles.find((t) => t.id === 'test-tracker').connected).toBe(true);
  });

  it('an oversized request is refused and the channel lives', async () => {
    const out = await p.call('list_issues', { pad: 'x'.repeat(600 * 1024) });
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/too large/i);
    expect(textOf(await p.call('list_issues'))).toContain('Group bookings');
  });
});

describe('the channel belongs to the run', () => {
  beforeEach(async () => { await conn.connect('test-tracker'); });

  it('a made-up run key gets nothing', async () => {
    const entry = broker.openRun({ runId: 'r', item: ITEM }).servers[NAME];
    const p = startProxy(entry, { env: { AGENTBOX_CONNECTION_RUN: 'made-up' } });
    const out = await p.call('list_issues');
    expect(out.isError).toBe(true);
    expect(fx.calls).toEqual(['list_issues']); // the check's read, nothing since
  });

  it('a run that has ended gets nothing', async () => {
    const run = broker.openRun({ runId: 'r', item: ITEM });
    const p = startProxy(run.servers[NAME]);
    expect(textOf(await p.call('list_issues'))).toContain('Group bookings');
    run.close();
    const out = await p.call('list_issues');
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/ended|restarted/i);
  });

  it('a run\'s key does not open another connection', async () => {
    const entry = broker.openRun({ runId: 'r', item: ITEM }).servers[NAME];
    const p = startProxy(entry, { env: { AGENTBOX_CONNECTION: 'linear' } });
    const out = await p.call('list_issues');
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/not given/i);
  });

  it('a disconnect mid-run stops the next call', async () => {
    const p = startProxy(broker.openRun({ runId: 'r', item: ITEM }).servers[NAME]);
    await conn.disconnect('test-tracker');
    const out = await p.call('list_issues');
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/not connected|sign in/i);
  });

  it('with the app gone the tool says the owner\'s app is offline', async () => {
    const p = startProxy(broker.openRun({ runId: 'r', item: ITEM }).servers[NAME]);
    expect((await p.ask('tools/list')).result.tools.length).toBeGreaterThan(0);
    await broker.stop();
    const out = await p.call('list_issues');
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/owner's app is offline/i);
  });

  it('started with the app already gone, it still offers one tool that says so', async () => {
    const entry = broker.openRun({ runId: 'r', item: ITEM }).servers[NAME];
    await broker.stop();
    const p = startProxy(entry);
    const tools = (await p.ask('tools/list')).result.tools;
    expect(tools.length).toBe(1);
    const out = await p.call(tools[0].name);
    expect(textOf(out)).toMatch(/owner's app is offline/i);
  });
});

describe('a write', () => {
  let run; let p;
  beforeEach(async () => {
    await conn.connect('test-tracker');
    run = broker.openRun({ runId: 'r', item: ITEM });
    p = startProxy(run.servers[NAME]);
  });
  const theCard = () => until(() => listPending(store).find((c) => c.tool === WRITE_CARD_TOOL('Test tracker', 'create_issue')));

  it('stops at her card, and reaches the tool once on her yes', async () => {
    const out = p.call('create_issue', { title: 'From an agent' });
    const card = await theCard();
    expect(card.item).toBe('w-1');
    expect(card.product).toBe('p');
    expect(card.input).toEqual({ title: 'From an agent' });
    expect(fx.writes).toEqual([]);
    expect(answer(store, card.id, true)).toBe(true);
    const done = await out;
    expect(done.isError).toBeFalsy();
    expect(fx.writes.map((w) => w.title)).toEqual(['From an agent']);
    await new Promise((r) => setTimeout(r, 200));
    expect(fx.writes).toHaveLength(1);
  });

  it('her no reaches the worker in words and the tool not at all', async () => {
    const out = p.call('create_issue', { title: 'No' });
    answer(store, (await theCard()).id, false, 'not today');
    const done = await out;
    expect(done.isError).toBe(true);
    expect(textOf(done)).toContain('not today');
    expect(fx.writes).toEqual([]);
  });

  it('an answer she did not sign is deleted and the card goes on waiting', async () => {
    const out = p.call('create_issue', { title: 'Forged' });
    const card = await theCard();
    fs.writeFileSync(path.join(spoolDir(store), `${card.id}.answer.json`), JSON.stringify({ allow: true, sig: 'AAAA', card: 'x', at: 1, note: null }));
    await new Promise((r) => setTimeout(r, 2500));
    expect(fx.writes).toEqual([]);
    listPending(store);
    answer(store, card.id, false);
    await out;
    expect(fx.writes).toEqual([]);
  });

  it('a card rewritten after it was shown is refused, and the original is not sent', async () => {
    const out = p.call('create_issue', { title: 'What was asked' });
    const card = await theCard();
    fs.writeFileSync(path.join(spoolDir(store), `${card.id}.request.json`), JSON.stringify({ ...card, input: { title: 'Harmless' } }));
    listPending(store);
    answer(store, card.id, true);
    const done = await out;
    expect(done.isError).toBe(true);
    expect(fx.writes).toEqual([]);
  });

  it('the run ending takes the card with it, and nothing is sent', async () => {
    const out = p.call('create_issue', { title: 'Run ended' });
    await theCard();
    run.close();
    const done = await out;
    expect(done.isError).toBe(true);
    await until(() => !listPending(store).length);
    expect(fx.writes).toEqual([]);
  });

  it('the proxy dying takes the card with it', async () => {
    p.call('create_issue', { title: 'Proxy died' });
    await theCard();
    p.child.kill('SIGKILL');
    await until(() => !listPending(store).length);
    expect(fx.writes).toEqual([]);
  });

  it('an expired token at the handshake is refreshed and the write goes once', async () => {
    fx.switches.expired = true;
    const out = p.call('create_issue', { title: 'Expired' });
    answer(store, (await theCard()).id, true);
    expect((await out).isError).toBeFalsy();
    expect(fx.writes.map((w) => w.title)).toEqual(['Expired']);
  });

  it('a write whose answer never came is not sent again, and says to look first', async () => {
    await broker.stop();
    const hurried = createBroker({ connections: service({ callMs: 200 }), storeRoot: store, socketPath: path.join(dir, 'b2.sock'), proxyFile: PROXY, runtime: process.execPath });
    await hurried.listen();
    const q = startProxy(hurried.openRun({ runId: 'r9', item: ITEM }).servers[NAME]);
    await q.ask('initialize', {});
    const out = q.call('create_issue', { title: 'Slow' });
    const card = await theCard();
    fx.switches.slowWriteMs = 700;
    answer(store, card.id, true);
    const done = await out;
    expect(done.isError).toBe(true);
    expect(textOf(done)).toMatch(/check whether/i);
    await new Promise((r) => setTimeout(r, 900));
    expect(fx.writes.map((w) => w.title)).toEqual(['Slow']);
    await hurried.stop();
  });

  it('a write under a mode that bypasses the engine\'s approvals still stops here', async () => {
    // The engine is not in this path at all: nothing but the card can pass it.
    const out = p.call('create_issue', { title: 'Bypass' });
    await theCard();
    await new Promise((r) => setTimeout(r, 300));
    expect(fx.writes).toEqual([]);
    answer(store, listPending(store)[0].id, false);
    await out;
  });
});

describe('no token leaves the app', () => {
  it('not in the worker\'s env or args, its config, the store, a log or an answer', async () => {
    const logged = [];
    const spies = ['log', 'warn', 'error', 'info'].map((m) => vi.spyOn(console, m).mockImplementation((...a) => { logged.push(a.join(' ')); }));
    await conn.connect('test-tracker');
    const run = broker.openRun({ runId: 'r', item: ITEM });
    const entry = run.servers[NAME];
    const p = startProxy(entry);
    await p.ask('tools/list');
    await p.call('list_issues');
    fx.switches.expired = true;
    await p.call('list_issues');
    const write = p.call('create_issue', { title: 'x' });
    const card = await until(() => listPending(store)[0]);
    answer(store, card.id, true);
    await write;
    for (const s of spies) s.mockRestore();

    const { tokens, client } = (await connectionVault({ file: path.join(dir, 'connections.enc'), cipher }).read()).connections['test-tracker'];
    const secrets = [tokens.access_token, tokens.refresh_token, ...fx.tokensEverIssued];
    expect(secrets.length).toBeGreaterThan(2);
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const places = {
      entry: JSON.stringify(entry),
      answers: p.heard.join('\n'),
      logs: logged.join('\n'),
      store: walk(store).map((f) => fs.readFileSync(f, 'latin1')).join('\n'),
      vaultOnDisk: fs.readFileSync(path.join(dir, 'connections.enc'), 'latin1'),
    };
    for (const [where, text] of Object.entries(places)) {
      for (const s of secrets) expect(text.includes(s), `${where} carries a token`).toBe(false);
    }
    expect(JSON.stringify(entry)).not.toContain(client.client_id);
    // And the broker hands out no way to ask for one.
    expect(Object.keys(broker)).not.toContain('token');
    for (const v of Object.values(await conn.list()).flat()) expect(JSON.stringify(v)).not.toContain(tokens.access_token);
  });
});
