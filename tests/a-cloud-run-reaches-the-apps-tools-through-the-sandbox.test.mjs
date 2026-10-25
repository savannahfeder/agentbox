// A CLOUD RUN REACHES THE APP'S TOOLS THROUGH THE SANDBOX, LINE FOR LINE.
//
// A worker talks to Agentbox through two MCP servers: the store
// (claim, update, file) and the approvals channel (the cards). Both are local
// programs reading local files, and neither can run in an AWS microVM. So the
// sandbox replaces each with cloud/sandbox/mcp-stub.mjs, which carries the raw
// JSON-RPC lines out as events and the Mac's replies back in. If a line is
// lost, split or reordered here, the worker's tool call hangs until its
// timeout and the thread looks stuck, which is the failure this guards.
//
// Driven for real: the sandbox server in process, a real stub as a child of a
// real command, and the "harness" a node script speaking JSON-RPC to it.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';

const STUB = fileURLToPath(new URL('../cloud/sandbox/mcp-stub.mjs', import.meta.url));

let tmp; let sandbox; let fileServer;

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  if (fileServer) { fileServer.closeAllConnections(); await new Promise((r) => fileServer.close(r)); fileServer = null; }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

async function startWith(script) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-'));
  const repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  const git = (...a) => execFileSync('git', a, { cwd: repo });
  git('init', '-q', '-b', 'main');
  git('-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'x');
  git('checkout', '-q', '-b', 'agentbox/w-1');
  git('bundle', 'create', path.join(tmp, 'b'), 'agentbox/w-1');
  const body = fs.readFileSync(path.join(tmp, 'b'));
  fileServer = http.createServer((q, s) => { s.writeHead(200); s.end(body); });
  await new Promise((r) => fileServer.listen(0, '127.0.0.1', r));
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  await sandbox.handle({
    action: 'start', runId: 'r', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1',
    bundleUrl: `http://127.0.0.1:${fileServer.address().port}/b`,
    argv: [process.execPath, '-e', script], env: { STUB },
  });
}

async function events(since = 0, waitMs = 0) {
  return (await sandbox.handle({ action: 'events', since, waitMs })).events;
}

async function waitFor(pred, what, ms = 15_000) {
  const end = Date.now() + ms;
  let at = 0; const seen = [];
  for (;;) {
    const got = await events(at, 200);
    if (got.length) { seen.push(...got); at = got.at(-1).seq; }
    const hit = seen.find(pred);
    if (hit) return { hit, seen, at };
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}; saw ${JSON.stringify(seen.map((e) => e.kind))}`);
  }
}

// The "harness": starts the stub for a server, sends lines, prints replies.
const harness = (server, lines) => `
  const { spawn } = require('child_process');
  const stub = spawn(process.execPath, [process.env.STUB, ${JSON.stringify(server)}], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  stub.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { process.stdout.write('reply:' + buf.slice(0, i) + '\\n'); buf = buf.slice(i + 1); } });
  for (const l of ${JSON.stringify(lines)}) stub.stdin.write(l + '\\n');
  setTimeout(() => { stub.stdin.end(); }, 3000);
  stub.on('close', () => process.exit(0));
