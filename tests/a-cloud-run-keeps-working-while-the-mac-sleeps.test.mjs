// A CLOUD RUN KEEPS WORKING, AND ENDS, WHILE THE MAC SLEEPS.
//
// What broke: she wants agents that "work when your Mac is closed" (2026-10-17).
// Read off the code that day, a cloud run stopped at its next tool call while
// the Mac slept (every call to the app waited for the Mac, up to 8 hours), and
// a run that had finished its turn sat idle until the Mac woke, because only
// the Mac closes the agent's input at the end of a turn.
//
// Now, when the start asks for it (`offline`), the sandbox counts the Mac as
// away once it has not heard from it for `afterMs`. Away, a tool call is
// answered at once with an honest error (never a made-up success: Codex's
// review), a call the Mac never answered is answered with "it may or may not
// have happened" and marked so the Mac skips it on waking, and a turn that has
// ended with nothing still running has its input closed by the sandbox, so the
// run finishes and its results go up. A Mac that is there does all of this
// itself, as before.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';

const STUB = fileURLToPath(new URL('../cloud/sandbox/mcp-stub.mjs', import.meta.url));
const AWAY = 400;
let tmp; let sandbox; let fileServer;

afterEach(async () => {
  await sandbox?.close();
  sandbox = null;
  if (fileServer) { fileServer.closeAllConnections(); await new Promise((r) => fileServer.close(r)); fileServer = null; }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

async function startWith(script, { offline = { afterMs: AWAY, endTurn: 'claude-stream-json' } } = {}) {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-asleep-'));
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
  return sandbox.handle({
    action: 'start', runId: 'r', cwd: path.join(tmp, 'vm', 'w'), branch: 'agentbox/w-1',
    bundleUrl: `http://127.0.0.1:${fileServer.address().port}/b`,
    argv: [process.execPath, '-e', script], env: { STUB },
    ...(offline ? { offline } : {}),
  });
}

// Reads what happened without counting as the Mac being there.
async function peekUntil(pred, what, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    const { events } = await sandbox.handle({ action: 'events', since: 0, peek: true });
    const hit = events.find(pred);
    if (hit) return { hit, events };
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}; saw ${JSON.stringify(events.map((e) => e.kind))}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
// The Mac, there and reading, until what it waits for has happened.
async function macUntil(pred, what, ms = 15_000) {
  const end = Date.now() + ms;
  for (;;) {
    const { events } = await sandbox.handle({ action: 'events', since: 0 });
    const hit = events.find(pred);
    if (hit) return { hit, events };
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}; saw ${JSON.stringify(events.map((e) => e.kind))}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
const text = (events) => events.filter((e) => e.kind === 'stdout').map((e) => Buffer.from(e.data, 'base64').toString()).join('');

// A stand-in for Claude Code: asks the app's store one thing through the
// stub after `delay`, prints the reply, then ends its turn and waits for its
// input to close, as Claude Code does.
const agent = ({ delay = 0, tasks = null } = {}) => `
  const { spawn } = require('child_process');
  const stub = spawn(process.execPath, [process.env.STUB, 'agentbox'], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  stub.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); process.stdout.write('reply:' + l + '\\n'); finish(); } });
  setTimeout(() => stub.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'update_work_item', arguments: { note: 'x' } } }) + '\\n'), ${delay});
  let done = false;
  function finish() {
    if (done) return; done = true;
    ${tasks ? `process.stdout.write(JSON.stringify({ type: 'system', subtype: 'background_tasks_changed', tasks: ${JSON.stringify(tasks)} }) + '\\n');` : ''}
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }) + '\\n');
  }
  process.stdin.on('data', () => {});
  process.stdin.on('end', () => { process.stdout.write('input-closed\\n'); stub.stdin.end(); setTimeout(() => process.exit(0), 100); });
`;

describe('while the Mac is away', () => {
  it('a tool call is answered at once with an honest error, and never sent on', async () => {
    const started = await startWith(agent({ delay: AWAY * 2 }));
    expect(started.caps).toContain('offline');
    const { events } = await peekUntil((e) => e.kind === 'mcp-offline', 'the call answered offline');
    expect(events.filter((e) => e.kind === 'mcp')).toEqual([]);
    const { events: later } = await peekUntil((e) => e.kind === 'stdout' && text([e]).includes('reply:'), 'the reply');
    const reply = JSON.parse(text(later).match(/reply:(.*)/)[1]);
    expect(reply.id).toBe(7);
    expect(reply.result.isError).toBe(true);
    expect(reply.result.content[0].text).toMatch(/asleep.*was not made/i);
  });

  it('a call it never answered is answered "may or may not have happened", and its late answer is dropped', async () => {
    await startWith(agent({ delay: 0 }));
    // The Mac is there when the call goes out, then goes quiet.
    const { hit } = await macUntil((e) => e.kind === 'mcp' && e.line.includes('"id":7'), 'the call sent to the Mac');
    const { events } = await peekUntil((e) => e.kind === 'mcp-abandoned', 'the call given up on');
    expect(events.find((e) => e.kind === 'mcp-abandoned')).toMatchObject({ conn: hit.conn, id: 7 });
    const late = await sandbox.handle({ action: 'mcp', runId: 'r', n: 1, conn: hit.conn, line: JSON.stringify({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'late' }] } }) });
    expect(late).toMatchObject({ ok: true, dropped: true });
    const { events: after } = await peekUntil((e) => e.kind === 'exit', 'the run to end');
    expect(text(after)).toMatch(/may or may not have/i);
    expect(text(after)).not.toContain('late');
  });

  it('a turn that has ended has its input closed by the sandbox, and the run ends', async () => {
    await startWith(agent({ delay: AWAY * 2 }));
    const { events } = await peekUntil((e) => e.kind === 'exit', 'the run to end');
    expect(text(events)).toContain('input-closed');
    expect(events.find((e) => e.kind === 'input-closed')).toMatchObject({ by: 'cloud' });
    // Input sent after that is not taken, and says so, so the app keeps the reply for the next run.
    const late = await sandbox.handle({ action: 'stdin', runId: 'r', n: 1, data: Buffer.from('{}\n').toString('base64') });
    expect(late).toMatchObject({ ok: false, consumed: true });
  });

  it('a turn waiting on its own background job is left open', async () => {
    await startWith(agent({ delay: AWAY * 2, tasks: [{ task_id: 't1', description: 'npm test' }] }));
    await peekUntil((e) => e.kind === 'stdout' && text([e]).includes('"result"'), 'the turn to end');
    await new Promise((r) => setTimeout(r, AWAY * 3));
    const { events } = await sandbox.handle({ action: 'events', since: 0, peek: true });
    expect(events.find((e) => e.kind === 'input-closed')).toBeUndefined();
  });
});

