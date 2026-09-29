// One `codex app-server` process, many work items, and the two ways that goes
// wrong silently.
//
// WHY THIS FILE EXISTS. The old build drove one-shot `codex exec`, which has no
// channel to ask the founder anything, so a Codex worker could not raise the
// card that main/approval-prompt-server.mjs raises for a Claude Code worker. It
// could only run ungated or fail.
//
// `codex app-server` solves it: it speaks newline-delimited JSON-RPC 2.0 over
// stdio and raises real approval REQUESTS that must be answered. That moves the
// failure somewhere new, and this file is about the new place. An approval is
// now a request with an id, and a request with an id that nobody answers is a
// worker parked forever with no symptom at all. That is the shape of the
// stranded-item incident already written up in CLAUDE.md, arriving through a
// new door. So the rule this file pins is the one
// main/approval-prompt-server.mjs already keeps: DENY IS THE DEFAULT IN EVERY
// FAILURE MODE, and silence is not a refusal, it is a hang.
//
// ------------------------------------------------------------------------
// MEASURED ON THIS MAC 2026-09-04, codex-cli 0.148.0, because four of the
// protocol facts this file asserts are NOT what the written brief said.
//
// 1. THE THREAD ID IS AT `result.thread.id`, NEVER `result.threadId`. Read off
//    a live `thread/start` response the same day: `result.thread.id` was
//    "01a068f1-be4d-7701-98e3-16137d16dcdf" and `result.threadId` was
//    `undefined`. A client reading the wrong one routes every notification to
//    the id `undefined`, which is one bucket that every thread shares.
//
// 2. SERVER REQUEST IDS START AT 0, AND THEY ARE A DIFFERENT NUMBER SPACE FROM
//    OURS. In the captured session the first approval carried `id: 0` while our
//    own `initialize` was `id: 1`. Any classifier written as `if (msg.id)`
//    drops the first approval of every session on the floor, because 0 is
//    falsy, and that is exactly the silent park described above.
//
// 3. `decline` IS ACCEPTED EVEN WHEN `availableDecisions` DOES NOT LIST IT.
//    The live approval offered `["accept", {acceptWithExecpolicyAmendment: ...},
//    "cancel"]` — no "decline" in it. Answering `{decision: 'decline'}` anyway
//    was accepted: the item completed with `status: "declined"`, the server
//    emitted `serverRequest/resolved`, and the TURN COMPLETED 4.0 seconds
//    later. `availableDecisions` is a hint about which buttons to draw, not a
//    whitelist the answer is validated against. That is what makes an
//    unconditional refusal safe.
//
// 4. A JSON-RPC ERROR FRAME IS ALSO A REFUSAL, and it is the only one available
//    for a request shape we have not measured. Answering the same approval with
//    `{error: {code: -32001, message}}` left the item at `status: "failed"` and
//    the turn still COMPLETED, 5.5 seconds later. So both refusals work; the
//    decision word is the tidier one where we know the vocabulary.
//
// AND TWO THINGS THE BRIEF GOT WRONG, both pinned below rather than only
// written down here:
//
//    `abort` IS NOT IN THE v2 APPROVAL VOCABULARY. Read out of the CLI's own
//    `codex app-server generate-json-schema` dump: CommandExecutionApprovalDecision
//    and FileChangeApprovalDecision are accept / acceptForSession / decline /
//    cancel plus two amendment objects. `abort` lives only in the LEGACY
//    `ReviewDecision` used by `execCommandApproval` and `applyPatchApproval`.
//    Sending it to a v2 approval is a malformed answer, so it is junk here.
//
//    `item/permissions/requestApproval` DOES NOT TAKE A `decision` AT ALL. Its
//    response schema, PermissionsRequestApprovalResponse, is
//    `{ permissions: GrantedPermissionProfile, scope?, strictAutoReview? }`.
//    A decision word sent there is junk too, which is why the refusal for that
//    one method is the error frame.
//
// ------------------------------------------------------------------------
// Everything below drives a FAKE transport, written line by line. Nothing here
// spawns `codex`, on purpose: the four tests already failing in this suite fail
// because they depend on this machine's clock and this machine's installs, and
// a transport test that needed the real binary would join them the first time
// somebody ran the suite on a Mac without Codex on it.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Name } from '../shared/product-name.mjs';
import {
  createCodexAppServer, APPROVAL_DECISIONS, REFUSAL_DECISION,
} from '../main/codex-app-server.mjs';

/**
 * A `codex app-server` that is really a notepad.
 *
 * stdout and stderr are plain emitters rather than streams so that `say`
 * delivers a line SYNCHRONOUSLY. That is not a shortcut: several of these tests
 * are about what happens between one line and the next line of the same chunk,
 * and a real PassThrough would put a scheduler between them and turn an
 * ordering assertion into a timing one.
 */
function fakeCodex() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const sent = [];
  // stdin is an emitter, not a plain object, because a real child's stdin can
  // fail three separate ways and each one must reach the client: it can throw,
  // it can accept the bytes and hand back an error in the write callback, and
  // it can raise `error` on the pipe long after anybody wrote to it.
  const failure = { mode: null };
  const stdin = new EventEmitter();
  stdin.write = (chunk, cb) => {
    if (failure.mode === 'throw') throw new Error('EPIPE: write to a pipe that is gone');
    for (const line of String(chunk).split('\n')) if (line.trim()) sent.push(JSON.parse(line));
    if (failure.mode === 'callback') { cb?.(new Error('EPIPE: the pipe went away mid-write')); return false; }
    cb?.(null);
    return true;
  };
  stdin.end = vi.fn();
  child.stdin = stdin;
  child.killed = false;
  child.kill = vi.fn((signal) => { child.killed = true; child.signal = signal; return true; });

  const emit = (text) => child.stdout.emit('data', Buffer.from(text));
  return {
    child,
    sent,
    /** One well-formed message, framed the way the real server frames it. */
    say: (msg) => emit(JSON.stringify(msg) + '\n'),
    /** Several messages in ONE chunk, which is the ordinary case on a busy turn. */
    sayAll: (...msgs) => emit(msgs.map((m) => JSON.stringify(m) + '\n').join('')),
    /** Bytes exactly as given, so a test can split a line wherever it likes. */
    raw: (text) => emit(text),
    diagnose: (text) => child.stderr.emit('data', Buffer.from(text)),
    exit: (code, signal = null) => child.emit('exit', code, signal),
    fail: (err) => child.emit('error', err),
    /** What the client wrote, oldest first. */
    lastSent: () => sent[sent.length - 1],
    answerTo: (id) => sent.find((m) => m.id === id && (m.result !== undefined || m.error !== undefined)),
    answersTo: (id) => sent.filter((m) => m.id === id && (m.result !== undefined || m.error !== undefined)),
    /** 'throw' fails the write where it stands, 'callback' fails it afterwards. */
    breakStdin: (mode) => { failure.mode = mode; },
  };
}

