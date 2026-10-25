// A BROKEN CLOUD IS NOTICED, AND THREADS GO BACK TO THE MAC.
//
// What broke: a cloud run that failed before its agent started (exit 75, or a
// start the cloud refused) skipped every strike and brake in the supervisor,
// so a cloud that could not run anything took a row, failed, took the next,
// and the row's redelivery sent it back to the cloud forever. The cloud menu's
// status had no health and no last error, and a project's
// .agentbox/cloud-setup.sh that failed was a `setup` event the relay dropped.
// Measured here: after five start failures in a row `_cloudSlotFor` still
// answered true, `cloudStatus()` carried no word of it, and the run's stderr
// said nothing of the failed setup.
//
// Now three failures in a row rest the cloud for ten minutes: no new row goes
// there, Everything mode runs rows on the Mac when it has room and waits when
// it has none, the menu's last line says why, and a run whose agent starts
// ends the rest. A failed setup is said on the run's stderr.

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
import { cloudRun } from '../main/cloud/run.mjs';
import { cloudFootLine } from '../renderer/src/cloud-menu';

let tmp;
beforeEach(() => { tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudhealth-'))); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function supervisor(cloudRuns = 'full') {
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], cloudRuns }, { listItems: () => [], listProducts: () => [], isDue: () => true }, tmp);
  sup._saveState = () => {};
  sup._cloudRoom = () => true;
  sup._cloudStarting = () => 0;
  return sup;
}
const failedStart = (said = 'agentbox cloud: the cloud run could not start: AccessDenied') => ({ cloud: true, engine: 'claude', sessionId: null, result: null, tail: ['session spawned', `stderr: ${said}\n`] });
const ranFine = () => ({ cloud: true, engine: 'claude', sessionId: 's-1', result: 'done', tail: [] });

