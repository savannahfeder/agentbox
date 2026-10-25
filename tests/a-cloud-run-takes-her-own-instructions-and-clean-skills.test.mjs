// A CLOUD RUN TAKES HER OWN INSTRUCTIONS TO CLAUDE, AND HER SKILLS WITHOUT THE
// MAC'S HIDDEN EXTRAS.
//
// What broke (2026-10-15), read from the transcript of a design thread that ran
// in the cloud: Claude Code noted her ~/.claude/CLAUDE.md as gone ("removed" at
// session start), so the run worked without her standing style rules; and its
// skill list held two entries named `._qa-tester` and `._sketch`, the
// AppleDouble files a Mac's tar adds beside any file with extended attributes.
//
// Now her instructions go up, and every archive is made with the extras
// switched off.
//
// Laying them in the agent's home folder was not enough (2026-10-23,
// w-cd4f783bc8): a real cloud run again reported her CLAUDE.md as gone, with
// the file sitting in the home folder, because the sandbox sets
// CLAUDE_CONFIG_DIR and Claude Code reads its user CLAUDE.md from there. So
// they are laid in that folder.
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
import { cloudRun, tarOf } from '../main/cloud/run.mjs';
import { tarDocs } from '../main/cloud/docs.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let objects; let mac; let s3Url;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudhome-')));
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

async function run(homeDir) {
  const configDir = path.join(tmp, 'mac', 'claude-home');
  fs.mkdirSync(configDir, { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
  let out = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir },
    cwd: mac, transport, storage, login: LOGIN, stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB,
    pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(), homeDir,
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } }) + '\n');
  expect(await done).toBe(0);
  return JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);
}

describe('her own instructions to Claude', () => {
  it('reach the agent in the cloud, in the folder Claude Code reads them from', async () => {
    const home = path.join(tmp, 'home');
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'CLAUDE.md'), '# Response style\nKeep it brief.\n');
    expect((await run(home)).memory).toBe('# Response style\nKeep it brief.\n');
  });

  it('are simply absent when she has none', async () => {
    expect((await run(path.join(tmp, 'nobody'))).memory).toBe(null);
  });

  it('are refused by the sandbox at any path but a plain name in .claude', async () => {
    for (const rel of ['../etc/passwd', '.claude/../../x', '.ssh/authorized_keys', '/abs']) {
      const res = await transport.invoke('x', { action: 'start', runId: `r-${rel.length}`, cwd: '/w', branch: 'b', bundleUrl: 'http://x', argv: ['x'], homeFiles: [{ rel, url: 'http://x' }] });
      expect(res.error, rel).toBe('bad-start');
    }
  });
});

describe('an archive made on a Mac', () => {
  // From a file: tar may stop reading a pipe at the archive's end, which fails with EPIPE on a busy machine.
  const list = (tgz) => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tgz-')), 'a.tgz');
    fs.writeFileSync(f, tgz);
    return execFileSync('tar', ['-tzf', f], { encoding: 'utf8' }).split('\n').filter(Boolean);
  };
  const tagged = () => {
    const dir = path.join(tmp, 'skills');
    fs.mkdirSync(path.join(dir, 'sketch'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sketch', 'SKILL.md'), 'a skill');
    try { execFileSync('xattr', ['-w', 'com.agentbox.test', 'yes', path.join(dir, 'sketch', 'SKILL.md')]); } catch { /* not a Mac */ }
    return dir;
  };

  it('carries no `._` extras, for skills or documents', async () => {
    const dir = tagged();
    expect(list(await tarOf(dir)).some((n) => path.basename(n).startsWith('._'))).toBe(false);
    expect(list(await tarDocs(dir, ['sketch/SKILL.md'])).some((n) => path.basename(n).startsWith('._'))).toBe(false);
    expect(list(await tarOf(dir)).some((n) => n.endsWith('sketch/SKILL.md'))).toBe(true);
  });
});
