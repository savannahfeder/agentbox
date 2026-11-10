// A CLOUD RUN NEVER LOSES ITS HELPERS IN SILENCE.
//
// What broke (2026-11-08, a film thread running in the cloud): the agent
// started a background helper to make design stills, said "waiting on the
// designer" and ended its turn. The app restarted. Leaving a cloud run going
// told it no more input was coming by closing its input at once, and Claude
// Code ends at a closed input, taking every helper still running with it. The
// run came home with exit 0, so its "waiting on the designer" landed on the
// row as the answer, and the thread read Waiting with nothing running until
// she asked "status?" an hour later.
//
// Measured here, driven for real through the sandbox with a stand-in for
// Claude Code whose helper dies when its input closes, as Claude Code's does.
// Before the fix, the joined run never printed the helper's answer.
//
// Now an app that leaves asks the sandbox to close the input once the turn is
// over and no helper is still out (`whenDone`). The relay keeps track of the
// helpers out, carries that across a restart in its marker, and says which
// were lost when a run ends with any still out. The app then keeps the
// promise off the row, says what was lost, and puts the thread in Needs you.

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
import { cloudRun, IMPORT_FAILED, LEFT_TO_FINISH } from '../main/cloud/run.mts';
import { readMarker } from '../main/cloud/marker.mts';
import { attachClaudeInput, helperWatch, helpersLostAnswer, HELPERS_LOST } from '../main/claude-input.mts';
import { markerForCloudRun } from '../main/cloud/kit.mts';
import { Supervisor } from '../main/supervisor.mts';
import { Name } from '../shared/product-name.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const STILLS = { task_id: 'h1', task_type: 'local_agent', description: 'Make design stills' };

let tmp; let sandbox; let sandboxUrl; let s3; let objects; let mac; let storeLog; let s3Url;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudhelpers-')));
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
const common = () => ({
  cwd: mac, transport, storage, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false,
  homeDir: path.join(tmp, 'home'), leaveFlushMs: 500,
});

// A run the app started. Its input is the app's to close, as the supervisor
// does once a turn ends with nothing out (main/claude-input.mts).
function launch(message) {
  fs.mkdirSync(configDir(), { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: storeLog } } } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const signals = new EventEmitter();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    ...common(), login: LOGIN, stdin, stdout, stderr, signals,
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir(), AGENTBOX_HOME: path.join(tmp, 'mac') },
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, signals, stdin, out: () => out, err: () => err };
}

// What the supervisor starts when the app opens again (main/supervisor.mts _bringCloudHome).
function bringHome() {
  const stderr = new PassThrough();
  const stdout = new PassThrough();
  const signals = new EventEmitter();
  let err = ''; let out = '';
  stderr.on('data', (d) => { err += d; });
  stdout.on('data', (d) => { out += d; });
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(ZERO_|STORE_|AGENTBOX_)/.test(k)) delete env[k];
  const done = cloudRun({ ...common(), importOnly: true, argv: [], env, stdin: new PassThrough(), stdout, stderr, signals });
  return { done, signals, err: () => err, out: () => out };
}

async function until(pred, what, ms = 20_000) {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(50);
  }
}
const lostLine = (out) => out.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((e) => e?.subtype === HELPERS_LOST);