describe('the cloud\'s health', () => {
  it('rests the cloud after three runs in a row fail before their agent starts, and says why', () => {
    const sup = supervisor();
    sup._noteCloudOutcome(failedStart(), 1);
    sup._noteCloudOutcome(failedStart(), 75);
    expect(sup._cloudSlotFor('claude')).toBe(true);
    expect(sup.cloudStatus()).toMatchObject({ health: 'failing' });
    sup._noteCloudOutcome(failedStart(), 75);
    expect(sup._cloudSlotFor('claude')).toBe(false);
    const st = sup.cloudStatus();
    expect(st.health).toBe('resting');
    expect(st.lastError).toBe('the cloud run could not start: AccessDenied');
    expect(st.restingUntil).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it('is well again the moment a run\'s agent starts', () => {
    const sup = supervisor();
    for (let i = 0; i < 3; i += 1) sup._noteCloudOutcome(failedStart(), 75);
    sup._noteCloudOutcome(ranFine(), 0);
    expect(sup._cloudSlotFor('claude')).toBe(true);
    expect(sup.cloudStatus()).toMatchObject({ health: 'ok', lastError: null, restingUntil: null });
  });

  it('tries the cloud again once the rest is over, and rests it again at the next failure', () => {
    const sup = supervisor();
    for (let i = 0; i < 3; i += 1) sup._noteCloudOutcome(failedStart(), 75);
    sup._cloudHealth.restUntil = Date.now() - 1;
    expect(sup._cloudSlotFor('claude')).toBe(true);
    sup._noteCloudOutcome(failedStart(), 75);
    expect(sup._cloudSlotFor('claude')).toBe(false);
  });

  it('does not count what is not the cloud\'s fault: a Stop, a sign-in, a folder still bringing a run home, or work that came home late', () => {
    const sup = supervisor();
    for (let i = 0; i < 5; i += 1) {
      sup._noteCloudOutcome({ ...failedStart(), stoppedByUs: true }, 143);
      sup._noteCloudOutcome({ ...failedStart(), cloudLoginTrouble: true }, 77);
      sup._noteCloudOutcome(failedStart('agentbox cloud: an earlier cloud run in this folder is still going; it comes home before another starts'), 75);
      sup._noteCloudOutcome({ ...ranFine(), result: null }, 75);
      sup._noteCloudOutcome({ cloud: false, sessionId: null, result: null, tail: [] }, 1);
    }
    expect(sup.cloudStatus().health).toBe('ok');
  });

  it('with Everything on, a resting cloud sends rows to this Mac when it has room, and holds them when it has none', () => {
    const sup = supervisor('all');
    const item = { id: 'w-1', product: 'p' };
    const product = { slug: 'p', repoPath: '/r' };
    sup._cloudSignedInAtAll = () => true;
    sup._cloudEligible = () => true;
    sup._mayRunInCloud = () => true;
    let room = true;
    sup._localSlotFor = () => room;
    expect(sup._whereToRun({ item, product, cwd: '/r/w-1', engine: 'claude' })).toBe('cloud');
    for (let i = 0; i < 3; i += 1) sup._noteCloudOutcome(failedStart(), 75);
    expect(sup._waitsForCloud(item, 'claude')).toBe(false);
    expect(sup._whereToRun({ item, product, cwd: '/r/w-1', engine: 'claude' })).toBe('local');
    room = false;
    expect(sup._whereToRun({ item, product, cwd: '/r/w-1', engine: 'claude' })).toBe(null);
  });
});

describe('the cloud menu\'s last line', () => {
  const base = { setUp: true, mode: 'full', running: 0, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null }, accounts: [] };
  const now = new Date(2026, 9, 19, 15, 0).getTime();

  it('says the cloud is resting, why, and until when', () => {
    const line = cloudFootLine({ ...base, health: 'resting', lastError: 'the cloud run could not start: AccessDenied', restingUntil: now + 10 * 60_000 }, now);
    expect(line).toBe('The cloud is failing (the cloud run could not start: AccessDenied). Threads run on this Mac until 3:10pm.');
  });

  it('says nothing of a rest that is over, or of a cloud that has only failed once', () => {
    expect(cloudFootLine({ ...base, health: 'resting', lastError: 'x', restingUntil: now - 1 }, now)).toBe('Nothing running in the cloud now');
    expect(cloudFootLine({ ...base, health: 'failing', lastError: 'x', restingUntil: null }, now)).toBe('Nothing running in the cloud now');
  });
});

describe('a project\'s cloud setup that fails', () => {
  let sandbox; let s3; let objects;
  afterEach(async () => { await sandbox?.close(); s3?.closeAllConnections(); await new Promise((r) => (s3 ? s3.close(r) : r())); });

  it('is said on the run\'s stderr, and the agent runs all the same', async () => {
    const here = (p) => fileURLToPath(new URL(p, import.meta.url));
    const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
    objects = new Map();
    s3 = http.createServer((req, res) => {
      const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
      if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
      const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
    });
    await new Promise((r) => s3.listen(0, '127.0.0.1', r));
    const s3Url = `http://127.0.0.1:${s3.address().port}`;
    sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock'), setupLog: path.join(tmp, 'setup.log') });
    const sandboxUrl = `http://127.0.0.1:${(await sandbox.listen(0, '127.0.0.1')).port}`;
    const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
    objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-123-cloud-signin-only' })));
    const mac = path.join(tmp, 'mac', 'repo');
    fs.mkdirSync(path.join(mac, '.agentbox'), { recursive: true });
    git(mac, 'init', '-q', '-b', 'main');
    git(mac, 'config', 'user.email', 'dev@example.com');
    git(mac, 'config', 'user.name', 'Dev');
    fs.writeFileSync(path.join(mac, '.agentbox', 'cloud-setup.sh'), 'echo nope >&2\nexit 3\n');
    git(mac, 'add', '.');
    git(mac, '-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '-m', 'first');
    git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
    const configDir = path.join(tmp, 'mac', 'claude-home');
    fs.mkdirSync(configDir, { recursive: true });
    const mcpFile = path.join(tmp, 'mac', 'mcp.json');
    fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [here('./fixtures/cloud/fake-store-server.mjs')], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
    const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
    let out = ''; let err = '';
    stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
    stderr.on('data', (d) => { err += d; });
    const done = cloudRun({
      argv: [here('./fixtures/cloud/fake-claude.mjs'), '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
      env: { ...process.env, ZERO_ITEM: 'w-1', CLAUDE_CONFIG_DIR: configDir },
      cwd: mac, login: LOGIN, stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: here('../cloud/sandbox/mcp-stub.mjs'), pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
      homeDir: path.join(tmp, 'home'),
      transport: { async invoke(_s, p) { return (await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(p), headers: { 'content-type': 'application/json' } })).json(); }, async stop() {} },
      storage: { async put(k, b) { objects.set(k, Buffer.from(b)); }, async get(k) { return objects.get(k) ?? null; }, async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; }, async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; } },
    });
    stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'please do it' } }) + '\n');
    expect(await done, err).toBe(0);
    expect(err).toMatch(/the project's cloud setup failed: \.agentbox\/cloud-setup\.sh exited with 3/);
    expect(err).toMatch(/\/tmp\/agentbox-cloud-setup\.log/);
  }, 60_000);
});
