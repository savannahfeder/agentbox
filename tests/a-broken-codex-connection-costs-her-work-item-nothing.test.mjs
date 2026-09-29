// A BROKEN CODEX CONNECTION COSTS HER WORK ITEM NOTHING.
//
// One `codex app-server` carries the whole fleet. That is what makes a second
// engine affordable and it is also what makes one bad line expensive: a single
// unparseable frame calls `fail('protocol')` on the SHARED process, every
// watched thread is told `onClosed`, and each of those threads is a work item.
//
// Until this file, each of them then ended `end(1, null)` -- no signal, nothing
// saying we did it -- so `settleDelivery` read every one of them as a run that
// tried and failed and SPENT ONE OF THAT ITEM'S THREE DELIVERY ATTEMPTS. Three
// such events on a busy afternoon and unrelated rows she had answered read
// "stopped", which CLAUDE.md's rule calls the loudest word this app has and
// says must never mean "and nothing will retry".
//
// It is not hypothetical. `turn/diff/updated` carries a git-format diff of the
// whole turn, so the biggest frames on this wire arrive exactly when a worker
// has done the most work.
//
// THE POSTURE DOES NOT CHANGE. A frame we cannot read might have been an
// approval request, so it is still fatal and still loud -- see
// tests/one-codex-process-carries-many-threads-and-a-card-nobody-answers-denies
// for that half. What changes is who pays: a transport fault is a fact about
// the connection, not about the item, and CLAUDE.md already settles that shape
// for the other engine.
//
// THE THREE OTHER WAYS THE SAME PROCESS HELD A ROW FOREVER, all closed here:
//
//   A COMPLETE FRAME OF ANY SIZE REACHED `JSON.parse`. The bound only looked at
//   the residual buffer after newline-delimited frames had been taken out of
//   it, so a single terminated ten-megabyte line passed straight through the
//   check that exists to stop exactly that.
//
//   AN ORDINARY REQUEST HAD NO DEADLINE. `initialize`, `config/read`,
//   `thread/start`, `thread/resume` and `turn/start` were all sent to a live
//   pipe with nothing to settle them if the server accepted the bytes and never
//   answered. The approval had a deadline from the first draft; the requests
//   that get a worker as far as raising one did not.
//
//   A SECOND SERVER REQUEST ON AN OPEN ID SILENTLY REPLACED THE FIRST. The
//   timer for the first card was overwritten rather than cleared, so it went on
//   to deny the SECOND card at its own deadline and the first card's real
//   answer landed on a map entry that had been replaced.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCodexAppServer } from '../main/codex-app-server.mjs';
import { createCodexWorker } from '../main/codex-session.mjs';
import { rememberCodexChange, CHANGE_FRAME_CAP, CHANGE_BYTE_CAP } from '../main/codex.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { Name } from '../shared/product-name.mjs';

/**
 * The same notepad the transport's own suite drives, kept local because two
 *  files sharing a fake is two files that cannot change it independently. */
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
  const emit = (text) => child.stdout.emit('data', Buffer.from(text));
  return {
    child,
    sent,
    say: (msg) => emit(`${JSON.stringify(msg)}\n`),
    raw: (text) => emit(text),
    idOf: (method) => sent.find((m) => m.method === method)?.id,
    answersTo: (id) => sent.filter((m) => m.id === id && (m.result !== undefined || m.error !== undefined)),
  };
}

const tick = () => new Promise((resolve) => { setTimeout(() => setImmediate(resolve), 0); });
const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => { setImmediate(r); }); };

/* ============ a transport fault is not the work item's failure =========== */

