// A LONG CLOUD THREAD BRINGS HOME ONLY WHAT THE RUN ADDED TO ITS CONVERSATION.
//
// A one-line reply on a long thread took 7 minutes in the cloud, and the
// agent's own part was 17 seconds (2026-10-21). Sending the 430 MB
// transcript up was fixed on main the same day (`sendConversation`), but the
// way back was not: the cloud tarred the conversation folder, transcript and
// all, and the Mac downloaded it before the answer showed. On this Mac, after
// the upload fix, runs on long threads still spent 108 to 171 s between the
// agent answering and the run ending.
//
// The cloud now notes each file it was given (its size and hash) and, when
// the Mac asks for it, sends home only what the run added past that; the Mac
// adds it to its own copy. Driven for real on one machine: the real sandbox
// server, a stand-in S3 that counts what the cloud put, and stand-ins for
// Claude Code and Codex.

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
import { cloudRun, transcriptFolderName, layTails, CLOUD_NOTE } from '../main/cloud/run.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const CLAUDE_LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const CODEX_LOGIN = { engine: 'codex', id: 'C1', key: 'logins/codex/C1.json' };
const SESSION = 'long-thread-0001';
const THREAD = '0199a000-0000-7000-8000-000000000001';
const MB = 1024 * 1024;

// Codex as the cloud sees it, as far as this needs: on `thread/resume` it
// adds a line to that thread's rollout and answers.
const FAKE_CODEX = `
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
const root = process.env.AGENTBOX_PATH_ROOT || '';
const sessions = path.join(root, process.env.CODEX_HOME, 'sessions');
const find = (dir, id) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = find(p, id); if (hit) return hit; } else if (e.name.endsWith(id + '.jsonl')) return p;
  }
  return null;
};
for await (const line of readline.createInterface({ input: process.stdin })) {
  const msg = JSON.parse(line);
  if (msg.method === 'thread/resume') {
    fs.appendFileSync(find(sessions, msg.params.threadId), JSON.stringify({ type: 'response_item', text: 'resumed in the cloud' }) + '\\n');
    process.stdout.write(JSON.stringify({ id: msg.id, result: { thread: { id: msg.params.threadId } } }) + '\\n');
  }
}
`;

let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let puts; let joins; let cloudPuts; let mac;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

// A token Codex would take, good for a day.
const jwt = (claims) => ['{"alg":"none"}', JSON.stringify(claims), 'sig'].map((s) => Buffer.from(s).toString('base64url')).join('.');

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudtail-')));
  objects = new Map();
  puts = [];
  joins = [];
  cloudPuts = [];
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
      const body = Buffer.concat(chunks);
      objects.set(k, body);
      cloudPuts.push({ key: k, size: body.length });
      res.writeHead(200); res.end();
    });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  objects.set(CLAUDE_LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-123-cloud-signin-only' })));
  objects.set(CODEX_LOGIN.key, Buffer.from(JSON.stringify({ engine: 'codex', auth: { tokens: { access_token: jwt({ exp: Math.floor(Date.now() / 1000) + 86_400 }), refresh_token: 'r' } } })));
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
  git(mac, 'update-ref', 'refs/remotes/origin/main', 'main');
  git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
});

