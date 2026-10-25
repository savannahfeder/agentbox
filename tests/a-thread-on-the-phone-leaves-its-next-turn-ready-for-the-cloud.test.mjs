// A THREAD ON THE PHONE LEAVES ITS NEXT TURN READY FOR THE CLOUD, AND THE
// COMPUTER BRINGS THAT TURN HOME WHEN IT WAKES.
//
// On 2026-10-24 the founder said the phone must work "with your computer
// completely closed": a reply sent from the bus waited in phone_commands until
// the computer woke. Now, after each turn, the computer leaves a kit in the
// cloud (shared/cloud-kit.mjs): the reply run's own pack and command line,
// with the reply's place marked. Driven here end to end on this machine: the
// computer's real relay (main/cloud/run.mjs) writes the kit, a stand-in for
// the cloud server starts the reply from it with nothing but the kit (as
// cloud/gateway would), the real sandbox runs a stand-in Claude Code with the
// computer away, and the computer, waking, writes the run's marker from its
// copy of the kit and brings the work home with the agent's answer.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { cloudRun } from '../main/cloud/run.mjs';
import { readMarker, writeMarker } from '../main/cloud/marker.mjs';
import { markerForCloudRun, readKitCopy } from '../main/cloud/kit.mjs';
import { kitFrom } from '../main/cloud/run-cli.mjs';
import { REPLY_MARK, kitKey, checkKit, startPayload, replyFrame, replyPrompt, cloudUserLine, cloudSessionId, lastAnswerIn } from '../shared/cloud-kit.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const DEVICE = 'a1b2c3d4e5f6';
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac; let storage; let configDir; let mcpFile;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-kit-')));
  objects = new Map();
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-kit' })));
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
  storage = {
    async put(k, body) { objects.set(k, Buffer.from(body)); },
    async get(k) { return objects.get(k) ?? null; },
    async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
    async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  };
  configDir = path.join(tmp, 'mac', 'claude-home');
  fs.mkdirSync(configDir, { recursive: true });
  mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
});

afterEach(async () => {
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const sandboxCall = async (payload) => (await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } })).json();
const env = () => ({ ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'alpha', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac', 'store') });
const frame = { before: 'The founder has replied.\n\nWhat they said:\n\n', after: '\n\nCarry on.' };

async function writeKit(extraArgs = []) {
  const err = new PassThrough(); let said = ''; err.on('data', (d) => { said += d; });
  const code = await cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile, ...extraArgs],
    env: env(), cwd: mac, transport: { async invoke() { throw new Error('a kit starts nothing'); }, async stop() {} }, storage, login: LOGIN,
    stdout: new PassThrough(), stderr: err, remoteCommand: process.execPath, stubPath: STUB, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'),
    kit: { device: DEVICE, project: 'alpha', item: 'w-1', frame, copy: path.join(tmp, 'mac', 'kits', 'alpha--w-1.json') },
  });
  return { code, said };
}