describe('a cloud run the app leaves going while a helper works', () => {
  it('keeps the helper running, and its answer comes home when the app opens again', async () => {
    const done = path.join(tmp, 'stills-done');
    const run = launch(`IDLE HELPER:${done}`);
    await until(() => run.out().includes('Waiting on the designer.'), 'the turn to end waiting');
    run.signals.emit('SIGHUP');
    expect(await run.done, run.err()).toBe(IMPORT_FAILED);
    expect(readMarker(mac).helpers.waiting).toEqual([STILLS]);
    // Left going, it is still running, waiting on its helper.
    await sleep(1500);
    expect((await transport.invoke('x', { action: 'status' })).state).toBe('running');

    const home = bringHome();
    for (let i = 0; i < 100 && !/joining/.test(home.err()); i += 1) await sleep(50);
    fs.writeFileSync(done, '');
    expect(await home.done, home.err()).toBe(0);
    expect(home.out()).toContain('Stills are ready.');
    expect(lostLine(home.out())).toBeUndefined();
  });

  it('says which helper was lost when the joined run is stopped before it finished', async () => {
    const run = launch(`IDLE HELPER:${path.join(tmp, 'never')}`);
    await until(() => run.out().includes('Waiting on the designer.'), 'the turn to end waiting');
    run.signals.emit('SIGHUP');
    await run.done;
    const home = bringHome();
    for (let i = 0; i < 100 && !/joining/.test(home.err()); i += 1) await sleep(50);
    home.signals.emit('SIGINT');
    await home.done;
    expect(lostLine(home.out())).toMatchObject({ type: 'system', tasks: [STILLS] });
  });

  it('tells the sandbox to close the input only once the work is done, for a run joined after its relay died too', () => {
    expect(LEFT_TO_FINISH).toEqual({ action: 'stdin', end: true, whenDone: true });
    expect(markerForCloudRun({ marker: {}, item: 'w-1' }, 'r1').unsent).toEqual([{ ...LEFT_TO_FINISH }]);
  });
});

describe('a cloud run the app is there for', () => {
  it('says which helper was lost when the run ends with it still out', async () => {
    const run = launch(`IDLE HELPER:${path.join(tmp, 'never')}`);
    await until(() => run.out().includes('Waiting on the designer.'), 'the turn to end waiting');
    run.signals.emit('SIGTERM');
    await run.done;
    expect(lostLine(run.out())).toMatchObject({ tasks: [STILLS] });
  });

  it('says nothing was lost when the helper finished and the agent answered', async () => {
    const done = path.join(tmp, 'stills-done');
    const run = launch(`IDLE HELPER:${done}`);
    await until(() => run.out().includes('Waiting on the designer.'), 'the turn to end waiting');
    fs.writeFileSync(done, '');
    await until(() => run.out().includes('Stills are ready.'), 'the helper to finish');
    run.stdin.end();
    expect(await run.done, run.err()).toBe(0);
    expect(lostLine(run.out())).toBeUndefined();
  });

  it('says nothing for a run that started no helper', async () => {
    const run = launch('IDLE plain');
    await until(() => run.out().includes('"type":"result"'), 'the turn to end');
    run.stdin.end();
    expect(await run.done, run.err()).toBe(0);
    expect(lostLine(run.out())).toBeUndefined();
  });
});

