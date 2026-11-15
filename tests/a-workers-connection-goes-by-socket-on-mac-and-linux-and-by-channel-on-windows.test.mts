// A WORKER'S CONNECTION GOES BY SOCKET ON MAC AND LINUX AND BY CHANNEL ON WINDOWS.
//
// On Windows 11 with Node 24.11 the broker's unix socket failed to listen with
// EACCES, so on Windows the broker now serves the local channel and a worker's
// proxy is told the channel's folder, kind and stamp in place of the socket
// path. Mac and Linux must be handed exactly what they were before, so these
// tests compare the whole environment, key order included, and start the real
// proxy against a plain server to see which way it goes. They run on every
// platform. The run over a real pipe is in
// on-windows-a-worker-reaches-a-connection-only-through-the-app.
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { CHANNEL_KIND, createBroker } from '../main/connections/broker.mts';
import { brokerChannel } from '../main/connections/start.mts';
import { stripTypesFlags } from '../main/strip-types.mts';
import { connectionServerName } from '../shared/connections-catalog.mts';

const ROOT = path.resolve(import.meta.dirname, '..');
const PROXY = path.join(ROOT, 'mcp', 'connection-proxy.mts');
const NAME = connectionServerName('test-tracker');
const ITEM = { id: 'w-1', product: 'p' };
const connections = { workingNow: () => [{ id: 'test-tracker', name: 'Test tracker' }] };

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
});

const handed = (channel) => createBroker({ connections, storeRoot: '/store', socketPath: '/tmp/agentbox-conn-0123456789abcdef.sock', proxyFile: '/app/mcp/connection-proxy.mts', runtime: '/app/node', channel })
  .openRun({ runId: 'r', item: ITEM }).servers;

describe('where the broker is on each platform', () => {
  it('is the socket on macOS and Linux, with no channel', () => {
    expect(brokerChannel('/Users/ann/agentbox', { platform: 'darwin', env: {}, home: '/Users/ann' })).toBeNull();
    expect(brokerChannel('/home/ann/.local/share/agentbox', { platform: 'linux', env: {}, home: '/home/ann' })).toBeNull();
  });

  it('is the channel in the account\'s own folder on Windows, with one stamp per store', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\ann\\AppData\\Local' };
    const a = brokerChannel('C:\\Users\\ann\\agentbox', { platform: 'win32', env, home: 'C:\\Users\\ann' });
    expect(a.dir).toBe('C:\\Users\\ann\\AppData\\Local\\agentbox\\channels');
    expect(a.stamp).toMatch(/^[0-9a-f]{16}$/);
    expect(brokerChannel('C:\\Users\\ann\\agentbox', { platform: 'win32', env, home: 'C:\\Users\\ann' }).stamp).toBe(a.stamp);
    expect(brokerChannel('C:\\Users\\ann\\agentbox-dev', { platform: 'win32', env, home: 'C:\\Users\\ann' }).stamp).not.toBe(a.stamp);
  });

  it('is no channel on Windows when the folder is on a network share, and says why', () => {
    const c = brokerChannel('C:\\Users\\ann\\agentbox', { platform: 'win32', env: { LOCALAPPDATA: '\\\\server\\share\\AppData' }, home: 'C:\\Users\\ann' });
    expect(c).toEqual({ dir: null, problem: expect.stringMatching(/not on a local drive/) });
  });
});

describe('what a worker is handed', () => {
  it('on macOS and Linux is handed the socket path and the run in the same order as before', () => {
    const { env, command, args } = handed(null)[NAME];
    expect(command).toBe('/app/node');
    expect(args).toEqual([...stripTypesFlags(), '/app/mcp/connection-proxy.mts']);
    expect(Object.keys(env)).toEqual(['ELECTRON_RUN_AS_NODE', 'AGENTBOX_CONNECTIONS_SOCK', 'AGENTBOX_CONNECTION_RUN', 'AGENTBOX_CONNECTION', 'AGENTBOX_CONNECTION_NAME']);
    expect(env).toEqual({
      ELECTRON_RUN_AS_NODE: '1',
      AGENTBOX_CONNECTIONS_SOCK: '/tmp/agentbox-conn-0123456789abcdef.sock',
      AGENTBOX_CONNECTION_RUN: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      AGENTBOX_CONNECTION: 'test-tracker',
      AGENTBOX_CONNECTION_NAME: 'Test tracker',
    });
  });

  it('on Windows is the channel\'s folder, kind and stamp in place of the socket, and nothing else', () => {
    const { env } = handed({ dir: 'C:\\Users\\ann\\AppData\\Local\\agentbox\\channels', stamp: '0123456789abcdef' })[NAME];
    expect(env).toEqual({
      ELECTRON_RUN_AS_NODE: '1',
      AGENTBOX_CHANNEL_DIR: 'C:\\Users\\ann\\AppData\\Local\\agentbox\\channels',
      AGENTBOX_CHANNEL_KIND: CHANNEL_KIND,
      AGENTBOX_CHANNEL_STAMP: '0123456789abcdef',
      AGENTBOX_CONNECTION_RUN: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      AGENTBOX_CONNECTION: 'test-tracker',
      AGENTBOX_CONNECTION_NAME: 'Test tracker',
    });
  });

  it('on Windows with no channel folder is no connection at all, and listening says why without touching a file', async () => {
    const channel = { dir: null, problem: '%LOCALAPPDATA% \\\\server\\share is not on a local drive' };
    expect(handed(channel)).toEqual({});
    const b = createBroker({ connections, storeRoot: '/store', socketPath: path.join(os.tmpdir(), `never-${crypto.randomBytes(6).toString('hex')}.sock`), proxyFile: PROXY, channel });
    await expect(b.listen()).rejects.toThrow(/no folder for the app's local channel: %LOCALAPPDATA% .* is not on a local drive/);
    expect(fs.existsSync(b.socketPath)).toBe(false);
    await b.stop();
  });
});

// A plain server at the path a socket-only proxy is given: a unix socket on
// macOS and Linux, a bare pipe name on Windows. It answers every line.
async function plainServer() {
  const at = process.platform === 'win32'
    ? `\\\\.\\pipe\\proxy-test-${crypto.randomBytes(12).toString('hex')}`
    : path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pxy-')), 's.sock');
  const got = { lines: [], connections: 0 };
  const sockets = new Set();
  const server = net.createServer((sock) => {
    got.connections += 1;
    sockets.add(sock);
    sock.setEncoding('utf8');
    let buf = '';
    sock.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        got.lines.push(line);
        sock.write(`${JSON.stringify({ id: JSON.parse(line).id, result: { content: [{ type: 'text', text: 'from the socket' }] } })}\n`);
      }
    });
  });
  await new Promise((resolve) => server.listen(at, resolve));
  cleanups.push(() => new Promise((resolve) => {
    for (const s of sockets) s.destroy();
    server.close(() => {
      if (process.platform !== 'win32') fs.rmSync(path.dirname(at), { recursive: true, force: true });
      resolve();
    });
  }));
  return { at, got };
}

