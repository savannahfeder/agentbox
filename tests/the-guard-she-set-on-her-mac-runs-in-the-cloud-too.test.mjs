// THE GUARD SHE SET ON HER MAC RUNS IN THE CLOUD TOO.
//
// What broke (2026-10-22, w-cd4f783bc8): an agent on her Mac put her email in
// the User-Agent of 27 requests to a public website, because the site asks
// bots for contact details. A PreToolUse hook in her own Claude settings now
// refuses that; replayed against 104,842 past tool calls it refused exactly the
// real leaks. She asked: "Can it cover the cloud too?" It could not. The cloud
// run of that same thread (2026-10-23) had a Claude config folder holding her
// skills, agents and commands, and no settings file and no hooks folder, so
// nothing stood between an agent there and the same request.
//
// Now her own hooks travel with the run, but only the ones that can work
// there: one program from the system running a script in her Claude hooks
// folder, which goes up with it. A hook that runs anything only her Mac has (an
// app, a script elsewhere, a chain of commands) stays home, as before.
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
import { cloudRun, hooksForTheCloud } from '../main/cloud/run.mjs';

const HOME = '/Users/someone';
const HOOKS = `${HOME}/.claude/hooks`;
const settings = (hooks) => JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] }, hooks });
const one = (command, extra = {}) => ({ PreToolUse: [{ matcher: 'Bash|WebFetch', hooks: [{ type: 'command', command, timeout: 10, ...extra }] }] });
const carried = (command) => hooksForTheCloud(settings(one(command)), { hooksDir: HOOKS, homeDir: HOME });

describe('which of her hooks go to the cloud', () => {
  it('carries a script in her hooks folder run by a system program, exactly as written', () => {
    const cmd = `/usr/bin/python3 -I ${HOOKS}/guard.py`;
    expect(carried(cmd)).toEqual(one(cmd));
  });

  it('carries one run by a program found by name, or the script on its own', () => {
    for (const cmd of [`node ${HOOKS}/guard.mjs`, `${HOOKS}/guard.sh`, `bash "${HOOKS}/guard.sh" --strict`]) expect(carried(cmd), cmd).toEqual(one(cmd));
  });

  it('carries one written with ~ as the Mac path, since the cloud has another home', () => {
    expect(carried('python3 ~/.claude/hooks/guard.py')).toEqual(one(`python3 ${HOOKS}/guard.py`));
    expect(carried('python3 $HOME/.claude/hooks/guard.py')).toEqual(one(`python3 ${HOOKS}/guard.py`));
  });

  it('leaves home a hook that runs anything only the Mac has', () => {
    for (const cmd of [
      `osascript -e 'display notification "done"'`,
      `${HOME}/bin/notify.sh`,
      `/opt/homebrew/bin/python3 ${HOOKS}/guard.py`,
      `python3 ${HOOKS}/guard.py; curl -s https://example.com`,
      `python3 ${HOOKS}/guard.py && say done`,
      `python3 ${HOOKS}/guard.py | tee /tmp/log`,
      `python3 $(echo ${HOOKS}/guard.py)`,
      `python3 ${HOOKS}/../bin/x.py`,
    ]) expect(carried(cmd), cmd).toBe(null);
  });

  it('does not take a folder that only starts like her hooks folder', () => {
    expect(carried(`python3 ${HOOKS}-old/guard.py`)).toBe(null);
    expect(carried(`python3 ${HOOKS}`)).toBe(null);
  });

  it('keeps what travels and drops what does not, event by event', () => {
    const guard = { type: 'command', command: `/usr/bin/python3 -I ${HOOKS}/guard.py`, timeout: 10 };
    const ping = { type: 'command', command: `osascript -e 'beep'` };
    const out = hooksForTheCloud(settings({
      PreToolUse: [{ matcher: 'Bash', hooks: [guard, ping] }, { matcher: 'Read', hooks: [ping] }],
      Stop: [{ hooks: [ping] }],
      Notification: [{ hooks: [{ type: 'prompt', prompt: 'x' }] }],
    }), { hooksDir: HOOKS, homeDir: HOME });
    expect(out).toEqual({ PreToolUse: [{ matcher: 'Bash', hooks: [guard] }] });
  });

  it('is nothing when she has no hooks, or no settings it can read', () => {
    expect(hooksForTheCloud(settings(undefined), { hooksDir: HOOKS, homeDir: HOME })).toBe(null);
    expect(hooksForTheCloud(settings({}), { hooksDir: HOOKS, homeDir: HOME })).toBe(null);
    expect(hooksForTheCloud('{not json', { hooksDir: HOOKS, homeDir: HOME })).toBe(null);
    expect(hooksForTheCloud(JSON.stringify({ hooks: { PreToolUse: 'x' } }), { hooksDir: HOOKS, homeDir: HOME })).toBe(null);
  });
});

/* ------------------------- through a real sandbox ------------------------- */

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let objects; let mac; let s3Url;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudhooks-')));
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

async function run(configDir) {
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough(); const stdout = new PassThrough(); const stderr = new PassThrough();
  let out = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir },
    cwd: mac, transport, storage, login: LOGIN, stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB,
    pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(), homeDir: path.join(tmp, 'nobody'),
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello' } }) + '\n');
  expect(await done).toBe(0);
  return JSON.parse(JSON.parse(out.split('\n').find((l) => l.includes('"type":"result"'))).result);
}

describe('a cloud run', () => {
  it('lays her guard and the settings that run it where Claude Code reads them', async () => {
    const config = path.join(tmp, 'mac', 'claude-home');
    const hooksDir = path.join(config, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(path.join(hooksDir, 'guard.py'), 'print("guarding")\n');
    const guard = { type: 'command', command: `/usr/bin/python3 -I ${hooksDir}/guard.py`, timeout: 10 };
    fs.writeFileSync(path.join(config, 'settings.json'), settings({
      PreToolUse: [{ matcher: 'Bash', hooks: [guard] }],
      Stop: [{ hooks: [{ type: 'command', command: `osascript -e 'beep'` }] }],
    }));
    const seen = await run(config);
    expect(seen.settings).toEqual({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [guard] }] } });
    expect(seen.hookScripts).toEqual({ [`${hooksDir}/guard.py`]: 'print("guarding")\n' });
  });

  it('lays no settings at all when none of her hooks can travel', async () => {
    const config = path.join(tmp, 'mac', 'claude-home');
    fs.mkdirSync(config, { recursive: true });
    fs.writeFileSync(path.join(config, 'settings.json'), settings({ Stop: [{ hooks: [{ type: 'command', command: `osascript -e 'beep'` }] }] }));
    const seen = await run(config);
    expect(seen.settings).toBe(null);
  });
});
