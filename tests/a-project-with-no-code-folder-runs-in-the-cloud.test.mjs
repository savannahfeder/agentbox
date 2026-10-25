// A PROJECT WITH NO CODE FOLDER RUNS IN THE CLOUD.
//
// With the cloud set to Everything, every thread of a project without a code
// repository still ran on the Mac: `_mayRunInCloud` refused any project with
// no repoPath, because a cloud run was a task folder's branch, packed. On
// 2026-10-20 that was Personal, My Workspace and Direct, 17 of the founder's
// 31 open threads, so most replies ran on the Mac with Everything on.
//
// Such a project's agent works in its documents folder, which a cloud run
// already carries up and brings back. Now it runs there with no repository
// (`plain`), once the cloud image says it can; each thread keeps its own
// marker, because every thread of the project shares that one folder.
// Measured against the supervisor's own placement, and for real on one
// machine: the real sandbox server, a stand-in S3, the stand-in Claude Code.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Supervisor } from '../main/supervisor.mjs';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { cloudRun, IMPORT_FAILED, PLAIN_CLOUD_NOTE, CLOUD_NOTE, argvForTheCloud } from '../main/cloud/run.mjs';
import { writeMarker, readMarker, cloudWorkPending } from '../main/cloud/marker.mjs';
import { noteImageCaps } from '../main/cloud/config.mjs';
import { taskFolderPath } from '../main/task-folders.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const NOW_CAPS = ['offline', 'setup', 'kept', 'base', 'plain'];
const savedConfigEnv = process.env.AGENTBOX_CLOUD_CONFIG;