describe('a thread whose connection died under it', () => {
  it('ends saying the transport did it, not the turn', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const worker = createCodexWorker({ server: client, ready: client.initialize() });
    codex.say({ jsonrpc: '2.0', id: codex.idOf('initialize'), result: {} });
    await settle();
    codex.say({ jsonrpc: '2.0', id: codex.idOf('thread/start'), result: { thread: { id: 'T-A' } } });
    await settle();

    const exits = [];
    worker.on('exit', (code, signal, how) => exits.push({ code, signal, how }));

    // One line nobody can read, on the shared process.
    codex.raw('}}}}\n');
    await tick();

    expect(exits).toHaveLength(1);
    expect(exits[0].how).toMatchObject({ transportFault: true });
  });

  // THE CASE THAT MUST NOT MATCH. A turn that really failed is the item's
  // business and still spends an attempt; only the connection dying is ours.
  it('says nothing of the kind when the turn itself failed', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const worker = createCodexWorker({ server: client, ready: client.initialize() });
    codex.say({ jsonrpc: '2.0', id: codex.idOf('initialize'), result: {} });
    await settle();
    codex.say({ jsonrpc: '2.0', id: codex.idOf('thread/start'), result: { thread: { id: 'T-A' } } });
    await settle();

    const exits = [];
    worker.on('exit', (code, signal, how) => exits.push({ code, signal, how }));
    codex.say({
      jsonrpc: '2.0',
      method: 'turn/completed',
      params: { threadId: 'T-A', turn: { id: 'X', status: 'failed', error: { message: 'the model refused' } } },
    });
    await tick();

    expect(exits).toHaveLength(1);
    expect(exits[0].code).toBe(1);
    expect(exits[0].how ?? null).toBe(null);
  });

  // And our own kill is unchanged: it already carries a signal, which is the
  // fact `settleDelivery` has always read.
  it('still reports our own kill as a signal', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const worker = createCodexWorker({ server: client, ready: client.initialize() });
    codex.say({ jsonrpc: '2.0', id: codex.idOf('initialize'), result: {} });
    await settle();

    const exits = [];
    worker.on('exit', (code, signal) => exits.push({ code, signal }));
    worker.kill();

    expect(exits).toEqual([{ code: 143, signal: 'SIGTERM' }]);
  });
});

/* ==================== and what settleDelivery does with it ================ */

describe('what a transport fault costs the answer she wrote', () => {
  const dirs = [];
  afterAll(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } });

  const ITEM = {
    id: 'w-595f3ccad4',
    product: 'agentbox',
    status: 'open',
    answer: 'Yes, go ahead.',
    wrote: { answer: { ts: 1_787_872_000_000, source: 'founder' } },
  };

  function supervisor() {
    const root = mkdtempSync(join(tmpdir(), 'zero-transport-'));
    dirs.push(root);
    return new Supervisor(
      { storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
      {
        listItems: () => [ITEM],
        listProducts: () => [{ slug: 'agentbox', name: Name, dir: root }],
        // Readable and unchanged: no agent has spoken since she wrote, which is
        // the only honest reading of a run that died on the transport.
        readItem: () => ITEM,
        recordSessionResult() {},
        settleAnswer() {},
      },
      root,
    );
  }

  const faulted = () => ({ engine: 'codex', tail: [], result: null, transportFault: true });

  it('hands her answer back rather than charging the item for it', () => {
    const sup = supervisor();
    sup._handledAnswers.add(sup._answerKey(ITEM, ITEM.answer));
    expect(sup.settleDelivery(ITEM, ITEM.answer, faulted(), null)).toBe('interrupted');
  });

  it('does not run the item out of attempts, however many times the pipe breaks', () => {
    const sup = supervisor();
    for (let n = 0; n < 5; n += 1) {
      sup._handledAnswers.add(sup._answerKey(ITEM, ITEM.answer));
      expect(sup.settleDelivery(ITEM, ITEM.answer, faulted(), null)).toBe('interrupted');
    }
    expect(sup._deliveryAttempts[sup._answerKey(ITEM, ITEM.answer)] ?? 0).toBe(0);
  });

  // THE CASE THAT MUST NOT MATCH. A run that died on its own still spends its
  // three, or an impossible task respawns forever.
  it('still spends an attempt on a run that died by itself', () => {
    const sup = supervisor();
    const dead = { engine: 'codex', tail: [], result: 'the turn failed', resultIsError: true };
    sup._handledAnswers.add(sup._answerKey(ITEM, ITEM.answer));
    expect(sup.settleDelivery(ITEM, ITEM.answer, dead, null)).toBe('retrying');
    sup._handledAnswers.add(sup._answerKey(ITEM, ITEM.answer));
    expect(sup.settleDelivery(ITEM, ITEM.answer, dead, null)).toBe('retrying');
    sup._handledAnswers.add(sup._answerKey(ITEM, ITEM.answer));
    expect(sup.settleDelivery(ITEM, ITEM.answer, dead, null)).toBe('given up');
  });
});