describe('the sandbox, told no more is coming', () => {
  async function startAgent(script, offline = { afterMs: 60_000, endTurn: 'claude-stream-json' }) {
    const repo = path.join(tmp, 'plain-repo');
    fs.mkdirSync(repo);
    const g = (...a) => execFileSync('git', a, { cwd: repo });
    g('init', '-q', '-b', 'main');
    g('-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'x');
    g('bundle', 'create', path.join(tmp, 'b.bundle'), 'main');
    objects.set('b.bundle', fs.readFileSync(path.join(tmp, 'b.bundle')));
    await transport.invoke('x', {
      action: 'start', runId: 'r', cwd: '/w', branch: 'main', bundleUrl: `${s3Url}/b.bundle`,
      argv: [process.execPath, '-e', script], env: {}, ...(offline ? { offline } : {}),
    });
  }
  // Prints a helper out and a result at once; the helper ends once `file`
  // exists, then the agent answers. Input closing first says so.
  const agent = (file) => `
    const fs = require('fs');
    const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
    let finished = false;
    process.stdin.on('data', () => {});
    process.stdin.on('end', () => { process.stdout.write('input-closed finished=' + finished + '\\n'); setTimeout(() => process.exit(0), 50); });
    out({ type: 'system', subtype: 'background_tasks_changed', tasks: [${JSON.stringify(STILLS)}] });
    out({ type: 'result', subtype: 'success', result: 'Waiting on the designer.' });
    const t = setInterval(() => {
      if (!fs.existsSync(${JSON.stringify(file)})) return;
      clearInterval(t); finished = true;
      out({ type: 'system', subtype: 'background_tasks_changed', tasks: [] });
      out({ type: 'assistant', message: { content: [{ type: 'text', text: 'Stills are ready.' }] } });
      out({ type: 'result', subtype: 'success', result: 'Stills are ready.' });
    }, 50);
  `;
  const text = async () => (await transport.invoke('x', { action: 'events', since: 0 })).events.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('');
  const kinds = async () => (await transport.invoke('x', { action: 'events', since: 0 })).events.map((e) => e.kind);
  const waitFor = async (pred, what) => { for (let i = 0; i < 300; i += 1) { if (await pred()) return; await sleep(50); } throw new Error(`timed out waiting for ${what}`); };

  it('with whenDone, keeps the input open while a helper works and closes it after the agent\'s last answer', async () => {
    const file = path.join(tmp, 'h-done');
    await startAgent(agent(file));
    await waitFor(async () => (await text()).includes('Waiting on the designer.'), 'the first turn');
    expect(await transport.invoke('x', { action: 'stdin', runId: 'r', n: 1, end: true, whenDone: true })).toMatchObject({ ok: true });
    await sleep(2500);
    expect(await kinds()).not.toContain('input-closed');
    fs.writeFileSync(file, '');
    await waitFor(async () => (await kinds()).includes('exit'), 'the run to end');
    expect(await text()).toContain('input-closed finished=true');
    expect((await transport.invoke('x', { action: 'events', since: 0 })).events.find((e) => e.kind === 'input-closed')).toMatchObject({ by: 'cloud' });
  });

  it('without whenDone, closes the input at once, as the app does at a turn with nothing out', async () => {
    await startAgent(agent(path.join(tmp, 'never')));
    await waitFor(async () => (await text()).includes('Waiting on the designer.'), 'the first turn');
    await transport.invoke('x', { action: 'stdin', runId: 'r', n: 1, end: true });
    await waitFor(async () => (await kinds()).includes('exit'), 'the run to end');
    expect(await text()).toContain('input-closed finished=false');
  });

  it('with whenDone on a start that cannot read its turns, closes the input at once, as before', async () => {
    await startAgent(agent(path.join(tmp, 'never')), { afterMs: 60_000, endTurn: null });
    await waitFor(async () => (await text()).includes('Waiting on the designer.'), 'the first turn');
    await transport.invoke('x', { action: 'stdin', runId: 'r', n: 1, end: true, whenDone: true });
    await waitFor(async () => (await kinds()).includes('exit'), 'the run to end');
    expect(await text()).toContain('input-closed finished=false');
  });
});

describe('what a run would lose if it ended now', () => {
  const bg = (...tasks) => ({ type: 'system', subtype: 'background_tasks_changed', tasks });
  const said = { type: 'assistant', message: { content: [{ type: 'text', text: 'x' }] } };
  const result = { type: 'result', result: 'x' };

  it('is the helpers out, and still them when Claude Code empties its list on the way out', () => {
    const w = helperWatch();
    w.see(bg(STILLS)); w.see(said); w.see(result);
    expect(w.lost()).toEqual([STILLS]);
    w.see(bg());
    expect(w.lost()).toEqual([STILLS]);
  });

  it('is nothing once the agent answered after its helpers finished', () => {
    const w = helperWatch();
    w.see(bg(STILLS)); w.see(result); w.see(bg()); w.see(said); w.see(result);
    expect(w.lost()).toEqual([]);
  });

  it('is nothing for a run that started none, and ignores a helper\'s own lines', () => {
    const w = helperWatch();
    w.see(said); w.see(result);
    expect(w.lost()).toEqual([]);
    w.see(bg(STILLS)); w.see(result);
    w.see({ ...said, parent_tool_use_id: 'toolu_1' }); w.see(bg());
    expect(w.lost()).toEqual([STILLS]);
  });

  it('carries over from what an earlier relay saved', () => {
    const before = helperWatch();
    before.see(bg(STILLS)); before.see(result);
    expect(helperWatch(JSON.parse(JSON.stringify(before.state()))).lost()).toEqual([STILLS]);
  });
});

// The app's side.
function fakeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stdin = { writable: true, write: () => true, end: () => { c.stdin.writable = false; }, on: () => {} };
  return c;
}
const say = (c, ...events) => c.stdout.emit('data', events.map((e) => JSON.stringify(e)).join('\n') + '\n');