// ONE TIMER TURN AND THEN ONE IMMEDIATE, AND THE SECOND HALF IS NOT DECORATION.
//
// `fail` in main/codex-app-server.mjs marks the connection dead synchronously
// and finishes it on a `setImmediate`, so that the tracing tail explaining the
// death is complete rather than whatever had arrived by the moment `exit`
// fired. A bare `setTimeout(0)` races that immediate: Node runs the timers
// phase before the check phase, so once a millisecond has passed the assertion
// lands BEFORE `finish` and `onClosed` has not been called yet. Measured
// 2026-09-04: green every time this file ran alone, and red in 3 of 13
// whole-suite runs once the suite grew -- always on "treats a write that throws
// where it stands as a broken connection", which is the one that reads
// `onClosed`. Waiting for a timer AND THEN an immediate puts `finish` first in
// both orderings, so nothing here depends on how loaded the machine is.
const tick = () => new Promise((resolve) => { setTimeout(() => setImmediate(resolve), 0); });

/** A client with the handshake already done, plus one watched thread. */
async function withThread(handlers = {}, { threadId = 'T-A', codex = fakeCodex(), ...options } = {}) {
  const client = createCodexAppServer({ transport: codex.child, ...options });
  const opening = client.startThread({ cwd: '/tmp/product' }, handlers);
  const startId = codex.sent.find((m) => m.method === 'thread/start').id;
  codex.say({ jsonrpc: '2.0', id: startId, result: { thread: { id: threadId, ephemeral: false } } });
  const started = await opening;
  return { codex, client, started };
}

/* ------------------------------ the handshake ----------------------------- */

describe('opening one app-server', () => {
  it('sends initialize with a clientInfo the server can name us by, and resolves on its answer', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });

    const opening = client.initialize();
    const sent = codex.sent[0];
    expect(sent).toMatchObject({ jsonrpc: '2.0', method: 'initialize' });
    expect(sent.params.clientInfo.name).toBeTruthy();
    expect(typeof sent.id).toBe('number');

    codex.say({ jsonrpc: '2.0', id: sent.id, result: { userAgent: 'codex/0.148.0', codexHome: '/Users/x/.codex' } });
    await expect(opening).resolves.toMatchObject({ codexHome: '/Users/x/.codex' });
  });

  // Fact 1 at the top of this file. The value is one level deeper than the
  // obvious guess and the obvious guess fails silently rather than loudly.
  it('reads the thread id from result.thread.id, and a response carrying only threadId yields nothing', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });

    const opening = client.startThread({ cwd: '/tmp/product' }, {});
    const startId = codex.sent.find((m) => m.method === 'thread/start').id;
    codex.say({ jsonrpc: '2.0', id: startId, result: { thread: { id: 'THE-REAL-ID' }, threadId: undefined } });
    await expect(opening).resolves.toMatchObject({ threadId: 'THE-REAL-ID' });

    const second = client.startThread({ cwd: '/tmp/other' }, {});
    const secondId = codex.sent.filter((m) => m.method === 'thread/start')[1].id;
    codex.say({ jsonrpc: '2.0', id: secondId, result: { threadId: 'ONLY-AT-THE-TOP' } });
    await expect(second).resolves.toMatchObject({ threadId: null });
  });

  // Fact 7 of the brief: `thread/resume` fails with "no rollout found for thread
  // id" on an ephemeral thread, so a continuation of a work item needs a thread
  // that was written to disk. The default has to be the one that can come back.
  it('starts threads that can be resumed later unless the caller insists otherwise', async () => {
    const { codex } = await withThread();
    expect(codex.sent.find((m) => m.method === 'thread/start').params).toMatchObject({ ephemeral: false });

    const other = fakeCodex();
    const client = createCodexAppServer({ transport: other.child });
    client.startThread({ cwd: '/tmp/scratch', ephemeral: true }, {});
    expect(other.sent.find((m) => m.method === 'thread/start').params).toMatchObject({ ephemeral: true });
  });

  it('interrupts a turn with both ids, because either one alone is not a turn', async () => {
    const { codex, client } = await withThread();
    client.interruptTurn('T-A', 'TURN-1');
    expect(codex.lastSent()).toMatchObject({ method: 'turn/interrupt', params: { threadId: 'T-A', turnId: 'TURN-1' } });
  });
});

/* ------------------------------ multiplexing ------------------------------ */