`;

const stdoutOf = (evs) => Buffer.concat(evs.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64'))).toString('utf8');

describe('the MCP bridge through a cloud sandbox', () => {
  it('names the server a stub stands in for, then carries its lines out in order', async () => {
    const lines = [1, 2, 3].map((id) => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { n: id } }));
    await startWith(harness('agentbox', lines));
    const open = await waitFor((e) => e.kind === 'mcp-open', 'the stub to connect');
    expect(open.hit.server).toBe('agentbox');
    const { seen } = await waitFor((e) => e.kind === 'mcp' && JSON.parse(e.line).id === 3, 'the third line');
    const carried = seen.filter((e) => e.kind === 'mcp').map((e) => JSON.parse(e.line).id);
    expect(carried).toEqual([1, 2, 3]);
    expect(new Set(seen.filter((e) => e.kind === 'mcp').map((e) => e.conn))).toEqual(new Set([open.hit.conn]));
  });

  it('hands the Mac\'s reply back to the harness as one whole line, even a large one', async () => {
    await startWith(harness('zero-approvals', [JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call' })]));
    const { hit } = await waitFor((e) => e.kind === 'mcp', 'the request');
    const big = 'x'.repeat(300_000);
    const reply = JSON.stringify({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: big }] } });
    expect(await sandbox.handle({ action: 'mcp', conn: hit.conn, line: reply })).toMatchObject({ ok: true });
    const done = await waitFor((e) => e.kind === 'stdout' && stdoutOf([e]).includes('reply:'), 'the reply to reach the harness');
    // Gather the whole stdout until the exit, then check the line arrived intact.
    await waitFor((e) => e.kind === 'exit', 'the harness to exit');
    const all = stdoutOf(await events(0));
    const got = all.split('\n').find((l) => l.startsWith('reply:'));
    expect(got.slice('reply:'.length)).toBe(reply);
    expect(done.hit).toBeTruthy();
  });

  it('keeps two servers apart', async () => {
    const script = `
      const { spawn } = require('child_process');
      const a = spawn(process.execPath, [process.env.STUB, 'agentbox'], { stdio: ['pipe', 'pipe', 'inherit'] });
      const b = spawn(process.execPath, [process.env.STUB, 'zero-approvals'], { stdio: ['pipe', 'pipe', 'inherit'] });
      a.stdout.on('data', (d) => process.stdout.write('A:' + d));
      b.stdout.on('data', (d) => process.stdout.write('B:' + d));
      a.stdin.write('{"to":"a"}\\n'); b.stdin.write('{"to":"b"}\\n');
      setTimeout(() => { a.stdin.end(); b.stdin.end(); }, 3000);
      let n = 0; const done = () => { if (++n === 2) process.exit(0); };
      a.on('close', done); b.on('close', done);
    `;
    await startWith(script);
    const { seen } = await waitFor((e) => e.kind === 'mcp' && e.line.includes('"b"'), 'the second server\'s line', 15_000)
      .then(async (r) => (r.seen.some((e) => e.kind === 'mcp' && e.line.includes('"a"')) ? r : waitFor((e) => e.kind === 'mcp' && e.line.includes('"a"'), 'the first server\'s line')));
    const opens = seen.filter((e) => e.kind === 'mcp-open');
    const connOf = (name) => opens.find((o) => o.server === name).conn;
    const a = seen.find((e) => e.kind === 'mcp' && e.line.includes('"a"'));
    const b = seen.find((e) => e.kind === 'mcp' && e.line.includes('"b"'));
    expect(a.conn).toBe(connOf('agentbox'));
    expect(b.conn).toBe(connOf('zero-approvals'));
    await sandbox.handle({ action: 'mcp', conn: connOf('zero-approvals'), line: '{"for":"b"}' });
    await sandbox.handle({ action: 'mcp', conn: connOf('agentbox'), line: '{"for":"a"}' });
    await waitFor((e) => e.kind === 'exit', 'the harness to exit');
    const out = stdoutOf(await events(0));
    expect(out).toContain('A:{"for":"a"}');
    expect(out).toContain('B:{"for":"b"}');
    expect(out).not.toContain('A:{"for":"b"}');
  });

  it('tells the Mac when a stub goes away, so the real server on the Mac can be closed too', async () => {
    await startWith(harness('agentbox', ['{"jsonrpc":"2.0","id":1,"method":"ping"}']));
    const { hit } = await waitFor((e) => e.kind === 'mcp-open', 'the stub to connect');
    const closed = await waitFor((e) => e.kind === 'mcp-close', 'the stub to close');
    expect(closed.hit.conn).toBe(hit.conn);
  });

  it('a reply for a connection that is gone is refused, not dropped in silence', async () => {
    await startWith(harness('agentbox', []));
    await waitFor((e) => e.kind === 'exit', 'the harness to exit');
    expect(await sandbox.handle({ action: 'mcp', conn: 'c99', line: '{}' })).toMatchObject({ ok: false, error: 'no-conn' });
  });
});
