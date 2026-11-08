// EVERY LOCAL AGENT SHARES ONE TOOL HOST.
//
// What was wrong (w-b9ffc220aa, 2026-11-06): each local Claude Code run started
// a store server of its own on node, 42 MB of footprint a run on the owner's
// Mac, about 840 MB at twenty runs, nearly all of it a runtime starting up. Now
// one detached host serves the store to every local run over HTTP (44 MB with
// twenty runs on it), each run holding a pass that its end deletes. These
// tests hold what a run must not lose by sharing: its own thread and claims,
// its sessions ending with it, approvals still its own, and a fallback to a
// server of its own when there is no host.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { serveTools, shareToolServers, readToolHost } from '../main/tool-host.mts';
import { stripTypesFlags } from '../main/strip-types.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cleanup = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()(); });
const tempDir = (name = 'tools-') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), name)); cleanup.push(() => fs.rmSync(d, { recursive: true, force: true })); return d; };
const until = async (check, ms = 10_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const got = await check();
    if (got) return got;
    if (Date.now() > end) throw new Error('waited and it never happened');
    await new Promise((r) => setTimeout(r, 25));
  }
};
const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const givePass = (dir, token, pass) => fs.writeFileSync(path.join(dir, 'passes', token), JSON.stringify(pass));

