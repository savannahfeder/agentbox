// A CLOUD RUN FINISHES WHILE THE MAC SLEEPS, AND COMES HOME WHEN IT WAKES.
//
// What broke: she wants agents that "work when your Mac is closed"
// (2026-10-17). A cloud run stopped at its next tool call while the Mac slept,
// and one that finished its turn sat idle until the Mac woke to close its
// input. Driven here end to end: this Mac's real relay (main/cloud/run.mjs)
// against the real sandbox server on this machine, with every call the relay
// makes to the cloud held while the Mac "sleeps" (as a frozen process is), a
// stand-in for Claude Code that calls the app's store and commits, and the
// app's own input reader (main/claude-input.mjs) on the relay's output.
//
// The run's tool calls are answered in the cloud ("not made"), never reach the
// store, its turn ends there, and when the Mac wakes its commit comes home and
// the app reads the run as finished, not stopped part-way.
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
import { readMarker } from '../main/cloud/marker.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac;

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
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('a cloud run while this Mac sleeps', () => {
  it('is told its tool calls did not reach the app, ends its turn in the cloud, and comes home finished when the Mac wakes', async () => {
    // The Mac: awake until the run has started, then asleep until told.
    let asleep = false; let wake; const woken = new Promise((r) => { wake = r; });
    const transport = {
      async invoke(_s, payload) {
        if (asleep && payload.action !== 'start') await woken;
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

    // The relay's ends, as the supervisor holds them, with its input reader on them.
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    attachClaudeInput(child);
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const done = cloudRun({
      argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
      env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac', 'store') },
      cwd: mac, transport, storage, login: LOGIN,
      stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, remoteCommand: process.execPath, stubPath: STUB,
      pollWaitMs: 100, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
      homeDir: path.join(tmp, 'home'), offlineAfterMs: 500,
    }).then((code) => { child.emit('exit', code); return code; });
    // The brief, then the lid closes, before the agent has made its first call ("LATE").
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'LATE please note this' } }) + '\n');
    for (let i = 0; i < 200 && readMarker(mac)?.state !== 'running'; i += 1) await new Promise((r) => setTimeout(r, 25));
    asleep = true;

    // Asleep: the run finishes in the cloud on its own and its results go up.
    for (let i = 0; i < 400 && !objects.has([...objects.keys()].find((k) => k.endsWith('/done.json'))); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect([...objects.keys()].some((k) => k.endsWith('/done.json'))).toBe(true);
    expect(fs.existsSync(storeLog) ? fs.readFileSync(storeLog, 'utf8') : '').not.toMatch(/tools\/call/);

    // Awake: its work comes home, and the app reads the run as finished.
    asleep = false; wake();
    expect(await done, err).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    const result = JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);
    expect(result.said).toMatch(/asleep.*was not made/i);
    expect(out).toContain(INPUT_CLOSED_IN_CLOUD);
    expect(child.ranToTheEnd()).toBe(true);
    expect(err).toMatch(/this Mac was asleep; the cloud run carried on/);
    expect(readMarker(mac)).toBe(null);
  }, 60_000);
});

describe('the app\'s input reader', () => {
  it('knows the line the relay writes when the cloud closed a run\'s input', () => {
    const src = fs.readFileSync(new URL('../main/claude-input.mjs', import.meta.url), 'utf8');
    expect(src).toContain(`event.subtype === '${INPUT_CLOSED_IN_CLOUD}'`);
  });
});
