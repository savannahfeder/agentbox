// A CLOUD RUN READS AND WRITES THE PROJECT'S DOCUMENTS FOLDER, AND WHAT IT
// DRAWS THERE REACHES THE MAC WHILE IT WORKS.
//
// What broke (2026-10-15): a design thread ran in the cloud and said "This run
// happened on a cloud machine without your documents folder", so it could not
// read the plan, could not write its pictures where the app draws them, put
// them in the code folder instead (mkdir under the repository was refused),
// and its result named paths that showed as text: "pics don't load even if i
// go to the link". The run's transcript showed the refused write at 01:01 and
// the pictures arriving only with the whole run at 01:05.
//
// Now the documents go up at the same path (the small files, and the whole of
// this thread's own designs folder, never another thread's or the gigabytes of
// pictures), and what the agent writes there comes back every few seconds and
// once more at the end, never over a file someone changed on the Mac.
//
// Driven for real, on one machine, as tests/a-cloud-run-brings-the-agents-work-home
// is: the real sandbox server over HTTP with its paths under a scratch root, a
// stand-in S3, and the stand-in Claude Code told to use the documents.

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
import { cloudRun } from '../main/cloud/run.mjs';
import { readMarker } from '../main/cloud/marker.mjs';
import { docsToSend, tarDocs, layDocs, docsFolderFor } from '../main/cloud/docs.mjs';
import { waitFor } from './waiting.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac; let docs;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const put = (file, body) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'clouddocs-')));
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

  // The project's documents folder, beside the repository as in the store.
  docs = path.join(tmp, 'mac', 'store', 'accounts', 'acct', 'p');
  put(path.join(docs, 'plans', 'plan.md'), 'the plan\n');
  put(path.join(docs, 'notes.md'), 'notes before\n');
  put(path.join(docs, 'reports', 'big.bin'), Buffer.alloc(300 * 1024));
  put(path.join(docs, 'designs', 'w-1', 'round1', 'a.png'), 'round one');
  put(path.join(docs, 'designs', 'w-2', 'old.png'), 'someone else\'s');
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

function launch({ onResult = () => {} } = {}) {
  const configDir = path.join(tmp, 'mac', 'claude-home');
  fs.mkdirSync(configDir, { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => {
    out += d;
    if (out.includes('"type":"result"') && !stdin.writableEnded) { onResult(); stdin.end(); }
  });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac', 'store'), AGENTBOX_DOCS: docs },
    cwd: mac, transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'), docsEveryMs: 200,
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: `use DOCS:${docs}` } }) + '\n');
  return { done, out: () => out, err: () => err };
}