describe('many threads on one process', () => {
  it('gives each thread only its own notifications', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const seenByA = [];
    const seenByB = [];
    client.watch('T-A', { onNotification: (m, p) => seenByA.push([m, p.turnId]) });
    client.watch('T-B', { onNotification: (m, p) => seenByB.push([m, p.turnId]) });

    codex.sayAll(
      { jsonrpc: '2.0', method: 'turn/started', params: { threadId: 'T-A', turnId: 'A1' } },
      { jsonrpc: '2.0', method: 'item/completed', params: { threadId: 'T-B', turnId: 'B1' } },
      { jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-A', turnId: 'A1' } },
    );

    expect(seenByA).toEqual([['turn/started', 'A1'], ['turn/completed', 'A1']]);
    expect(seenByB).toEqual([['item/completed', 'B1']]);
  });

  // `thread/started` is the one notification with no `threadId`: the id is at
  // `params.thread.id`, measured off the captured session. Routing on
  // `params.threadId` alone loses the first event of every thread.
  it('routes thread/started by params.thread.id, which is where that one keeps it', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const seen = [];
    client.watch('T-A', { onNotification: (m) => seen.push(m) });

    codex.say({ jsonrpc: '2.0', method: 'thread/started', params: { thread: { id: 'T-A', ephemeral: false } } });
    expect(seen).toEqual(['thread/started']);
  });

  // THE CASE THAT MUST NOT MATCH. A line for a thread we are not watching, and
  // a line for no thread at all, must never be handed to a thread that happens
  // to be registered. `account/rateLimits/updated` genuinely carries no
  // threadId — measured, it is one of two that do not.
  it('never hands one thread a line meant for another, or a line meant for none', async () => {
    const codex = fakeCodex();
    const loose = [];
    const client = createCodexAppServer({ transport: codex.child, onNotification: (m, p) => loose.push([m, p?.threadId ?? null]) });
    const seenByA = [];
    client.watch('T-A', { onNotification: (m) => seenByA.push(m) });

    codex.sayAll(
      { jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-SOMEBODY-ELSE' } },
      { jsonrpc: '2.0', method: 'account/rateLimits/updated', params: { rateLimits: {} } },
    );

    expect(seenByA).toEqual([]);
    expect(loose).toEqual([['turn/completed', 'T-SOMEBODY-ELSE'], ['account/rateLimits/updated', null]]);
  });

  // The race that a naive client loses. The server may put the thread/start
  // RESPONSE and the thread's first notification in one chunk, and a promise
  // resolves on a microtask while the next line of the chunk is read on this
  // one. Register on the response inside the read loop or the first event of
  // every thread goes to the loose bucket.
  it('is watching the thread before it reads the next line of the same chunk', async () => {
    const codex = fakeCodex();
    const loose = [];
    const client = createCodexAppServer({ transport: codex.child, onNotification: (m) => loose.push(m) });
    const seen = [];

    const opening = client.startThread({ cwd: '/tmp/product' }, { onNotification: (m) => seen.push(m) });
    const startId = codex.sent.find((m) => m.method === 'thread/start').id;
    codex.sayAll(
      { jsonrpc: '2.0', id: startId, result: { thread: { id: 'T-A' } } },
      { jsonrpc: '2.0', method: 'thread/status/changed', params: { threadId: 'T-A', status: { type: 'active' } } },
    );
    await opening;

    expect(seen).toEqual(['thread/status/changed']);
    expect(loose).toEqual([]);
  });

  it('stops delivering to a thread that has been let go', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const seen = [];
    client.watch('T-A', { onNotification: (m) => seen.push(m) });
    client.unwatch('T-A');

    codex.say({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-A' } });
    expect(seen).toEqual([]);
  });
});

/* ------------------------------- approvals -------------------------------- */

describe('an approval reaches the founder', () => {
  it('hands the request to the thread that raised it, and sends back the word she chose', async () => {
    const raised = [];
    const { codex } = await withThread({
      onApproval: (method, params) => { raised.push([method, params.command]); return 'accept'; },
    });

    codex.say({
      jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval',
      params: { threadId: 'T-A', turnId: 'TURN-1', itemId: 'call_1', command: '/bin/zsh -lc "ls"' },
    });
    await tick();

    expect(raised).toEqual([['item/commandExecution/requestApproval', '/bin/zsh -lc "ls"']]);
    expect(codex.answerTo(0)).toEqual({ jsonrpc: '2.0', id: 0, result: { decision: 'accept' } });
  });

  // Fact 2. The first approval of every session carries id 0 and `if (msg.id)`
  // is how it gets dropped. The test above already uses 0; this one says out
  // loud that the zero is the point, by proving a nonzero id behaves the same.
  it('answers an approval numbered zero exactly as it answers any other', async () => {
    const { codex } = await withThread({ onApproval: () => 'accept' });
    codex.sayAll(
      { jsonrpc: '2.0', id: 0, method: 'item/fileChange/requestApproval', params: { threadId: 'T-A' } },
      { jsonrpc: '2.0', id: 7, method: 'item/fileChange/requestApproval', params: { threadId: 'T-A' } },
    );
    await tick();

    expect(codex.answerTo(0)).toMatchObject({ result: { decision: 'accept' } });
    expect(codex.answerTo(7)).toMatchObject({ result: { decision: 'accept' } });
  });

  // She can be away from her desk, and nothing is decided for her while she is
  // still deciding. What happens when she never comes back is a deadline, and
  // that has its own describe block below: an earlier draft of this file
  // asserted the client waits FOREVER, which pinned the bug this whole file is
  // named after.
  it('answers nothing while she is still thinking, and sends her word when she picks one', async () => {
    let answer;
    const her = new Promise((resolve) => { answer = resolve; });
    const { codex } = await withThread({ onApproval: () => her });

    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    expect(codex.answerTo(0)).toBeUndefined();

    answer('acceptForSession');
    await tick();
    expect(codex.answerTo(0)).toMatchObject({ result: { decision: 'acceptForSession' } });
  });

  // The measured product question, and the reason one process may carry the
  // whole fleet. A's card is never answered; B must still work.
  it('lets another thread finish while one sits on a card nobody has answered', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, approvalTimeoutMs: 15 * 60_000 });
    const seenByB = [];
    client.watch('T-A', { onApproval: () => new Promise(() => {}) });
    client.watch('T-B', { onApproval: () => 'accept', onNotification: (m) => seenByB.push(m) });

    // All three in ONE chunk on purpose. A read loop that awaits her answer
    // where it stands never reaches the second line, so this is the assertion
    // that tells "she has not answered yet" apart from "the pipe has stopped".
    codex.sayAll(
      { jsonrpc: '2.0', id: 5, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A' } },
      { jsonrpc: '2.0', id: 6, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-B' } },
      { jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-B' } },
    );
    await tick();

    expect(codex.answerTo(5)).toBeUndefined();
    expect(codex.answerTo(6)).toMatchObject({ result: { decision: 'accept' } });
    expect(seenByB).toEqual(['turn/completed']);
  });
});

/* ------------------- THE CASE THAT MUST NOT MATCH: a refusal --------------- */

describe('every way of not getting an answer is a refusal, never an accept and never silence', () => {
  const refusal = { decision: REFUSAL_DECISION };

  it('refuses when the thread raising the card is not being watched at all', async () => {
    const codex = fakeCodex();
    createCodexAppServer({ transport: codex.child });

    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-NOBODY' } });
    await tick();

    expect(codex.answerTo(0)).toEqual({ jsonrpc: '2.0', id: 0, result: refusal });
  });

  it('refuses when the thread is watched but nobody signed up to answer cards', async () => {
    const { codex } = await withThread({ onNotification: () => {} });
    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/fileChange/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    expect(codex.answerTo(0)).toEqual({ jsonrpc: '2.0', id: 0, result: refusal });
  });

  it('refuses when the handler throws', async () => {
    const { codex } = await withThread({ onApproval: () => { throw new Error('the spool is gone'); } });
    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    expect(codex.answerTo(0)).toEqual({ jsonrpc: '2.0', id: 0, result: refusal });
  });

  it('refuses when the handler rejects', async () => {
    const { codex } = await withThread({ onApproval: () => Promise.reject(new Error('she closed the app')) });
    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    expect(codex.answerTo(0)).toEqual({ jsonrpc: '2.0', id: 0, result: refusal });
  });

  // `abort` is the interesting junk. It reads like a real word and the brief
  // this file was written from listed it, but it belongs to the LEGACY
  // ReviewDecision, not to a v2 approval, so sending it is a malformed answer
  // and a malformed answer is not a refusal.
  it.each([
    ['nothing at all', undefined],
    ['a null', null],
    ['an empty string', ''],
    ['a word from the wrong protocol version', 'abort'],
    ['a word from no protocol at all', 'yes'],
    ['a boolean somebody meant as approval', true],
    ['an empty object', {}],
    ['an object that looks like a permissions grant', { permissions: {} }],
    ['a number', 1],
  ])('refuses when the handler answers with %s', async (_name, answered) => {
    const { codex } = await withThread({ onApproval: () => answered });
    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    expect(codex.answerTo(0)).toEqual({ jsonrpc: '2.0', id: 0, result: refusal });
  });

  it('offers exactly the four words the v2 schema defines, and abort is not one of them', () => {
    expect([...APPROVAL_DECISIONS].sort()).toEqual(['accept', 'acceptForSession', 'cancel', 'decline']);
    expect(APPROVAL_DECISIONS).not.toContain('abort');
    expect(REFUSAL_DECISION).toBe('decline');
  });

  // `item/permissions/requestApproval` answers with a granted profile rather
  // than a word, so the vocabulary above is junk there and the refusal has to
  // be the error frame — measured 2026-09-04 to leave the item failed and the
  // turn completing, which is a refusal rather than a hang.
  it('refuses a decision word sent to the one approval that does not take one', async () => {
    const { codex } = await withThread({ onApproval: () => 'accept' });
    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/permissions/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    expect(codex.answerTo(0).result).toBeUndefined();
    expect(codex.answerTo(0).error.code).toBeTypeOf('number');
  });

  // There are TEN server-to-client request methods in the 0.148.0 schema, not
  // the three approvals. `attestation/generate` and
  // `account/chatgptAuthTokens/refresh` do not even carry a threadId. Every one
  // of them hangs whatever raised it if it is never answered, so the ones this
  // slice has no answer for get the measured refusal rather than nothing.
  it.each([
    ['attestation/generate', {}],
    ['account/chatgptAuthTokens/refresh', {}],
    ['item/tool/requestUserInput', { threadId: 'T-A' }],
    // `mcpServer/elicitation/request` WAS ON THIS LIST AND IS NOT ANY MORE.
    // It turned out to be the channel an MCP TOOL CALL is approved through, so
    // the error frame this test pinned reached a Codex worker as "user rejected
    // MCP tool call" for every store tool it tried. It is answered in its own
    // vocabulary now, and the measurement that changed it is in
    // tests/the-store-tools-a-codex-worker-lives-on-are-not-rejected.test.mjs.
    ['item/tool/call', { threadId: 'T-A' }],
    ['execCommandApproval', { threadId: 'T-A' }],
    ['some/method/from/a/newer/codex', { threadId: 'T-A' }],
  ])('answers %s with a refusal rather than leaving it open', async (method, params) => {
    const { codex } = await withThread({ onApproval: () => 'accept' });
    codex.say({ jsonrpc: '2.0', id: 3, method, params });
    await tick();

    const answer = codex.answerTo(3);
    expect(answer, `${method} was never answered`).toBeDefined();
    expect(answer.result).toBeUndefined();
    expect(answer.error.message).toBeTruthy();
  });
});

/* -------------------------------- framing --------------------------------- */

describe('the framing survives what a real pipe does to it', () => {
  it('reassembles one message that arrived as two chunks', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const seen = [];
    client.watch('T-A', { onNotification: (m, p) => seen.push([m, p.turnId]) });

    const line = JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-A', turnId: 'A1' } }) + '\n';
    const cut = Math.floor(line.length / 2);
    codex.raw(line.slice(0, cut));
    expect(seen).toEqual([]);
    codex.raw(line.slice(cut));
    expect(seen).toEqual([['turn/completed', 'A1']]);
  });

  it('reassembles a message split in the middle of a multi-byte character', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const seen = [];
    client.watch('T-A', { onNotification: (m, p) => seen.push(p.delta) });

    const bytes = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'T-A', delta: 'né' } }) + '\n');
    const at = bytes.indexOf(Buffer.from('é')) + 1;
    codex.child.stdout.emit('data', bytes.subarray(0, at));
    codex.child.stdout.emit('data', bytes.subarray(at));
    expect(seen).toEqual(['né']);
  });

  it('skips blank lines without taking them for protocol', () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const seen = [];
    client.watch('T-A', { onNotification: (m) => seen.push(m) });

    codex.raw('\n');
    codex.raw('   \n');
    codex.say({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-A' } });

    expect(seen).toEqual(['turn/completed']);
    expect(client.isClosed()).toBe(false);
  });

  it('delivers every message in a chunk that carries several', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const seen = [];
    client.watch('T-A', { onNotification: (m) => seen.push(m) });

    codex.sayAll(
      { jsonrpc: '2.0', method: 'item/started', params: { threadId: 'T-A' } },
      { jsonrpc: '2.0', method: 'item/agentMessage/delta', params: { threadId: 'T-A', delta: 'a' } },
      { jsonrpc: '2.0', method: 'item/completed', params: { threadId: 'T-A' } },
    );
    expect(seen).toEqual(['item/started', 'item/agentMessage/delta', 'item/completed']);
  });

  // The child writes tracing to stderr — 621 and 732 bytes of it in the two
  // measured runs, ending in the line that says WHY a command was rejected. It
  // is worth keeping for a cause report and it is not the protocol: a JSON
  // object on that pipe must move nothing.
  it('keeps stderr for the cause report and never reads it as protocol', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const seen = [];
    client.watch('T-A', { onNotification: (m) => seen.push(m) });

    codex.diagnose('ERROR codex_core::tools::router: exec_command failed\n');
    codex.diagnose(JSON.stringify({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-A' } }) + '\n');

    expect(seen).toEqual([]);
    expect(client.stderr()).toContain('exec_command failed');
  });
});