afterEach(async () => {
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const transport = {
  async invoke(sessionId, payload) {
    const res = await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
    return res.json();
  },
  async stop() {},
};
// A cloud image from before tails, as far as the Mac can tell: it never hears the ask.
const oldImage = {
  ...transport,
  async invoke(sessionId, payload) {
    const { tails: _t, ...rest } = payload;
    return transport.invoke(sessionId, rest);
  },
};
const storage = {
  async put(k, body) { puts.push({ key: k, size: Buffer.byteLength(body) }); objects.set(k, Buffer.from(body)); },
  async get(k) { return objects.get(k) ?? null; },
  async exists(k) { return objects.has(k); },
  async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  async extend(k, base, file, start) {
    const tail = fs.readFileSync(file).subarray(start);
    joins.push({ key: k, base, size: tail.length });
    objects.set(k, Buffer.concat([objects.get(base), tail]));
  },
};

const configDir = () => path.join(tmp, 'mac', 'claude-home');
const codexHome = () => path.join(tmp, 'mac', 'codex-home');
const projects = () => path.join(configDir(), 'projects', transcriptFolderName(mac));
const transcript = (id = SESSION) => path.join(projects(), `${id}.jsonl`);
const rollout = () => path.join(codexHome(), 'sessions', '2026', '10', '21', `rollout-2026-10-21T10-00-00-${THREAD}.jsonl`);
// Where the cloud machine kept a path (its paths sit under `vm`).
const inTheCloud = (p) => path.join(tmp, 'vm', p);
const freshMachine = () => fs.rmSync(path.join(tmp, 'vm'), { recursive: true, force: true });
const lineFor = (message) => `${JSON.stringify({ type: 'user', text: message })}\n`;
// A resumed run reads the cloud note at the top of its message
// (tests/a-cloud-reply-to-a-conversation-begun-on-the-mac-is-told-it-is-in-the-cloud).
const resumedLineFor = (message) => lineFor(`${CLOUD_NOTE}\n\n${message}`);

// A conversation of `bytes`, in lines that do not compress to nothing.
function writeConversation(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let text = '';
  while (text.length < bytes) text += `${JSON.stringify({ type: 'assistant', text: crypto.randomBytes(300).toString('base64') })}\n`;
  text = `${text.slice(0, bytes - 1)}\n`;
  fs.writeFileSync(file, text);
  return Buffer.from(text);
}

function launch({ message = 'please do it', resume = SESSION, onOut = () => {}, via = transport } = {}) {
  fs.mkdirSync(configDir(), { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; onOut(out); if (out.includes('"type":"result"')) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile, ...(resume ? ['--resume', resume] : [])],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir(), AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport: via, storage, login: CLAUDE_LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'),
    imageCaps: ['offline', 'setup', 'kept', 'base'],
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, err: () => err };
}

function launchCodex() {
  const fake = path.join(tmp, 'fake-codex.mjs');
  fs.writeFileSync(fake, FAKE_CODEX);
  fs.mkdirSync(codexHome(), { recursive: true });
  fs.writeFileSync(path.join(codexHome(), 'config.toml'), '');
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"id":1')) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    engine: 'codex',
    argv: [fake],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CODEX_HOME: codexHome(), AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport, storage, login: CODEX_LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'),
    imageCaps: ['offline', 'setup', 'kept', 'base'],
  });
  stdin.write(JSON.stringify({ id: 1, method: 'thread/resume', params: { threadId: THREAD } }) + '\n');
  return { done, err: () => err };
}

const conversationPuts = () => puts.filter((p) => /\/conversation-[0-9a-f]{64}\.jsonl$/.test(p.key));
const broughtHome = (name = 'projects.tgz') => cloudPuts.filter((p) => p.key.endsWith(`/${name}`));
const leftovers = (dir = projects()) => fs.readdirSync(dir).filter((n) => /agentbox/.test(n));

