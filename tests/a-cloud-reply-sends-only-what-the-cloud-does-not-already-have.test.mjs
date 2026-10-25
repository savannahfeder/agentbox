// A CLOUD REPLY SENDS ONLY WHAT THE CLOUD DOES NOT ALREADY HAVE.
//
// Every reply that ran in the cloud packed the project's whole history and
// the account's skills again and sent them up one after another: 61.9 MB of
// history for this repository and 13 MB of skills, on every reply. Measured
// on a real reply (2026-10-20): 53 s from sending it to the agent starting,
// 47 s of that before the cloud machine was even asked to start, which made
// the cloud feel slow and made replies on the Mac look like the better deal.
//
// Now the history goes up once as a base that every thread of the repository
// shares for six days (the bucket keeps `runs/` for seven), and each run sends
// only the commits past it; a folder of skills goes up once and again only
// when it changes. Driven for real on one machine: the real sandbox server, a
// stand-in S3 that counts what was put, and the stand-in Claude Code.
//
// The conversation a reply resumes went up whole too. On 2026-10-21 a long
// thread's was 395 MB, mostly screenshots, and sending it took 189 s of a
// reply's start. It only ever grows, so it now goes up once and after that
// only what was added, joined in the bucket to the copy already there.

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
import { pickBase, periodOf, CACHE_PERIOD_MS, sendConversation, sentRecordPath, MIN_JOIN_BYTES } from '../main/cloud/reuse.mjs';
import { transcriptFolderName } from '../main/cloud/run.mjs';
import { copyRanges } from '../main/cloud/aws.mjs';
import { imageCaps, noteImageCaps } from '../main/cloud/config.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const TAKES_A_BASE = ['offline', 'setup', 'kept', 'base'];

let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let puts; let joins; let mac; let heard;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudreuse-')));
  objects = new Map();
  puts = [];
  joins = [];
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

  // "The Mac": a repository with some history on main, and a task branch.
  mac = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(mac, { recursive: true });
  git(mac, 'init', '-q', '-b', 'main');
  git(mac, 'config', 'user.email', 'dev@example.com');
  git(mac, 'config', 'user.name', 'Dev');
  fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
  fs.writeFileSync(path.join(mac, 'history.bin'), crypto.randomBytes(400_000));
  git(mac, 'add', '.');
  git(mac, 'commit', '-q', '-m', 'first');
  git(mac, 'update-ref', 'refs/remotes/origin/main', 'main');
  git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
  heard = [];
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
const storage = {
  async put(k, body) { puts.push({ key: k, size: Buffer.byteLength(body) }); objects.set(k, Buffer.from(body)); },
  async get(k) { return objects.get(k) ?? null; },
  async exists(k) { return objects.has(k); },
  async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  // S3's join: the object at `base`, then the file from `start`.
  async extend(k, base, file, start) {
    const tail = fs.readFileSync(file).subarray(start);
    joins.push({ key: k, base, size: tail.length });
    objects.set(k, Buffer.concat([objects.get(base), tail]));
  },
};

const configDir = () => path.join(tmp, 'mac', 'claude-home');

function launch({ message = 'please do it', caps = TAKES_A_BASE, args = [] } = {}) {
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
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile, ...args],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir(), AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'),
    imageCaps: caps,
    onCaps: (c) => heard.push(c),
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, err: () => err };
}

const baseKeys = () => puts.filter((p) => /^runs\/cache\/\d+\/base-[0-9a-f]{40}\.bundle$/.test(p.key));
const runBundles = () => puts.filter((p) => /^runs\/[0-9a-f-]{36}\/in\.bundle$/.test(p.key));
// Where the sandbox checked the task folder out (its paths sit under `vm`).
const inTheCloud = () => path.join(tmp, 'vm', mac);
// Every real run gets a new machine; this sandbox server is reused.
const freshMachine = () => fs.rmSync(inTheCloud(), { recursive: true, force: true });

