// A REPLY TO A CLOUD THREAD GOES STRAIGHT TO THE AGENT THAT ANSWERED, END TO END.
//
// The unit half is tests/a-reply-to-a-cloud-thread-goes-straight-to-the-agent-
// that-answered. This drives the path a real cloud run takes: the shim the
// supervisor holds, the shared cloud host, this Mac's relay, the real sandbox
// server on this machine and a stand-in for Claude Code. Before the change the
// first result closed the input there, the run ended, and a second message
// needed a new run.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { cloudRun } from '../main/cloud/run.mts';
import { attachClaudeInput } from '../main/claude-input.mts';
import { startCloudHost } from '../main/cloud/host.mts';
import { readMarker } from '../main/cloud/marker.mts';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const SHIM = here('../scripts/cloud-shim.pl');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
let host; let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let mac; let starts;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-between-')));
  objects = new Map();
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(k, Buffer.concat(chunks)); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-between' })));
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
  starts = 0;
});

afterEach(async () => {
  await host?.close();
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

function startRun() {
  const transport = {
    async invoke(_s, payload) {
      if (payload?.action === 'start') starts += 1;
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
  const configDir = path.join(tmp, 'mac', 'claude-home');
  fs.mkdirSync(configDir, { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const sockPath = path.join(tmp, 'host.sock');
  host = startCloudHost({
    sockPath,
    runOne: (o) => cloudRun({
      argv: o.args, env: o.env, cwd: o.cwd, stdin: o.stdin, stdout: o.stdout, stderr: o.stderr, signals: o.signals, pid: o.pid, watchParent: false,
      transport, storage, login: LOGIN, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 100, resultsWaitMs: 8000, homeDir: path.join(tmp, 'home'),
    }),
  });
  return { sockPath, mcpFile, configDir };
}

const results = (out) => out.split('\n').filter((l) => l.includes('"type":"result"')).map((l) => JSON.parse(l));

describe('a cloud session between turns', () => {
  it('takes a second message in the same session, then closes and brings both turns home', async () => {
    const { sockPath, mcpFile, configDir } = startRun();
    for (let i = 0; i < 100 && !fs.existsSync(sockPath); i += 1) await new Promise((r) => setTimeout(r, 20));
    const child = spawn('/usr/bin/perl', [SHIM, sockPath, FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile], {
      cwd: mac, env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac', 'store') }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    attachClaudeInput(child);
    child.waitAfterTurns(60_000);
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    let exited = null;
    const code = new Promise((r) => child.on('exit', (c) => { exited = c; r(c); }));
    const turnOver = () => new Promise((r) => child.once('turn-over', r));

    const sentFirst = Date.now();
    child.steer('first question');
    await turnOver();
    const firstMs = Date.now() - sentFirst;
    // Still open: the agent is waiting for the next reply, not packing up.
    await new Promise((r) => setTimeout(r, 1500));
    expect(exited, err).toBe(null);
    expect(results(out)).toHaveLength(1);

    const sentSecond = Date.now();
    child.steer('second answer');
    await turnOver();
    const secondMs = Date.now() - sentSecond;
    expect(results(out)).toHaveLength(2);
    expect(starts).toBe(1);
    // The second never waits for a start; on this machine the first did.
    expect(secondMs).toBeLessThan(firstMs);

    child.stopWaiting();
    expect(await code, err).toBe(0);
    expect(git(mac, 'log', '--format=%s', 'main..HEAD').split('\n')).toEqual(['From the cloud', 'From the cloud']);
    expect(child.ranToTheEnd()).toBe(true);
    expect(readMarker(mac)).toBe(null);
    console.log(`first turn ${firstMs} ms (with the start), second ${secondMs} ms`);
  }, 90_000);
});
