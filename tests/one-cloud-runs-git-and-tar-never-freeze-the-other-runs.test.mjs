// ONE CLOUD RUN'S GIT AND TAR NEVER FREEZE THE OTHER RUNS.
//
// What broke: every cloud run's relay lives in one process on the Mac
// (main/cloud/host.mjs), and main/cloud/run.mjs and main/cloud/docs.mjs ran git
// and tar synchronously: the folder's state, the bundle, the import's fetch,
// reset and apply, the transcripts' unpacking, and the documents every ten
// seconds. While one run packed a big repository, every other run's events,
// tool calls and input stood still. Measured here with git and tar replaced by
// stand-ins that take 600 ms each: the event loop stopped for 600 ms or more
// at every one of those calls, where it should never stop for more than a few
// milliseconds.
//
// The stand-ins now take a second and the bar is 700 ms: a Mac at load 160
// stands this process still for up to 400 ms with nothing wrong (measured
// 2026-10-19, all of it ordinary work run slow), and that failed a 300 ms bar
// on code that was fine. A synchronous call into a stand-in still fails it.
//
// Driven for real, as tests/a-cloud-run-brings-the-agents-work-home is: the
// real sandbox server, a stand-in S3, the stand-in Claude Code, and the
// project's documents, with a timer ticking every 10 ms beside the run.

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

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const SLOW_S = '1';

let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac; let docs; let calls; let oldPath;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const put = (file, body) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, body); };
const which = (cmd) => execFileSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudslow-')));
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
  fs.writeFileSync(path.join(mac, 'draft.txt'), 'half done\n');
  docs = path.join(tmp, 'mac', 'store', 'p');
  put(path.join(docs, 'plans', 'plan.md'), 'the plan\n');
  put(path.join(docs, 'designs', 'w-1', 'round1', 'a.png'), 'round one');

  // The slow stand-ins, first on the PATH, each noting where it was run.
  const bin = path.join(tmp, 'slow-bin');
  fs.mkdirSync(bin);
  calls = path.join(tmp, 'calls.log');
  const realGit = which('git'); const realTar = which('tar');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\ncase " $* " in *" add "*|*" bundle "*|*" fetch "*|*" reset "*|*" apply "*|*" write-tree "*) echo "git|$PWD|$*" >> '${calls}'; sleep ${SLOW_S};; esac\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'tar'), `#!/bin/sh\necho "tar|$PWD|$*" >> '${calls}'\nsleep ${SLOW_S}\nexec '${realTar}' "$@"\n`, { mode: 0o755 });
  oldPath = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
});

afterEach(async () => {
  process.env.PATH = oldPath;
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

describe('a cloud run whose git and tar are slow', () => {
  it('packs, brings its documents home while it works, and lays its work in without ever holding up the process it shares', async () => {
    const configDir = path.join(tmp, 'mac', 'claude-home');
    fs.mkdirSync(path.join(configDir, 'skills', 'one'), { recursive: true });
    fs.writeFileSync(path.join(configDir, 'skills', 'one', 'SKILL.md'), 'a skill\n');
    const mcpFile = path.join(tmp, 'mac', 'mcp.json');
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
    const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
    let out = ''; let err = '';
    stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
    stderr.on('data', (d) => { err += d; });

    // Another run's relay, as far as this process can tell: a timer.
    let last = Date.now(); let worst = 0;
    const ticker = setInterval(() => { const now = Date.now(); worst = Math.max(worst, now - last); last = now; }, 10);
    let code;
    try {
      const done = cloudRun({
        argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
        env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac', 'store'), AGENTBOX_DOCS: docs },
        cwd: mac, transport, storage, login: LOGIN,
        stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 20_000, watchParent: false, signals: new EventEmitter(),
        homeDir: path.join(tmp, 'home'), docsEveryMs: 200,
      });
      stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: `use DOCS:${docs}` } }) + '\n');
      code = await done;
    } finally {
      clearInterval(ticker);
    }
    expect(code, err).toBe(0);

    // The run did all of it, through the slow stand-ins, on the Mac's side.
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(fs.readFileSync(path.join(mac, 'draft.txt'), 'utf8')).toBe('half done\n');
    expect(fs.readFileSync(path.join(docs, 'designs', 'w-1', 'round2', 'b.png'), 'utf8')).toBe('picture from the cloud');
    expect(readMarker(mac)).toBe(null);
    const onMac = fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l.split('|')[1] === mac).map((l) => l.split('|')[2]);
    for (const step of ['add -A', 'bundle create', 'fetch', 'reset', 'apply']) expect(onMac.some((c) => c.includes(step)), step).toBe(true);
    const tars = fs.readFileSync(calls, 'utf8').split('\n').filter((l) => l.startsWith('tar|')).map((l) => l.split('|')[2]);
    expect(tars.some((c) => c.startsWith('-czf - -C') && c.includes('--null'))).toBe(true);
    expect(tars.some((c) => c.startsWith('-czf - -C') && c.includes(' -h '))).toBe(true);
    expect(tars.some((c) => c.startsWith('-xzf') && c.includes('.agentbox-docs.tgz'))).toBe(true);

    // And through all of it the process never stood still for a slow call.
    expect(worst).toBeLessThan(700);
  }, 120_000);
});