const resultOf = (out) => JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);
const picture = () => path.join(docs, 'designs', 'w-1', 'round2', 'b.png');
// Waits for a fact rather than a fixed time; throws if it never comes.
async function until(fact, ms = 30_000) {
  const end = Date.now() + ms;
  while (!fact()) {
    if (Date.now() > end) throw new Error('waited 30 s and it never happened');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('a cloud run and the project\'s documents', () => {
  it('reads the plan and its own designs there, and never the big files or another thread\'s designs', async () => {
    const run = launch();
    expect(await run.done, run.err()).toBe(0);
    expect(resultOf(run.out()).found).toEqual({ plan: 'the plan\n', big: false, other: false, own: true });
  });

  it('brings a picture it draws home while it is still working, and its last edit at the end', async () => {
    let pictureBeforeResult = null;
    const run = launch({ onResult: () => { pictureBeforeResult = fs.existsSync(picture()); } });
    expect(await run.done, run.err()).toBe(0);
    expect(pictureBeforeResult).toBe(true);
    expect(fs.readFileSync(picture(), 'utf8')).toBe('picture from the cloud');
    expect(fs.readFileSync(path.join(docs, 'notes.md'), 'utf8')).toBe('the cloud wrote this\n');
    // Nothing it did not touch was written back, and nothing was deleted.
    expect(fs.readFileSync(path.join(docs, 'designs', 'w-2', 'old.png'), 'utf8')).toBe('someone else\'s');
    expect(fs.statSync(path.join(docs, 'reports', 'big.bin')).size).toBe(300 * 1024);
    expect(readMarker(mac)).toBe(null);
  });

  it('never brings the run\'s own sign-in home inside a document', async () => {
    const run = launch();
    expect(await run.done, run.err()).toBe(0);
    const env = fs.readFileSync(path.join(docs, 'designs', 'w-1', 'round2', 'env.txt'), 'utf8');
    expect(env).toBe('login=[cloud sign-in]\n');
    // Not in a file's name either: that file stays in the cloud.
    expect(fs.readdirSync(path.join(docs, 'designs', 'w-1', 'round2')).sort()).toEqual(['b.png', 'env.txt']);
    // Nor in anything the run put in the bucket for the Mac.
    for (const [k, body] of objects) if (k !== LOGIN.key) expect(body.toString('latin1'), k).not.toContain('tok-123-cloud-signin-only');
  });

  it('keeps a note changed on the Mac while the run was away, and puts the run\'s copy beside it', async () => {
    const run = launch();
    // After the run has left with the folder, however long that takes on a
    // busy machine (a fixed 300 ms lost the race inside the ship's suite).
    await until(() => readMarker(mac)?.state === 'running');
    fs.writeFileSync(path.join(docs, 'notes.md'), 'she edited this here\n');
    expect(await run.done, run.err()).toBe(0);
    expect(fs.readFileSync(path.join(docs, 'notes.md'), 'utf8')).toBe('she edited this here\n');
    expect(fs.readFileSync(path.join(docs, 'notes (cloud).md'), 'utf8')).toBe('the cloud wrote this\n');
  });
});

describe('what goes up', () => {
  it('is the small files and this thread\'s designs, inside the limits', async () => {
    const list = docsToSend(docs, { item: 'w-1' });
    expect(list.sort()).toEqual(['designs/w-1/round1/a.png', 'notes.md', 'plans/plan.md']);
    expect(docsToSend(docs, { item: null }).sort()).toEqual(['notes.md', 'plans/plan.md']);
    // A thread id that could climb out of designs/ takes nothing from it.
    expect(docsToSend(docs, { item: '../w-2' }).sort()).toEqual(['notes.md', 'plans/plan.md']);
    put(path.join(docs, '.secret'), 'hidden');
    expect(docsToSend(docs, { item: 'w-1' })).not.toContain('.secret');
  });

  it('is nothing when the folder holds the task folder or sits inside it', async () => {
    expect(docsFolderFor(docs, mac)).toBe(docs);
    expect(docsFolderFor(path.join(tmp, 'mac'), mac)).toBe(null);
    expect(docsFolderFor(path.join(mac, 'docs'), mac)).toBe(null);
    expect(docsFolderFor(path.join(tmp, 'missing'), mac)).toBe(null);
    expect(docsFolderFor('relative/path', mac)).toBe(null);
  });
});

describe('laying documents in', () => {
  const archive = (files) => {
    const src = fs.mkdtempSync(path.join(tmp, 'src-'));
    for (const [rel, body] of Object.entries(files)) put(path.join(src, rel), body);
    return tarDocs(src, Object.keys(files));
  };

  it('writes over its own earlier copy, but not over a change made here', async () => {
    const laid = {};
    const sentAt = Date.now() - 1000;
    await layDocs({ tgz: await archive({ 'designs/w-1/x.md': 'one' }), dir: docs, sentAt, laid });
    await layDocs({ tgz: await archive({ 'designs/w-1/x.md': 'two' }), dir: docs, sentAt, laid });
    expect(fs.readFileSync(path.join(docs, 'designs/w-1/x.md'), 'utf8')).toBe('two');
    fs.writeFileSync(path.join(docs, 'designs/w-1/x.md'), 'mine');
    const out = await layDocs({ tgz: await archive({ 'designs/w-1/x.md': 'three' }), dir: docs, sentAt, laid });
    expect(fs.readFileSync(path.join(docs, 'designs/w-1/x.md'), 'utf8')).toBe('mine');
    expect(out.beside).toEqual(['designs/w-1/x (cloud).md']);
  });

  it('writes over a file nobody touched since the run left', async () => {
    const out = await layDocs({ tgz: await archive({ 'plans/plan.md': 'new plan' }), dir: docs, sentAt: Date.now() + 1000, laid: {} });
    expect(out.written).toEqual(['plans/plan.md']);
    expect(fs.readFileSync(path.join(docs, 'plans/plan.md'), 'utf8')).toBe('new plan');
  });

  // WHAT BROKE (2026-10-23): main went red on Linux on the end-to-end test in
  // this file, with notes.md still saying 'notes before' and the run's own
  // edit left beside it as notes (cloud).md. Date.now() counts whole
  // milliseconds and a filesystem's mtime does not, so a document saved 0.7 ms
  // BEFORE the run left read as newer than the moment it left, and a file
  // nobody had touched was taken for a change made here.
  it('writes over a file saved in the same millisecond the run left, and never over one saved after', async () => {
    const note = path.join(docs, 'notes.md');
    const sentAt = Date.now();
    // A number is seconds here, which is how an mtime inside a millisecond is set.
    fs.utimesSync(note, (sentAt + 0.7) / 1000, (sentAt + 0.7) / 1000);
    expect(fs.statSync(note).mtimeMs).toBeGreaterThan(sentAt);
    const out = await layDocs({ tgz: await archive({ 'notes.md': 'from the run' }), dir: docs, sentAt, laid: {}, sent: ['notes.md'] });
    expect(out.beside).toEqual([]);
    expect(fs.readFileSync(note, 'utf8')).toBe('from the run');

    // And the case that must not match: saved here after the run left, a real
    // change, so it stands. The mtime a write gets comes from a clock the
    // kernel moves a tick at a time, measured here as much as 18 ms behind the
    // one Date.now() reads, so saving once proves nothing: it is saved until
    // it reads as later than the run leaving.
    await waitFor('a save here to read as later than the run leaving', () => {
      fs.writeFileSync(note, 'saved here after the run left');
      return Math.floor(fs.statSync(note).mtimeMs) > sentAt;
    });
    const later = await layDocs({ tgz: await archive({ 'notes.md': 'from the run again' }), dir: docs, sentAt, laid: {}, sent: ['notes.md'] });
    expect(later.beside).toEqual(['notes (cloud).md']);
    expect(fs.readFileSync(note, 'utf8')).toBe('saved here after the run left');
  });

  it('lays a version it already laid only once, even when it comes again', async () => {
    const laid = {};
    const sentAt = Date.now() - 1000;
    const before = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(docs, 'notes.md'), before, before);
    await layDocs({ tgz: await archive({ 'notes.md': 'from the run' }), dir: docs, sentAt, laid });
    expect(fs.readFileSync(path.join(docs, 'notes.md'), 'utf8')).toBe('from the run');
    fs.writeFileSync(path.join(docs, 'notes.md'), 'she changed it after');
    const out = await layDocs({ tgz: await archive({ 'notes.md': 'from the run' }), dir: docs, sentAt, laid });
    expect(out.beside).toEqual([]);
    expect(fs.readFileSync(path.join(docs, 'notes.md'), 'utf8')).toBe('she changed it after');
    expect(fs.existsSync(path.join(docs, 'notes (cloud).md'))).toBe(false);
  });

  it('leaves a link in the folder alone rather than writing through it, and keeps the run\'s copy beside it', async () => {
    const outside = path.join(tmp, 'outside.md');
    fs.writeFileSync(outside, 'not hers to change');
    fs.symlinkSync(outside, path.join(docs, 'linked.md'));
    const out = await layDocs({ tgz: await archive({ 'linked.md': 'from the run' }), dir: docs, sentAt: Date.now() + 1000, laid: {} });
    expect(out.beside).toEqual(['linked (cloud).md']);
    expect(fs.readFileSync(outside, 'utf8')).toBe('not hers to change');
    expect(fs.readFileSync(path.join(docs, 'linked (cloud).md'), 'utf8')).toBe('from the run');
  });

  it('never follows a link out of the folder, and puts the file in a folder of its own instead of dropping it', async () => {
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(docs, 'escape'));
    const out = await layDocs({ tgz: await archive({ 'escape/x.md': 'should not land outside' }), dir: docs, sentAt: 0, laid: {} });
    expect(out.moved).toEqual(['from-the-cloud/escape/x.md']);
    expect(fs.existsSync(path.join(outside, 'x.md'))).toBe(false);
    expect(fs.readFileSync(path.join(docs, 'from-the-cloud', 'escape', 'x.md'), 'utf8')).toBe('should not land outside');
  });
});