/* ------------------------------- lifecycle -------------------------------- */

describe('nothing is left hanging when the process goes', () => {
  it('rejects every request that was still in flight when the child exited', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const opening = client.initialize();
    const turn = client.startTurn('T-A', { input: [{ type: 'text', text: 'hi' }] });

    codex.diagnose('error: no such model\n');
    codex.exit(1, null);

    await expect(opening).rejects.toThrow(/exited/i);
    await expect(turn).rejects.toThrow(/no such model/);
  });

  it('tells every watched thread that its process is gone, once', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const closedA = [];
    const closedB = [];
    client.watch('T-A', { onClosed: (why) => closedA.push(why) });
    client.watch('T-B', { onClosed: (why) => closedB.push(why) });

    codex.exit(null, 'SIGKILL');
    codex.exit(null, 'SIGKILL');
    await tick();

    expect(closedA).toHaveLength(1);
    expect(closedA[0]).toMatchObject({ signal: 'SIGKILL' });
    expect(closedB).toHaveLength(1);
  });

  it('settles the same way when the child never started at all', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const opening = client.initialize();
    const gone = [];
    client.watch('T-A', { onClosed: (why) => gone.push(why.reason) });

    codex.fail(Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' }));

    await expect(opening).rejects.toThrow(/ENOENT/);
    await tick();
    expect(gone).toEqual(['error']);
  });

  // A request made after the process is gone must come back, and quickly. A
  // promise nobody ever settles is the exact shape of a stranded work item.
  it('refuses a new request afterwards instead of returning a promise nobody settles', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    codex.exit(0);

    await expect(client.request('turn/start', { threadId: 'T-A' })).rejects.toThrow();
    expect(client.isClosed()).toBe(true);
  });

  // THE ASSERTION IS ATTACHED BEFORE THE CLOSE, AND THAT IS NOT A STYLE CHOICE
  // (2026-09-04). `close` marks the connection gone synchronously and then
  // rejects everything pending from a `setImmediate`, so with the
  // `expect(...).rejects` written below the `await tick` this promise spent a
  // whole turn of the event loop rejected with nobody listening -- which is
  // Node's definition of an unhandled rejection, and it was one of the seven
  // errors this branch reported where a run of `main` reports none. The
  // assertion is the same assertion; it just holds the promise from the moment
  // it exists. The app already knows this rule and writes it down at
  // `_codexServer` in main/supervisor.mjs, where the handshake is `catch`ed on
  // the spot for exactly this reason, so the code under test is not what was
  // wrong here. This was.
  it('closes on purpose: ends the pipe, kills the child, and settles what was open', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const opening = client.initialize();
    const refused = expect(opening).rejects.toThrow(/shutting down/);
    const gone = [];
    client.watch('T-A', { onClosed: (why) => gone.push(why.reason) });

    client.close(`${Name} is shutting down`);
    await tick();

    await refused;
    expect(codex.child.stdin.end).toHaveBeenCalled();
    expect(codex.child.kill).toHaveBeenCalled();
    expect(gone).toEqual(['closed']);
    expect(client.isClosed()).toBe(true);
  });

  it('carries a server error back to the caller as a rejection rather than a value', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const resume = client.resumeThread({ threadId: 'T-OLD' }, {});
    const id = codex.sent.find((m) => m.method === 'thread/resume').id;

    codex.say({ jsonrpc: '2.0', id, error: { code: -32602, message: 'no rollout found for thread id' } });
    await expect(resume).rejects.toThrow(/no rollout found/);
  });

  it('spawns through the injected function when it is given one instead of a transport', async () => {
    const codex = fakeCodex();
    const spawn = vi.fn(() => codex.child);
    const client = createCodexAppServer({ spawn });

    expect(spawn).toHaveBeenCalledTimes(1);
    const opening = client.initialize();
    codex.say({ jsonrpc: '2.0', id: codex.sent[0].id, result: {} });
    await expect(opening).resolves.toEqual({});
  });
});