describe('a cloud run against an image that takes a base', () => {
  it('sends the history once, then only the commits past it, and the cloud checks out the same commit', async () => {
    const first = launch();
    expect(await first.done, first.err()).toBe(0);
    expect(baseKeys()).toHaveLength(1);
    const base = baseKeys()[0];
    expect(base.size).toBeGreaterThan(300_000);
    expect(heard.at(-1)).toContain('base');

    // The agent's commit came home on top of the commit the run left with.
    const startedOn = git(mac, 'rev-parse', 'HEAD~1');
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(startedOn).toBe(git(mac, 'rev-parse', 'main'));
    // In the cloud, main and origin/main are where the Mac had them, and the
    // base's own refs are gone.
    expect(git(inTheCloud(), 'rev-parse', 'refs/heads/main')).toBe(git(mac, 'rev-parse', 'main'));
    expect(git(inTheCloud(), 'rev-parse', 'refs/remotes/origin/main')).toBe(git(mac, 'rev-parse', 'refs/remotes/origin/main'));
    expect(git(inTheCloud(), 'for-each-ref', 'refs/agentbox/base/')).toBe('');

    // The next reply: a commit made here meanwhile, and nothing else new.
    git(mac, 'add', '-A');
    git(mac, 'commit', '-q', '-m', 'made on the Mac');
    const tip = git(mac, 'rev-parse', 'HEAD');
    puts.length = 0;
    freshMachine();
    const second = launch({ message: 'and the next thing' });
    expect(await second.done, second.err()).toBe(0);
    expect(baseKeys()).toHaveLength(0);
    expect(runBundles()).toHaveLength(1);
    expect(runBundles()[0].size).toBeLessThan(base.size / 20);
    expect(git(mac, 'rev-parse', 'HEAD~1')).toBe(tip);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
  });

  it('sends no bundle at all when the base already holds every ref', async () => {
    const run = launch();
    expect(await run.done, run.err()).toBe(0);
    expect(runBundles()).toHaveLength(0);
    expect(baseKeys()).toHaveLength(1);
    expect(git(mac, 'rev-parse', 'HEAD~1')).toBe(git(mac, 'rev-parse', 'main'));
    expect(git(inTheCloud(), 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('agentbox/w-1');
  });
});

describe('a cloud run against an image that has not said it takes a base', () => {
  it('sends the whole history, as before, and no base', async () => {
    git(mac, 'commit', '-q', '--allow-empty', '-m', 'on the branch');
    const run = launch({ caps: [] });
    expect(await run.done, run.err()).toBe(0);
    expect(baseKeys()).toHaveLength(0);
    expect(runBundles()).toHaveLength(1);
    expect(runBundles()[0].size).toBeGreaterThan(300_000);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
  });

  it('learns from the start\'s answer that this image takes one', async () => {
    const run = launch({ caps: [] });
    expect(await run.done, run.err()).toBe(0);
    expect(heard).toEqual([expect.arrayContaining(['base'])]);
  });
});

describe('the account\'s skills', () => {
  it('go up once, are reused while unchanged, and go up again when a skill changes', async () => {
    const skill = path.join(configDir(), 'skills', 'writing', 'SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, 'write plainly\n');
    const folders = () => puts.filter((p) => /^runs\/cache\/\d+\/folder-[0-9a-f]{64}\.tgz$/.test(p.key));

    expect(await launch().done).toBe(0);
    expect(folders()).toHaveLength(1);
    freshMachine();
    expect(await launch().done).toBe(0);
    expect(folders()).toHaveLength(1);

    fs.writeFileSync(skill, 'write plainly, and briefly\n');
    freshMachine();
    expect(await launch().done).toBe(0);
    expect(folders()).toHaveLength(2);
    // The changed skill is the one the cloud unpacked.
    expect(fs.readFileSync(path.join(tmp, 'vm', skill), 'utf8')).toBe('write plainly, and briefly\n');
  });
});

describe('the base', () => {
  it('is reused inside its period, made afresh in the next, and sent again when the bucket lost it', async () => {
    const now = (periodOf(Date.now()) + 0.1) * CACHE_PERIOD_MS;
    const a = await pickBase(mac, storage, { now });
    expect(a.sent).toBe(true);
    expect(a.sha).toBe(git(mac, 'rev-parse', 'main'));

    const b = await pickBase(mac, storage, { now: now + 1000 });
    expect(b).toEqual({ ...a, sent: false });

    const later = await pickBase(mac, storage, { now: now + CACHE_PERIOD_MS });
    expect(later.sent).toBe(true);
    expect(later.key).not.toBe(a.key);

    objects.delete(later.key);
    const again = await pickBase(mac, storage, { now: now + CACHE_PERIOD_MS + 1000 });
    expect(again.sent).toBe(true);
    expect(objects.has(again.key)).toBe(true);
    // The ref it was bundled from is not left behind.
    expect(git(mac, 'for-each-ref', 'refs/agentbox/cloud-base/')).toBe('');
  });

  it('is where the branch meets main, not the branch\'s own tip', async () => {
    git(mac, 'commit', '-q', '--allow-empty', '-m', 'on the branch');
    const base = await pickBase(mac, storage);
    expect(base.sha).toBe(git(mac, 'rev-parse', 'main'));
    expect(base.sha).not.toBe(git(mac, 'rev-parse', 'HEAD'));
  });
});

describe('the cloud image\'s start', () => {
  const start = (extra) => transport.invoke('s1', { action: 'start', runId: 'r1', cwd: '/x/y', branch: 'b', argv: ['true'], ...extra });

  it('takes a base without a bundle, and refuses a start with neither', async () => {
    expect(await start({})).toMatchObject({ ok: false, message: 'bundleUrl is required' });
    expect(await start({ base: { url: 'http://x', sha: 'nope' } })).toMatchObject({ ok: false, message: 'base must be { url, sha }' });
    expect(await start({ base: { url: 'http://x', sha: 'a'.repeat(40) }, refs: { '../etc': 'a'.repeat(40) } })).toMatchObject({ ok: false, message: 'refs must be { ref: sha }' });
    expect(await start({ base: { url: `${s3Url}/missing`, sha: 'a'.repeat(40) }, refs: { 'refs/heads/b': 'a'.repeat(40) } })).toMatchObject({ ok: true, caps: expect.arrayContaining(['base']) });
  });
});

const MB = 1024 * 1024;
const conversations = () => puts.filter((p) => /^runs\/cache\/\d+\/conversation-[0-9a-f]{64}\.jsonl$/.test(p.key));

describe('a resumed conversation', () => {
  const SESSION = 'c0ffee00-0000-4000-8000-000000000001';
  const file = () => path.join(configDir(), 'projects', transcriptFolderName(mac), `${SESSION}.jsonl`);

  it('goes up whole once, then only what was added, and the cloud resumes all of it', async () => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), `${'{"type":"user","text":"an old screenshot"}\n'.repeat(Math.ceil((6 * MB) / 40))}`);
    const firstSize = fs.statSync(file()).size;
    const first = launch({ args: ['--resume', SESSION] });
    expect(await first.done, first.err()).toBe(0);
    expect(conversations().map((p) => p.size)).toEqual([firstSize]);

    // A run on this Mac adds to it before the next reply.
    fs.appendFileSync(file(), '{"type":"user","text":"said on the Mac"}\n');
    const before = fs.readFileSync(file());
    puts.length = 0;
    freshMachine();
    fs.rmSync(path.join(tmp, 'vm', configDir()), { recursive: true, force: true });
    const second = launch({ args: ['--resume', SESSION], message: 'and the next thing' });
    expect(await second.done, second.err()).toBe(0);
    expect(conversations()).toHaveLength(0);
    expect(joins.map((j) => j.size)).toEqual([before.length - firstSize]);
    // What came home is what the cloud resumed, plus its own turn.
    const after = fs.readFileSync(file());
    expect(after.subarray(0, before.length).equals(before)).toBe(true);
    expect(after.subarray(before.length).toString()).toContain('and the next thing');
  });
});