describe('a document the Mac could not write', () => {
  // Codex's review, round two: a failed write was confirmed all the same, so
  // the sandbox left the file out of every later archive and it never came.
  it('comes again, and lands once the Mac can write it', async () => {
    const own = path.join(docs, 'designs', 'w-1');
    fs.chmodSync(own, 0o555);
    const run = launch();
    // Writable again once an archive has really failed to land, not after a
    // fixed 900 ms, which a busy machine can pass before the first one comes.
    await until(() => /could not be laid in yet/.test(run.err()));
    fs.chmodSync(own, 0o755);
    expect(await run.done, run.err()).toBe(0);
    expect(run.err()).toMatch(/could not be laid in yet/);
    expect(fs.readFileSync(picture(), 'utf8')).toBe('picture from the cloud');
  });
});

describe('an answer lost on the way', () => {
  // The sandbox counts a file as home only once the Mac says it laid the
  // archive it came in, so the files in an answer that never arrived go again.
  it('loses no document: the files in it come in the next archive', async () => {
    let dropped = 0;
    const real = transport.invoke;
    transport.invoke = async (sid, payload) => {
      const res = await real(sid, payload);
      if (payload.action === 'docs' && res.files?.length && dropped < 1) { dropped += 1; throw new Error('the answer was lost'); }
      return res;
    };
    try {
      let pictureBeforeResult = null;
      const run = launch({ onResult: () => { pictureBeforeResult = fs.existsSync(picture()); } });
      expect(await run.done, run.err()).toBe(0);
      expect(dropped).toBe(1);
      expect(pictureBeforeResult).toBe(true);
      expect(fs.readFileSync(picture(), 'utf8')).toBe('picture from the cloud');
    } finally {
      transport.invoke = real;
    }
  });
});
