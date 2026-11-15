// ON WINDOWS A WORKER REACHES A CONNECTION ONLY THROUGH THE APP.
//
// On Windows 11 with Node 24.11 the broker listened on a unix socket path,
// listen() failed with EACCES, and every connection tool a worker had said the
// owner's app was offline. The broker now serves the local channel
// (main/local-channel.mts) and the worker's proxy reaches it with connectLocal.
// These tests start the real proxy as a child process, the way a worker does,
// over a real named pipe. They count what reached the tool, how many
// connections the broker accepted, and what reached a process holding the pipe
// name without the key. The run key and the call's arguments reached that
// process 0 times. They run only on Windows. The shape of what a worker is
// handed is checked everywhere in
// a-workers-connection-goes-by-socket-on-mac-and-linux-and-by-channel-on-windows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { CHANNEL_KIND, createBroker } from '../main/connections/broker.mts';
import { connectionServerName } from '../shared/connections-catalog.mts';

const onWindows = it.runIf(process.platform === 'win32');
const PROXY = path.resolve(import.meta.dirname, '../mcp/connection-proxy.mts');
const NAME = connectionServerName('test-tracker');
const ITEM = { id: 'w-1', product: 'p' };

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brk-win-'));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The connections service as far as the broker uses it, with one tool that
// records each call that reaches it.
function service() {
  const entry = { id: 'test-tracker', name: 'Test tracker', reads: ['list_issues'], writes: [] };
  const calls = [];
  const client = {
    listTools: async () => ({ tools: [{ name: 'list_issues', description: 'Lists issues.', inputSchema: { type: 'object' } }] }),
    callTool: async ({ name, arguments: args }) => { calls.push({ name, args }); return { content: [{ type: 'text', text: `issues for ${args.team}` }] }; },
  };
  return {
    calls,
    callMs: 2000,
    workingNow: () => [entry],
    _entryOf: (id) => (id === entry.id ? entry : null),
    _withTool: async (_e, fn) => fn(client),
    _noteTools: async () => {},
    _noteRead: async () => {},
    _noteUse: async () => {},
    _saveStatus: async () => {},
    _read: async () => ({}),
  };
}

function broker(dir, connections = service(), stamp = crypto.randomBytes(8).toString('hex')) {
  const b = createBroker({ connections, storeRoot: path.join(dir, 'store'), socketPath: path.join(dir, 'unused.sock'), proxyFile: PROXY, runtime: process.execPath, channel: { dir: path.join(dir, 'channels'), stamp } });
  cleanups.push(() => b.stop());
  return { b, connections, stamp, marker: path.join(dir, 'channels', `${CHANNEL_KIND}.${stamp}.pipe`) };
}

