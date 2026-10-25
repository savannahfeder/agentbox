// A CLOUD RUN CARRIES ON WHEN THE APP RESTARTS, AND COMES HOME WHEN IT OPENS.
//
// What broke (2026-10-15): she restarted the app and her cloud threads were
// stopped with it. Quitting sent every worker SIGTERM, and the cloud proxy
// read that as Stop: it cancelled the agent in the cloud mid-turn. Running in
// the cloud is meant to be what keeps work going when the Mac is not there.
//
// Now quitting sends a cloud run SIGHUP. Its proxy tells the agent no more is
// coming, so it finishes the turn it is in and ends; answers any tool call the
// app can no longer answer with why; and leaves a marker saying where it got
// to. When the app opens again, the process that brings cloud work home joins
// the run instead of stopping it: it serves the agent's tool calls again (the
// store server started afresh, its handshake said again), waits for the run to
// finish, and lays its work into the folder. Stop is still Stop.
//
// Driven for real on one machine, as in tests/a-cloud-run-brings-the-agents-work-home.

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
import { cloudRun, IMPORT_FAILED, toolVariables } from '../main/cloud/run.mjs';
import { readMarker } from '../main/cloud/marker.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let objects; let mac; let storeLog; let s3Url;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudquit-')));
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
  const addr = await sandbox.listen(0, '127.0.0.1');
  sandboxUrl = `http://127.0.0.1:${addr.port}`;
  mac = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(mac, { recursive: true });
  git(mac, 'init', '-q', '-b', 'main');
  git(mac, 'config', 'user.email', 'dev@example.com');
  git(mac, 'config', 'user.name', 'Dev');
  fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
  git(mac, 'add', '.');
  git(mac, 'commit', '-q', '-m', 'first');
  git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
  storeLog = path.join(tmp, 'store.log');
});

afterEach(async () => {
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

// While set, input to the agent does not get through, as when the network
// drops just as the app quits.
let cutOff = false;
const transport = {
  async invoke(_s, payload) {
    if (cutOff && payload.action === 'stdin') throw new Error('offline');
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
const common = () => ({
  cwd: mac, transport, storage, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false,
  homeDir: path.join(tmp, 'home'), leaveFlushMs: 500,
});

function launch(message, extra = {}) {
  fs.mkdirSync(configDir(), { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: storeLog, FAKE_STORE_STRICT: '1' } } } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const signals = new EventEmitter();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    ...common(), login: LOGIN, stdin, stdout, stderr, signals, ...extra,
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir(), AGENTBOX_HOME: path.join(tmp, 'mac') },
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, signals, out: () => out, err: () => err };
}

// What the supervisor starts when the app opens again: no prompt, no stream,
// and none of the worker's own variables (main/supervisor.mjs _bringCloudHome).
function bringHome(extraEnv = {}) {
  const stderr = new PassThrough();
  const stdout = new PassThrough();
  const signals = new EventEmitter();
  let err = ''; let out = '';
  stderr.on('data', (d) => { err += d; });
  stdout.on('data', (d) => { out += d; });
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(ZERO_|STORE_|AGENTBOX_)/.test(k)) delete env[k];
  Object.assign(env, extraEnv);
  const done = cloudRun({ ...common(), importOnly: true, argv: [], env, stdin: new PassThrough(), stdout, stderr, signals });
  return { done, signals, err: () => err, out: () => out };
}