async function callThroughProxy(env) {
  const child = spawn(process.execPath, [...stripTypesFlags(), PROXY], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const deadline = setTimeout(() => child.kill(), 20_000);
  cleanups.push(() => { clearTimeout(deadline); child.kill(); });
  let out = '';
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { stderr += d; });
  child.stdout.setEncoding('utf8');
  const answered = new Promise((resolve) => child.stdout.on('data', (d) => { out += d; if (out.includes('\n')) resolve(JSON.parse(out.split('\n')[0])); }));
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_issues', arguments: { team: 'core' } } })}\n`);
  const m = await answered;
  return { result: m.result, stderr: () => stderr };
}

describe('the proxy', () => {
  const RUN = { AGENTBOX_CONNECTION_RUN: 'run-key-only-the-app-may-see', AGENTBOX_CONNECTION: 'test-tracker', AGENTBOX_CONNECTION_NAME: 'Test tracker' };

  it('goes to the socket it is handed when it is handed no channel', async () => {
    const plain = await plainServer();
    const { result } = await callThroughProxy({ ...RUN, AGENTBOX_CONNECTIONS_SOCK: plain.at });
    expect(result.content[0].text).toBe('from the socket');
    expect(plain.got.lines.map((l) => JSON.parse(l))).toEqual([{ id: 1, run: RUN.AGENTBOX_CONNECTION_RUN, connection: 'test-tracker', method: 'tools/call', params: { name: 'list_issues', arguments: { team: 'core' } } }]);
  });

  it('goes only to the channel when it is handed one, and says offline when nothing there answers', async () => {
    const plain = await plainServer();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pxy-ch-'));
    cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
    const { result, stderr } = await callThroughProxy({ ...RUN, AGENTBOX_CONNECTIONS_SOCK: plain.at, AGENTBOX_CHANNEL_DIR: dir, AGENTBOX_CHANNEL_KIND: CHANNEL_KIND, AGENTBOX_CHANNEL_STAMP: '0123456789abcdef' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/owner's app is offline/i);
    expect(stderr()).toMatch(/Test tracker could not reach the app: local channel: /);
    expect(plain.got.connections).toBe(0);
  });
});

describe('the files the proxy starts with', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const relativeImports = (file) => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/(?:^\s*import\s[^'"]*?['"]|\bimport\(\s*['"])(\.{1,2}\/[^'"]+)['"]/gm)]
    .map((m) => path.posix.join(path.posix.dirname(file), m[1]));

  it('are only Node\'s own modules, main/local-channel.mts and shared/product-name.mjs, which imports nothing', () => {
    expect(relativeImports('mcp/connection-proxy.mts')).toEqual(['main/local-channel.mts']);
    expect(relativeImports('main/local-channel.mts')).toEqual(['shared/product-name.mjs']);
    expect(relativeImports('shared/product-name.mjs')).toEqual([]);
    for (const file of ['mcp/connection-proxy.mts', 'main/local-channel.mts', 'shared/product-name.mjs']) {
      const bare = [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^\s*import\s[^'"]*?['"]([^.'"][^'"]*)['"]/gm)].map((m) => m[1]);
      expect(bare.filter((s) => !s.startsWith('node:')), file).toEqual([]);
    }
  });

  it('ship in the packaged app and in the npm package', () => {
    expect(pkg.build.files).toEqual(expect.arrayContaining(['mcp/connection-proxy.mts', 'main/**/*', 'shared/**/*']));
    expect(pkg.files).toEqual(expect.arrayContaining(['mcp/**/*.mts', 'main/**/*.mts', 'shared/**/*.mjs']));
    expect(pkg.build.files.filter((f) => f.startsWith('!') && /^!(main|shared|mcp)\//.test(f))).toEqual([]);
  });
});