/** The proxy as a worker starts it, spoken to as an engine does. */
function startProxy(entry) {
  const child = spawn(entry.command, entry.args, { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...entry.env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const deadline = setTimeout(() => child.kill(), 30_000);
  cleanups.push(() => { clearTimeout(deadline); child.kill(); });
  let buf = '';
  let stderr = '';
  const waiting = new Map();
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { stderr += d; });
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      waiting.get(m.id)?.(m);
    }
  });
  let n = 0;
  const ask = (method, params = {}) => new Promise((resolve) => {
    n += 1;
    waiting.set(n, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`);
  });
  return { ask, stderr: () => stderr, call: (name, args = {}) => ask('tools/call', { name, arguments: args }).then((m) => m.result) };
}

// A process without the key that holds a pipe name, sends a handshake of
// random bytes, and keeps every byte sent to it. A silent one sends nothing.
function squatter(name, { silent = false } = {}) {
  const got = { bytes: Buffer.alloc(0), connections: 0 };
  const sockets = new Set();
  const server = net.createServer((sock) => {
    got.connections += 1;
    sockets.add(sock);
    sock.on('error', () => {});
    if (!silent) sock.write(Buffer.concat([Buffer.from('AB3\0', 'latin1'), crypto.randomBytes(32), Buffer.from([1]), crypto.randomBytes(32), Buffer.from([0]), crypto.randomBytes(32)]));
    sock.on('data', (d) => { got.bytes = Buffer.concat([got.bytes, d]); });
  });
  cleanups.push(() => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()); }));
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(name, () => resolve(got));
  });
}

const textOf = (r) => r.content.map((c) => c.text).join('\n');

describe('a worker on Windows', () => {
  onWindows('reaches the tool through the pipe, and is handed no socket and no channel key', async () => {
    const dir = tempDir();
    const { b, connections, marker } = broker(dir);
    await b.listen();
    expect(JSON.parse(fs.readFileSync(marker, 'utf8')).name).toMatch(/^\\\\\.\\pipe\\agentbox-connections-[0-9a-f]{32}$/);

    const entry = b.openRun({ runId: 'r', item: ITEM }).servers[NAME];
    expect(entry.env.AGENTBOX_CONNECTIONS_SOCK).toBeUndefined();
    const channelKey = fs.readFileSync(path.join(dir, 'channels', 'key'));
    for (const encoding of ['hex', 'base64', 'base64url', 'latin1']) {
      expect(JSON.stringify(entry)).not.toContain(channelKey.toString(encoding));
    }

    const p = startProxy(entry);
    expect((await p.ask('tools/list')).result.tools.map((t) => t.name)).toEqual(['list_issues']);
    const out = await p.call('list_issues', { team: 'core' });
    expect(out.isError).toBeFalsy();
    expect(textOf(out)).toBe('issues for core');
    expect(connections.calls).toEqual([{ name: 'list_issues', args: { team: 'core' } }]);
  });

  onWindows('making 16 calls at once, opens one connection to the broker for all of them', async () => {
    const dir = tempDir();
    let authenticated = 0;
    const createServer = net.createServer;
    const spy = vi.spyOn(net, 'createServer').mockImplementationOnce((onConnection) => createServer((sock) => { authenticated += 1; onConnection(sock); }));
    const { b, connections } = broker(dir);
    await b.listen();
    spy.mockRestore();

    const p = startProxy(b.openRun({ runId: 'r', item: ITEM }).servers[NAME]);
    const teams = Array.from({ length: 16 }, (_, i) => `t${i}`);
    const outs = await Promise.all(teams.map((team) => p.call('list_issues', { team })));
    expect(outs.map(textOf)).toEqual(teams.map((team) => `issues for ${team}`));
    expect(connections.calls).toHaveLength(16);
    expect(authenticated).toBe(1);
  });

  onWindows('with a squatter on the pipe of a broker that is gone, sends it neither the run key nor the arguments, and says the app is offline', async () => {
    const dir = tempDir();
    const { b, marker } = broker(dir);
    await b.listen();
    const left = fs.readFileSync(marker);
    const entry = b.openRun({ runId: 'r', item: ITEM }).servers[NAME];
    await b.stop();
    expect(fs.existsSync(marker)).toBe(false);
    // A broker that crashed leaves its marker, and another process takes its name.
    fs.writeFileSync(marker, left);
    const squat = await squatter(JSON.parse(left).name);

    const p = startProxy(entry);
    const out = await p.call('list_issues', { team: 'ARGUMENT-only-the-app-may-see' });
    expect(out.isError).toBe(true);
    expect(textOf(out)).toMatch(/owner's app is offline/i);
    expect(p.stderr()).toMatch(/could not reach the app: .*did not prove it holds the key, so nothing was sent/);
    expect(squat.connections).toBeGreaterThan(0);
    expect(squat.bytes.length).toBe(0);
  });

  onWindows('started with no broker running, offers the one tool that says the app is offline', async () => {
    const dir = tempDir();
    const { b } = broker(dir);
    const entry = b.openRun({ runId: 'r', item: ITEM }).servers[NAME];
    const p = startProxy(entry);
    const tools = (await p.ask('tools/list')).result.tools;
    expect(tools.map((t) => t.name)).toEqual(['connection_status']);
    expect(textOf(await p.call('connection_status'))).toMatch(/owner's app is offline/i);
    expect(p.stderr()).toMatch(/no connections server is running/);
  });
});

describe('a second broker for the same store on Windows', () => {
  onWindows('is told another copy serves it, and the first keeps answering', async () => {
    const dir = tempDir();
    const first = broker(dir);
    await first.b.listen();
    const second = broker(dir, service(), first.stamp);
    await expect(second.b.listen()).rejects.toThrow(/another copy of .* on this store already serves its connections/);

    const p = startProxy(first.b.openRun({ runId: 'r', item: ITEM }).servers[NAME]);
    expect(textOf(await p.call('list_issues', { team: 'core' }))).toBe('issues for core');
  });

  onWindows('is told the running one did not answer when it is alive but silent, and leaves its marker', async () => {
    const dir = tempDir();
    const { b, marker } = broker(dir);
    const name = `\\\\.\\pipe\\agentbox-${CHANNEL_KIND}-${crypto.randomBytes(16).toString('hex')}`;
    const silent = await squatter(name, { silent: true });
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    const before = JSON.stringify({ v: 1, name, pid: process.pid });
    fs.writeFileSync(marker, before);

    const started = Date.now();
    await expect(b.listen()).rejects.toThrow(/already running for this store .* did not answer in time, so this one did not start/);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(fs.readFileSync(marker, 'utf8')).toBe(before);
    expect(silent.bytes.length).toBe(0);
  }, 20_000);
});
