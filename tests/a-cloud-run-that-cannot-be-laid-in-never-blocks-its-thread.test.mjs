// A CLOUD RUN THAT CANNOT BE LAID INTO ITS FOLDER NEVER BLOCKS ITS THREAD.
//
// What broke: main/cloud/run.mjs laid a run's commits in with
// `merge --ff-only`, so an agent that amended or rebased a commit the branch
// started on could never come home; an import cut off between its
// `reset --hard` and its merge found the folder changed by its own hand and
// called it "diverged"; and a folder somebody worked in meanwhile was marked
// "diverged" too. A diverged marker made the supervisor's `_whereToRun` answer
// null for that folder forever, and the only word of it was one console.warn.
// Measured here: each of those runs ended with IMPORT_FAILED and the marker
// state 'diverged', and the import run again afterwards still refused.
//
// Now the branch moves to the cloud's tip when the folder is as the run left
// it (or as the cut-off import left it), with the old tip kept on
// refs/agentbox/before-cloud/<run>; and a folder that really changed keeps its
// own work while the run's version goes on a branch `cloud/<item>`, the marker
// goes, and the row says so and waits for her.
//
// Driven for real, as tests/a-cloud-run-brings-the-agents-work-home is.

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
import { readMarker, writeMarker, takeCloudNews, addCloudNews } from '../main/cloud/marker.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac; let oldPath;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudpark-')));
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
  fs.writeFileSync(path.join(mac, 'task.txt'), 'the task so far\n');
  git(mac, 'add', '.');
  git(mac, 'commit', '-q', '-m', 'task so far');
  oldPath = process.env.PATH;
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
const configDir = () => path.join(tmp, 'mac', 'claude-home');

function launch(message) {
  fs.mkdirSync(configDir(), { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir(), AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'),
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, err: () => err };
}

const importOnly = () => cloudRun({ importOnly: true, argv: [], env: { ...process.env, CLAUDE_CONFIG_DIR: configDir() }, cwd: mac, transport, storage, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), watchParent: false, homeDir: path.join(tmp, 'home') });
const refsUnder = (prefix) => git(mac, 'for-each-ref', '--format=%(refname)', prefix).split('\n').filter(Boolean);

// The run has left with the folder as it was: only a change after this is one made while it was away.
const untilAway = async () => { for (let i = 0; i < 600 && readMarker(mac)?.state !== 'running'; i += 1) await new Promise((r) => setTimeout(r, 25)); };

describe('a cloud run whose agent rewrote the commit it started on', () => {
  it('comes home onto the cloud\'s tip, and the tip it replaced is kept', async () => {
    const before = git(mac, 'rev-parse', 'HEAD');
    const run = launch('AMEND please');
    expect(await run.done, run.err()).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('Amended in the cloud');
    expect(git(mac, 'log', '--format=%s')).not.toContain('task so far');
    expect(fs.readFileSync(path.join(mac, 'cloud.txt'), 'utf8')).toBe('made in the cloud\n');
    expect(fs.readFileSync(path.join(mac, 'loose.txt'), 'utf8')).toBe('not committed\n');
    expect(readMarker(mac)).toBe(null);
    const kept = refsUnder('refs/agentbox/before-cloud/').filter((r) => git(mac, 'rev-parse', r) === before);
    expect(kept.length).toBeGreaterThan(0);
  });

  it('still fast-forwards an ordinary run, and keeps no replaced tip for it', async () => {
    const before = git(mac, 'rev-parse', 'HEAD');
    const run = launch('please do it');
    expect(await run.done, run.err()).toBe(0);
    expect(git(mac, 'log', '--format=%s').split('\n').slice(0, 3)).toEqual(['From the cloud', 'task so far', 'first']);
    expect(refsUnder('refs/agentbox/before-cloud/').some((r) => git(mac, 'rev-parse', r) === before)).toBe(false);
  });
});