/* -------------------------------- the deadline ---------------------------- */

// SHE IS NOT ALWAYS AT HER DESK, AND THE WAIT IS NOT UNBOUNDED.
//
// The first version of this client waited forever for `onApproval`, and the
// test above it asserted that as the intended behaviour, on the theory that the
// caller owns the timeout policy. That was wrong, and the precedent settles it:
// main/approval-prompt-server.mjs, the Claude Code half of exactly this
// channel, has `TIMEOUT_MS = 15 * 60_000` and DENIES on expiry, with deny as
// its default in every failure mode. A card nobody answers is not a policy
// question the caller gets to defer. It is a worker parked for the rest of the
// session, which is the thing this file is named after.
//
// Fake timers rather than a short real one, because a test that sleeps is a
// test that goes red on a loaded machine, and this suite already carries four
// of those.
describe('a card she never answers denies itself, the way the Claude Code one does', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const flush = () => vi.advanceTimersByTimeAsync(0);
  const card = (id, method = 'item/commandExecution/requestApproval') =>
    ({ jsonrpc: '2.0', id, method, params: { threadId: 'T-A' } });
  const parked = () => new Promise(() => {});

  it('holds the card open while she is still deciding', async () => {
    const { codex } = await withThread({ onApproval: parked }, { approvalTimeoutMs: 15 * 60_000 });
    codex.say(card(0));
    await flush();
    expect(codex.answerTo(0)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(14 * 60_000);
    expect(codex.answerTo(0)).toBeUndefined();
  });

  it('denies once the deadline passes, exactly once', async () => {
    const { codex } = await withThread({ onApproval: parked }, { approvalTimeoutMs: 15 * 60_000 });
    codex.say(card(0));
    await vi.advanceTimersByTimeAsync(15 * 60_000);

    expect(codex.answerTo(0)).toEqual({ jsonrpc: '2.0', id: 0, result: { decision: REFUSAL_DECISION } });
    expect(codex.answersTo(0)).toHaveLength(1);
  });

  it('denies a timed-out permissions card in the shape that method takes', async () => {
    const { codex } = await withThread({ onApproval: parked }, { approvalTimeoutMs: 1000 });
    codex.say(card(0, 'item/permissions/requestApproval'));
    await vi.advanceTimersByTimeAsync(1000);

    expect(codex.answerTo(0).result).toBeUndefined();
    expect(codex.answerTo(0).error.code).toBeTypeOf('number');
  });

  // THE ONE THAT MATTERS. She comes back to her desk and clicks Approve on a
  // card that timed out twenty minutes ago. The turn has already been told no
  // and has moved on; saying yes now is an approval nobody is waiting for, and
  // a second answer to one request id is a protocol violation on top of it.
  it('ignores her answer when it arrives after the deadline already denied', async () => {
    let her;
    const { codex } = await withThread(
      { onApproval: () => new Promise((resolve) => { her = resolve; }) },
      { approvalTimeoutMs: 1000 },
    );
    codex.say(card(0));
    await vi.advanceTimersByTimeAsync(1000);
    expect(codex.answerTo(0)).toMatchObject({ result: { decision: REFUSAL_DECISION } });

    her('accept');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(codex.answersTo(0)).toHaveLength(1);
    expect(codex.answersTo(0)[0].result.decision).toBe(REFUSAL_DECISION);
  });

  it('drops the deadline when she answers in time, and never sends a second answer', async () => {
    const { codex } = await withThread({ onApproval: () => 'accept' }, { approvalTimeoutMs: 1000 });
    codex.say(card(0));
    await flush();
    expect(codex.answerTo(0)).toMatchObject({ result: { decision: 'accept' } });

    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(codex.answersTo(0)).toHaveLength(1);
  });

  // A refusal that is already certain does not wait out the clock. There is
  // nobody to ask, so the turn hears no now rather than in fifteen minutes.
  it('refuses at once when there is nobody to ask, rather than sitting on the card', async () => {
    const { codex } = await withThread({}, { approvalTimeoutMs: 15 * 60_000 });
    codex.say(card(0));
    await flush();
    expect(codex.answerTo(0)).toMatchObject({ result: { decision: REFUSAL_DECISION } });
  });
});