describe('a reply on a long Claude Code conversation', () => {
  it('brings home only what the run added, and the Mac\'s copy is the cloud\'s', async () => {
    const before = writeConversation(transcript(), 6 * MB);

    const first = launch({ message: 'first reply' });
    expect(await first.done, first.err()).toBe(0);
    const afterFirst = Buffer.concat([before, Buffer.from(resumedLineFor('first reply'))]);
    expect(fs.readFileSync(inTheCloud(transcript())).equals(afterFirst)).toBe(true);
    expect(broughtHome()).toHaveLength(1);
    expect(broughtHome()[0].size).toBeLessThan(64 * 1024);
    expect(fs.readFileSync(transcript()).equals(afterFirst)).toBe(true);
    expect(leftovers()).toEqual([]);

    // The next reply, on a new machine: up goes the join, home comes the end.
    puts.length = 0; cloudPuts.length = 0;
    freshMachine();
    const second = launch({ message: 'second reply' });
    expect(await second.done, second.err()).toBe(0);
    expect(conversationPuts()).toHaveLength(0);
    expect(joins.at(-1).size).toBe(Buffer.byteLength(resumedLineFor('first reply')));
    expect(broughtHome()[0].size).toBeLessThan(64 * 1024);
    const afterSecond = Buffer.concat([afterFirst, Buffer.from(resumedLineFor('second reply'))]);
    expect(fs.readFileSync(transcript()).equals(afterSecond)).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  it('brings a new conversation, with nothing to resume, home whole', async () => {
    const run = launch({ message: 'a new thread', resume: null });
    expect(await run.done, run.err()).toBe(0);
    expect(fs.readFileSync(path.join(projects(), 'cloud-session-0001.jsonl'), 'utf8')).toBe(lineFor('a new thread'));
    expect(leftovers()).toEqual([]);
  });

  it('comes home whole from an image that does not cut tails, and is laid as before', async () => {
    const before = writeConversation(transcript(), 2 * MB);
    const run = launch({ message: 'a reply', via: oldImage });
    expect(await run.done, run.err()).toBe(0);
    expect(broughtHome()[0].size).toBeGreaterThan(MB);
    expect(fs.readFileSync(transcript()).equals(Buffer.concat([before, Buffer.from(resumedLineFor('a reply'))]))).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  it('comes home whole when the run changed the start of what it was given', async () => {
    writeConversation(transcript(), 2 * MB);
    let rewritten = null;
    const run = launch({
      message: 'a reply',
      onOut: (out) => {
        if (rewritten || !out.includes('"type":"assistant"')) return;
        const cloudCopy = fs.readFileSync(inTheCloud(transcript()));
        cloudCopy.write('{"type":"rewritten"}', 0);
        fs.writeFileSync(inTheCloud(transcript()), cloudCopy);
        rewritten = cloudCopy;
      },
    });
    expect(await run.done, run.err()).toBe(0);
    expect(rewritten).not.toBe(null);
    expect(broughtHome()[0].size).toBeGreaterThan(MB);
    expect(fs.readFileSync(transcript()).equals(rewritten)).toBe(true);
  });

  it('keeps a conversation that changed on this Mac while the run was away, and adds the run\'s lines after it', async () => {
    writeConversation(transcript(), 2 * MB);
    let changed = null;
    const run = launch({
      message: 'a reply',
      onOut: (out) => {
        if (changed || !out.includes('"type":"assistant"')) return;
        const now = fs.readFileSync(transcript());
        now.write('{"type":"changed-here"}', 0);
        fs.writeFileSync(transcript(), now);
        changed = now;
      },
    });
    expect(await run.done, run.err()).toBe(0);
    expect(changed).not.toBe(null);
    expect(fs.readFileSync(transcript()).equals(Buffer.concat([changed, Buffer.from(resumedLineFor('a reply'))]))).toBe(true);
    expect(run.err()).toMatch(/changed on this Mac/);
    expect(leftovers()).toEqual([]);
  });

  // Claude Code deletes a transcript untouched for 30 days when it starts, so
  // an old thread replied to in the cloud can lose its file here meanwhile.
  // The whole file coming home used to put it back.
  it('is laid whole from the copy this Mac sent when its own was deleted while the run was away', async () => {
    const before = writeConversation(transcript(), 6 * MB);
    let deleted = false;
    const run = launch({
      message: 'a reply',
      onOut: (out) => {
        if (deleted || !out.includes('"type":"assistant"')) return;
        fs.rmSync(transcript());
        deleted = true;
      },
    });
    expect(await run.done, run.err()).toBe(0);
    expect(deleted).toBe(true);
    expect(broughtHome()[0].size).toBeLessThan(64 * 1024);
    expect(fs.readFileSync(transcript()).equals(Buffer.concat([before, Buffer.from(resumedLineFor('a reply'))]))).toBe(true);
    expect(run.err()).toMatch(/gone from this Mac/);
    expect(leftovers()).toEqual([]);
  });
});

describe('a reply on a long Codex conversation', () => {
  it('sends its rollout joined to the copy in the bucket, and brings home only what the run added', async () => {
    const before = writeConversation(rollout(), 6 * MB);

    const first = launchCodex();
    expect(await first.done, first.err()).toBe(0);
    const added = `${JSON.stringify({ type: 'response_item', text: 'resumed in the cloud' })}\n`;
    const afterFirst = Buffer.concat([before, Buffer.from(added)]);
    expect(conversationPuts().map((p) => p.size)).toEqual([before.length]);
    expect(broughtHome('sessions.tgz')[0].size).toBeLessThan(64 * 1024);
    expect(fs.readFileSync(rollout()).equals(afterFirst)).toBe(true);

    puts.length = 0; cloudPuts.length = 0;
    freshMachine();
    const second = launchCodex();
    expect(await second.done, second.err()).toBe(0);
    expect(conversationPuts()).toHaveLength(0);
    expect(joins.at(-1).size).toBe(added.length);
    expect(broughtHome('sessions.tgz')[0].size).toBeLessThan(64 * 1024);
    expect(fs.readFileSync(rollout()).equals(Buffer.concat([afterFirst, Buffer.from(added)]))).toBe(true);
    expect(leftovers(path.dirname(rollout()))).toEqual([]);
  });
});

describe('laying what came home', () => {
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const dir = () => path.join(tmp, 'home-folder');
  const start = Buffer.from('{"n":1}\n{"n":2}\n');
  const tail = Buffer.from('{"n":3}\n');
  // What untarring the cloud's folder leaves: its tail and the list.
  function arrive(list = [{ file: 'c.jsonl', tail: 'c.jsonl.agentbox-tail', from: start.length, sha256: sha(start) }]) {
    fs.mkdirSync(dir(), { recursive: true });
    for (const t of list) fs.writeFileSync(path.join(dir(), t.tail), tail);
    fs.writeFileSync(path.join(dir(), '.agentbox-tails.json'), JSON.stringify(list));
  }
  const file = () => path.join(dir(), 'c.jsonl');

  it('adds the run\'s lines once, however many times an import is tried', async () => {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(file(), start);
    for (let i = 0; i < 3; i += 1) { arrive(); await layTails(dir()); }
    expect(fs.readFileSync(file()).equals(Buffer.concat([start, tail]))).toBe(true);
    expect(fs.readdirSync(dir())).toEqual(['c.jsonl']);
  });

  it('adds them once after a copy that changed here, and says so', async () => {
    fs.mkdirSync(dir(), { recursive: true });
    const changed = Buffer.from('{"n":9}\n{"n":2}\n');
    fs.writeFileSync(file(), changed);
    const heard = [];
    for (let i = 0; i < 2; i += 1) { arrive(); await layTails(dir(), (m) => heard.push(m)); }
    expect(fs.readFileSync(file()).equals(Buffer.concat([changed, tail]))).toBe(true);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatch(/changed on this Mac/);
  });

  it('cuts a copy that ran on past what was sent back to it, as the whole file coming home did', async () => {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(file(), Buffer.concat([start, Buffer.from('{"n":"left over"}\n')]));
    arrive();
    await layTails(dir());
    expect(fs.readFileSync(file()).equals(Buffer.concat([start, tail]))).toBe(true);
  });

  it('never writes through a link, or outside the folder', async () => {
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'c.jsonl'), start);
    fs.writeFileSync(path.join(outside, 'd.jsonl'), start);
    fs.mkdirSync(dir(), { recursive: true });
    fs.symlinkSync(path.join(outside, 'c.jsonl'), file());
    fs.symlinkSync(outside, path.join(dir(), 'sub'));
    arrive([
      { file: 'c.jsonl', tail: 'c.jsonl.agentbox-tail', from: start.length, sha256: sha(start) },
      { file: 'sub/d.jsonl', tail: 'd.jsonl.agentbox-tail', from: start.length, sha256: sha(start) },
      { file: '../outside/d.jsonl', tail: 'e.jsonl.agentbox-tail', from: start.length, sha256: sha(start) },
    ]);
    await layTails(dir());
    expect(fs.readFileSync(path.join(outside, 'c.jsonl')).equals(start)).toBe(true);
    expect(fs.readFileSync(path.join(outside, 'd.jsonl')).equals(start)).toBe(true);
  });

  // The run's lines alone would read as the whole conversation (Codex's review).
  it('keeps the run\'s lines beside it, and says so, when the file is gone and the copy sent with it cannot be had', async () => {
    arrive();
    const heard = [];
    await layTails(dir(), (m) => heard.push(m), { sentCopy: async () => false });
    expect(fs.existsSync(file())).toBe(false);
    expect(fs.readFileSync(`${file()}.agentbox-tail`).equals(tail)).toBe(true);
    expect(heard[0]).toMatch(/gone from this Mac.*c\.jsonl\.agentbox-tail/);
  });

  it('takes the copy sent with the run only when it is what the cloud was given', async () => {
    arrive();
    const fetched = [];
    await layTails(dir(), () => {}, {
      sentCopy: async (t, into) => { fetched.push(t.from); fs.writeFileSync(into, Buffer.alloc(t.from - 1, 'x')); return true; },
    });
    expect(fetched).toEqual([start.length]);
    expect(fs.existsSync(file())).toBe(false);
  });

  it('does nothing in a folder that came home whole', async () => {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(file(), start);
    await layTails(dir());
    expect(fs.readFileSync(file()).equals(start)).toBe(true);
  });
});