describe('while the Mac is there', () => {
  it('nothing is answered or closed for it', async () => {
    await startWith(agent({ delay: 0 }));
    // At least AWAY * 4, and on until the agent's call has reached the Mac, however slow this machine is.
    const end = Date.now() + AWAY * 4; const cap = Date.now() + 30_000;
    let seen = [];
    while (Date.now() < cap && (Date.now() < end || !seen.some((e) => e.kind === 'mcp'))) { seen = (await sandbox.handle({ action: 'events', since: 0 })).events; await new Promise((r) => setTimeout(r, 50)); }
    expect(seen.find((e) => ['mcp-offline', 'mcp-abandoned', 'input-closed'].includes(e.kind))).toBeUndefined();
    expect(seen.find((e) => e.kind === 'mcp')).toBeTruthy();
  });
});

describe('a start that does not ask for it', () => {
  it('waits for the Mac as before', async () => {
    const started = await startWith(agent({ delay: AWAY * 2 }), { offline: null });
    await new Promise((r) => setTimeout(r, AWAY * 4));
    let events = [];
    for (const cap = Date.now() + 30_000; Date.now() < cap; await new Promise((r) => setTimeout(r, 50))) {
      ({ events } = await sandbox.handle({ action: 'events', since: 0, peek: true }));
      if (events.some((e) => e.kind === 'mcp')) break;
    }
    expect(events.find((e) => ['mcp-offline', 'mcp-abandoned', 'input-closed'].includes(e.kind))).toBeUndefined();
    expect(events.find((e) => e.kind === 'mcp')).toBeTruthy();
    expect(started.ok).toBe(true);
  });
});