describe('the kit a turn leaves', () => {
  it('names everything a start needs by key, with the reply\'s place, and starts nothing on this computer', async () => {
    const { code, said } = await writeKit();
    expect(code, said).toBe(0);
    const kit = JSON.parse(objects.get(kitKey(DEVICE, 'alpha', 'w-1')));
    expect(checkKit(kit)).toBeNull();
    expect(kit).toMatchObject({ device: DEVICE, project: 'alpha', item: 'w-1', cwd: mac, branch: 'agentbox/w-1', frame, login: LOGIN });
    expect(objects.has(kit.bundleKey)).toBe(true);
    for (const f of kit.files) expect(objects.has(f.key), f.path).toBe(true);
    expect(kit.argv.slice(1)).toEqual(expect.arrayContaining(['--output-format', 'stream-json', '--mcp-config', mcpFile]));
    // What a computer joining the run needs, and the copy it reads that from.
    expect(kit.marker).toMatchObject({ branch: 'agentbox/w-1', configDir, engine: 'claude' });
    expect(readKitCopy(path.join(tmp, 'mac', 'kits', 'alpha--w-1.json'))).toEqual(kit);
    // Not a run: no marker in the folder, no start, nothing under runs/<id>.
    expect(readMarker(mac)).toBeNull();
  }, 60_000);

  it('a conversation begun here is told it is in the cloud at the top of the reply; a new one is not', async () => {
    await writeKit(['--resume', 's-1']);
    expect(JSON.parse(objects.get(kitKey(DEVICE, 'alpha', 'w-1'))).note).toMatch(/cloud machine/);
    await writeKit();
    expect(JSON.parse(objects.get(kitKey(DEVICE, 'alpha', 'w-1'))).note).toBeNull();
  }, 60_000);

  it('is not written while this folder\'s cloud work is still on its way back', async () => {
    writeMarker(mac, { runId: 'earlier', state: 'detached' });
    const { code } = await writeKit();
    expect(code).not.toBe(0);
    expect(objects.has(kitKey(DEVICE, 'alpha', 'w-1'))).toBe(false);
  }, 60_000);
});

describe('what the supervisor hands the kit writer', () => {
  it('the thread, this computer and the reply\'s place, read once', () => {
    const f = path.join(tmp, 'frame.json');
    fs.writeFileSync(f, JSON.stringify(replyFrame(`said ${REPLY_MARK} done`)));
    const kit = kitFrom({ AGENTBOX_KIT_DEVICE: DEVICE, ZERO_PRODUCT: 'alpha', ZERO_ITEM: 'w-1', AGENTBOX_KIT_FRAME: f, AGENTBOX_KIT_COPY: '/x/copy.json' });
    expect(kit).toEqual({ device: DEVICE, project: 'alpha', item: 'w-1', frame: { before: 'said ', after: ' done' }, copy: '/x/copy.json' });
    expect(fs.existsSync(f)).toBe(false);
    expect(kitFrom({ AGENTBOX_KIT_DEVICE: 'nope', ZERO_PRODUCT: 'alpha', ZERO_ITEM: 'w-1', AGENTBOX_KIT_FRAME: f })).toBeNull();
  });
});

