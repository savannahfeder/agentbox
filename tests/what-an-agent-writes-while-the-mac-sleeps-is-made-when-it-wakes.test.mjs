// WHAT AN AGENT WRITES ON ITS THREAD WHILE THE MAC SLEEPS IS MADE WHEN IT WAKES.
//
// What broke (found reading the code, 2026-10-19): with the Mac asleep, a
// cloud run's every call to the app's store was answered "not made" in the
// cloud. An agent that finished its work then could not mark its thread done,
// write its result or label it to ship; the row never moved, and a reply it
// had answered was delivered again on wake and counted as a failed try.
//
// Now the calls the Mac names as safe to make late (writes to the thread and
// its documents) are kept in the cloud while it is away, the agent is told so,
// and the Mac makes them through its own store server when it wakes, before
// the run comes home. Anything else is still "not made". A Mac that does not
// ask for this, or a cloud that does not offer it, behaves as before.
// Driven end to end, as tests/a-cloud-run-finishes-while-the-mac-sleeps.
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
  it('keeps the writes the Mac named, tells the agent, and makes them when the Mac wakes', async () => {
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
      homeDir: path.join(tmp, 'home'), offlineAfterMs: 500, keptWhileAway: { agentbox: ['note'] },
    }).then((code) => { child.emit('exit', code); return code; });
    // The brief, then the lid closes, before the agent has made its first call ("LATE").
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'LATE please note this' } }) + '\n');
    for (let i = 0; i < 200 && readMarker(mac)?.state !== 'running'; i += 1) await new Promise((r) => setTimeout(r, 25));
    asleep = true;

    for (let i = 0; i < 400 && !objects.has([...objects.keys()].find((k) => k.endsWith('/done.json'))); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect([...objects.keys()].some((k) => k.endsWith('/done.json'))).toBe(true);
    // Kept in the cloud, not made: nothing has reached the store yet.
    expect(fs.existsSync(storeLog) ? fs.readFileSync(storeLog, 'utf8') : '').not.toMatch(/"note"/);

    asleep = false; wake();
    expect(await done, err).toBe(0);
    const result = JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);
    expect(result.said).toMatch(/kept.*made when your computer is back/i);
    // Made by the Mac's own store server once it woke, with the agent's words.
    const calls = fs.readFileSync(storeLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(calls).toEqual([expect.objectContaining({ name: 'note', args: { text: 'LATE please note this' } })]);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(err).toMatch(/1 thing the run wrote while this Mac was asleep was made now/);
  }, 60_000);

  it('says so when a kept write is turned down on waking', async () => {
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
      homeDir: path.join(tmp, 'home'), offlineAfterMs: 500, keptWhileAway: { agentbox: ['note'] },
    }).then((code) => { child.emit('exit', code); return code; });
    // The brief, then the lid closes, before the agent has made its first call ("LATE").
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'LATE REFUSE please note this' } }) + '\n');
    for (let i = 0; i < 200 && readMarker(mac)?.state !== 'running'; i += 1) await new Promise((r) => setTimeout(r, 25));
    asleep = true;

    for (let i = 0; i < 400 && !objects.has([...objects.keys()].find((k) => k.endsWith('/done.json'))); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect([...objects.keys()].some((k) => k.endsWith('/done.json'))).toBe(true);
    // Kept in the cloud, not made: nothing has reached the store yet.
    expect(fs.existsSync(storeLog) ? fs.readFileSync(storeLog, 'utf8') : '').not.toMatch(/"note"/);

    asleep = false; wake();
    expect(await done, err).toBe(0);
    expect(err).toMatch(/a write the run made while this Mac was asleep was turned down: another session holds this row/);
  }, 60_000);

  it('still answers "not made" for a call the Mac did not name', async () => {
    const src = fs.readFileSync(new URL('../cloud/sandbox/server.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/kept\?\.\[server\]\?\.includes\(tool\)/);
  });
});

describe('what the Mac names', () => {
  it('the writes to a thread and its documents, and nothing that reads or claims', async () => {
    const { KEPT_WHILE_AWAY } = await import('../main/cloud/run.mjs');
    const tools = Object.values(KEPT_WHILE_AWAY).flat();
    expect(tools).toEqual(expect.arrayContaining(['update_work_item', 'create_work_item', 'write_document']));
    for (const t of ['claim_work_item', 'release_work_item', 'list_work_items', 'read_document', 'look_at_page']) expect(tools).not.toContain(t);
  });
});
