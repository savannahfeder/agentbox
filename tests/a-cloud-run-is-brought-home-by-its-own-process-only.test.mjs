// A CLOUD RUN IS BROUGHT HOME BY ITS OWN PROCESS ONLY.
//
// What broke: w-21b638d821's cloud runs were set aside on `cloud/<id>` twice
// in a row, "this folder changed on this Mac while the run was in the cloud",
// with nobody touching the folder; its agent then found the work already in
// it. Every run that labels itself `ship` has the ship queue ask `liveSince`,
// which started a second process bringing the same run home every two
// minutes. Once the run's results were up and before its own relay began
// laying them in, that second process passed every check, laid the run in
// beside it, and whichever compared the folder second set the work aside and
// took `ship` off the row. Measured here by holding both import slots so the
// live relay waits just after its results land, starting a second import in
// that window, and letting both go: before the fix the run ended on
// `cloud/w-1`.

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
import { cloudRun, IMPORT_FAILED } from '../main/cloud/run.mjs';
import { readMarker, writeMarker } from '../main/cloud/marker.mjs';
import { nameSlug } from '../shared/product-name.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { taskFolderPath } from '../main/task-folders.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac; let oldTmp;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudone-')));
  // The import slots live under the temp folder; these are this test's own.
  oldTmp = process.env.TMPDIR;
  process.env.TMPDIR = path.join(tmp, 't');
  fs.mkdirSync(process.env.TMPDIR);
  objects = new Map();
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-123-cloud-signin-only' })));
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
  if (oldTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = oldTmp;
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

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
const configDir = () => path.join(tmp, 'mac', 'claude-home');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launch(message) {
  fs.mkdirSync(configDir(), { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir(), AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'),
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, err: () => err };
}

// What the supervisor starts beside a live run: another process, by its pid.
function secondImport() {
  const stderr = new PassThrough();
  let err = '';
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({ importOnly: true, pid: 2 ** 22 + 7, argv: [], env: { ...process.env, CLAUDE_CONFIG_DIR: configDir() }, cwd: mac, transport, storage, stdin: new PassThrough(), stdout: new PassThrough(), stderr, watchParent: false, homeDir: path.join(tmp, 'home') });
  return { done, err: () => err };
}

const slots = () => path.join(os.tmpdir(), `${nameSlug}-cloud-imports`);
const holdBothSlots = () => {
  fs.mkdirSync(slots(), { recursive: true });
  for (const i of [0, 1]) fs.writeFileSync(path.join(slots(), `slot-${i}`), `${process.pid}:held-by-the-test`);
};
const letThemGo = () => { for (const i of [0, 1]) fs.rmSync(path.join(slots(), `slot-${i}`), { force: true }); };
const resultsAreUp = () => [...objects.keys()].some((k) => k.endsWith('done.json'));

describe('a second import started while the run\'s own relay is alive', () => {
  it('stands aside, and the run comes home into its folder, not onto a branch of its own', async () => {
    holdBothSlots();
    const run = launch('please do it');
    for (let i = 0; i < 800 && !resultsAreUp(); i += 1) await sleep(25);
    expect(resultsAreUp()).toBe(true);
    await sleep(300);
    expect(readMarker(mac)?.state).toBe('running');
    const second = secondImport();
    await sleep(300);
    letThemGo();
    expect(await second.done).toBe(IMPORT_FAILED);
    expect(second.err()).toMatch(/already being brought home by its own process/);
    expect(await run.done, run.err()).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(git(mac, 'branch', '--list', 'cloud/*')).toBe('');
    expect(readMarker(mac)).toBe(null);
  });

  it('a relay that died is still brought home by the next one, as before', async () => {
    writeMarker(mac, { runId: 'r-dead', sessionId: 's-dead', branch: 'agentbox/w-1', state: 'running', pid: 2 ** 22 + 9 });
    const second = secondImport();
    await second.done;
    expect(second.err()).not.toMatch(/already being brought home by its own process/);
  });
});

describe('the ship queue asking whether a cloud thread is still live', () => {
  let product;
  const make = () => new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [product], isDue: () => true }, tmp);

  it('waits, and starts nothing, while the thread\'s own run is live', () => {
    product = { slug: 'p', dir: path.join(tmp, 'docs'), repoPath: mac };
    const sup = make();
    const folder = taskFolderPath(sup.productFolder(product), 'w-1');
    fs.mkdirSync(folder, { recursive: true });
    git(folder, 'init', '-q');
    writeMarker(folder, { runId: 'r1', sessionId: 's1', branch: 'agentbox/w-1', state: 'running', pid: process.pid });
    const started = [];
    sup._bringCloudHome = (f) => started.push(f);
    sup.sessions.set('w-1', { startedAt: 5 });
    expect(sup.shipQueue.liveSince({ id: 'w-1', product: 'p' })).toBe(null);
    expect(started).toEqual([]);
    sup.sessions.delete('w-1');
    expect(sup.shipQueue.liveSince({ id: 'w-1', product: 'p' })).toBe(null);
    expect(started).toEqual([folder]);
  });
});