/* ========================= the frame bound, for real ===================== */

describe('the bound on one frame', () => {
  it('refuses a complete frame that is over the limit, before it is parsed', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, maxFrameLength: 512 });
    const gone = [];
    client.watch('T-A', { onClosed: (why) => gone.push(why.reason) });

    // Terminated, well-formed JSON, and far too big. The old check only looked
    // at what was LEFT in the buffer after the newline split, so this line went
    // straight to JSON.parse and on to the handlers.
    codex.say({ jsonrpc: '2.0', method: 'turn/diff/updated', params: { threadId: 'T-A', diff: 'd'.repeat(2000) } });
    await tick();

    expect(client.isClosed()).toBe(true);
    expect(gone).toEqual(['protocol']);
  });

  it('still passes a large frame that is inside the limit', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, maxFrameLength: 8192 });
    const seen = [];
    client.watch('T-A', { onNotification: (m) => seen.push(m) });

    codex.say({ jsonrpc: '2.0', method: 'turn/diff/updated', params: { threadId: 'T-A', diff: 'd'.repeat(4000) } });
    await tick();

    expect(seen).toEqual(['turn/diff/updated']);
    expect(client.isClosed()).toBe(false);
  });

  // The boundary either side, on the exact number rather than near it.
  it('takes a frame of exactly the limit and refuses one character more', async () => {
    for (const [over, closed] of [[false, false], [true, true]]) {
      const codex = fakeCodex();
      const limit = 200;
      const client = createCodexAppServer({ transport: codex.child, maxFrameLength: limit });
      const head = JSON.stringify({ jsonrpc: '2.0', method: 'x', params: { pad: '' } });
      const pad = limit - head.length + (over ? 1 : 0);
      codex.raw(`${JSON.stringify({ jsonrpc: '2.0', method: 'x', params: { pad: 'p'.repeat(pad) } })}\n`);
      await tick();
      expect(client.isClosed()).toBe(closed);
    }
  });
});

/* ===================== a request that is never answered ================== */

describe('an app-server that takes a request and never answers it', () => {
  it('lets the request go rather than holding the row forever', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, requestTimeoutMs: 5 });
    const asked = client.initialize();
    await expect(asked).rejects.toThrow(/never answered/i);
  });

  it('ends the worker waiting on it, with the reason on its stderr', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, requestTimeoutMs: 5 });
    const worker = createCodexWorker({ server: client, ready: client.initialize() });
    const said = [];
    worker.stderr.on('data', (line) => said.push(line));
    const exits = [];
    worker.on('exit', (code) => exits.push(code));

    await new Promise((resolve) => { setTimeout(resolve, 40); });

    expect(exits).toEqual([1]);
    expect(said.join('\n')).toMatch(/never answered/i);
  });

  // THE CASE THAT MUST NOT MATCH: an answer that arrives inside the deadline is
  // an ordinary answer, and the deadline does not fire behind it.
  it('does nothing at all to a request that was answered', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, requestTimeoutMs: 40 });
    const asked = client.initialize();
    codex.say({ jsonrpc: '2.0', id: codex.idOf('initialize'), result: { userAgent: 'codex/0.148.0' } });
    await expect(asked).resolves.toMatchObject({ userAgent: 'codex/0.148.0' });
    await new Promise((resolve) => { setTimeout(resolve, 60); });
    expect(client.isClosed()).toBe(false);
  });
});

/* ================= two server requests on one open id ==================== */

