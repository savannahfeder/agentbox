// The transport to `codex app-server`: one child process for many work items.
// It speaks newline-delimited JSON-RPC 2.0 over stdio, and when a turn needs an
// approval the server sends us a request with an id that we must answer.
//
// main/supervisor.mjs spawns the process and holds the client,
// main/codex-session.mjs wraps one thread of it per work item, and
// main/codex-approvals.mjs is the `onApproval` handler. This file does
// transport and routing only. The transport is injected so the tests run
// without `codex` installed.
//
// Deny is the default in every failure mode, and silence is not a refusal:
// - A card waits for the person it is addressed to and is never denied on a
//   clock; main/codex-approvals.mjs holds the whole argument. It is settled by
//   their answer, by the worker that raised it stopping, or by the app closing,
//   and a late answer is dropped, because one request id cannot be answered
//   twice.
// - A write that fails, at once or in its callback, is a broken connection.
//   Every waiter is settled and the child is killed.
// - A stdout line that will not parse may have been an approval request, so it
//   is fatal. Tracing goes to stderr, and blank lines are skipped.
//
// Protocol facts, measured on codex-cli 0.148.0:
// - The thread id is at `result.thread.id`; `result.threadId` is undefined.
// - Server request ids start at 0 and are a separate number space from ours,
//   so ids are tested with `!== undefined`.
// - `decline` is accepted even when `availableDecisions` does not list it,
//   which is what makes an unconditional refusal safe.
// - An error frame also refuses a command approval. That was measured for that
//   method only; other server requests get it because it is the one answer
//   valid for any result shape.
// - An open approval on one thread does not block the others, as long as the
//   read loop never awaits.
// - `thread/resume` fails on an ephemeral thread, so `ephemeral` defaults to
//   false.
// - `abort` is a word of the legacy `ReviewDecision`, not a v2 approval
//   decision.
// - `item/permissions/requestApproval` takes a granted profile, not a decision.
// - Any server request not in APPROVAL_SHAPE gets the error frame, because one
//   left open hangs whatever raised it.

import { StringDecoder } from 'node:string_decoder';
import { NAME, Name, nameSlug } from '../shared/product-name.mjs';

/**
 * How this client names itself to the server. It appears in `userAgent` and in
 * Codex's own session records, so it comes from shared/product-name.mjs rather
 * than being typed here.
 */
export const CLIENT_INFO = Object.freeze({ name: nameSlug, title: NAME, version: '1.0.0' });

/**
 * The scalar answers a v2 approval takes, from the CLI's schema dump. Command
 * approvals also take two amendment objects, which are standing policy changes
 * rather than an answer, so a handler returning one is refused. `abort` is a
 * legacy word and is not here.
 */
export const APPROVAL_DECISIONS = Object.freeze(['accept', 'acceptForSession', 'decline', 'cancel']);

/**
 * The actions an MCP elicitation takes. `McpServerElicitationRequestResponse`
 * has no `acceptForSession`.
 */
export const ELICITATION_ACTIONS = Object.freeze(['accept', 'decline', 'cancel']);

/**
 * The refusal. `decline` lets the agent carry on and try something else, while
 * `cancel` also interrupts the whole turn.
 */
export const REFUSAL_DECISION = 'decline';

/**
 * The longest frame allowed before the connection is called corrupt. Large,
 * because `turn/diff/updated` carries the whole turn's diff. Bounded, because
 * an unterminated line would otherwise grow until the app dies. `read` checks
 * each complete line, and the data handler checks the unterminated rest.
 */
export const MAX_FRAME_LENGTH = 16 * 1024 * 1024;

/**
 * How long an ordinary request may go unanswered. A live server that accepts a
 * request and never answers would otherwise hold a work item forever, since the
 * pipe is not broken. `turn/start` resolves when the turn is accepted, so the
 * turn itself is not on this clock. A timeout rejects that one request and
 * leaves the connection up for the other threads.
 */
export const REQUEST_TIMEOUT_MS = 2 * 60_000;