describe('the app reading a run that lost its helpers', () => {
  it('does not count it as having reached its end, and knows what was lost', () => {
    const c = attachClaudeInput(fakeChild());
    say(c, { type: 'result', result: 'Done.' });
    expect(c.ranToTheEnd()).toBe(true);
    say(c, { type: 'system', subtype: HELPERS_LOST, tasks: [STILLS] });
    expect(c.ranToTheEnd()).toBe(false);
    expect(c.helpersLost()).toEqual([STILLS]);
  });

  it('says what was lost in words, first line the reply to send', () => {
    expect(helpersLostAnswer([STILLS])).toBe('**Reply to start the lost work again.**\n\nThe cloud run ended while "Make design stills" was still running in the background. It stopped before finishing, and anything it had not saved is gone. Your reply starts this thread again.');
    expect(helpersLostAnswer([STILLS, { task_id: 'h2', description: 'Cut the film /tmp/x/film.mp4' }, { task_id: 'h3' }]))
      .toContain('while "Make design stills", "Cut the film film.mp4" and "h3" were still running in the background. They stopped before finishing, and anything they had not saved is gone.');
  });
});

describe('a thread whose cloud run came home after a restart', () => {
  const NOW = Date.now();
  function makeSupervisor(tmpDir) {
    const written = [];
    const row = { id: 'w-film', product: 'p', status: 'claimed', wrote: {} };
    const store = {
      listItems: () => [row],
      listProducts: () => [{ slug: 'p', name: Name, dir: path.join(tmpDir, 'p') }],
      isDue: () => true,
      readItem: () => row,
      recordSessionResult: (slug, id, patch) => written.push({ slug, id, ...patch }),
      releaseRunClaim: () => {},
    };
    const sup = new Supervisor({ storeRoot: tmpDir, authProfiles: ['default'], home: tmpDir }, store, tmpDir);
    sup._saveState = () => {};
    sup.storeMcpCommand = () => '/bin/agentbox-mcp.sh';
    return { sup, written };
  }
  function follow(sup, lines, code, { stop = false } = {}) {
    const rec = { product: 'p', cwd: mac, startedAt: NOW - 60_000, engine: 'claude', sessionId: 's-1' };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.kill = () => {};
    const f = sup._followComingHome({ itemId: 'w-film', rec }, child);
    child.stdout.emit('data', lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    if (stop) sup._comingHome.get('w-film').stoppedOnRequest = true;
    f.end(code);
  }
  const waiting = [
    { type: 'system', subtype: 'init', session_id: 's-1' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'Waiting on the designer.' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: 'Waiting on the designer.', session_id: 's-1' },
  ];

  it('puts it in Needs you naming what was lost, and never lands the promise as the answer', () => {
    const { sup, written } = makeSupervisor(tmp);
    follow(sup, [...waiting, { type: 'system', subtype: HELPERS_LOST, tasks: [STILLS] }], 0);
    expect(written.map((w) => w.result)).not.toContain('Waiting on the designer.');
    expect(written).toEqual([expect.objectContaining({ id: 'w-film', status: 'blocked', result: helpersLostAnswer([STILLS]) })]);
  });

  it('still lands the answer of a run that lost nothing', () => {
    const { sup, written } = makeSupervisor(tmp);
    follow(sup, waiting, 0);
    expect(written).toEqual([expect.objectContaining({ result: 'Waiting on the designer.', status: null })]);
  });

  it('says nothing more after she pressed Stop', () => {
    const { sup, written } = makeSupervisor(tmp);
    follow(sup, [...waiting, { type: 'system', subtype: HELPERS_LOST, tasks: [STILLS] }], 0, { stop: true });
    expect(written.find((w) => w.status === 'blocked')).toBeUndefined();
  });
});