let tmp; let docs; let notes; let coded; let folder; let sup; let cloudConfig;
const put = (p, body) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudplain-')));
  docs = path.join(tmp, 'mac', 'store', 'accounts', 'acct', 'notes');
  put(path.join(docs, 'plans', 'plan.md'), 'the plan\n');
  put(path.join(docs, 'notes.md'), 'notes before\n');
  notes = { slug: 'notes', repoPath: null, dir: docs };
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: repo });
  coded = { slug: 'p', repoPath: repo, dir: path.join(tmp, 'mac', 'store', 'accounts', 'acct', 'p') };
  folder = taskFolderPath(repo, 'w-1');
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'agentbox/w-1', folder], { cwd: repo });
  const cfg = path.join(tmp, 'cloud.json');
  cloudConfig = { region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x' };
  fs.writeFileSync(cfg, JSON.stringify(cloudConfig));
  process.env.AGENTBOX_CLOUD_CONFIG = cfg;
});
afterEach(() => {
  if (savedConfigEnv === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = savedConfigEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const imageSays = (caps) => noteImageCaps(cloudConfig, caps);
const build = ({ cloudRuns = 'all', slots = 2 } = {}) => {
  sup = new Supervisor(
    { home: '/nonexistent-home-with-no-second-account', storeRoot: path.join(tmp, 'store'), maxConcurrentSessions: slots, authProfiles: ['default'], cloudRuns, maxCloudSessions: 10 },
    { listItems: () => [], listProducts: () => [notes, coded], isDue: () => true, settleAnswer() {}, readItem: () => null },
    path.join(tmp, 'app'), path.join(tmp, 'app'), path.join(tmp, 'user'),
  );
  sup._homesAsked = [];
  sup._bringCloudHome = (p) => sup._homesAsked.push(p);
  sup._hasCloudSignIn = () => true;
  sup._cloudSignedInAtAll = () => true;
  return sup;
};
const row = (id = 'w-1', product = 'notes') => ({ id, product, status: 'open', labels: ['founder'] });

describe('where a thread of a project with no code folder runs, with Everything on', () => {
  it('goes to the cloud once the cloud image says it takes one', () => {
    imageSays(NOW_CAPS);
    build();
    expect(sup._whereToRun({ item: row(), product: notes, cwd: docs, engine: 'claude' })).toBe('cloud');
    expect(sup._cloudEligible(row())).toBe(true);
  });

  it('stays on this Mac while the image has not said so, as before', () => {
    imageSays(['offline', 'setup', 'kept', 'base']);
    build();
    expect(sup._cloudEligible(row())).toBe(false);
    expect(sup._whereToRun({ item: row(), product: notes, cwd: docs, engine: 'claude' })).toBe('local');
  });

  it('goes only from its documents folder, and a project with code still needs its task folder', () => {
    imageSays(NOW_CAPS);
    build();
    expect(sup._mayRunInCloud(row(), notes, path.join(tmp, 'elsewhere'))).toBe(false);
    expect(sup._mayRunInCloud(row('w-1', 'p'), coded, folder)).toBe(true);
    expect(sup._mayRunInCloud(row('w-1', 'p'), coded, coded.repoPath)).toBe(false);
    expect(sup._mayRunInCloud(row('w-1', 'p'), coded, coded.dir)).toBe(true);
  });

  it('holds only the thread whose earlier run has not come home, not the others in the same folder', () => {
    imageSays(NOW_CAPS);
    build();
    const mine = { folder: docs, file: sup._plainMarker('notes', 'w-1') };
    writeMarker(mine, { runId: 'r1', state: 'running' });
    expect(cloudWorkPending(mine)).toBe(true);
    expect(sup._whereToRun({ item: row('w-1'), product: notes, cwd: docs, engine: 'claude' })).toBe(null);
    expect(sup._homesAsked).toEqual([mine]);
    expect(sup._whereToRun({ item: row('w-2'), product: notes, cwd: docs, engine: 'claude' })).toBe('cloud');
    // Nothing of it is written into the shared documents folder.
    expect(fs.readdirSync(docs).sort()).toEqual(['notes.md', 'plans']);
  });

  it('gives a cloud run its marker only for a project with no code folder', () => {
    build();
    expect(sup._cloudDocsEnv(row())).toEqual({ AGENTBOX_DOCS: docs, AGENTBOX_CLOUD_MARKER: sup._plainMarker('notes', 'w-1') });
    expect(sup._cloudDocsEnv(row('w-1', 'p'))).toEqual({ AGENTBOX_DOCS: coded.dir });
  });
});

describe('a cloud run with no repository', () => {
  let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let sent; let marker; let configDir;
  beforeEach(async () => {
    objects = new Map();
    sent = [];
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
    marker = path.join(tmp, 'user', 'cloud-runs', 'notes--w-1.json');
    configDir = path.join(tmp, 'mac', 'claude-home');
  });
  afterEach(async () => {
    await sandbox?.close();
    s3.closeAllConnections();
    await new Promise((r) => s3.close(r));
  });

  const storage = () => ({
    async put(k, body) { objects.set(k, Buffer.from(body)); },
    async get(k) { return objects.get(k) ?? null; },
    async exists(k) { return objects.has(k); },
    async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
    async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  });
  const transport = (answer = null) => ({
    async invoke(_s, payload) {
      sent.push(payload);
      if (answer && payload.action === 'start') return answer;
      return (await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } })).json();
    },
    async stop() {},
  });

  function launch({ caps = NOW_CAPS, answer = null, heard = [] } = {}) {
    fs.mkdirSync(configDir, { recursive: true });
    const mcpFile = path.join(tmp, 'mac', 'mcp.json');
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
    const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
    let out = ''; let err = '';
    stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
    stderr.on('data', (d) => { err += d; });
    const done = cloudRun({
      argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
      env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'notes', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac', 'store'), AGENTBOX_DOCS: docs, AGENTBOX_CLOUD_MARKER: marker },
      cwd: docs, transport: transport(answer), storage: storage(), login: LOGIN,
      stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
      homeDir: path.join(tmp, 'home'), docsEveryMs: 200, imageCaps: caps, onCaps: (c) => heard.push(c),
    });
    stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: `IDLE DOCS:${docs}` } }) + '\n');
    return { done, out: () => out, err: () => err };
  }
  const resultOf = (out) => JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);

  it('works in the documents folder and brings what it wrote and its conversation home', async () => {
    const run = launch();
    expect(await run.done, run.err()).toBe(0);
    const start = sent.find((p) => p.action === 'start');
    expect(start).toMatchObject({ plain: true, cwd: docs });
    expect(start.bundleUrl).toBeUndefined();
    expect([...objects.keys()].some((k) => /bundle$/.test(k) && !k.startsWith('logins/'))).toBe(false);
    // It found the folder's documents there, and what it wrote is here.
    expect(resultOf(run.out()).found.plan).toBe('the plan\n');
    expect(fs.readFileSync(path.join(docs, 'notes.md'), 'utf8')).toBe('the cloud wrote this\n');
    expect(fs.readFileSync(path.join(docs, 'designs/w-1/round2/b.png'), 'utf8')).toBe('picture from the cloud');
    // The conversation is where the next reply resumes it from.
    expect(fs.existsSync(path.join(configDir, 'projects', docs.replace(/[^a-zA-Z0-9]/g, '-'), 'cloud-session-0001.jsonl'))).toBe(true);
    // Its marker is gone, and no repository appeared in the documents folder.
    expect(readMarker({ folder: docs, file: marker })).toBe(null);
    expect(fs.existsSync(path.join(docs, '.git'))).toBe(false);
  });

  it('tells its agent it works in the documents folder, with no repository', () => {
    expect(argvForTheCloud(['-p'], { plain: true })).toEqual(['-p', '--append-system-prompt', PLAIN_CLOUD_NOTE]);
    expect(PLAIN_CLOUD_NOTE).toContain('which is the folder you work in');
    expect(PLAIN_CLOUD_NOTE).not.toContain('git branch');
    expect(argvForTheCloud(['-p'])).toEqual(['-p', '--append-system-prompt', CLOUD_NOTE]);
  });

  it('is not sent to an image that has not said it takes one', async () => {
    const run = launch({ caps: ['offline', 'setup', 'kept', 'base'] });
    expect(await run.done).toBe(IMPORT_FAILED);
    expect(run.err()).toMatch(/rebuild it/);
    expect(sent.some((p) => p.action === 'start')).toBe(false);
  });

  it('believes an image that refuses one, and leaves the reply to run again', async () => {
    const heard = [];
    const run = launch({ answer: { ok: false, error: 'bad-start', message: 'branch is required' }, heard });
    expect(await run.done).toBe(IMPORT_FAILED);
    expect(heard).toEqual([[]]);
    expect(readMarker({ folder: docs, file: marker })).toBe(null);
  });

  it('is refused by the image when it carries a bundle as well', async () => {
    const answer = await transport().invoke('s', { action: 'start', runId: 'r1', cwd: docs, plain: true, bundleUrl: 'http://x', argv: ['true'] });
    expect(answer).toMatchObject({ ok: false, message: 'a run with no repository takes no bundle' });
    const ok = await transport().invoke('s', { action: 'start', runId: 'r2', cwd: docs, plain: true, argv: ['true'] });
    expect(ok).toMatchObject({ ok: true, caps: expect.arrayContaining(['plain']) });
  });
});
