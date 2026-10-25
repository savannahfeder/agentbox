// A CODEX WORKER SAYS WHY ITS CONNECTION ENDED.
//
// What broke (raised in PR #31, measured here 2026-10-20 by driving the
// worker): one `codex app-server` carries every Codex thread of a login, and
// when it goes down each thread's worker said only Codex's own tracing tail.
// A frame past MAX_FRAME_LENGTH ends the connection on our side, so Codex's
// tracing has nothing about it, and every Codex task on the login stopped with
// no word in its trace of why. The client already words the reason (`cause`
// in main/codex-app-server.mjs); it never reached the worker.
//
// The reason goes first and the tracing last, because the account books read
// the last stderr line for a cause, and Codex's own words (a 401, a limit) are
// the ones that can name one.
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createCodexAppServer } from '../main/codex-app-server.mjs';
import { createCodexWorker } from '../main/codex-session.mjs';
import { troubleCause } from '../shared/spawn-trouble.mjs';

function fakeCodex() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const sent = [];
  const stdin = new EventEmitter();
  stdin.write = (chunk, cb) => {
    for (const line of String(chunk).split('\n')) if (line.trim()) sent.push(JSON.parse(line));
    cb?.(null);
    return true;
  };
  stdin.end = vi.fn();
  child.stdin = stdin;
  child.kill = vi.fn(() => true);
  return {
    child,
    sent,
    say: (msg) => child.stdout.emit('data', Buffer.from(`${JSON.stringify(msg)}\n`)),
    raw: (text) => child.stdout.emit('data', Buffer.from(text)),
    trace: (text) => child.stderr.emit('data', Buffer.from(text)),
  };
}

const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => { setImmediate(r); }); };

async function runningWorker(codex, opts = {}) {
  const server = createCodexAppServer({ spawn: () => codex.child, ...opts });
  const ready = server.initialize();
  await settle();
  codex.say({ id: codex.sent.find((m) => m.method === 'initialize').id, result: {} });
  const worker = createCodexWorker({ server, ready, threadParams: { cwd: '/w' }, turnParams: { input: [] } });
  const said = [];
  worker.stderr.on('data', (line) => said.push(String(line)));
  const exited = new Promise((resolve) => worker.once('exit', (code, signal, how) => resolve({ code, how })));
  await settle();
  codex.say({ id: codex.sent.find((m) => m.method === 'thread/start').id, result: { thread: { id: 'th-1' } } });
  await settle();
  codex.say({ id: codex.sent.find((m) => m.method === 'turn/start').id, result: { turn: { id: 'tu-1' } } });
  await settle();
  return { said, exited };
}

describe('a codex worker whose shared connection ended', () => {
  it('says the frame was too long, then what Codex printed', async () => {
    const codex = fakeCodex();
    const { said, exited } = await runningWorker(codex, { maxFrameLength: 200 });
    codex.trace('INFO codex_core: turn running\n');
    codex.raw(`${JSON.stringify({ method: 'turn/diff/updated', params: { threadId: 'th-1', diff: 'x'.repeat(400) } })}\n`);
    const { code, how } = await exited;
    expect(code).toBe(1);
    expect(how).toEqual({ transportFault: true });
    expect(said[0]).toMatch(/^the connection to codex app-server is corrupt, a frame of \d+ characters passed the 200/);
    expect(said.at(-1)).toMatch(/turn running/);
  });

  it('says it crashed, with the exit code', async () => {
    const codex = fakeCodex();
    const { said, exited } = await runningWorker(codex);
    codex.child.emit('exit', 101, null);
    await exited;
    expect(said[0]).toMatch(/^codex app-server exited \(code 101, signal null\)/);
  });

  it('keeps Codex\'s own words last, so a signed-out login is still read as one', async () => {
    const codex = fakeCodex();
    const { said, exited } = await runningWorker(codex);
    codex.trace('ERROR unexpected status 401 Unauthorized: Missing bearer or basic authentication in header\n');
    codex.child.emit('exit', 1, null);
    await exited;
    expect(troubleCause(said.at(-1))).toBe('signed-out');
  });

  it('names no cause of its own in the reason', () => {
    for (const reason of [
      'the connection to codex app-server is corrupt, a frame of 17000000 characters passed the 16777216 this connection allows',
      'the connection to codex app-server is corrupt, a line on stdout could not be read as JSON, and it may have been an approval request',
      'codex app-server exited (code 101, signal null)',
    ]) expect(troubleCause(reason), reason).toBe('unknown');
  });
});