describe('a reply sent with the computer shut', () => {
  it('runs in the cloud from the kit alone, and comes home with its answer when the computer wakes', async () => {
    expect((await writeKit()).code).toBe(0);
    const kit = JSON.parse(objects.get(kitKey(DEVICE, 'alpha', 'w-1')));

    // THE SERVER: the kit and the reply, nothing of this computer's.
    const runId = crypto.randomUUID();
    const link = async (k) => `${s3Url}/${encodeURIComponent(k)}`;
    const start = await startPayload(kit, { runId, getUrl: link, putUrl: link, loginName: (k) => `${s3Url}/${encodeURIComponent(k)}`, offlineAfterMs: 300, kept: kit.kept });
    expect((await sandboxCall(start)).ok).toBe(true);
    const line = cloudUserLine(replyPrompt(kit.frame, 'yes, go ahead'), { note: kit.note, uuid: crypto.randomUUID() });
    expect((await sandboxCall({ action: 'stdin', runId, n: 1, data: Buffer.from(line).toString('base64') })).ok).toBe(true);

    // Nobody reads it: the computer is shut. It finishes and its results go up.
    for (let i = 0; i < 400 && !objects.has(`runs/${runId}/done.json`); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(objects.has(`runs/${runId}/done.json`)).toBe(true);
    const events = objects.get(`runs/${runId}/events.jsonl`)?.toString() ?? '';
    const heard = events.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('');
    // The agent took her reply, in the turn's own prompt, and answered with the computer away.
    expect(heard).toContain(JSON.stringify(replyPrompt(kit.frame, 'yes, go ahead')).slice(1, -1));
    expect(lastAnswerIn(events)).toMatchObject({ isError: false, text: expect.stringMatching(/asleep/) });

    // THE COMPUTER WAKES: the run's marker from its own copy of the kit, then
    // the import path it uses for a run the app left going.
    const copy = readKitCopy(path.join(tmp, 'mac', 'kits', 'alpha--w-1.json'));
    writeMarker(mac, markerForCloudRun(copy, runId));
    expect(readMarker(mac)).toMatchObject({ runId, sessionId: cloudSessionId('w-1', runId), state: 'detached' });
    const out = new PassThrough(); let printed = ''; out.on('data', (d) => { printed += d; });
    const err = new PassThrough(); let said = ''; err.on('data', (d) => { said += d; });
    const transport = { invoke: async (_s, payload) => sandboxCall(payload), async stop() {} };
    const code = await cloudRun({
      importOnly: true, argv: [], env: env(), cwd: mac, transport, storage, login: null,
      stdout: out, stderr: err, remoteCommand: process.execPath, stubPath: STUB, watchParent: false, signals: new EventEmitter(),
      homeDir: path.join(tmp, 'home'), resultsWaitMs: 8000,
    });
    expect(code, said).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    // Its answer is passed on, so the supervisor following it writes it on the row.
    expect(printed).toMatch(/"type":"result"/);
    expect(readMarker(mac)).toBeNull();
  }, 90_000);

  it('a run the server kept open for follow-ups is joined numbered after every reply it took, and closed so it comes home', async () => {
    expect((await writeKit()).code).toBe(0);
    const kit = JSON.parse(objects.get(kitKey(DEVICE, 'alpha', 'w-1')));
    // THE SERVER keeps the run open for her next reply (it closes it itself after a while).
    const runId = crypto.randomUUID();
    const link = async (k) => `${s3Url}/${encodeURIComponent(k)}`;
    const start = await startPayload(kit, { runId, getUrl: link, putUrl: link, loginName: (k) => `${s3Url}/${encodeURIComponent(k)}`, offlineAfterMs: 300, kept: kit.kept });
    start.offline.endTurn = null;
    expect((await sandboxCall(start)).ok).toBe(true);
    for (const [n, said] of [[1, 'first'], [2, 'second'], [3, 'third']]) {
      const line = cloudUserLine(n === 1 ? replyPrompt(kit.frame, said) : said, { note: n === 1 ? kit.note : null, uuid: crypto.randomUUID() });
      expect((await sandboxCall({ action: 'stdin', runId, n, data: Buffer.from(line).toString('base64') })).ok).toBe(true);
    }
    for (let i = 0; i < 200 && (await sandboxCall({ action: 'status' })).state !== 'running'; i += 1) await new Promise((r) => setTimeout(r, 25));

    // THE COMPUTER WAKES while it is still open: joined, its own input numbered
    // after the three, and closed, so its turn ends and its work comes home.
    writeMarker(mac, markerForCloudRun(readKitCopy(path.join(tmp, 'mac', 'kits', 'alpha--w-1.json')), runId));
    const out = new PassThrough(); out.resume();
    const err = new PassThrough(); let said = ''; err.on('data', (d) => { said += d; });
    const sent = [];
    const transport = { invoke: async (_s, payload) => { if (payload.action === 'stdin') sent.push(payload); return sandboxCall(payload); }, async stop() {} };
    const code = await cloudRun({
      importOnly: true, argv: [], env: env(), cwd: mac, transport, storage, login: null, pollWaitMs: 100,
      stdout: out, stderr: err, remoteCommand: process.execPath, stubPath: STUB, watchParent: false, signals: new EventEmitter(),
      homeDir: path.join(tmp, 'home'), resultsWaitMs: 8000,
    });
    expect(code, said).toBe(0);
    expect(sent).toEqual([expect.objectContaining({ end: true, n: 4 })]);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    const heard = (objects.get(`runs/${runId}/events.jsonl`)?.toString() ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('');
    for (const w of ['first', 'second', 'third']) expect(heard).toContain(w);
  }, 90_000);
});