/**
 * The server requests we answer, and the shape each answer takes.
 *
 * `mcpServer/elicitation/request` is how Codex asks whether an MCP tool call
 * may run (`_meta.codex_approval_kind: "mcp_tool_call"`), and every store tool
 * is one. Refused with the error frame, the call fails as "user rejected MCP
 * tool call", so it must reach the handler. Its answer is `{ action }`.
 */
const APPROVAL_SHAPE = new Map([
  ['item/commandExecution/requestApproval', 'decision'],
  ['item/fileChange/requestApproval', 'decision'],
  ['item/permissions/requestApproval', 'grant'],
  ['mcpServer/elicitation/request', 'elicitation'],
  // THE SAME TWO APPROVALS UNDER THEIR v1 NAMES (w-36c51443df). These are the
  // older spellings of the first two rows, and they used to fall through to a
  // protocol error -- so a Codex speaking v1 on any path would have had every
  // command refused rather than carded. Their answer is `{ decision:
  // ReviewDecision }` and that vocabulary is NOT the v2 one, which is why they
  // get a shape of their own rather than sharing `decision`. See
  // LEGACY_DECISIONS.
  ['execCommandApproval', 'legacy'],
  ['applyPatchApproval', 'legacy'],
]);

/**
 * THE v1 WORD FOR EACH OF OUR FOUR, read off `ExecCommandApprovalResponse.json`
 * in the 0.160.0 schema dump, 2026-10-09.
 *
 * `ReviewDecision` is `approved` | `approved_for_session` |
 * `approved_mcp_policy_amendment` | `timed_out` | `abort` as bare words, plus
 * `{denied:{rejection}}` and two amendment objects. NOTE THAT `decline` IS NOT
 * IN IT: forwarding our own v2 word would have been refused by the server, and
 * the refusal is an OBJECT here rather than a word, which is exactly the kind of
 * difference that a shared mapping hides. The amendments are left out for the
 * reason APPROVAL_DECISIONS gives: they are standing policy changes rather than
 * an answer to the question asked, and nothing here can produce one.
 */
export const LEGACY_DECISIONS = Object.freeze({
  accept: 'approved',
  acceptForSession: 'approved_for_session',
  cancel: 'abort',
  // The one place a refusal gets to say why, so it says why.
  decline: { denied: { rejection: `${Name} did not approve this. Carry on with what you are already allowed to do and leave the rest for her to look at.` } },
});

/**
 * EVERY REQUEST THE SERVER MAY SEND A CLIENT, so the list lives somewhere a
 * reader can check it against the schema rather than inferring it from which
 * branch happens to catch what.
 *
 * Read off every `method` const in `ServerRequest.json`, codex-cli 0.160.0,
 * 2026-10-09. Six raise a card (APPROVAL_SHAPE above) and four cannot be served
 * at all (CANNOT_SERVE below). A method in neither list is NEW, and `onUnknownRequest`
 * exists so that it is news rather than a silence.
 */
export const SERVER_REQUESTS = Object.freeze([
  'account/chatgptAuthTokens/refresh',
  'applyPatchApproval',
  'attestation/generate',
  'execCommandApproval',
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'item/tool/call',
  'item/tool/requestUserInput',
  'mcpServer/elicitation/request',
]);

/**
 * THE FOUR THAT ARE REFUSED ON PURPOSE, each with the reason in its own words.
 *
 * They used to share one anonymous error with the approvals, which is how
 * nobody noticed they existed. All four ask the CLIENT to do something rather
 * than asking a person to decide something, and there is no answer here to
 * invent for any of them.
 */
const CANNOT_SERVE = new Map([
  ['item/tool/call', `it asks this app to run a tool of its own, and ${Name} offers the model no such tool`],
  ['account/chatgptAuthTokens/refresh', `it asks this app to mint a fresh ChatGPT login token, which ${Name} does not hold and must not forge`],
  ['attestation/generate', `it asks this app to sign an attestation, which ${Name} cannot produce`],
  // THE ONE THAT IS A QUESTION FOR A PERSON, and the one worth coming back to.
  // Its answer is a map of question id to typed answers
  // (`ToolRequestUserInputResponse`), Agentbox has no form to put on screen, and a
  // question may be flagged `isSecret` -- so an invented answer would be worse
  // than a no. Pointing the model at its reply is the road that does reach her.
  ['item/tool/requestUserInput', `it asks a question that needs a typed answer and ${Name} has no way to put that question on screen; ask it in your reply instead, where she will read it`],
]);