async function untilRunning() {
  for (let i = 0; i < 100 && (await transport.invoke('x', { action: 'status' })).state !== 'running'; i += 1) await sleep(50);
}
const calls = () => (fs.existsSync(storeLog) ? fs.readFileSync(storeLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

describe('when the app quits with a run in the cloud', () => {
  it('leaves it going, and the app opening again serves its tool call and brings its work home', async () => {
    const run = launch('LATE please');
    await untilRunning();
    await sleep(400);
    run.signals.emit('SIGHUP');
    expect(await run.done, run.err()).toBe(IMPORT_FAILED);
    expect(readMarker(mac)).toMatchObject({ state: 'detached', pid: null });
    // The agent was not stopped: it carries on to its tool call, which waits
    // for the app.
    await sleep(1800);
    expect(calls()).toEqual([]);
    expect((await transport.invoke('x', { action: 'status' })).state).toBe('running');

    const home = bringHome();
    expect(await home.done, home.err()).toBe(0);
    // Served on the Mac by a fresh store server, after the handshake was said
    // to it again, with the worker's own variables.
    expect(calls()).toEqual([{ name: 'note', args: { text: 'LATE please' }, item: 'w-1' }]);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(fs.existsSync(path.join(configDir(), 'projects', mac.replace(/[^a-zA-Z0-9]/g, '-'), 'cloud-session-0001.jsonl'))).toBe(true);
    expect(readMarker(mac)).toBe(null);
  });

  // THE WINDOW CLOSING SENT A STOP RIGHT AFTER (2026-10-16): her restarts at
  // 6:47 and 6:52pm left every cloud run going, and the supervisor's stop on
  // the window's close then sent each one SIGTERM, which cancelled it ("leaving
  // the cloud run going" followed by "stopping the cloud run (asked to stop)"
  // in six run logs). The window's stop now says SIGHUP too (below, "the
  // app"); a SIGTERM is a Stop she meant, during a quit as at any other time
  // (Codex's review, 2026-10-16).
  it('still stops when she presses Stop while the app is quitting', async () => {
    const run = launch('LATE please');
    await untilRunning();
    await sleep(400);
    run.signals.emit('SIGHUP');
    run.signals.emit('SIGTERM');
    await run.done;
    expect(run.err()).toMatch(/stopping the cloud run \(asked to stop\)/);
  });

  // The approvals server's key is made fresh at every start of the app, so the
  // servers the run began with are out of date by the time it is joined.
  it('serves it with the app\'s tool servers as they are now, not as they were', async () => {
    const run = launch('LATE please');
    await untilRunning();
    await sleep(400);
    run.signals.emit('SIGHUP');
    await run.done;
    const nowLog = path.join(tmp, 'store-now.log');
    const nowConfig = path.join(tmp, 'mcp-now.json');
    fs.writeFileSync(nowConfig, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: nowLog, FAKE_STORE_STRICT: '1' } } } }));
    expect(await bringHome({ AGENTBOX_MCP_CONFIG: nowConfig }).done).toBe(0);
    expect(fs.readFileSync(nowLog, 'utf8')).toContain('"name":"note"');
    expect(calls()).toEqual([]);
  });

  it('tells the agent no more is coming even when the app could not before it went', async () => {
    const run = launch('LATE please');
    await untilRunning();
    await sleep(400);
    cutOff = true;
    run.signals.emit('SIGHUP');
    expect(await run.done).toBe(IMPORT_FAILED);
    cutOff = false;
    expect(readMarker(mac).unsent).toEqual([expect.objectContaining({ action: 'stdin', end: true })]);
    const home = bringHome();
    expect(await home.done, home.err()).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(readMarker(mac)).toBe(null);
  });

  // Codex's review, round four: the quit was only heard once the start had
  // answered, and a quit before then ended this process and stopped the run.
  it('holds a quit that comes while the run is still starting, then leaves it going', async () => {
    const real = transport.invoke;
    let started = null;
    transport.invoke = async (sid, payload) => {
      const res = await real(sid, payload);
      if (payload.action === 'start') { started = true; await sleep(800); }
      return res;
    };
    try {
      const run = launch('LATE please');
      for (let i = 0; i < 100 && !started; i += 1) await sleep(50);
      run.signals.emit('SIGHUP');
      expect(await run.done, run.err()).toBe(IMPORT_FAILED);
      expect(readMarker(mac)).toMatchObject({ state: 'detached', pid: null });
    } finally {
      transport.invoke = real;
    }
    const home = bringHome();
    expect(await home.done, home.err()).toBe(0);
    expect(calls()).toEqual([{ name: 'note', args: { text: 'LATE please' }, item: 'w-1' }]);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
  });

  it('a new run in that folder waits for it rather than stopping it', async () => {
    const run = launch('LATE please');
    await untilRunning();
    await sleep(400);
    run.signals.emit('SIGHUP');
    await run.done;
    const again = launch('another');
    expect(await again.done).toBe(IMPORT_FAILED);
    expect(again.err()).toMatch(/still going/);
    expect((await transport.invoke('x', { action: 'status' })).state).toBe('running');
    expect(await bringHome().done).toBe(0);
  });

  // THE SHARED HOST CRASHING (2026-10-17): every cloud run's relay now lives
  // in one process on the Mac (main/cloud/host.mjs). When it dies without a
  // word, each run's marker still says running, for a stand-in that is gone,
  // and bringing the folder home sent the run SIGTERM: one crash would cancel
  // fifty runs mid-turn. Such a run is now joined, as one the app left going.
  it('a run whose relay died without a word is joined, not stopped', async () => {
    const gone = execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    let dead = false;
    const freezes = { ...transport, invoke: (s, p) => (dead ? new Promise(() => {}) : transport.invoke(s, p)) };
    launch('LATE please', { pid: Number(gone), transport: freezes });
    await untilRunning();
    await sleep(400);
    dead = true;
    expect(readMarker(mac)).toMatchObject({ state: 'running', pid: Number(gone) });
    const home = bringHome();
    expect(await home.done, home.err()).toBe(0);
    expect(home.err()).toMatch(/joining/);
    expect(calls()).toEqual([{ name: 'note', args: { text: 'LATE please' }, item: 'w-1' }]);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(readMarker(mac)).toBe(null);
  });

  // THE THREAD HEARD NOTHING OF IT (2026-10-20, the multiplayer design
  // thread). An update restarted the app at 11:46; the run carried on in the
  // cloud, wrote its answer at 11:51 and came home at 12:00, and the joined
  // process dropped every line of it. The thread said "Nothing running", its
  // steps stopped at 11:45, and the answer never reached the row. The joined
  // stream now goes to whoever brought it home (main/supervisor.mjs
  // `_followComingHome`), from where the last process stopped.
  it('passes on what the run says after the app came back, and nothing said before', async () => {
    const run = launch('LATE please');
    await untilRunning();
    await sleep(400);
    run.signals.emit('SIGHUP');
    await run.done;
    const home = bringHome();
    expect(await home.done, home.err()).toBe(0);
    const before = new Set(run.out().split('\n').filter(Boolean));
    const after = home.out().split('\n').filter(Boolean);
    const said = after.map((l) => JSON.parse(l));
    expect(said.find((e) => e.type === 'assistant')?.message.content[0].text).toBe('working');
    expect(said.find((e) => e.type === 'result')).toMatchObject({ is_error: false });
    expect(after.filter((l) => before.has(l))).toEqual([]);
  });

  // THE ANSWER OF A RUN THAT ENDED WHILE THE APP WAS SHUT (w-4465054f04): in
  // the cloud power test two runs finished during an 11-minute quit and their
  // commits came home on reopen, but what they said did not, so their threads
  // had no answer and the app ran each request again in the cloud to get one.
  it('passes on what a run that ended while the app was shut said after the app went', async () => {
    const run = launch('LATE please', { offlineAfterMs: 300 });
    await untilRunning();
    await sleep(400);
    run.signals.emit('SIGHUP');
    await run.done;
    const before = new Set(run.out().split('\n').filter(Boolean));
    for (let i = 0; i < 100 && (await transport.invoke('x', { action: 'status' })).state === 'running'; i += 1) await sleep(100);
    expect((await transport.invoke('x', { action: 'status' })).state).not.toBe('running');
    const home = bringHome();
    expect(await home.done, home.err()).toBe(0);
    const after = home.out().split('\n').filter(Boolean);
    expect(after.map((l) => JSON.parse(l)).find((e) => e.type === 'result')).toMatchObject({ is_error: false });
    expect(after.filter((l) => before.has(l))).toEqual([]);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(readMarker(mac)).toBe(null);
  });

  // Once the thread shows it as running, its Stop has to stop it. A SIGTERM
  // or a SIGHUP is still the app going, which leaves it going.
  it('stops a joined run on SIGINT, which is how the app says Stop to one', async () => {
    const run = launch('HANG please');
    await untilRunning();
    await sleep(400);
    run.signals.emit('SIGHUP');
    await run.done;
    const home = bringHome();
    for (let i = 0; i < 100 && !/joining/.test(home.err()); i += 1) await sleep(50);
    home.signals.emit('SIGINT');
    await home.done;
    expect(home.err()).toMatch(/stopping the cloud run \(asked to stop\)/);
  });

  it('leaves a joined run going on SIGTERM', async () => {
    const run = launch('LATE please');
    await untilRunning();
    await sleep(400);
    run.signals.emit('SIGHUP');
    await run.done;
    const home = bringHome();
    for (let i = 0; i < 100 && !/joining/.test(home.err()); i += 1) await sleep(50);
    home.signals.emit('SIGTERM');
    expect(await home.done).toBe(IMPORT_FAILED);
    expect(home.err()).not.toMatch(/stopping the cloud run/);
    expect((await transport.invoke('x', { action: 'status' })).state).toBe('running');
    expect(await bringHome().done).toBe(0);
  });

  it('a Stop still stops it', async () => {
    const run = launch('HANG please');
    await untilRunning();
    run.signals.emit('SIGTERM');
    expect(await run.done).toBe(143);
    expect(readMarker(mac)).toBe(null);
  });
});