/* ------------------- a refusal that cannot be written ---------------------- */

// SILENCE IS THE ONE OUTCOME THAT MUST BE IMPOSSIBLE.
//
// Every refusal above is only a refusal if the bytes actually leave. A write
// that fails and is ignored produces the exact state the deny-by-default rule
// exists to prevent: the founder said no, we believe we said no, and the turn
// heard nothing. There is no way to answer a request over a pipe that is gone,
// so the honest move is to stop pretending the connection works: settle
// everything, tell every thread, and take the child down so the supervisor sees
// a dead worker instead of a hung one.
describe('a refusal that cannot be written takes the connection down with it', () => {
  const card = (id = 0) => ({ jsonrpc: '2.0', id, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A' } });

  it('treats a write that throws where it stands as a broken connection', async () => {
    const gone = [];
    const { codex, client } = await withThread({ onApproval: () => 'accept', onClosed: (why) => gone.push(why.reason) });

    codex.breakStdin('throw');
    codex.say(card());
    await tick();

    expect(client.isClosed()).toBe(true);
    expect(gone).toEqual(['write']);
    expect(codex.child.kill).toHaveBeenCalled();
  });

  // The nastier one: the write is accepted and fails later, in its callback.
  // Without a callback there is nothing to notice, which is why the client
  // passes one rather than trusting the return value.
  it('treats a write that fails afterwards, in its callback, the same way', async () => {
    const gone = [];
    const { codex, client } = await withThread({ onApproval: () => 'accept', onClosed: (why) => gone.push(why.reason) });

    codex.breakStdin('callback');
    codex.say(card());
    await tick();

    expect(client.isClosed()).toBe(true);
    expect(gone).toEqual(['write']);
  });

  it('treats an error raised on the pipe itself as a broken connection', async () => {
    const gone = [];
    const { codex, client } = await withThread({ onClosed: (why) => gone.push(why.reason) });

    codex.child.stdin.emit('error', new Error('EPIPE'));
    await tick();

    expect(client.isClosed()).toBe(true);
    expect(gone).toEqual(['error']);
  });

  it('rejects whatever was in flight when the write failed, rather than leaving it', async () => {
    const { codex, client } = await withThread({ onApproval: () => 'accept' });
    const turn = client.startTurn('T-A', { input: [] });

    codex.breakStdin('throw');
    codex.say(card());

    await expect(turn).rejects.toThrow(/write|pipe/i);
  });
});

/* ------------------ a frame we cannot read might have been a card ---------- */

// stdout IS the protocol: the child's tracing goes to stderr, measured, and the
// live run read zero unreadable lines. So a line on stdout that will not parse
// is not noise to be stepped over. It is a frame whose id has just been lost,
// and if that frame was `item/commandExecution/requestApproval` then the turn
// which raised it waits forever and nothing will ever answer it. There is no
// way to tell whether it was, which is exactly why tolerating it is not safe.
// Fatal, loudly, so that every thread hears about it.
describe('a frame that will not parse is corruption, not noise', () => {
  it('settles instead of reading on when a line is not JSON', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const gone = [];
    const seen = [];
    client.watch('T-A', { onNotification: (m) => seen.push(m), onClosed: (why) => gone.push(why.reason) });

    codex.raw('{"jsonrpc":"2.0","method":"turn/started",\n');
    codex.say({ jsonrpc: '2.0', method: 'turn/completed', params: { threadId: 'T-A' } });
    await tick();

    expect(client.isClosed()).toBe(true);
    expect(gone).toEqual(['protocol']);
    expect(seen).toEqual([]);
    expect(codex.child.kill).toHaveBeenCalled();
  });

  it('settles on a frame that is JSON but is not a message', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const gone = [];
    client.watch('T-A', { onClosed: (why) => gone.push(why.reason) });

    codex.raw('42\n');
    await tick();

    expect(gone).toEqual(['protocol']);
  });

  it('rejects an in-flight request with a cause that names the corruption', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const opening = client.initialize();

    codex.raw('not json at all\n');
    await expect(opening).rejects.toThrow(/could not be read|protocol/i);
  });

  // An approval outstanding when the pipe goes bad can never be answered. The
  // thread has to hear that, because a supervisor told nothing goes on
  // believing a card is still in front of her.
  it('tells a thread that was waiting on a card that its connection is gone', async () => {
    const gone = [];
    const { codex, client } = await withThread({ onApproval: () => new Promise(() => {}), onClosed: (why) => gone.push(why) });

    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    expect(client.stats().approvals).toBe(1);

    codex.raw('}}}}\n');
    await tick();

    expect(gone).toHaveLength(1);
    expect(gone[0].reason).toBe('protocol');
    expect(client.stats().approvals).toBe(0);
  });

  it('settles rather than buffering forever when a line never ends', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, maxFrameLength: 128 });
    const gone = [];
    client.watch('T-A', { onClosed: (why) => gone.push(why.reason) });

    codex.raw('{"jsonrpc":"2.0","params":"' + 'x'.repeat(400));
    await tick();

    expect(client.isClosed()).toBe(true);
    expect(gone).toEqual(['protocol']);
  });

  // A real `turn/diff/updated` carries a whole git-format diff of the turn, so
  // the cap has to be big enough not to call an ordinary one corruption.
  it('does not mistake a large but complete frame for a runaway one', () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child, maxFrameLength: 8192 });
    const seen = [];
    client.watch('T-A', { onNotification: (m) => seen.push(m) });

    codex.say({ jsonrpc: '2.0', method: 'turn/diff/updated', params: { threadId: 'T-A', diff: 'd'.repeat(4000) } });

    expect(seen).toEqual(['turn/diff/updated']);
    expect(client.isClosed()).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH. stderr is where the child writes tracing, and
  // tracing is not protocol however badly formed it is. Garbage there must not
  // cost the founder a fleet.
  it('never treats anything on stderr as corruption, however unreadable', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const gone = [];
    client.watch('T-A', { onClosed: (why) => gone.push(why.reason) });

    codex.diagnose('}}}} not json at all\n');
    codex.diagnose(' binary rubbish\n');
    await tick();

    expect(client.isClosed()).toBe(false);
    expect(gone).toEqual([]);
    expect(client.stderr()).toContain('binary rubbish');
  });
});