describe('a second server request arriving on an id that is still open', () => {
  it('is refused loudly rather than quietly replacing the first card', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, approvalTimeoutMs: 60_000 });
    const gone = [];
    client.watch('T-A', { onApproval: () => new Promise(() => {}), onClosed: (why) => gone.push(why.reason) });

    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A', command: 'ls' } });
    await tick();
    expect(client.stats().approvals).toBe(1);

    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A', command: 'rm -rf /' } });
    await tick();

    expect(gone).toEqual(['protocol']);
    // And nothing was answered twice on the one id, which is the thing a second
    // card on it would eventually have done.
    expect(codex.answersTo(0)).toHaveLength(0);
  });

  // THE CASE THAT MUST NOT MATCH: an id REUSED after its card was answered is
  // ordinary, because the entry is gone by then.
  it('accepts an id again once the card on it has been answered', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    client.watch('T-A', { onApproval: () => 'decline', onClosed: () => {} });

    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A', command: 'ls' } });
    await tick();
    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A', command: 'ls' } });
    await tick();

    expect(client.isClosed()).toBe(false);
    expect(codex.answersTo(0)).toHaveLength(2);
  });
});

/* ================== a kill that lands during the startup ================= */

describe('a worker killed before its thread exists', () => {
  it('never starts the thread', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const worker = createCodexWorker({ server: client, ready: client.initialize() });

    worker.kill();
    codex.say({ jsonrpc: '2.0', id: codex.idOf('initialize'), result: {} });
    await settle();

    expect(codex.sent.filter((m) => m.method === 'thread/start')).toHaveLength(0);
    expect(codex.sent.filter((m) => m.method === 'turn/start')).toHaveLength(0);
  });

  it('lets go of a thread that turns up after the kill', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const worker = createCodexWorker({ server: client, ready: client.initialize() });
    codex.say({ jsonrpc: '2.0', id: codex.idOf('initialize'), result: {} });
    await settle();
    expect(codex.sent.filter((m) => m.method === 'thread/start')).toHaveLength(1);

    // The kill lands while `thread/start` is in flight, and the server answers
    // it anyway. A watch left installed here hands every later line for that id
    // to a session that no longer exists, and holds the client open on it.
    worker.kill();
    codex.say({ jsonrpc: '2.0', id: codex.idOf('thread/start'), result: { thread: { id: 'T-A' } } });
    await settle();

    expect(client.stats().threads).toBe(0);
    expect(codex.sent.filter((m) => m.method === 'turn/start')).toHaveLength(0);
  });
});

/* ==================== the artifact's frames, in bytes ==================== */

describe('how much of one run the artifact will hold', () => {
  const bigChange = (bytes) => ({
    item: { type: 'fileChange', changes: [{ path: '/tmp/p/x.js', kind: { type: 'update' }, diff: 'd'.repeat(bytes) }] },
  });

  it('keeps the ordinary run whole', () => {
    const session = {};
    for (let n = 0; n < 20; n += 1) rememberCodexChange(session, 'item/completed', bigChange(100));
    expect(session.codexChange).toHaveLength(20);
  });

  // A FRAME CAP IS NOT A MEMORY CAP. Each of the five thousand frames may carry
  // up to the transport's whole frame limit, so the count alone bounds this at
  // eighty gigabytes -- which is not a bound, it is her app dying on a run that
  // edits in a loop.
  it('stops on bytes as well as on frames', () => {
    const session = {};
    const each = 100_000;
    for (let n = 0; n < 200; n += 1) rememberCodexChange(session, 'item/completed', bigChange(each));
    expect(session.codexChange.length).toBeLessThan(200);
    // The cap is never EXCEEDED, so the last frame that would cross it is the
    // first one dropped: floor, not ceil.
    expect(session.codexChange.length).toBe(Math.floor(CHANGE_BYTE_CAP / each));
    expect(session.codexChangeBytes).toBeLessThanOrEqual(CHANGE_BYTE_CAP);
  });

  it('still stops on frames when every one of them is small', () => {
    const session = {};
    for (let n = 0; n < CHANGE_FRAME_CAP + 10; n += 1) rememberCodexChange(session, 'item/completed', bigChange(1));
    expect(session.codexChange).toHaveLength(CHANGE_FRAME_CAP);
  });
});