describe('an import cut off part way', () => {
  it('is taken up again from where it stopped, not read as somebody else\'s change', async () => {
    fs.writeFileSync(path.join(mac, 'draft.txt'), 'half done\n');
    // git apply fails once, after the folder was reset and the branch moved.
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin);
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    const flag = path.join(tmp, 'failed-once');
    fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nif [ "$PWD" = '${mac}' ] && [ "$1" = apply ] && [ ! -e '${flag}' ]; then touch '${flag}'; echo 'cut off' >&2; exit 1; fi\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
    const run = launch('please do it');
    expect(await run.done).toBe(IMPORT_FAILED);
    expect(fs.existsSync(flag)).toBe(true);
    expect(readMarker(mac)?.state).not.toBe('diverged');
    expect(await importOnly()).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('From the cloud');
    expect(fs.readFileSync(path.join(mac, 'draft.txt'), 'utf8')).toBe('half done\n');
    expect(fs.readFileSync(path.join(mac, 'loose.txt'), 'utf8')).toBe('not committed\n');
    expect(readMarker(mac)).toBe(null);
  });
});

describe('a folder that changed on this Mac while the run was away', () => {
  it('keeps its own work, puts the run\'s on a branch of its own, frees the thread and says what to do', async () => {
    const run = launch('SLOW please');
    await untilAway();
    fs.writeFileSync(path.join(mac, 'local-edit.txt'), 'made here meanwhile\n');
    expect(await run.done, run.err()).toBe(0);
    // This Mac's work, untouched.
    expect(fs.readFileSync(path.join(mac, 'local-edit.txt'), 'utf8')).toBe('made here meanwhile\n');
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('task so far');
    expect(fs.existsSync(path.join(mac, 'cloud.txt'))).toBe(false);
    // The run's, whole, on cloud/w-1: its commit and what it left uncommitted.
    expect(git(mac, 'log', '--format=%s', 'cloud/w-1')).toMatch(/From the cloud/);
    expect(git(mac, 'show', 'cloud/w-1:loose.txt')).toBe('not committed');
    // Nothing holds the thread back, and the row is told.
    expect(readMarker(mac)).toBe(null);
    const news = takeCloudNews(mac);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ item: 'w-1', product: 'p' });
    expect(news[0].note).toMatch(/changed on this Mac/);
    expect(news[0].note).toMatch(/cloud\/w-1/);
    expect(run.err()).toMatch(/cloud\/w-1/);
  });

  it('notices a change staged meanwhile, even one whose file was put back, and leaves it staged', async () => {
    const run = launch('SLOW please');
    await untilAway();
    fs.writeFileSync(path.join(mac, 'a.txt'), 'staged meanwhile\n');
    git(mac, 'add', 'a.txt');
    fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
    expect(await run.done, run.err()).toBe(0);
    expect(git(mac, 'diff', '--cached', '--name-only')).toBe('a.txt');
    expect(git(mac, 'log', '-1', '--format=%s', 'cloud/w-1')).toBe('Uncommitted work from a cloud run');
    expect(readMarker(mac)).toBe(null);
  });

  it('gives a second such run a branch of its own rather than writing over the first', async () => {
    git(mac, 'branch', 'cloud/w-1', 'HEAD~1');
    const run = launch('SLOW please');
    await untilAway();
    fs.writeFileSync(path.join(mac, 'local-edit.txt'), 'made here meanwhile\n');
    expect(await run.done, run.err()).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s', 'cloud/w-1')).toBe('first');
    const mine = git(mac, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/cloud/').split('\n').find((b) => b !== 'cloud/w-1');
    expect(git(mac, 'log', '--format=%s', mine)).toMatch(/From the cloud/);
  });

  it('when the run changed nothing, keeps no branch and says nothing', async () => {
    const run = launch('SLOW IDLE please');
    await untilAway();
    fs.writeFileSync(path.join(mac, 'local-edit.txt'), 'made here meanwhile\n');
    expect(await run.done, run.err()).toBe(0);
    expect(refsUnder('refs/heads/cloud/')).toEqual([]);
    expect(takeCloudNews(mac)).toEqual([]);
    expect(readMarker(mac)).toBe(null);
  });
});

