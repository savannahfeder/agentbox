// A CLOUD RUN IS TOLD HOW LONG IT HAS, AND ITS THREAD IS TOLD WHY IT ENDED.
//
// What broke (w-f37c87e2f1, 2026-10-31): a cloud run started at 11:11, gave
// two builder subagents about 45 minutes of work each, and its machine was
// gone by 11:24. The next run came up on a fresh machine with the same message
// replayed and no word of why the last one stopped, so it sized its work the
// same way again. Nothing anywhere told the agent that a run has a ceiling.
//
// Measured here before the fix: the note the agent is given said nothing about
// a time limit or about commits being what survives the machine; the relay
// never sent the sandbox a deadline, so the only copy of the number was the
// image's; and a run the sandbox stopped at its deadline left no word of it on
// the row at all.
//
// Driven for real as tests/a-cloud-run-whose-machine-dies-keeps-the-commits-it-sent-home
// is: the real sandbox server, a stand-in S3, and a stand-in Claude Code, with
// the deadline set to seconds instead of hours.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox, DEFAULT_DEADLINE_MS } from '../cloud/sandbox/server.mjs';
import { cloudRun, CLOUD_NOTE, PLAIN_CLOUD_NOTE, RUN_LIMIT_MS, howLongWords, IMPORT_FAILED } from '../main/cloud/run.mjs';
import { takeCloudNews } from '../main/cloud/marker.mjs';
import { waitFor } from './waiting.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let objects; let mac; let machineGone;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

describe('the note a cloud run is given', () => {
  it('says how long the run has, and that its commits on this branch are what outlives the machine', () => {
    expect(CLOUD_NOTE).toContain('7 hours 45 minutes');
    expect(CLOUD_NOTE).toMatch(/reclaimed/);
    expect(CLOUD_NOTE).toMatch(/commits on this task's branch are sent back/);
    expect(CLOUD_NOTE).toMatch(/subagent/);
    // A project with no repository has no branch to commit on, but the same ceiling.
    expect(PLAIN_CLOUD_NOTE).toContain('7 hours 45 minutes');
    expect(PLAIN_CLOUD_NOTE).not.toMatch(/commits on this task's branch/);
  });

  it('names the same limit the sandbox stops the agent at', () => {
    expect(RUN_LIMIT_MS).toBe(DEFAULT_DEADLINE_MS);
    expect(howLongWords(RUN_LIMIT_MS)).toBe('7 hours 45 minutes');
    expect(howLongWords(90 * 60_000)).toBe('1 hour 30 minutes');
    expect(howLongWords(60 * 60_000)).toBe('1 hour');
    expect(howLongWords(45_000)).toBe('45 seconds');
  });
});

async function freshSandbox() {
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
}

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudlimit-')));
  objects = new Map();
  machineGone = false;
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    if (machineGone) return res.destroy();
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

const sent = [];
const transport = {
  async invoke(sessionId, payload) {
    sent.push(payload);
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

function launch({ message, runLimitMs, signals = new EventEmitter() }) {
  const configDir = path.join(tmp, 'mac', 'claude-home');
  fs.mkdirSync(configDir, { recursive: true });
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
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals,
    homeDir: path.join(tmp, 'home'), checkpointEveryMs: 100, runLimitMs,
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, err: () => err };
}

describe('a cloud run the sandbox stops at its deadline', () => {
  beforeEach(() => { sent.length = 0; });

  it('tells the sandbox the deadline it told the agent about', async () => {
    const run = launch({ message: 'please do it', runLimitMs: 60_000 });
    expect(await run.done, run.err()).toBe(0);
    expect(sent.find((p) => p.action === 'start')?.deadlineMs).toBe(60_000);
    // Nothing was stopped by the limit, so nothing is said about one.
    expect(takeCloudNews(mac)).toEqual([]);
  });

  it('says on the row that the limit stopped it, and brings home the commits it made', async () => {
    const run = launch({ message: 'STAY after committing', runLimitMs: 3000 });
    expect(await run.done, run.err()).not.toBe(IMPORT_FAILED);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    const news = takeCloudNews(mac);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ item: 'w-1', product: 'p' });
    expect(news[0].note).toMatch(/stopped at the cloud's time limit of 3 seconds/);
    expect(news[0].note).toMatch(/did not finish/);
  });
});

describe('a cloud run whose machine stopped', () => {
  it('says how long it had been going when it went', async () => {
    const run = launch({ message: 'STAY after committing', runLimitMs: 60_000 });
    await waitFor('the run to send its commits home as it works', () => [...objects.keys()].some((k) => k.endsWith('/checkpoint.bundle')));
    // A machine that is gone uploads nothing more. Closing the sandbox SIGKILLs
    // the agent and its exit path would collect for it; if that upload beat the
    // Mac's next poll the run read as one that ended of signal 9, which is how
    // main went red on GitHub while passing here.
    machineGone = true;
    await sandbox.close();
    await freshSandbox();
    expect(await run.done, run.err()).toBe(IMPORT_FAILED);
    expect([...objects.keys()].some((k) => k.endsWith('/done.json'))).toBe(false);
    const news = takeCloudNews(mac);
    expect(news[0].note).toMatch(/machine stopped \d+ seconds? into its run/);
  });
});