// Codex's review of this change (2026-10-17): a call given up on could still be
// made by a Mac that woke and read it on a later page; a reply waiting for the
// agent could be mistaken for a finished turn; a server opened while the Mac
// was away failed its handshake, so the agent marked its tools unavailable.
describe('after Codex\'s review', () => {
  it('a call given up on is refused when the waking Mac asks to make it; one it took up first is its to finish', async () => {
    await startWith(agent({ delay: 0 }));
    const { hit } = await macUntil((e) => e.kind === 'mcp' && e.line.includes('"id":7'), 'the call sent to the Mac');
    await peekUntil((e) => e.kind === 'mcp-abandoned', 'the call given up on');
    const asked = await sandbox.handle({ action: 'mcp-claim', runId: 'r', calls: [{ conn: hit.conn, id: 7 }, { conn: hit.conn, id: 99 }] });
    expect(asked.calls).toEqual([{ conn: hit.conn, id: 7, go: false }, { conn: hit.conn, id: 99, go: false }]);
  });

  it('a call the Mac takes up while there is made', async () => {
    await startWith(agent({ delay: 0 }));
    const { hit } = await macUntil((e) => e.kind === 'mcp' && e.line.includes('"id":7'), 'the call sent to the Mac');
    const asked = await sandbox.handle({ action: 'mcp-claim', runId: 'r', calls: [{ conn: hit.conn, id: 7 }] });
    expect(asked.calls).toEqual([{ conn: hit.conn, id: 7, go: true }]);
    await sandbox.handle({ action: 'mcp', runId: 'r', n: 1, conn: hit.conn, line: JSON.stringify({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'noted' }] } }) });
    const { events } = await peekUntil((e) => e.kind === 'stdout' && text([e]).includes('reply:'), 'the reply');
    expect(text(events)).toContain('noted');
  });

  it('a message the agent has not taken up keeps its turn open', async () => {
    // An agent that never says back what it reads: the Mac's message is unread.
    await startWith(`
      process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', result: 'first' }) + '\\n');
      process.stdin.on('data', () => {}); process.stdin.on('end', () => { process.stdout.write('input-closed\\n'); process.exit(0); });
    `);
    await sandbox.handle({ action: 'stdin', runId: 'r', n: 1, data: Buffer.from(JSON.stringify({ type: 'user', uuid: 'u1', message: { role: 'user', content: 'and also' } }) + '\n').toString('base64') });
    await new Promise((r) => setTimeout(r, AWAY * 4));
    let events = [];
    for (const cap = Date.now() + 30_000; Date.now() < cap; await new Promise((r) => setTimeout(r, 50))) {
      ({ events } = await sandbox.handle({ action: 'events', since: 0, peek: true }));
      if (events.some((e) => e.kind === 'mcp')) break;
    }
    expect(events.find((e) => e.kind === 'input-closed')).toBeUndefined();
  });

  it('a server opened while the Mac is away gets the app\'s own handshake and tool list, and is opened on the Mac too', async () => {
    // Two servers: the first opens while the Mac is there, the second after it has gone.
    await startWith(`
      const { spawn } = require('child_process');
      const open = (name, delay) => setTimeout(() => {
        const stub = spawn(process.execPath, [process.env.STUB, name], { stdio: ['pipe', 'pipe', 'inherit'] });
        let buf = ''; stub.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { process.stdout.write(name + ':' + buf.slice(0, i) + '\\n'); buf = buf.slice(i + 1); } });
        stub.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\\n');
        stub.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\\n');
      }, delay);
      open('agentbox', 0); open('agentbox', ${AWAY * 3});
      process.stdin.on('data', () => {});
    `, { offline: { afterMs: AWAY, endTurn: null } });
    let at = 0; const seen = [];
    let n = 0;
    for (let i = 0; i < 100 && seen.filter((e) => e.kind === 'mcp').length < 2; i += 1) {
      const got = (await sandbox.handle({ action: 'events', since: at, waitMs: 100 })).events;
      seen.push(...got); if (got.length) at = got.at(-1).seq;
    }
    for (const e of seen.filter((x) => x.kind === 'mcp')) {
      const id = JSON.parse(e.line).id;
      n += 1;
      await sandbox.handle({ action: 'mcp', runId: 'r', n, conn: e.conn, line: JSON.stringify({ jsonrpc: '2.0', id, result: id === 1 ? { serverInfo: { name: 'agentbox' } } : { tools: [{ name: 'note' }] } }) });
    }
    // The Mac goes quiet; the second server opens.
    await peekUntil((e) => e.kind === 'mcp-open' && e.conn === 'c2', 'the second server');
    let out = '';
    for (let i = 0; i < 100 && (out.match(/"tools":\[\{"name":"note"\}\]/g) || []).length < 2; i += 1) {
      out = text((await sandbox.handle({ action: 'events', since: 0, peek: true })).events);
      await new Promise((r) => setTimeout(r, 50));
    }
    expect((out.match(/"serverInfo"/g) || []).length).toBe(2);
    expect((out.match(/"tools":\[\{"name":"note"\}\]/g) || []).length).toBe(2);
    expect(out).not.toMatch(/was not made/);
    // Its handshake still went on to the Mac, whose answer is dropped.
    const { events: all } = await sandbox.handle({ action: 'events', since: 0, peek: true });
    const sent = all.filter((e) => e.kind === 'mcp' && e.conn === 'c2').map((e) => JSON.parse(e.line).method);
    expect(sent).toEqual(['initialize', 'tools/list']);
    const late = await sandbox.handle({ action: 'mcp', runId: 'r', n: n + 1, conn: 'c2', line: JSON.stringify({ jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'late' } } }) });
    expect(late).toMatchObject({ dropped: true });
  });
});