const REFUSAL_ERROR = Object.freeze({
  code: -32001,
  message: `${Name} did not approve this request. Continue with what you are already allowed to do, and leave the rest for the founder to look at.`,
});

/** A refusal that names what was asked, so it is one somebody can act on. */
const cannotServe = (method, why) => Object.freeze({
  code: -32001,
  message: `${Name} cannot answer ${method}: ${why}.`,
});

const UNKNOWN_REQUEST = `${Name} does not recognise this request, so it is refused rather than guessed at`;

// Refuse in the method's own vocabulary where it has one. A declined
// elicitation leaves the turn running; the error frame is a protocol failure.
const refusal = (shape) => {
  if (shape === 'decision') return { result: { decision: REFUSAL_DECISION } };
  if (shape === 'elicitation') return { result: { action: REFUSAL_DECISION } };
  // v1 SAYS NO WITH AN OBJECT, NOT A WORD. `decline` is not in its
  // vocabulary at all, so a timed-out or unowned legacy card answered in our
  // own word would be a protocol error on a question the server is waiting on.
  if (shape === 'legacy') return { result: { decision: LEGACY_DECISIONS.decline } };
  return { error: { ...REFUSAL_ERROR } };
};

/** This client's yes to `method`, without the JSON-RPC envelope, or null for a request a yes does not answer. */
export function yesTo(method) {
  const shape = APPROVAL_SHAPE.get(method);
  if (shape === 'decision') return { result: { decision: 'accept' } };
  if (shape === 'elicitation') return { result: { action: 'accept' } };
  return null;
}

/**
 * The no this client sends `method` when nobody can be asked, without the
 * JSON-RPC envelope: for the cloud server driving a Codex run with the
 * computer shut (cloud/gateway/phone.mjs), so it refuses in these words.
 */
export function refusalTo(method) {
  const cannot = CANNOT_SERVE.get(method);
  if (cannot) return { error: cannotServe(method, cannot) };
  const shape = APPROVAL_SHAPE.get(method);
  return shape ? refusal(shape) : { error: cannotServe(method, UNKNOWN_REQUEST) };
}

const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (keys, allowed) => keys.every((k) => allowed.includes(k));

/**
 * One long-lived `codex app-server`.
 *
 * Give it either a `transport` (anything child-process-shaped: `stdin.write`,
 * `stdin.end`, `stdout.on('data')`, an optional `stderr`, `on('exit')`,
 * `on('error')`, `kill`) or a `spawn` function that returns one.
 *
 * `onNotification` gets every line for no watched thread, including the many
 * account and config notifications that carry no thread at all.
 */