describe('sending a conversation', () => {
  const record = () => sentRecordPath(mac);
  const write = (bytes, fill = 'a') => { const f = path.join(tmp, 'c.jsonl'); fs.writeFileSync(f, Buffer.alloc(bytes, fill)); return f; };
  const send = (f, opts = {}) => sendConversation(storage, f, { record: record(), ...opts });

  it('sends only what was added once a copy is in the bucket', async () => {
    const f = write(6 * MB);
    expect((await send(f)).sent).toBe(6 * MB);
    fs.appendFileSync(f, 'more\n');
    const second = await send(f);
    expect(second.sent).toBe(5);
    expect(objects.get(second.key).equals(fs.readFileSync(f))).toBe(true);
  });

  it('sends nothing when nothing was added', async () => {
    const f = write(6 * MB);
    const first = await send(f);
    const again = await send(f);
    expect(again).toEqual({ ...first, sent: 0 });
    expect(conversations()).toHaveLength(1);
  });

  it('is sent whole every time while it is under S3\'s 5 MiB', async () => {
    const f = write(MIN_JOIN_BYTES - 1);
    await send(f);
    fs.appendFileSync(f, 'more\n');
    expect((await send(f)).sent).toBe(MIN_JOIN_BYTES + 4);
    expect(joins).toHaveLength(0);
  });

  it('is sent whole when it was changed rather than added to', async () => {
    const f = write(6 * MB);
    await send(f);
    const fd = fs.openSync(f, 'r+');
    fs.writeSync(fd, 'b', 0);
    fs.closeSync(fd);
    fs.appendFileSync(f, 'more\n');
    const second = await send(f);
    expect(second.sent).toBe(6 * MB + 5);
    expect(joins).toHaveLength(0);
    expect(objects.get(second.key).equals(fs.readFileSync(f))).toBe(true);
  });

  it('is sent whole when the bucket no longer has the copy', async () => {
    const f = write(6 * MB);
    objects.delete((await send(f)).key);
    fs.appendFileSync(f, 'more\n');
    expect((await send(f)).sent).toBe(6 * MB + 5);
    expect(joins).toHaveLength(0);
  });

  // The copy is only joined from, into a name of the new period, so what the
  // cloud reads is never one the bucket is about to drop. A 430 MB
  // conversation went up whole once every six days without this.
  it('is joined to a copy sent in an earlier period while the bucket still has it', async () => {
    const now = (periodOf(Date.now()) + 0.9) * CACHE_PERIOD_MS;
    const f = write(6 * MB);
    const first = await send(f, { now });
    fs.appendFileSync(f, 'more\n');
    const later = now + 0.2 * CACHE_PERIOD_MS;
    const second = await send(f, { now: later });
    expect(second.sent).toBe(5);
    expect(joins).toEqual([{ key: second.key, base: first.key, size: 5 }]);
    expect(second.key.startsWith(`runs/cache/${periodOf(later)}/`)).toBe(true);
    expect(objects.get(second.key).equals(fs.readFileSync(f))).toBe(true);
  });

  it('is sent whole when the copy from an earlier period is gone', async () => {
    const now = (periodOf(Date.now()) + 0.9) * CACHE_PERIOD_MS;
    const f = write(6 * MB);
    objects.delete((await send(f, { now })).key);
    fs.appendFileSync(f, 'more\n');
    expect((await send(f, { now: now + 0.2 * CACHE_PERIOD_MS })).sent).toBe(6 * MB + 5);
    expect(joins).toHaveLength(0);
  });

  it('is sent whole to a cloud that cannot join, and when the join fails', async () => {
    const f = write(6 * MB);
    const { extend: _join, ...noJoin } = storage;
    await sendConversation(noJoin, f, { record: record() });
    fs.appendFileSync(f, 'more\n');
    expect((await sendConversation(noJoin, f, { record: record() })).sent).toBe(6 * MB + 5);

    fs.appendFileSync(f, 'and more\n');
    const failing = { ...storage, async extend() { throw new Error('AccessDenied'); } };
    const last = await sendConversation(failing, f, { record: record() });
    expect(last.sent).toBe(fs.statSync(f).size);
    expect(objects.get(last.key).equals(fs.readFileSync(f))).toBe(true);
  });

  it('is joined from pieces that cover the copy exactly, none under S3\'s 5 MiB', () => {
    const pieces = (size) => copyRanges(size).map((r) => r.slice(6).split('-').map(Number));
    for (const size of [5 * MB, 32 * MB - 1, 32 * MB, 64 * MB - 1, 64 * MB, 64 * MB + 1, 395_663_965]) {
      const got = pieces(size);
      expect(got[0][0]).toBe(0);
      expect(got.at(-1)[1]).toBe(size - 1);
      for (let i = 1; i < got.length; i += 1) expect(got[i][0]).toBe(got[i - 1][1] + 1);
      for (const [a, b] of got) expect(b - a + 1).toBeGreaterThanOrEqual(Math.min(size, 32 * MB));
    }
    expect(pieces(64 * MB - 1)).toHaveLength(1);
    expect(pieces(64 * MB)).toHaveLength(2);
    expect(pieces(395_663_965)).toHaveLength(11);
  });

  it('keeps its note beside the folder\'s cloud marker', () => {
    expect(sentRecordPath(mac)).toBe(path.join(mac, '.git', 'agentbox-cloud-sent.json'));
    expect(sentRecordPath({ folder: '/docs', file: '/data/cloud-runs/p--w-1.json' })).toBe('/data/cloud-runs/p--w-1-sent.json');
  });
});

describe('what the Mac remembers of the image', () => {
  it('is kept per cloud, and an image that stops saying it takes a base is believed', () => {
    const env = { AGENTBOX_CLOUD_CONFIG: path.join(tmp, 'home', '.agentbox', 'cloud.json') };
    const mine = { runtimeArn: 'arn:one', bucket: 'b', region: 'r' };
    const managed = { gateway: 'https://cloud.example' };
    expect(imageCaps(mine, env)).toEqual([]);
    noteImageCaps(mine, TAKES_A_BASE, env);
    expect(imageCaps(mine, env)).toContain('base');
    expect(imageCaps(managed, env)).toEqual([]);
    noteImageCaps(mine, ['offline', 'setup'], env);
    expect(imageCaps(mine, env)).not.toContain('base');
  });
});