/* --------------------------- the rest of the handshake --------------------- */

describe('the handshake is finished, not just started', () => {
  // `initialized` is the ONLY client notification in the 0.148.0 schema, and
  // the documented lifecycle is initialize, its response, then initialized,
  // before anything else. 0.148 tolerates its absence; a later one need not.
  it('sends initialized after the initialize answer, never before it', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const opening = client.initialize();

    expect(codex.sent.map((m) => m.method)).toEqual(['initialize']);

    codex.say({ jsonrpc: '2.0', id: codex.sent[0].id, result: { userAgent: 'codex/0.148.0' } });
    await opening;

    expect(codex.sent.map((m) => m.method)).toEqual(['initialize', 'initialized']);
    expect(codex.sent[1].id).toBeUndefined();
  });

  it('does not announce itself ready when the server refused the handshake', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const opening = client.initialize();

    codex.say({ jsonrpc: '2.0', id: codex.sent[0].id, error: { code: -32600, message: 'unsupported client' } });
    await expect(opening).rejects.toThrow(/unsupported client/);

    expect(codex.sent.map((m) => m.method)).toEqual(['initialize']);
  });
});

/* --------------------------- nothing is left holding on -------------------- */

describe('a gone process leaves nothing registered behind it', () => {
  it('forgets its threads, so a dead client stops retaining them', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    client.watch('T-A', {});
    client.watch('T-B', {});
    expect(client.stats().threads).toBe(2);

    codex.exit(0);
    await tick();

    expect(client.stats().threads).toBe(0);
  });

  it('drops the deadline of a card that can now never be answered', async () => {
    const { codex, client } = await withThread({ onApproval: () => new Promise(() => {}) });
    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/commandExecution/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    expect(client.stats().approvals).toBe(1);

    client.close('done');
    await tick();

    expect(client.stats().approvals).toBe(0);
  });

  // A resume the server refused never became a thread, so leaving its handlers
  // installed means the next line carrying that id is delivered to a listener
  // for a session that does not exist.
  it('stops watching a thread whose resume was refused', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const resume = client.resumeThread({ threadId: 'T-OLD' }, { onNotification: () => {} });
    expect(client.stats().threads).toBe(1);

    const id = codex.sent.find((m) => m.method === 'thread/resume').id;
    codex.say({ jsonrpc: '2.0', id, error: { code: -32602, message: 'no rollout found for thread id' } });
    await expect(resume).rejects.toThrow(/no rollout/);

    expect(client.stats().threads).toBe(0);
  });

  it('keeps watching a thread whose resume the server accepted', async () => {
    const codex = fakeCodex();
    const client = createCodexAppServer({ transport: codex.child });
    const resume = client.resumeThread({ threadId: 'T-OLD' }, { onNotification: () => {} });
    const id = codex.sent.find((m) => m.method === 'thread/resume').id;

    codex.say({ jsonrpc: '2.0', id, result: { thread: { id: 'T-OLD' } } });
    await resume;

    expect(client.stats().threads).toBe(1);
  });
});

