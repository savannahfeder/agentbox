// A CLOUD RUN THROUGH THE SHARED HOST BRINGS ITS WORK HOME.
//
// The host (main/cloud/host.mjs) carries many cloud runs in one process, each
// held by the supervisor as a small stand-in (scripts/cloud-shim.pl), so 50 to
// 100 runs no longer cost a whole runtime each on her Mac (about 75 MB each,
// measured 2026-10-17). Driven here end to end: the real stand-in, the real
// host, this Mac's real relay and the real sandbox server on this machine, a
// stand-in for Claude Code that calls the store and commits, and the app's
// own input reader on the stand-in's output.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { cloudRun, INPUT_CLOSED_IN_CLOUD } from '../main/cloud/run.mjs';
import { attachClaudeInput } from '../main/claude-input.mjs';
import { startCloudHost } from '../main/cloud/host.mjs';
import { spawn } from 'node:child_process';
import { readMarker } from '../main/cloud/marker.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
let host; let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-asleep-')));
  objects = new Map();
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-asleep' })));
  sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
  mac = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(mac, { recursive: true });
  git(mac, 'init', '-q', '-b', 'main');
  git(mac, 'config', 'user.email', 'dev@example.com');
  git(mac, 'config', 'user.name', 'Dev');
  fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
  git(mac, 'add', '.');
  git(mac, 'commit', '-q', '-m', 'first');
  git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
});

afterEach(async () => {
  await host?.close();
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});


const SHIM = here('../scripts/cloud-shim.pl');

describe('a cloud run through the host', () => {
  it('runs, calls the store, and brings its commit home, as a relay of its own did', async () => {
    const transport = {
      async invoke(_s, payload) {
        const res = await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
        return res.json();
      },
      async stop() {},
    };
    const storage = {
      async put(k, body) { objects.set(k, Buffer.from(body)); },
      async get(k) { return objects.get(k) ?? null; },
      async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
      async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
    };
    const configDir = path.join(tmp, 'mac', 'claude-home');
    fs.mkdirSync(configDir, { recursive: true });
    const storeLog = path.join(tmp, 'store.log');
    const mcpFile = path.join(tmp, 'mac', 'mcp.json');
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: storeLog } } } }));
    const sockPath = path.join(tmp, 'host.sock');
    host = startCloudHost({
      sockPath,
      runOne: (o) => cloudRun({
        argv: o.args, env: o.env, cwd: o.cwd, stdin: o.stdin, stdout: o.stdout, stderr: o.stderr, signals: o.signals, pid: o.pid, watchParent: false,
        transport, storage, login: LOGIN, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 100, resultsWaitMs: 8000, homeDir: path.join(tmp, 'home'),
      }),
    });
    for (let i = 0; i < 100 && !fs.existsSync(sockPath); i += 1) await new Promise((r) => setTimeout(r, 20));
    const child = spawn('/usr/bin/perl', [SHIM, sockPath, FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile], {
      cwd: mac, env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac', 'store') }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    attachClaudeInput(child);
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const code = new Promise((r) => child.on('exit', (c) => r(c)));
    child.stdin.write(JSON.stringify({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'please note this' } }) + '\n');
    expect(await code, err).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    const result = JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);
    expect(result.said).toBeTruthy();
    expect(fs.readFileSync(storeLog, "utf8")).toContain('"name":"note"');
    expect(child.ranToTheEnd()).toBe(true);
    expect(readMarker(mac)).toBe(null);
  }, 60_000);
});