// What Claude Code does over Streamable HTTP, with every event a response sent.
async function post(port, kind, token, body, sid) {
  const res = await fetch(`http://127.0.0.1:${port}/${kind}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(sid ? { 'mcp-session-id': sid } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const events = text.split('\n\n').filter((e) => e.startsWith('event: message')).map((e) => JSON.parse(e.slice(e.indexOf('data: ') + 6)));
  return { status: res.status, sid: res.headers.get('mcp-session-id'), events, text };
}
const INIT = { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } };

// A server that answers every request with what it was started for.
const echo = (seen) => ({ input, output, ownItem, ownProduct, env }) => {
  const rl = readline.createInterface({ input });
  const said = { ownItem, ownProduct, item: env.ZERO_ITEM, closed: false };
  seen.push(said);
  rl.on('line', (line) => {
    const m = JSON.parse(line);
    if (m.id === undefined) return;
    const wait = m.params?.waitMs ?? 0;
    setTimeout(() => output.write(`${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { ownItem, method: m.method } })}\n`), wait);
  });
  return { close: () => { said.closed = true; rl.close(); } };
};

async function host(opts = {}) {
  const dir = tempDir();
  const seen = [];
  const h = serveTools({ dir, appPid: process.pid, servers: { store: echo(seen) }, checkMs: 20, ...opts });
  cleanup.push(() => h.close());
  const port = await h.started;
  return { dir, port, seen, h };
}

describe('the tool host', () => {
  it('serves each run its own thread, in a session of its own', async () => {
    const { dir, port, seen } = await host();
    givePass(dir, TOKEN_A, { item: 'w-aaaaaaaaaa', product: 'one', env: {} });
    givePass(dir, TOKEN_B, { item: 'w-bbbbbbbbbb', product: 'two', env: {} });
    const a = await post(port, 'store', TOKEN_A, INIT);
    const b = await post(port, 'store', TOKEN_B, INIT);
    expect(a.status).toBe(200);
    expect(a.sid).toBeTruthy();
    expect(a.sid).not.toBe(b.sid);
    const callA = await post(port, 'store', TOKEN_A, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }, a.sid);
    const callB = await post(port, 'store', TOKEN_B, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }, b.sid);
    expect(callA.events).toEqual([{ jsonrpc: '2.0', id: 1, result: { ownItem: 'w-aaaaaaaaaa', method: 'tools/call' } }]);
    expect(callB.events[0].result.ownItem).toBe('w-bbbbbbbbbb');
    expect(seen.map((s) => s.item).sort()).toEqual(['w-aaaaaaaaaa', 'w-bbbbbbbbbb']);
    const note = await post(port, 'store', TOKEN_A, { jsonrpc: '2.0', method: 'notifications/initialized' }, a.sid);
    expect(note.status).toBe(202);
  });

  it('refuses a request with no pass, and a session another pass opened', async () => {
    const { dir, port } = await host();
    givePass(dir, TOKEN_A, { item: 'w-aaaaaaaaaa', env: {} });
    givePass(dir, TOKEN_B, { item: 'w-bbbbbbbbbb', env: {} });
    expect((await post(port, 'store', 'c'.repeat(64), INIT)).status).toBe(403);
    expect((await post(port, 'store', '../passes', INIT)).status).toBe(403);
    expect((await post(port, 'elsewhere', TOKEN_A, INIT)).status).toBe(404);
    const a = await post(port, 'store', TOKEN_A, INIT);
    expect((await post(port, 'store', TOKEN_B, { jsonrpc: '2.0', id: 1, method: 'tools/call' }, a.sid)).status).toBe(404);
    expect((await post(port, 'approvals', TOKEN_A, INIT)).status).toBe(404);
  });

  it('keeps a slow answer\'s stream talking until the answer comes', async () => {
    const { dir, port } = await host({ keepaliveMs: 30 });
    givePass(dir, TOKEN_A, { item: 'w-aaaaaaaaaa', env: {} });
    const a = await post(port, 'store', TOKEN_A, INIT);
    const slow = await post(port, 'store', TOKEN_A, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { waitMs: 250 } }, a.sid);
    expect(slow.text.indexOf(': \n\n')).toBeGreaterThanOrEqual(0);
    expect(slow.text.indexOf(': \n\n')).toBeLessThan(slow.text.indexOf('event: message'));
    expect(slow.events[0].id).toBe(7);
  });

  // Measured with Claude Code 2.1 on 2026-11-06: over HTTP it gives up on a
  // call that has sent nothing for 300 s, whatever MCP_TOOL_TIMEOUT says, and
  // comment lines do not count. A progress message does: a 6 min 40 s call
  // came through with them and was cut off twice without.
  it('tells a waiting caller it is still working, with the progress token it was given', async () => {
    const { dir, port } = await host({ keepaliveMs: 30 });
    givePass(dir, TOKEN_A, { item: 'w-aaaaaaaaaa', env: {} });
    const a = await post(port, 'store', TOKEN_A, INIT);
    const slow = await post(port, 'store', TOKEN_A, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { waitMs: 250, _meta: { progressToken: 2 } } }, a.sid);
    const progress = slow.events.filter((e) => e.method === 'notifications/progress');
    expect(progress.length).toBeGreaterThanOrEqual(2);
    expect(progress.every((p) => p.params.progressToken === 2)).toBe(true);
    expect(progress.map((p) => p.params.progress)).toEqual([...progress.keys()].map((i) => i + 1));
    expect(slow.events.at(-1)).toMatchObject({ id: 8, result: { method: 'tools/call' } });
  });

  it('ends a run\'s sessions when its pass is deleted, and a call waiting with them, and not when a client lets go', async () => {
    const { dir, port, seen, h } = await host();
    givePass(dir, TOKEN_A, { item: 'w-aaaaaaaaaa', env: {} });
    givePass(dir, TOKEN_B, { item: 'w-bbbbbbbbbb', env: {} });
    const a = await post(port, 'store', TOKEN_A, INIT);
    await post(port, 'store', TOKEN_B, INIT);
    const let_go = await fetch(`http://127.0.0.1:${port}/store`, { method: 'DELETE', headers: { authorization: `Bearer ${TOKEN_A}`, 'mcp-session-id': a.sid } });
    expect(let_go.status).toBe(200);
    expect(h.sessions()).toBe(2);
    const waiting = post(port, 'store', TOKEN_A, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { waitMs: 60_000 } }, a.sid);
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(path.join(dir, 'passes', TOKEN_A));
    const ended = await waiting;
    expect(ended.events).toEqual([]);
    await until(() => seen.find((s) => s.ownItem === 'w-aaaaaaaaaa')?.closed);
    expect(seen.find((s) => s.ownItem === 'w-bbbbbbbbbb').closed).toBe(false);
    expect(h.sessions()).toBe(1);
  });

  it('stops once its app has gone and no run holds a pass, and not before', async () => {
    let idle = 0;
    const dead = spawn(process.execPath, ['-e', '']);
    await new Promise((r) => dead.on('exit', r));
    const { dir } = await host({ appPid: dead.pid, idleMs: 60, onIdle: () => { idle += 1; } });
    givePass(dir, TOKEN_A, { item: 'w-aaaaaaaaaa', env: {} });
    await new Promise((r) => setTimeout(r, 250));
    expect(idle).toBe(0);
    fs.rmSync(path.join(dir, 'passes', TOKEN_A));
    await until(() => idle > 0);

    let alsoIdle = 0;
    await host({ appPid: process.pid, idleMs: 60, onIdle: () => { alsoIdle += 1; } });
    await new Promise((r) => setTimeout(r, 250));
    expect(alsoIdle).toBe(0);
  });
});

