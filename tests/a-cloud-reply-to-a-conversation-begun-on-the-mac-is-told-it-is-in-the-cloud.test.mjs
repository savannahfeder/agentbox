// A CLOUD REPLY TO A CONVERSATION BEGUN ON THE MAC IS TOLD IT IS IN THE CLOUD
// (w-4465054f04, 2026-10-22).
//
// In the cloud power test a refund thread handed back to the Mac because it
// wanted Codex, a Mac run asked a question, and the answer went to the cloud
// again. That cloud turn was never told where it was: it ran `codex exec`,
// got a 401, offered "Move it back to your Mac" (which it cannot do), and two
// replies later merged into main inside the sandbox and called it merged. The
// Mac's main never moved. A web-app thread did the same three times.
//
// The note rode only in --append-system-prompt, and Claude Code keeps a
// conversation's system text from its first turn: the refund session's cloud
// turn at 00:30:14Z carried the same 17,057 characters as its Mac turn, no
// note, and none of 49 multi-turn sessions in the test ever changed system
// text between turns. Six cloud turns of Mac-begun sessions; none handed back.
// Both brand-new cloud runs did.
//
// A resumed Claude run in the cloud now gets the note at the top of its first
// message, as a Codex run always has.

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
import { cloudRun, claudeLineForTheCloud, CLOUD_NOTE, PLAIN_CLOUD_NOTE } from '../main/cloud/run.mjs';
import { HAND_BACK } from '../shared/cloud-hand-back.mjs';

const user = (content) => JSON.stringify({ type: 'user', uuid: 'u-1', message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' });

describe('the first message of a resumed Claude run in the cloud', () => {
  it('carries the note above the person\'s words, which reach the agent intact', () => {
    const out = JSON.parse(claudeLineForTheCloud(user('Yes, have Codex build it.'), { note: CLOUD_NOTE }));
    expect(out.message.content.startsWith(CLOUD_NOTE)).toBe(true);
    expect(out.message.content.endsWith('\n\nYes, have Codex build it.')).toBe(true);
    expect(out.message.content).toContain(`${HAND_BACK} merging into main`);
    expect(out).toMatchObject({ type: 'user', uuid: 'u-1', parent_tool_use_id: null });
  });

  it('puts the note first in a message made of parts, and keeps every part', () => {
    const parts = [{ type: 'text', text: 'What is in this picture?' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } }];
    const out = JSON.parse(claudeLineForTheCloud(user(parts), { note: CLOUD_NOTE }));
    expect(out.message.content).toEqual([{ type: 'text', text: CLOUD_NOTE }, ...parts]);
  });

  it('carries the note for a project with no repository', () => {
    const out = JSON.parse(claudeLineForTheCloud(user('Write the notes.'), { note: PLAIN_CLOUD_NOTE }));
    expect(out.message.content.startsWith(PLAIN_CLOUD_NOTE)).toBe(true);
  });

  // Told "do not offer to move the thread", the agent read it as "you cannot",
  // and answered her "Move it back to your Mac" with "I have no way to".
  it('is told that a person asking to move the thread is answered with the hand-back line', () => {
    for (const note of [CLOUD_NOTE, PLAIN_CLOUD_NOTE]) {
      const last = note.split('\n\n').at(-1);
      expect(last).toMatch(/asks to have this thread moved to their computer is answered with this line/i);
    }
  });

  it('passes a line that is not a person\'s message exactly as it came', () => {
    for (const line of [
      JSON.stringify({ type: 'control_request', request_id: 'r1', request: { subtype: 'interrupt' } }),
      JSON.stringify({ type: 'user', message: { role: 'assistant', content: 'x' } }),
      'not json',
    ]) expect(claudeLineForTheCloud(line, { note: CLOUD_NOTE })).toBe(line);
  });
});

// Driven for real on one machine, as in tests/a-cloud-run-carries-on-when-the-app-restarts.
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };

let tmp; let sandbox; let sandboxUrl; let s3; let objects; let mac; let s3Url; let sent;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudnote-')));
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
});

afterEach(async () => {
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const transport = {
  async invoke(_s, payload) {
    if (payload.action === 'stdin' && payload.data) sent.push(Buffer.from(payload.data, 'base64').toString('utf8'));
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

async function run(message, extraArgv = [], then = null) {
  const configDir = path.join(tmp, 'mac', 'claude-home');
  // The conversation a resumed run carries up, as the Mac's turn left it.
  const convo = path.join(configDir, 'projects', mac.replace(/[^a-zA-Z0-9]/g, '-'));
  fs.mkdirSync(convo, { recursive: true });
  fs.writeFileSync(path.join(convo, 's-mac.jsonl'), `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'begun on the Mac' } })}\n`);
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; if (out.includes('"type":"result"') && !stdin.writableEnded) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    cwd: mac, transport, storage, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false,
    homeDir: path.join(tmp, 'home'), leaveFlushMs: 500, login: LOGIN, stdin, stdout, stderr, signals: new EventEmitter(),
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile, ...extraArgv],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir, AGENTBOX_HOME: path.join(tmp, 'mac') },
  });
  stdin.write(`${user(message)}\n`);
  if (then) stdin.write(`${user(then)}\n`);
  const code = await done;
  return { code, err, messages: sent.flatMap((s) => s.split('\n')).filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.type === 'user') };
}

describe('a cloud run', () => {
  it('resuming a conversation tells the agent where it is in the message it reads', async () => {
    const { code, err, messages } = await run('Move it back to your Mac.', ['--resume', 's-mac']);
    expect(code, err).toBe(0);
    expect(messages).toHaveLength(1);
    expect(messages[0].message.content.startsWith(CLOUD_NOTE)).toBe(true);
    expect(messages[0].message.content.endsWith('Move it back to your Mac.')).toBe(true);
  }, 30_000);

  it('tells it once: a second message in the same run comes as it was typed', async () => {
    const { code, err, messages } = await run('Have Codex build it.', ['--resume', 's-mac'], 'and add a test');
    expect(code, err).toBe(0);
    expect(messages).toHaveLength(2);
    expect(messages[0].message.content.startsWith(CLOUD_NOTE)).toBe(true);
    expect(messages[1].message.content).toBe('and add a test');
  }, 30_000);

  it('starting a conversation leaves the message alone: the note is in its instructions', async () => {
    const { code, err, messages } = await run('Write tests for the refund flow.');
    expect(code, err).toBe(0);
    expect(messages.map((m) => m.message.content)).toEqual(['Write tests for the refund flow.']);
  }, 30_000);
});