// Codex's second review: a call the Mac took up, then slept on, had its late
// answer delivered after "maybe"; a message never said back kept a run open for
// good; a control answer after a result read as a new turn.
describe('after Codex\'s second review', () => {
  it('a call the Mac took up and then slept on is answered once', async () => {
    await startWith(agent({ delay: 0 }));
    const { hit } = await macUntil((e) => e.kind === 'mcp' && e.line.includes('"id":7'), 'the call sent to the Mac');
    expect((await sandbox.handle({ action: 'mcp-claim', runId: 'r', calls: [{ conn: hit.conn, id: 7 }] })).calls[0].go).toBe(true);
    await peekUntil((e) => e.kind === 'mcp-abandoned', 'the call given up on');
    const late = await sandbox.handle({ action: 'mcp', runId: 'r', n: 1, conn: hit.conn, line: JSON.stringify({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'late' }] } }) });
    expect(late).toMatchObject({ dropped: true });
    const { events } = await peekUntil((e) => e.kind === 'exit', 'the run to end');
    expect((text(events).match(/reply:/g) || []).length).toBe(1);
  });

  it('a message never said back stops holding the turn open once two turns have ended without it', async () => {
    await startWith(`
      const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
      out({ type: 'result', subtype: 'success', result: 'first' });
      let n = 0;
      process.stdin.on('data', () => { if (n++ === 0) { out({ type: 'assistant', message: { content: [] } }); out({ type: 'result', subtype: 'success', result: 'second' }); } });
      process.stdin.on('end', () => { process.stdout.write('input-closed\\n'); process.exit(0); });
    `);
    await sandbox.handle({ action: 'stdin', runId: 'r', n: 1, data: Buffer.from(JSON.stringify({ type: 'user', uuid: 'meta-1', isMeta: true, message: { role: 'user', content: 'x' } }) + '\n').toString('base64') });
    const { events } = await peekUntil((e) => e.kind === 'input-closed', 'its input closed');
    expect(text(events)).toContain('second');
  });

  it('a control answer after a result is not a new turn', async () => {
    await startWith(`
      process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }) + '\\n');
      process.stdout.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'q1' } }) + '\\n');
      process.stdout.write(JSON.stringify({ type: 'system', subtype: 'bridge_state', state: 'on' }) + '\\n');
      process.stdin.on('data', () => {}); process.stdin.on('end', () => { process.stdout.write('input-closed\\n'); process.exit(0); });
    `);
    await peekUntil((e) => e.kind === 'input-closed', 'its input closed');
  });
});

describe('the Mac\'s relay', () => {
  it('replays the input closing in the cloud from the saved log, when the session is gone before it read it', () => {
    const src = fs.readFileSync(new URL('../main/cloud/run.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/e\.kind === 'login' \|\| e\.kind === 'input-closed'\)\) await replay\(e\)/);
  });
});