describe('a host whose app has gone', () => {
  const deadPid = async () => {
    const dead = spawn(process.execPath, ['-e', '']);
    await new Promise((r) => dead.on('exit', r));
    return dead.pid;
  };

  it('stops after a quiet spell even with passes a crashed app left, but not while a call waits', async () => {
    let idle = 0;
    const { dir, port } = await host({ appPid: await deadPid(), idleMs: 60, orphanMs: 300, onIdle: () => { idle += 1; } });
    givePass(dir, TOKEN_A, { item: 'w-aaaaaaaaaa', env: {} });
    const a = await post(port, 'store', TOKEN_A, INIT);
    const waiting = post(port, 'store', TOKEN_A, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { waitMs: 700 } }, a.sid);
    await new Promise((r) => setTimeout(r, 600));
    expect(idle).toBe(0);
    expect((await waiting).events[0].id).toBe(9);
    await until(() => idle > 0, 5_000);
  });
});

describe('a run\'s MCP config', () => {
  const writeConfig = (dir) => {
    const file = path.join(dir, 'mcp.json');
    fs.writeFileSync(file, JSON.stringify({ mcpServers: {
      linear: { command: '/x/linear', env: { L: '1' } },
      'zero-approvals': { command: '/app/scripts/approval-server.sh', env: { ZERO_APPROVALS_DIR: '/s/.approvals', ZERO_APPROVALS_PUBKEY: 'pub' } },
      agentbox: { command: '/app/mcp/agentbox-mcp.sh', env: { STORE_ACCOUNT_ID: 'acct', AGENTBOX_HOME: '/s' } },
    } }));
    return file;
  };

  it('reaches the host for the store, with a pass, and leaves approvals and the rest as they were', async () => {
    const { dir, port } = await host();
    const file = writeConfig(tempDir());
    const pass = shareToolServers(file, { dir, item: 'w-aaaaaaaaaa', product: 'one', storeServer: 'agentbox' });
    expect(pass).toBeTruthy();
    const { mcpServers } = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(mcpServers.linear).toEqual({ command: '/x/linear', env: { L: '1' } });
    expect(mcpServers['zero-approvals']).toEqual({ command: '/app/scripts/approval-server.sh', env: { ZERO_APPROVALS_DIR: '/s/.approvals', ZERO_APPROVALS_PUBKEY: 'pub' } });
    expect(mcpServers.agentbox.url).toBe(`http://127.0.0.1:${port}/store`);
    expect(mcpServers.agentbox.type).toBe('http');
    expect(mcpServers.agentbox.headers.Authorization).toBe(`Bearer ${path.basename(pass)}`);
    expect(fs.statSync(pass).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(pass, 'utf8'))).toEqual({
      item: 'w-aaaaaaaaaa', product: 'one',
      env: { STORE_ACCOUNT_ID: 'acct', AGENTBOX_HOME: '/s' },
    });
  });

  it('is left alone when no host is serving or there is no store server, so the run starts its own', async () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'passes'));
    const file = writeConfig(tempDir());
    const before = fs.readFileSync(file, 'utf8');
    expect(readToolHost(dir)).toBe(null);
    expect(shareToolServers(file, { dir, item: 'w-aaaaaaaaaa', storeServer: 'agentbox' })).toBe(null);
    fs.writeFileSync(path.join(dir, 'host.json'), JSON.stringify({ port: 1, pid: 999_999_99 }));
    expect(shareToolServers(file, { dir, item: 'w-aaaaaaaaaa', storeServer: 'agentbox' })).toBe(null);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(fs.readdirSync(path.join(dir, 'passes'))).toEqual([]);
    // The packaged app offers no store server; there is nothing to share.
    const served = await host();
    expect(shareToolServers(file, { dir: served.dir, item: 'w-aaaaaaaaaa', storeServer: 'nothing-by-this-name' })).toBe(null);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('is shared from the supervisor only for a local Claude Code run the run host holds', () => {
    const src = fs.readFileSync(path.join(ROOT, 'main', 'supervisor.mts'), 'utf8');
    const line = src.split('\n').find((l) => l.includes('this._shareToolServers(plan'));
    expect(line).toMatch(/if \(hosted && !adopted && engineOf\(engine\) === 'claude'\)/);
    expect(src).toMatch(/const hosted = !!this\.hostRuns && where !== 'cloud'/);
  });
});