describe('an agent that finished on another branch', () => {
  it('has its work kept on cloud/<item>, the folder left alone, and the thread freed', async () => {
    const run = launch('SWITCH branches');
    expect(await run.done, run.err()).toBe(0);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('task so far');
    expect(git(mac, 'log', '-1', '--format=%s', 'cloud/w-1')).toBe('Uncommitted work from a cloud run');
    expect(git(mac, 'log', '--format=%s', 'cloud/w-1')).toMatch(/From the cloud/);
    expect(takeCloudNews(mac)[0].note).toMatch(/somewhere-else/);
    expect(readMarker(mac)).toBe(null);
  });
});

describe('a folder an older app marked diverged', () => {
  it('is brought home the new way: the run\'s work on a branch, the marker gone', async () => {
    // As an older app left it: the run's commit on its ref, the marker
    // diverged, and its results long gone from the bucket.
    fs.writeFileSync(path.join(mac, 'old.txt'), 'x');
    git(mac, 'add', 'old.txt');
    git(mac, 'commit', '-q', '-m', 'the old run\'s work');
    git(mac, 'update-ref', 'refs/agentbox/cloud/r-old', 'HEAD');
    git(mac, 'reset', '-q', '--hard', 'HEAD~1');
    writeMarker(mac, { runId: 'r-old', sessionId: 's-old', branch: 'agentbox/w-1', startSha: git(mac, 'rev-parse', 'HEAD'), state: 'diverged', why: 'this folder changed on this Mac while the run was in the cloud', toolEnv: { ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p' } });
    expect(await importOnly()).toBe(0);
    expect(readMarker(mac)).toBe(null);
    expect(git(mac, 'log', '-1', '--format=%s')).toBe('task so far');
    expect(git(mac, 'log', '-1', '--format=%s', 'cloud/w-1')).toBe('the old run\'s work');
    const news = takeCloudNews(mac);
    expect(news).toHaveLength(1);
    expect(news[0]).toMatchObject({ item: 'w-1', product: 'p' });
  });
});

describe('the supervisor', () => {
  const product = { slug: 'p', dir: '/nowhere', repoPath: '/r' };
  const make = (store) => new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [product], isDue: () => true, ...store }, tmp);

  it('says a run kept aside on its row, once, which then waits for her', () => {
    const said = [];
    const sup = make({ cloudWorkKeptAside: (slug, id, note) => said.push({ slug, id, note }) });
    addCloudNews(mac, { runId: 'r1', item: 'w-1', product: 'p', note: 'kept on cloud/w-1' });
    sup._sayCloudNews(mac);
    sup._sayCloudNews(mac);
    expect(said).toEqual([{ slug: 'p', id: 'w-1', note: 'kept on cloud/w-1' }]);
  });

  it('leaves the row waiting for her, with the note, and no longer marked to ship', async () => {
    const { Store } = await import('../main/store.mjs');
    const root = path.join(tmp, 'store');
    fs.mkdirSync(path.join(root, 'team'), { recursive: true });
    fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: mac }));
    const store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
    const made = store.fileItem('team', { title: 'Fix it', kind: 'task', body: 'Fix it.' });
    store.modules.workItemsDisk.updateWorkItem(store.productDir('team'), made.id, { labels: ['ship', 'ui'], status: 'done' }, { source: 'agent' });
    store.cloudWorkKeptAside('team', made.id, 'kept on cloud/w-1');
    const row = store.readItem('team', made.id);
    expect(row.status).toBe('blocked');
    expect(row.labels).toEqual(['ui']);
    expect(JSON.stringify(store.readThread('team', made.id))).toContain('kept on cloud/w-1');
  });

  it('asks a relay to bring home a folder marked diverged, rather than waiting on it forever', () => {
    const sup = make({});
    writeMarker(mac, { runId: 'r-old', sessionId: 's-old', branch: 'agentbox/w-1', state: 'diverged' });
    const asked = [];
    sup.writeMcpConfig = () => null;
    sup._workerEnv = () => ({});
    sup._spawnCloudRelay = (args) => { asked.push(args); const c = new EventEmitter(); c.stderr = new PassThrough(); return c; };
    sup._bringCloudHome(mac);
    expect(asked).toEqual([['--agentbox-import-only']]);
  });
});
