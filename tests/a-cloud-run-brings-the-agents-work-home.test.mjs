// A CLOUD RUN BRINGS THE AGENT'S WORK HOME, AND THE APP CANNOT TELL IT FROM A
// LOCAL ONE.
//
// main/cloud/run.mjs stands in for `claude` when a thread runs in the cloud
// (docs/cloud/PLAN.md). The supervisor reads its stdout as the agent's stream,
// writes the prompt to its stdin, and when it exits expects the task folder to
// hold the agent's work, because the change card, the ship queue and the next
// resume all read that folder. Every way that can go wrong is a thread that
// says it finished while its commits are somewhere else: the commits not
// fast-forwarded, the uncommitted file dropped, the transcript left in the
// cloud (so the next reply cannot resume), the store call made from the wrong
// machine, or a run cancelled by an app quit whose work never comes back.
//
// Driven for real, on one machine: the real sandbox server over HTTP (with its
// paths moved under a scratch root), a stand-in S3 over HTTP, a stand-in Claude
// Code that speaks stream-json and calls the store through the bridge, and a
// stand-in store server that runs on the "Mac" and logs what it was asked.

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
import { readMarker, writeMarker, cloudWorkPending } from '../main/cloud/marker.mjs';
import { waitFor } from './waiting.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudrun-')));
  objects = new Map();
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  // The account's Claude sign-in, kept in the cloud (main/cloud/logins.mjs).
  macReads = [];
  objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-123-cloud-signin-only' })));
  const addr = await sandbox.listen(0, '127.0.0.1');
  sandboxUrl = `http://127.0.0.1:${addr.port}`;

  // "The Mac": a repository on its task branch, a store log, an account folder.
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
  // The retries, as in a-cloud-sandbox-runs-one-command: a write already on
  // its way can put an entry back between the delete reading this folder and
  // emptying it, and ENOTEMPTY here failed a test that had already passed.
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const transport = {
  async invoke(sessionId, payload) {
    const res = await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
    return res.json();
  },
  async stop() {},
};
// What the Mac asked to read from the bucket: never a login.
let macReads = [];
const storage = {
  async put(k, body) { objects.set(k, Buffer.from(body)); },
  async get(k) { macReads.push(k); return objects.get(k) ?? null; },
  async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
};

function launch({ message = 'please do it', extraArgs = [], signals = new EventEmitter(), env = {} } = {}) {
  const storeLog = path.join(tmp, 'store.log');
  const configDir = path.join(tmp, 'mac', 'claude-home');
  fs.mkdirSync(configDir, { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: storeLog } } } }));
  const settingsFile = path.join(tmp, 'mac', 'settings.json');
  fs.writeFileSync(settingsFile, JSON.stringify({ permissions: { allow: ['Bash'] }, hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: '/Users/someone/memory-gate-hook.sh pre' }] }] } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => {
    out += d;
    // As the supervisor does: close stdin once the result has arrived.
    if (out.includes('"type":"result"')) stdin.end();
  });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile, '--settings', settingsFile, ...extraArgs],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac'), ...env },
    cwd: mac, transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals,
    homeDir: path.join(tmp, 'home'),
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, out: () => out, err: () => err, storeLog, configDir, signals, settingsFile };
}

const resultOf = (out) => JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);

// The run has left with the folder as it was: only a change after this is one made while it was away.
const untilAway = () => waitFor('the run to be away in the cloud', () => readMarker(mac)?.state === 'running');