describe('the real host, with the real store server', () => {
  let home;
  let account;
  beforeEach(async () => {
    home = (await import('../main/store/home.mts')).appHome();
    account = 'acct-shared-tools';
    fs.mkdirSync(path.join(home, 'accounts', account), { recursive: true });
  });

  it('gives a run its store tools and its claims, and gives the claims back when the run ends', async () => {
    const dir = path.join(tempDir(), 'host');
    fs.mkdirSync(dir);
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', AGENTBOX_HOME: home, STORE_ACCOUNT_ID: account };
    delete env.ZERO_ITEM;
    const proc = spawn(process.execPath, [...stripTypesFlags(), path.join(ROOT, 'main', 'tool-host.mts'), dir, String(process.pid)], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let errText = '';
    proc.stderr.on('data', (d) => { errText += d; });
    cleanup.push(() => new Promise((r) => { if (proc.exitCode !== null) return r(); proc.on('exit', r); proc.kill('SIGTERM'); }));
    const { port } = await until(() => readToolHost(dir), 20_000).catch((e) => { throw new Error(`${e.message}: ${errText}`); });

    // A thread in a product, made the way the store makes one.
    const prev = process.env.STORE_ACCOUNT_ID;
    process.env.STORE_ACCOUNT_ID = account;
    cleanup.push(() => { if (prev === undefined) delete process.env.STORE_ACCOUNT_ID; else process.env.STORE_ACCOUNT_ID = prev; });
    (await import('../mcp/core/account.mts')).resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mts');
    const work = await import('../mcp/core/work.mts');
    const product = createProduct(`Shared ${Math.random().toString(36).slice(2, 8)}`);
    const item = work.createItem(product.id, { title: 'A thread a shared host serves' }, { source: 'founder' });

    const token = 'e'.repeat(64);
    givePass(dir, token, { item: item.id, product: product.slug ?? product.id, env: { AGENTBOX_HOME: home, STORE_ACCOUNT_ID: account } });

    const store = await post(port, 'store', token, INIT);
    expect(store.status).toBe(200);
    await post(port, 'store', token, { jsonrpc: '2.0', method: 'notifications/initialized' }, store.sid);
    const list = await post(port, 'store', token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, store.sid);
    expect(list.events[0].result.tools.map((t) => t.name)).toContain('claim_work_item');
    const claim = await post(port, 'store', token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'claim_work_item', arguments: {} } }, store.sid);
    const claimText = claim.events[0].result.content[0].text;
    if (!claimText.startsWith('{')) throw new Error(claimText);
    const claimed = JSON.parse(claimText);
    expect(claimed.claimed).toBe(true);
    expect(claimed.item.id).toBe(item.id);

    fs.rmSync(path.join(dir, 'passes', token));
    const row = () => work.listWorkItems({ product: product.id, includeDone: true }).find((i) => i.id === item.id);
    expect(row().status).toBe('claimed');
    await until(() => row().status !== 'claimed', 10_000);
  }, 60_000);
});