export function createCodexAppServer({
  transport = null,
  spawn = null,
  clientInfo = CLIENT_INFO,
  onNotification = null,
  // A SERVER REQUEST THIS FILE HAS NEVER HEARD OF (w-36c51443df). Six known
  // methods once shared one anonymous refusal, so a NEW one would have been
  // indistinguishable from them and from nothing at all. Handed up rather than
  // logged here, because what to do with it -- a line on the row, a report --
  // belongs to the caller.
  onUnknownRequest = null,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  maxFrameLength = MAX_FRAME_LENGTH,
  stderrLimit = 64 * 1024,
} = {}) {
  const child = transport ?? spawn?.();
  if (!child) throw new Error('createCodexAppServer needs a transport or a spawn that makes one');

  const pending = new Map();    // OUR request id -> { resolve, reject, method, onResult }
  const threads = new Map();    // thread id -> handlers
  const openCards = new Set();  // THEIR request ids, each waiting on a person
  const decoder = new StringDecoder('utf8');
  let nextId = 1;
  let buffer = '';
  let stderrText = '';
  let gone = null;              // null while live; the closing reason once not
  let drained = false;          // stdout has ended, so the diagnostics are complete
  let finished = false;
  let resumeLeavesTurns = true; // false once this Codex refuses `excludeTurns`

  /**
   * Put one message on the wire, or take the connection down. A pipe can fail
   * by throwing or in the write callback (or later with `error`). The callback
   * matters most: a refusal that never arrived looks the same as no answer. A
   * `false` return is only backpressure, not a failure.
   */
  function write(msg) {
    if (gone) return false;
    let text;
    try {
      text = JSON.stringify(msg) + '\n';
    } catch (err) {
      fail('write', { error: err });
      return false;
    }
    try {
      child.stdin.write(text, (err) => { if (err) fail('write', { error: err }); });
    } catch (err) {
      fail('write', { error: err });
      return false;
    }
    return !gone;
  }

  function send(method, params, onResult) {
    if (gone) return Promise.reject(new Error(`${method}: codex app-server is no longer running (${gone.reason})`));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      // Armed before the write. See REQUEST_TIMEOUT_MS.
      const timer = setTimeout(() => {
        if (!pending.delete(id)) return;
        reject(new Error(`${method}: codex app-server accepted this request and never answered it (${Math.round(requestTimeoutMs / 1000)}s)`));
      }, requestTimeoutMs);
      timer?.unref?.();
      pending.set(id, { resolve, reject, method, onResult, timer });
      if (!write({ jsonrpc: '2.0', id, method, params })) {
        clearTimeout(timer);
        pending.delete(id);
        reject(new Error(`${method}: ${cause()}`));
      }
    });
  }

  const notify = (method) => write({ jsonrpc: '2.0', method });

  // A StringDecoder, because a chunk can end in the middle of a UTF-8 sequence.
  child.stdout.on('data', (chunk) => {
    if (gone) return;
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let at;
    while (!gone && (at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      read(line);
    }
    if (!gone && buffer.length > maxFrameLength) {
      fail('protocol', { note: `a frame passed ${maxFrameLength} characters with no end to it` });
    }
  });

  // The child's tracing. Its last lines usually say why something failed, so
  // the tail is kept for cause reports. It is not protocol and is never parsed.
  child.stderr?.on('data', (chunk) => {
    stderrText += typeof chunk === 'string' ? chunk : chunk.toString();
    if (stderrText.length > stderrLimit) stderrText = stderrText.slice(-stderrLimit);
  });

  child.on('error', (err) => fail('error', { error: err }));
  child.on('exit', (code, signal) => fail('exit', { code: code ?? null, signal: signal ?? null }));
  child.stdin?.on?.('error', (err) => fail('error', { error: err }));
  child.stdout.on?.('error', (err) => fail('error', { error: err }));
  child.stderr?.on?.('error', () => { /* tracing, not protocol */ });
  for (const event of ['end', 'close']) child.stdout.on?.(event, () => { drained = true; if (gone) finish(); });

  function read(line) {
    // The data handler's check only sees an unterminated line. See
    // MAX_FRAME_LENGTH.
    if (line.length > maxFrameLength) {
      return fail('protocol', { note: `a frame of ${line.length} characters passed the ${maxFrameLength} this connection allows` });
    }
    const text = line.trim();
    if (!text) return;                       // framing, not content

    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return fail('protocol', { note: 'a line on stdout could not be read as JSON, and it may have been an approval request' });
    }
    if (!plain(msg)) {
      return fail('protocol', { note: 'a line on stdout could not be read as a message, and it may have been an approval request' });
    }

    // `!== undefined`, because the server's ids start at zero.
    if (msg.id !== undefined && msg.method !== undefined) return serverRequest(msg);
    if (msg.id !== undefined) return response(msg);
    if (typeof msg.method === 'string') return notification(msg);
    fail('protocol', { note: 'a message on stdout was neither a request, a response nor a notification' });
  }

  function response(msg) {
    const waiting = pending.get(msg.id);
    if (!waiting) return;
    pending.delete(msg.id);
    clearTimeout(waiting.timer);
    if (msg.error) {
      waiting.reject(new Error(`codex app-server refused ${waiting.method}: ${msg.error.message ?? JSON.stringify(msg.error)}`));
      return;
    }
    // `onResult` runs before the next line is read. Registering a thread off
    // the resolved promise would miss notifications sent right behind the
    // response, such as the thread's first event.
    try { waiting.onResult?.(msg.result); } catch { /* the caller's bookkeeping, not ours */ }
    waiting.resolve(msg.result);
  }

  function notification(msg) {
    const id = threadOf(msg.params);
    const handlers = id === null ? null : threads.get(id);
    if (handlers?.onNotification) call(() => handlers.onNotification(msg.method, msg.params));
    else call(() => onNotification?.(msg.method, msg.params));
  }

  /**
   * Answer a server request. Never awaits the handler, because one card waits
   * for a person and every thread reads through this loop.
   */
  function serverRequest(msg) {
    // Two open requests on one id cannot both be answered, so treat it like an
    // unreadable frame and end the connection.
    if (openCards.has(msg.id)) {
      return fail('protocol', { note: `codex app-server raised a second request on id ${msg.id} while the first was still open, and one answer cannot settle two` });
    }
    // THREE ROADS NOW, AND A REQUEST TAKES ONE OF THEM BY DECISION (w-36c51443df).
    //
    // There used to be two: a card, or one anonymous error for everything else.
    // Six of the ten requests the schema allows took the second, with nothing
    // anywhere naming which -- so the only way to learn that
    // `account/chatgptAuthTokens/refresh` was being refused was to read the
    // schema by hand. Now a refusal says what it refused, and a method in
    // neither table is REPORTED, because a new one arriving in silence is how
    // this lasted.
    const cannot = CANNOT_SERVE.get(msg.method);
    if (cannot) return write({ jsonrpc: '2.0', id: msg.id, error: cannotServe(msg.method, cannot) });

    const shape = APPROVAL_SHAPE.get(msg.method);
    if (!shape) {
      call(() => onUnknownRequest?.(msg.method, msg.params));
      return write({ jsonrpc: '2.0', id: msg.id, error: cannotServe(msg.method, UNKNOWN_REQUEST) });
    }

    const id = threadOf(msg.params);
    const handler = id === null ? null : threads.get(id)?.onApproval;
    // Nobody to ask, so refuse now rather than at the deadline.
    if (typeof handler !== 'function') return write({ jsonrpc: '2.0', id: msg.id, ...refusal(shape) });

    openCards.add(msg.id);
    Promise.resolve()
      .then(() => handler(msg.method, msg.params))
      .then((answered) => answerCard(msg.id, translate(shape, answered) ?? refusal(shape)))
      .catch(() => answerCard(msg.id, refusal(shape)));
  }

  /**
   * The only answer a card gets. A card on a dead connection is already closed,
   * so a late answer is dropped.
   */
  function answerCard(id, body) {
    if (!openCards.delete(id)) return;
    write({ jsonrpc: '2.0', id, ...body });
  }

  /**
   * The handler's answer in the shape the method takes, or null, which means
   * refuse. An elicitation has no `acceptForSession`, so that word is refused
   * rather than turned into a yes. `content` is never sent, because Agentbox
   * only answers elicitations that ask for no input.
   */
  function translate(shape, answered) {
    if (shape === 'decision') {
      return APPROVAL_DECISIONS.includes(answered) ? { result: { decision: answered } } : null;
    }
    if (shape === 'elicitation') {
      return ELICITATION_ACTIONS.includes(answered) ? { result: { action: answered } } : null;
    }
    if (shape === 'legacy') {
      // Our word in, Codex's older word out. A word that is not one of our four
      // answers null, which lands on the deny-by-default rule exactly as it
      // does for every other shape.
      const said = Object.hasOwn(LEGACY_DECISIONS, answered) ? LEGACY_DECISIONS[answered] : null;
      return said ? { result: { decision: said } } : null;
    }
    const grant = grantFrom(answered);
    return grant ? { result: grant } : null;
  }

  /**
   * A permissions grant, checked field by field and built fresh. This answer
   * widens a sandbox, so nothing the handler returned is sent by reference: a
   * getter or `toJSON` could give JSON.stringify a different value from the one
   * checked. Any unknown key is a refusal, and inherited properties do not
   * count. The `entries` form of the filesystem profile is refused because its
   * shape is unmeasured.
   */
  function grantFrom(answered) {
    if (!plain(answered)) return null;
    const top = Object.keys(answered);
    if (!top.includes('permissions') || !only(top, ['permissions', 'scope', 'strictAutoReview'])) return null;

    const profile = answered.permissions;
    if (!plain(profile)) return null;
    const areas = Object.keys(profile);
    if (!areas.length || !only(areas, ['fileSystem', 'network'])) return null;

    const permissions = {};
    if (areas.includes('fileSystem')) {
      const asked = profile.fileSystem;
      if (!plain(asked)) return null;
      const keys = Object.keys(asked);
      if (!keys.length || !only(keys, ['read', 'write', 'globScanMaxDepth'])) return null;
      const fileSystem = {};
      for (const list of ['read', 'write']) {
        if (!keys.includes(list)) continue;
        const paths = asked[list];
        if (!Array.isArray(paths) || !paths.length) return null;
        if (!paths.every((p) => typeof p === 'string' && p.length > 0)) return null;
        fileSystem[list] = [...paths];
      }
      if (keys.includes('globScanMaxDepth')) {
        const depth = asked.globScanMaxDepth;
        if (!Number.isInteger(depth) || depth < 1) return null;
        fileSystem.globScanMaxDepth = depth;
      }
      permissions.fileSystem = fileSystem;
    }
    if (areas.includes('network')) {
      const asked = profile.network;
      if (!plain(asked)) return null;
      const keys = Object.keys(asked);
      if (keys.length !== 1 || keys[0] !== 'enabled' || typeof asked.enabled !== 'boolean') return null;
      permissions.network = { enabled: asked.enabled };
    }

    const grant = { permissions };
    // Default to `turn`, the narrower scope.
    if (top.includes('scope')) {
      if (answered.scope !== 'turn' && answered.scope !== 'session') return null;
      grant.scope = answered.scope;
    } else {
      grant.scope = 'turn';
    }
    if (top.includes('strictAutoReview')) {
      if (typeof answered.strictAutoReview !== 'boolean') return null;
      grant.strictAutoReview = answered.strictAutoReview;
    }
    return grant;
  }

  // Most lines carry `params.threadId`, but `thread/started` has
  // `params.thread.id`.
  function threadOf(params) {
    if (!plain(params)) return null;
    if (typeof params.threadId === 'string') return params.threadId;
    if (typeof params.thread?.id === 'string') return params.thread.id;
    return null;
  }

  // A listener that throws must not stop the read loop for every other thread.
  function call(fn) {
    try { fn(); } catch { /* the caller's problem, and not worth the fleet */ }
  }

  /** Why this connection ended, in a sentence that names something actionable. */
  function cause({ withTail = true } = {}) {
    const tail = withTail ? stderrText.trim().split('\n').slice(-3).join(' ').trim() : '';
    const said = tail ? `: ${tail}` : '';
    if (!gone) return `the connection to codex app-server failed on write${said}`;
    switch (gone.reason) {
      case 'write': return `the connection to codex app-server failed on write (${gone.error?.message ?? 'no detail'})${said}`;
      case 'protocol': return `the connection to codex app-server is corrupt, ${gone.note}${said}`;
      case 'error': return `codex app-server failed to run (${gone.error?.message ?? 'no detail'})${said}`;
      case 'closed': return `codex app-server was closed by ${NAME} (${gone.note})${said}`;
      default: return `codex app-server exited (code ${gone.code}, signal ${gone.signal})${said}`;
    }
  }

  /**
   * The connection is over. It is marked at once, so no further request or late
   * approval is written, and finished once stdout drains, because `exit` often
   * arrives before the last of the tracing that explains it.
   */
  function fail(reason, detail = {}) {
    if (gone) return;
    gone = { reason, code: null, signal: null, error: null, note: null, ...detail, stderr: stderrText };
    if (reason !== 'exit') stop();
    if (drained) finish();
    else if (typeof setImmediate === 'function') setImmediate(finish);
    else finish();
  }

  function stop() {
    try { child.stdin.end(); } catch { /* already gone */ }
    try { child.kill(); } catch { /* already gone */ }
  }

  /**
   * Settles everything once. Pending requests reject, watched threads get
   * `onClosed`, and every timer and registration is dropped, so no work item is
   * left waiting and nothing keeps the client alive.
   */
  function finish() {
    if (finished) return;
    finished = true;
    gone.stderr = stderrText;
    gone.why = cause({ withTail: false });
    const why = cause();

    openCards.clear();

    for (const [id, waiting] of pending) {
      pending.delete(id);
      clearTimeout(waiting.timer);
      waiting.reject(Object.assign(new Error(`${waiting.method}: ${why}`), { cause: gone }));
    }
    const listening = [...threads.values()];
    threads.clear();
    for (const handlers of listening) call(() => handlers.onClosed?.(gone));
  }

  const watch = (threadId, handlers = {}) => { threads.set(threadId, handlers); return threadId; };

  return {
    /** Any client request, for the ones with no wrapper (`config/read`). */
    request: (method, params) => send(method, params),

    /**
     * The handshake: `initialize`, then the `initialized` notification once the
     * server answers. The protocol wants it before any other call, though 0.148
     * does not enforce that. Sent from the response hook, so it cannot overtake
     * the response and is not sent if the server refuses.
     */
    initialize: () => send('initialize', { clientInfo }, () => notify('initialized')),

    /**
     * Start a thread and watch it from the instant the server names it.
     *
     * `ephemeral` defaults to false so the thread leaves a rollout on disk and
     * a later `thread/resume` can find it; pass true only for work that will
     * never be continued.
     */
    startThread: (params = {}, handlers = {}) => send(
      'thread/start',
      { ephemeral: false, ...params },
      (result) => { const id = result?.thread?.id; if (typeof id === 'string') watch(id, handlers); },
    ).then((result) => ({ threadId: result?.thread?.id ?? null, thread: result?.thread ?? null, result })),

    /**
     * Continue a known thread. The watch goes on before the request, so no
     * event of the resumed thread arrives unowned, and comes off if the server
     * refuses the resume.
     *
     * Without `excludeTurns` the answer carries every turn in one frame, and a
     * long thread passes `maxFrameLength`, which ends this connection for every
     * thread on it. Codex before 0.155 refuses the field without the
     * experimental API, so that Codex is asked again in full.
     */
    resumeThread: (params = {}, handlers = {}) => {
      const id = typeof params.threadId === 'string' ? params.threadId : null;
      if (id) watch(id, handlers);
      const lean = resumeLeavesTurns;
      return send('thread/resume', lean ? { ...params, excludeTurns: true } : params)
        .catch((err) => {
          if (!lean || !/excludeTurns/.test(err?.message ?? '')) throw err;
          resumeLeavesTurns = false;
          return send('thread/resume', params);
        })
        .catch((err) => {
          if (id && threads.get(id) === handlers) threads.delete(id);
          throw err;
        });
    },

    startTurn: (threadId, params = {}) => send('turn/start', { threadId, ...params }),

    /** Both ids: a turn is not identified by either one alone. */
    interruptTurn: (threadId, turnId) => send('turn/interrupt', { threadId, turnId }),
    steerTurn: (threadId, expectedTurnId, text, pictures = []) => send('turn/steer', {threadId, expectedTurnId, input:[{type:'text',text}, ...pictures.map((p) => ({type:'localImage', path:p}))]}),

    watch,
    unwatch: (threadId) => threads.delete(threadId),

    /** Stop on purpose. Same settling as a crash, so callers have one ending. */
    close: (note = 'no reason given') => fail('closed', { note }),

    isClosed: () => gone !== null,
    /** The tracing tail, for a cause report. Never protocol. */
    stderr: () => stderrText,
    stats: () => ({ pending: pending.size, threads: threads.size, approvals: openCards.size }),
  };
}