describe('a cloud run', () => {
  it('streams the agent, runs its store call on the Mac, and lays its commit, its loose file and its transcript into the task folder', async () => {
    const run = launch();
    const code = await run.done;
    expect(code, run.err()).toBe(0);
    const result = resultOf(run.out());
    // The store call ran HERE, with the worker's own environment.
    expect(result.said).toBe('noted on the Mac for w-1');
    expect(fs.readFileSync(run.storeLog, 'utf8')).toContain('"item":"w-1"');
    // The account's cloud sign-in reached the remote command, and what the
    // command printed of it came home redacted. The Mac never read it.
    expect(result.token).toBe('[cloud sign-in]');
    expect(macReads.some((k) => k.startsWith('logins/'))).toBe(false);
    // The commit came home, fast-forwarded onto the task branch.
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(git(mac, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('agentbox/w-1');
    expect(fs.readFileSync(path.join(mac, 'cloud.txt'), 'utf8')).toBe('made in the cloud\n');
    // The uncommitted file came home uncommitted.
    expect(fs.readFileSync(path.join(mac, 'loose.txt'), 'utf8')).toBe('not committed\n');
    expect(git(mac, 'status', '--porcelain')).toContain('loose.txt');
    // The transcript is where the supervisor's resume looks for it.
    const transcript = path.join(run.configDir, 'projects', mac.replace(/[^a-zA-Z0-9]/g, '-'), 'cloud-session-0001.jsonl');
    expect(fs.existsSync(transcript)).toBe(true);
    // Nothing is left pending, so shipping may go ahead.
    expect(readMarker(mac)).toBe(null);
    // And what the run used is on record for setting the plan limits
    // (tests/a-cloud-run-records-what-it-really-used).
    const used = fs.readFileSync(path.join(tmp, 'home', '.agentbox', 'cloud-usage.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(used).toHaveLength(1);
    expect(used[0]).toMatchObject({ item: 'w-1', engine: 'claude', exitCode: 0 });
    expect(used[0].wallSeconds).toBeGreaterThan(0);
    expect(cloudWorkPending(mac)).toBe(false);
  });

  // THE SAME TOOLS AS ON THE MAC, AND A CALL TO THE ONE THAT CANNOT WORK HERE
  // REFUSED (2026-10-16). It used to be left out of the list, and a thread that
  // moved from the Mac to the cloud was then told "deferred tools are no longer
  // available (MCP server disconnected): mcp__agentbox__*". Two agents took
  // that at its word and never tried the store: "I couldn't add the ship label
  // because my link to your inbox dropped", while their own start-up line said
  // the server was connected with 17 tools.
  it('lists the same tools as on the Mac, and refuses a call to the one that would look at the Mac', async () => {
    const run = launch({ message: 'LOOK at the page' });
    expect(await run.done).toBe(0);
    const result = resultOf(run.out());
    expect(result.names).toEqual(['note', 'look_at_page']);
    expect(result.said).toMatch(/not available to a cloud run/);
    expect(fs.existsSync(run.storeLog) ? fs.readFileSync(run.storeLog, 'utf8') : '').not.toContain('look_at_page');
  });

  it('carries the task folder\'s uncommitted work up, and sends a file the prompt names from the store', async () => {
    fs.writeFileSync(path.join(mac, 'draft.txt'), 'half done\n');
    const attachment = path.join(tmp, 'mac', 'attachments', 'note.txt');
    fs.mkdirSync(path.dirname(attachment), { recursive: true });
    fs.writeFileSync(attachment, 'from the store\n');
    const run = launch({ message: `use ATTACH:${attachment}` });
    expect(await run.done, run.err()).toBe(0);
    expect(resultOf(run.out()).attached).toBe('from the store');
    // The draft went up, survived the run, and is still uncommitted here.
    expect(fs.readFileSync(path.join(mac, 'draft.txt'), 'utf8')).toBe('half done\n');
    expect(git(mac, 'status', '--porcelain')).toContain('draft.txt');
  });

  it('leaves the Mac\'s memory hooks out of the settings it sends up', async () => {
    const run = launch();
    expect(await run.done).toBe(0);
    const sent = [...objects.entries()].map(([, v]) => v.toString('utf8')).find((t) => t.includes('"permissions"'));
    expect(JSON.parse(sent)).toEqual({ permissions: { allow: ['Bash'] } });
    // And the original on the Mac is untouched.
    expect(JSON.parse(fs.readFileSync(run.settingsFile, 'utf8')).hooks).toBeTruthy();
  });

  it('when asked to stop, cancels the agent in the cloud and still brings its transcript home', async () => {
    const signals = new EventEmitter();
    const run = launch({ message: 'HANG please', signals });
    // Wait until it is really running in the sandbox. A stop that lands while
    // it is still preparing cancels something else, which is not this test.
    await waitFor('the agent to be running in the sandbox', async () => (await transport.invoke('x', { action: 'status' })).state === 'running');
    signals.emit('SIGTERM');
    const code = await run.done;
    expect(code).toBe(143);
    expect(run.err()).toMatch(/stopping the cloud run/);
    expect(readMarker(mac)).toBe(null);
  });

  it('keeps the folder marked when the work cannot be brought back, so nothing ships the stale branch', async () => {
    const realGet = storage.get;
    storage.get = async (k) => (k.endsWith('out.bundle') ? null : realGet(k));
    try {
      const run = launch();
      expect(await run.done).toBe(IMPORT_FAILED);
      expect(cloudWorkPending(mac)).toBe(true);
      expect(readMarker(mac)).toMatchObject({ state: 'import-failed' });
      expect(git(mac, 'log', '-1', '--format=%s')).toBe('first');
    } finally {
      storage.get = realGet;
    }
  });

  it('brings home an earlier run that never came back before it starts a new one', async () => {
    // A first run whose import failed, as an app that quit mid-import leaves it.
    const realGet = storage.get;
    storage.get = async (k) => (k.endsWith('out.bundle') ? null : realGet(k));
    const first = launch();
    expect(await first.done).toBe(IMPORT_FAILED);
    storage.get = realGet;
    // The next run in the same folder imports the first one's commit, then runs.
    await sandbox.close();
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work-2'), pathRoot: path.join(tmp, 'vm2'), bridgeSocket: path.join(tmp, 'bridge2.sock') });
    sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
    const second = launch();
    expect(await second.done, second.err()).toBe(0);
    const subjects = git(mac, 'log', '--format=%s').split('\n');
    expect(subjects.filter((s) => s === 'From the cloud').length).toBe(2);
    expect(readMarker(mac)).toBe(null);
  });

  // What happens to the run's work then: tests/a-cloud-run-that-cannot-be-laid-in-never-blocks-its-thread.
  it('will not lay the run over a folder that changed on this Mac while it was away, and keeps the run\'s commits', async () => {
    const run = launch({ message: 'SLOW please' });
    // Something on the Mac writes into the folder while the agent works.
    await untilAway();
    fs.writeFileSync(path.join(mac, 'local-edit.txt'), 'made here meanwhile\n');
    expect(await run.done).toBe(0);
    expect(run.err()).toMatch(/changed on this Mac/);
    // The local edit is untouched, and the run's commit is kept on its branch.
    expect(fs.readFileSync(path.join(mac, 'local-edit.txt'), 'utf8')).toBe('made here meanwhile\n');
    expect(git(mac, 'log', '--format=%s', 'cloud/w-1')).toMatch(/From the cloud/);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('first');
  });

  it('notices a change staged on this Mac meanwhile, even one whose file was put back', async () => {
    const run = launch({ message: 'SLOW please' });
    await untilAway();
    fs.writeFileSync(path.join(mac, 'a.txt'), 'staged meanwhile\n');
    git(mac, 'add', 'a.txt');
    fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
    expect(await run.done).toBe(0);
    expect(run.err()).toMatch(/changed on this Mac/);
    expect(git(mac, 'diff', '--cached', '--name-only')).toBe('a.txt');
  });

  it('touches nothing in the folder until every piece has downloaded, so a retry finds it as the run left it', async () => {
    const realGet = storage.get;
    storage.get = async (k) => (k.endsWith('changes.bundle') ? null : realGet(k));
    const first = launch();
    expect(await first.done).toBe(IMPORT_FAILED);
    storage.get = realGet;
    // Nothing moved: not the branch, not the files.
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('first');
    expect(fs.existsSync(path.join(mac, 'loose.txt'))).toBe(false);
    expect(readMarker(mac)).toMatchObject({ state: 'import-failed' });
    // The homecoming alone, as the app runs it, now lays all of it down.
    const code = await cloudRun({ importOnly: true, argv: [], env: { ...process.env, CLAUDE_CONFIG_DIR: first.configDir }, cwd: mac, transport, storage, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), watchParent: false, homeDir: path.join(tmp, 'home') });
    expect(code).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(fs.readFileSync(path.join(mac, 'loose.txt'), 'utf8')).toBe('not committed\n');
    expect(readMarker(mac)).toBe(null);
  });

  it('will not bring home an agent that finished on another branch as if it were the task\'s', async () => {
    const run = launch({ message: 'SWITCH branches' });
    expect(await run.done).toBe(0);
    expect(run.err()).toMatch(/finished on somewhere-else/);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('first');
    expect(git(mac, 'log', '--format=%s', 'cloud/w-1')).toMatch(/From the cloud/);
  });

  it('keeps its record when the start went unanswered, because the run may have begun', async () => {
    const realInvoke = transport.invoke;
    transport.invoke = async (sid, p) => { if (p.action === 'start') throw new Error('network down'); return realInvoke(sid, p); };
    try {
      const run = launch();
      expect(await run.done).toBe(IMPORT_FAILED);
      expect(readMarker(mac)).toMatchObject({ state: 'start-unknown' });
    } finally {
      transport.invoke = realInvoke;
    }
  });

  it('carries a real MCP handshake, as Codex makes it with a bare environment, from the sandbox to the Mac and back', async () => {
    // Measured 2026-10-13 against real AWS: Codex's store tool "timed out
    // handshaking". This drives the official MCP client through the stub, the
    // bridge and the proxy to the store server on the Mac.
    const storeLog = path.join(tmp, 'store-real.log');
    const mcpFile = path.join(tmp, 'mac', 'mcp-real.json');
    fs.mkdirSync(path.dirname(mcpFile), { recursive: true });
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: storeLog } } } }));
    let out = '';
    const stdout = new PassThrough();
    stdout.on('data', (d) => { out += d; });
    const stderr = new PassThrough();
    let err = '';
    stderr.on('data', (d) => { err += d; });
    const stdin = new PassThrough();
    stdin.end();
    const code = await cloudRun({
      argv: [here('./fixtures/cloud/real-mcp-client.mjs'), process.execPath, STUB, 'agentbox', '--mcp-config', mcpFile],
      env: { ...process.env, ZERO_ITEM: 'w-1', CLAUDE_CONFIG_DIR: path.join(tmp, 'mac', 'claude-home') },
      cwd: mac, transport, storage, login: LOGIN, stdin, stdout, stderr,
      remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false,
      homeDir: path.join(tmp, 'home'),
    });
    expect(code, err).toBe(0);
    expect(JSON.parse(out.trim().split('\n').at(-1))).toEqual({ tools: ['note', 'look_at_page'], said: 'noted on the Mac for w-1' });
    expect(fs.readFileSync(storeLog, 'utf8')).toContain('through the bridge');
  });

  it('refuses to start a second run while an earlier one\'s own process is still bringing it home', async () => {
    writeMarker(mac, { runId: 'r-old', sessionId: 's-old-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', branch: 'agentbox/w-1', startSha: git(mac, 'rev-parse', 'HEAD'), pid: process.pid === 1 ? 2 : process.ppid, state: 'running' });
    const run = launch();
    expect(await run.done).toBe(IMPORT_FAILED);
    expect(run.err()).toMatch(/could not be brought back yet/);
  });
});