describe('the real supervisor, with a stand-in agent', () => {
  const STUB = path.join(ROOT, 'scripts', 'lib', 'stub-claude-worker.mjs');
  let app;
  let copy;
  afterEach(async () => {
    try { app?.supervisor.killAll(); app?.supervisor.stop?.(); } catch { /* done */ }
    const at = copy ? readToolHost(copy.hostDir) : null;
    if (at) try { process.kill(at.pid, 'SIGKILL'); } catch { /* gone */ }
    const runHost = copy ? await new Promise((resolve) => {
      const sock = net.connect(path.join(copy.dir, 'r.sock'));
      sock.once('error', () => resolve(null));
      sock.once('connect', () => sock.write(`${JSON.stringify({ op: 'hello' })}\n`));
      sock.setEncoding('utf8');
      sock.once('data', (d) => { sock.destroy(); try { resolve(JSON.parse(d).pid); } catch { resolve(null); } });
    }) : null;
    if (runHost) try { process.kill(runHost, 'SIGKILL'); } catch { /* gone */ }
    if (copy) fs.rmSync(copy.dir, { recursive: true, force: true });
    app = null;
    copy = null;
  });

  it('gives a local run its store from the shared host and its approvals as before, and takes its pass back when it ends', async () => {
    const { bootHeadless } = await import('../main/serve.mts');
    const { setAppHome } = await import('./app-home.mts');
    const approvals = await import('../main/approvals.mts');
    const dir = fs.mkdtempSync(path.join(fs.existsSync('/tmp') ? '/tmp' : os.tmpdir(), 'ab-tools-'));
    const storeRoot = path.join(dir, 'store');
    const account = path.join(storeRoot, 'accounts', 'acct-tools', 'sandbox');
    const repo = path.join(dir, 'repo');
    fs.mkdirSync(account, { recursive: true });
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
    for (const a of [['init', '-q', '-b', 'main'], ['add', '-A'], ['-c', 'user.email=t@t.t', '-c', 'user.name=t', 'commit', '-qm', 's']]) execFileSyncQuiet('git', a, repo);
    fs.writeFileSync(path.join(account, 'project.json'), JSON.stringify({ schemaVersion: 2, id: 'sandbox', name: 'Sandbox', repoPath: repo }));
    const bin = path.join(dir, 'claude');
    fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${STUB}" "$@"\n`, { mode: 0o755 });
    const receipts = path.join(dir, 'receipts');
    const hostDir = path.join(dir, 'tools');
    copy = { dir, hostDir };
    fs.writeFileSync(path.join(dir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'acct-tools', claudeBin: bin, authProfiles: ['default'] }));
    setAppHome(storeRoot);
    const booted = await bootHeadless({ dataDir: dir, appDir: ROOT, userDir: dir });
    app = booted;
    booted.supervisor.hostRuns = true;
    booted.supervisor.shareTools = true;
    booted.supervisor._runHostSock = path.join(dir, 'r.sock');
    booted.supervisor._toolHostDir = hostDir;
    booted.supervisor.start();
    expect(await until(() => readToolHost(hostDir), 20_000)).toBeTruthy();

    const item = booted.store.composeItem('sandbox', { title: 'Write a note and ask first [[stub:act:note]]' });
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({
      receipts,
      approval: { tool_name: 'Bash', input: { command: 'ls' } },
      acts: { note: { calls: [{ tool: 'update_work_item', args: { id: item.id, note: 'written through the shared host' } }], say: 'noted' } },
    }));
    process.env.STUB_CLAUDE_PLAN = path.join(dir, 'plan.json');
    booted.supervisor.wake?.();

    const card = await until(() => approvals.listPending(storeRoot).find((p) => p.item === item.id), 20_000);
    expect(card.tool).toBe('Bash');
    expect(fs.readdirSync(path.join(hostDir, 'passes'))).toHaveLength(1);
    expect(approvals.answer(storeRoot, card.id, true)).toBe(true);

    const result = await until(() => /approval allow/.test(booted.store.readItem('sandbox', item.id)?.result ?? '') && booted.store.readItem('sandbox', item.id), 20_000);
    expect(result.note).toBe('written through the shared host');
    const receipt = JSON.parse(fs.readFileSync(path.join(receipts, `${item.id}.json`), 'utf8'));
    expect(receipt.mcp).toEqual({ 'zero-approvals': 'stdio', agentbox: 'http' });
    await until(() => !booted.supervisor.sessions.has(item.id), 15_000);
    await until(() => fs.readdirSync(path.join(hostDir, 'passes')).length === 0, 10_000);
    expect(fs.readdirSync(path.join(hostDir, 'passes'))).toEqual([]);
  }, 90_000);
});

function execFileSyncQuiet(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, stdio: 'ignore' });
}