/* ------------------- a grant is rebuilt, never forwarded ------------------- */

// `item/permissions/requestApproval` is the one server request whose answer is
// a DOCUMENT rather than a word, and a document that widens a sandbox is the
// last thing in this file that should be taken on trust from a caller. So the
// answer is validated field by field and then BUILT FRESH: nothing the handler
// returned reaches the wire by reference. That is not pedantry. An object with
// a `toJSON`, or with a getter, is checked as one value and serialised as
// another, and the value that reaches Codex is the second one.
describe('a permissions grant is checked and rebuilt before it is sent', () => {
  const answerFor = async (answered) => {
    const { codex } = await withThread({ onApproval: () => answered });
    codex.say({ jsonrpc: '2.0', id: 0, method: 'item/permissions/requestApproval', params: { threadId: 'T-A' } });
    await tick();
    return codex.answerTo(0);
  };

  it('sends a grant it recognises, field by field', async () => {
    const answer = await answerFor({
      permissions: { network: { enabled: true }, fileSystem: { read: ['/tmp/a'], write: ['/tmp/b'] } },
      scope: 'session',
    });
    expect(answer).toEqual({
      jsonrpc: '2.0',
      id: 0,
      result: {
        permissions: { fileSystem: { read: ['/tmp/a'], write: ['/tmp/b'] }, network: { enabled: true } },
        scope: 'session',
      },
    });
  });

  it('defaults the scope to the narrower of the two when the handler leaves it out', async () => {
    const answer = await answerFor({ permissions: { network: { enabled: false } } });
    expect(answer.result.scope).toBe('turn');
  });

  it.each([
    ['an empty profile, which grants nothing and is therefore not a grant', { permissions: {} }],
    ['a profile that is not an object at all', { permissions: 'everything' }],
    ['a null profile', { permissions: null }],
    ['a profile that is an array', { permissions: [] }],
    ['a scope that is neither of the two', { permissions: { network: { enabled: true } }, scope: 'forever' }],
    ['a nested profile of the wrong type', { permissions: { network: 'on' } }],
    ['an enabled flag that is not a boolean', { permissions: { network: { enabled: 'yes' } } }],
    ['read paths that are not strings', { permissions: { fileSystem: { read: [{}] } } }],
    ['an empty path string', { permissions: { fileSystem: { write: [''] } } }],
    ['a key this slice has never measured', { permissions: { fileSystem: { entries: [] } } }],
    ['a top-level key that is not part of the response', { permissions: { network: { enabled: true } }, sudo: true }],
    ['a strictAutoReview that is not a boolean', { permissions: { network: { enabled: true } }, strictAutoReview: 1 }],
    ['an array wearing a grant as a property', Object.assign([], { permissions: { network: { enabled: true } } })],
  ])('refuses %s', async (_name, answered) => {
    const answer = await answerFor(answered);
    expect(answer.result).toBeUndefined();
    expect(answer.error.code).toBeTypeOf('number');
  });

  it('refuses a grant that lives on the prototype rather than on the object', async () => {
    const answer = await answerFor(Object.create({ permissions: { network: { enabled: true } } }));
    expect(answer.result).toBeUndefined();
  });

  // The check-then-serialise hole, closed. Both toJSON hooks would fire during
  // JSON.stringify and hand Codex something nobody validated; neither can,
  // because the object that gets serialised is one this file built.
  it('refuses an answer carrying its own toJSON, at either level', async () => {
    const outer = await answerFor({
      permissions: { network: { enabled: false } },
      toJSON() { return { permissions: { fileSystem: { write: ['/'] } } }; },
    });
    expect(outer.result).toBeUndefined();

    const inner = await answerFor({ permissions: { network: { enabled: false, toJSON: () => ({ enabled: true }) } } });
    expect(inner.result).toBeUndefined();
  });

  // THE ONE THAT PROVES THE REBUILD. A toJSON on the PROTOTYPE is invisible to
  // an own-key check, so this grant validates cleanly -- and would then be
  // serialised by whatever toJSON returns, handing Codex a profile nobody
  // checked. It cannot, because the object that gets serialised is one this
  // file built out of values it read itself.
  it('never lets a toJSON on the prototype rewrite a grant that already passed', async () => {
    class Grant {
      constructor() { this.permissions = { network: { enabled: false } }; }
      toJSON() { return { permissions: { fileSystem: { write: ['/'] } }, scope: 'session' }; }
    }
    const answer = await answerFor(new Grant());
    expect(answer.result).toEqual({ permissions: { network: { enabled: false } }, scope: 'turn' });
  });

  it('sends what a getter said the first time it was asked, not the second', async () => {
    let asked = 0;
    const answered = {
      permissions: {
        get network() { asked += 1; return { enabled: asked === 1 }; },
      },
    };
    const answer = await answerFor(answered);
    expect(answer.result.permissions.network).toEqual({ enabled: true });
  });
});