describe('the variables a joined run gives its tools', () => {
  it('are this app\'s own, and never a key', () => {
    expect(toolVariables({ ZERO_ITEM: 'w-1', STORE_ACCOUNT_ID: 'a', AGENTBOX_HOME: '/h', AGENTBOX_API_KEY: 'k', PATH: '/bin', ANTHROPIC_API_KEY: 'x', STORE_TOKEN: 't' }))
      .toEqual({ ZERO_ITEM: 'w-1', STORE_ACCOUNT_ID: 'a', AGENTBOX_HOME: '/h' });
  });
});

describe('the app', () => {
  const sup = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
  const claude = fs.readFileSync(new URL('../main/harnesses/claude.mjs', import.meta.url), 'utf8');
  it('quits a Claude cloud run with SIGHUP, and everything else as before', () => {
    const quit = sup.slice(sup.indexOf('  killAll() {'), sup.indexOf('  killAll() {') + 800);
    expect(quit).toMatch(/this\._kill\(session, session\.cloud && session\.engine !== 'codex' \? 'SIGHUP' : undefined\)/);
  });
  it('does not stop a Claude cloud run as its window closes after the quit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-quit-'));
    const s = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3 }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
    const sent = { cloud: [], codex: [], mac: [] };
    const add = (id, extra) => s.sessions.set(id, { itemId: id, child: { kill: (sig) => sent[id].push(sig ?? 'SIGTERM') }, tail: [], ...extra });
    add('cloud', { cloud: true, engine: 'claude' });
    add('codex', { cloud: true, engine: 'codex' });
    add('mac', { cloud: false, engine: 'claude' });
    s.killAll();
    s.stop();
    expect(sent.cloud).toEqual(['SIGHUP', 'SIGHUP']);
    expect(sent.codex).toEqual(['SIGTERM', 'SIGTERM']);
    expect(sent.mac).toEqual(['SIGTERM', 'SIGTERM']);
    fs.rmSync(root, { recursive: true, force: true });
  });
  // Closing the last window, or installing an update, closes the window BEFORE
  // the quit that runs killAll (tests/closing-the-window-does-not-kill-the-app-
  // before-it-counts), so stop() comes first and alone (Claude's review).
  it('leaves a Claude cloud run going when the window closes before the quit', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-close-'));
    const s = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3 }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
    const sent = [];
    s.sessions.set('cloud', { itemId: 'cloud', cloud: true, engine: 'claude', child: { kill: (sig) => sent.push(sig ?? 'SIGTERM') }, tail: [] });
    s.stop();
    expect(sent).toEqual(['SIGHUP']);
    fs.rmSync(root, { recursive: true, force: true });
  });
  it('hands the process that brings a run home its tool servers as they are now', () => {
    const home = sup.slice(sup.indexOf('  _bringCloudHome(place) {'), sup.indexOf('  _bringCloudHome(place) {') + 2500);
    expect(home).toMatch(/this\.writeMcpConfig\(\)/);
    expect(home).toMatch(/AGENTBOX_MCP_CONFIG: mcp/);
  });
  it('tells every cloud run, Claude or Codex, where the project\'s documents are', () => {
    expect(claude).toMatch(/\.\.\.sup\._cloudDocsEnv\(item\)/);
    const codex = sup.slice(sup.indexOf('  _cloudCodexServer('), sup.indexOf('  _cloudCodexServer(') + 1500);
    expect(codex).toMatch(/\.\.\.this\._cloudDocsEnv\(item\)/);
  });
});
