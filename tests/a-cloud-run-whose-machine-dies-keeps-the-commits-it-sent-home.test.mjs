// A CLOUD RUN WHOSE MACHINE DIES KEEPS THE COMMITS IT SENT HOME, AND THE ROW
// SAYS WHAT WAS LOST.
//
// What broke (2026-10-30): a cloud run worked 3 hours 8 minutes and made many
// commits, then its machine went away. Commits only left the machine when the
// run ended, so the bucket held nothing of it: no done.json, no out.bundle,
// and the sandbox answered no-run. The row said the work "is kept in the cloud
// for 7 days and will be tried again", which was not true, and the next run
// started from the old commit as if nothing had happened.
//
// Measured here before the fix: with the machine killed after the agent
// committed, the folder stayed at "first", the relay printed "kept in the
// cloud for 7 days", and nothing was said on the row.
//
// Driven for real, as tests/a-cloud-run-brings-the-agents-work-home is: the
// real sandbox server, a stand-in S3, and a stand-in Claude Code. Killing the
// machine is closing the sandbox and putting a fresh one where it was, which
// answers no-run, as AgentCore does for a session whose microVM is gone.

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
import { readMarker, takeCloudNews, addCloudNews } from '../main/cloud/marker.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { waitFor } from './waiting.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let objects; let mac; let vms;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

async function freshSandbox() {
  vms += 1;
  sandbox = createSandbox({ workRoot: path.join(tmp, `vm-work-${vms}`), pathRoot: path.join(tmp, `vm-${vms}`), bridgeSocket: path.join(tmp, `bridge-${vms}.sock`) });
  sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
}

// The machine goes, and AgentCore answers the same session with an empty one.
async function killTheMachine() {
  await sandbox.close();
  await freshSandbox();
}

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudlost-')));
  objects = new Map();
  vms = 0;
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-123-cloud-signin-only' })));
  await freshSandbox();

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
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const transport = {
  async invoke(sessionId, payload) {
    const res = await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
    return res.json();
  },
  async stop() {},
};
const s3Url = () => `http://127.0.0.1:${s3.address().port}`;
const storage = {
  async put(k, body) { objects.set(k, Buffer.from(body)); },
  async get(k) { return objects.get(k) ?? null; },
  async getUrl(k) { return `${s3Url()}/${encodeURIComponent(k)}`; },
  async putUrl(k) { return `${s3Url()}/${encodeURIComponent(k)}`; },
};

const configDir = () => path.join(tmp, 'mac', 'claude-home');

function launch({ message, signals = new EventEmitter(), checkpointEveryMs = 100 }) {
  fs.mkdirSync(configDir(), { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"')) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir(), AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals,
    homeDir: path.join(tmp, 'home'), checkpointEveryMs,
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, err: () => err };
}

const savedCommits = () => [...objects.keys()].some((k) => k.endsWith('/checkpoint.bundle'));
const runningInTheCloud = () => waitFor('the agent to be running in the sandbox', async () => (await transport.invoke('x', { action: 'status' })).state === 'running');

describe('a cloud run whose machine dies', () => {
  it('lays the commits it sent home into the task folder, and says on the row what was lost', async () => {
    const run = launch({ message: 'STAY after committing' });
    await waitFor('the run to send its commits home as it works', savedCommits);
    await killTheMachine();
    expect(await run.done, run.err()).toBe(IMPORT_FAILED);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(git(mac, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('agentbox/w-1');
    // Nothing is left pending, so the thread can run again from here.
    expect(readMarker(mac)).toBe(null);
    expect(run.err()).not.toMatch(/kept in the cloud/);
    const news = takeCloudNews(mac);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ item: 'w-1', product: 'p', lost: true });
    expect(news[0].note).toMatch(/machine stopped before its run finished/);
    expect(news[0].note).toMatch(/in the task folder, the last one "From the cloud"/);
    expect(news[0].note).toMatch(/uncommitted files and its conversation since are lost/);
  });

  it('says plainly that everything is lost when it had sent nothing yet, and never that it is kept', async () => {
    const run = launch({ message: 'HANG before committing' });
    await runningInTheCloud();
    await killTheMachine();
    expect(await run.done, run.err()).toBe(IMPORT_FAILED);
    expect(savedCommits()).toBe(false);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('first');
    expect(readMarker(mac)).toBe(null);
    expect(run.err()).not.toMatch(/kept in the cloud/);
    const news = takeCloudNews(mac);
    expect(news).toHaveLength(1);
    expect(news[0].note).toMatch(/None of its work had been saved yet/);
  });

  it('lays in what it sent even when the machine died while the app was closed', async () => {
    const signals = new EventEmitter();
    const run = launch({ message: 'STAY after committing', signals });
    await waitFor('the run to send its commits home as it works', savedCommits);
    signals.emit('SIGHUP');
    expect(await run.done).toBe(IMPORT_FAILED);
    expect(readMarker(mac)).toMatchObject({ state: 'detached' });
    await killTheMachine();
    // The app opens again and brings the folder's cloud work home.
    const err = new PassThrough();
    let said = '';
    err.on('data', (d) => { said += d; });
    const code = await cloudRun({ importOnly: true, argv: [], env: { ...process.env, CLAUDE_CONFIG_DIR: configDir() }, cwd: mac, transport, storage, stdin: new PassThrough(), stdout: new PassThrough(), stderr: err, watchParent: false, homeDir: path.join(tmp, 'home') });
    expect(code, said).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(readMarker(mac)).toBe(null);
    expect(takeCloudNews(mac)[0].note).toMatch(/the last one "From the cloud"/);
  });
});

describe('a cloud run whose machine lives', () => {
  it('comes home from its own results, loose file and all, with nothing said about a lost machine', async () => {
    const run = launch({ message: 'SLOW please', checkpointEveryMs: 50 });
    expect(await run.done, run.err()).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(fs.readFileSync(path.join(mac, 'loose.txt'), 'utf8')).toBe('not committed\n');
    expect(takeCloudNews(mac)).toEqual([]);
  });

  it('still says its results are kept in the cloud when they are there but could not be laid in', async () => {
    const realGet = storage.get;
    storage.get = async (k) => (k.endsWith('out.bundle') ? null : realGet(k));
    try {
      const run = launch({ message: 'please do it' });
      expect(await run.done).toBe(IMPORT_FAILED);
      expect(run.err()).toMatch(/kept in the cloud for 7 days/);
      expect(readMarker(mac)).toMatchObject({ state: 'import-failed' });
    } finally {
      storage.get = realGet;
    }
  });
});

describe('the supervisor', () => {
  const product = { slug: 'p', dir: '/nowhere', repoPath: '/r' };
  it('notes a lost machine on its row without holding the row for her', () => {
    const noted = [];
    const keptAside = [];
    const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, {
      listItems: () => [], listProducts: () => [product], isDue: () => true,
      noteItem: (slug, id, note) => noted.push({ slug, id, note }),
      cloudWorkKeptAside: (slug, id, note) => keptAside.push({ slug, id, note }),
    }, tmp);
    addCloudNews(mac, { runId: 'r1', item: 'w-1', product: 'p', note: 'the machine stopped', lost: true });
    sup._sayCloudNews(mac);
    expect(noted).toEqual([{ slug: 'p', id: 'w-1', note: 'the machine stopped' }]);
    expect(keptAside).toEqual([]);
  });
});
