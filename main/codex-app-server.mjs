// The transport to `codex app-server`: one child process, many work items, and
// an approval that always gets an answer or takes the connection down trying.
//
// THIS IS THE PART THAT WAS NEVER SOLVED.The removed build drove `codex exec`,
// a one-shot run over a single JSON stream, and `codex exec` has no channel
// back to the caller. A Claude Code worker that wants something outside its
// grants raises a card through main/approval-prompt-server.mjs and waits in
// place; a Codex worker could not raise anything, so it either ran ungated or
// it stopped. That was the blocker, and `git show 258d71d^:main/codex.mjs` is
// worth reading for what else was tried, but ITS EVENT PARSING IS OBSOLETE and
// none of it is carried over here.
//
// `codex app-server` is the fix, verified by running it rather than by reading
// about it. It speaks newline-delimited JSON-RPC 2.0 over the child's stdio,
// and when a turn wants to run a gated command the SERVER sends US a request,
// with an id, that we must answer. That is the missing channel, and it is the
// same shape the approvals spool already has: a question, a wait, an answer.
//
// AND IT MOVES THE FAILURE SOMEWHERE NEW, WHICH IS WHAT THIS FILE IS ABOUT. A
// request with an id that nobody ever answers is not an error. It is a worker
// parked forever, with no exit code, no message and nothing on the row. CLAUDE.md
// already has that incident under another name -- "A WORKER THAT DID NOT FINISH
// DELIVERED NOTHING, HOWEVER LONG IT TOOK" -- three items stranded for two, two
// and six hours. So the posture here is copied from
// main/approval-prompt-server.mjs and not re-argued:
//
//   DENY IS THE DEFAULT IN EVERY FAILURE MODE, AND SILENCE IS NOT A REFUSAL.
//
// That sentence has three consequences, and each one cost a draft of this file.
//
// A CARD SHE NEVER ANSWERS DENIES ITSELF, AFTER FIFTEEN MINUTES. The first
// draft waited forever, on the theory that the caller owns the timeout policy.
// It does not: main/approval-prompt-server.mjs is the same channel for the same
// founder and it has `TIMEOUT_MS = 15 * 60_000` and denies on expiry. Waiting
// forever is not neutrality, it is a worker parked for the rest of the session
// because she went to lunch. The deadline is injectable so that tests do not
// sleep, and a late answer arriving after it has already denied is DROPPED --
// the turn was told no and has moved on, and a second answer to one request id
// is a protocol violation on top of an approval nobody is waiting for.
//
// A REFUSAL THAT CANNOT BE WRITTEN IS SILENCE. So a write that throws, a write
// that fails afterwards in its callback, and an error raised on the pipe itself
// are all treated as a broken connection: settle everything, tell every thread,
// take the child down. There is no way to answer a request over a dead pipe,
// and a supervisor can see a dead worker. It cannot see a hung one.
//
// A FRAME WE CANNOT READ MIGHT HAVE BEEN A CARD. stdout is the protocol here --
// the child's tracing goes to stderr, measured, and the live run read zero
// unreadable lines. A line on stdout that will not parse is therefore not noise
// to step over: it is a frame whose id has just been lost, and if it was an
// approval request then the turn that raised it waits forever. Nothing can tell
// whether it was, which is exactly why tolerating it is unsafe. Unreadable or
// unbounded input is fatal, loudly. Blank lines are framing rather than content
// and are the one thing here that may be skipped.
//
// ------------------------------------------------------------------------
// WHAT WAS MEASURED, ON THIS MAC, 2026-09-04, codex-cli 0.148.0. Some of this
// contradicts what was written down before; where it does, the machine wins.
//
// THE THREAD ID IS AT `result.thread.id`. Off a live `thread/start` response:
// `result.thread.id` was "01a068f1-be4d-7701-98e3-16137d16dcdf" and
// `result.threadId` was `undefined`. The obvious guess fails silently -- every
// thread ends up filed under the id `undefined`, which is one shared bucket --
// so it is asserted rather than trusted.
//
// SERVER REQUEST IDS START AT 0 AND ARE A SEPARATE NUMBER SPACE FROM OURS. In
// the captured session the first approval carried `id: 0` while our own
// `initialize` carried `id: 1`. A classifier written `if (msg.id)` drops the
// first approval of every session, because 0 is falsy. Everything below tests
// `!== undefined`, and the two spaces never share a map.
//
// A REFUSAL IS ACCEPTED EVEN WHEN THE SERVER DID NOT OFFER IT. The live
// approval arrived with `availableDecisions: ["accept",
// {acceptWithExecpolicyAmendment: ...}, "cancel"]` -- no "decline" in the list.
// Answering `{decision: 'decline'}` anyway worked: the item completed with
// `status: "declined"`, `serverRequest/resolved` fired, and the turn COMPLETED
// 4.0 seconds later. `availableDecisions` is a hint about which buttons a UI
// should draw, not a whitelist the answer is validated against. That is the
// measurement that makes an unconditional refusal safe, and without it the
// deny-by-default rule above would have been a guess.
//
// A JSON-RPC ERROR FRAME REFUSES TOO, MEASURED ON ONE METHOD. The same
// `item/commandExecution/requestApproval` answered with `{error: {code: -32001,
// message}}` left the item at `status: "failed"` and the turn still COMPLETED,
// 5.5 seconds later. BE PRECISE ABOUT THE SCOPE OF THAT: it was measured for
// command approval and for nothing else, so using it as the refusal for other
// server requests is a REASONED EXTENSION rather than a measured fact. It is
// the best one available -- a well-formed error is the only answer that is
// valid for a result shape nobody has measured -- but the next slice to lean on
// it for a specific method should measure that method.
//
// NO HEAD-OF-LINE BLOCKING. Proven separately: an approval on thread A that is
// deliberately never answered does not stop thread B from raising its own
// approval, having it answered, and completing its turn. That is what makes one
// process for the whole fleet safe, and it is a promise this file has to keep --
// hence the read loop below never awaits anything.
//
// `ephemeral: false` IS THE DEFAULT AND HAS TO BE. `thread/resume` fails with
// "no rollout found for thread id" on an ephemeral thread, so a thread started
// ephemerally cannot carry a continuation. the app's whole reply path is
// continuations, so the default is the one that can come back.
//
// TWO THINGS THE WRITTEN BRIEF HAD WRONG, both from the CLI's own
// `codex app-server generate-json-schema` dump:
//
//   `abort` IS NOT A v2 APPROVAL DECISION. CommandExecutionApprovalDecision and
//   FileChangeApprovalDecision are accept / acceptForSession / decline / cancel,
//   plus two amendment OBJECTS (`acceptWithExecpolicyAmendment` and
//   `applyNetworkPolicyAmendment`, command approvals only). `abort` belongs to
//   the LEGACY `ReviewDecision` used by `execCommandApproval` and
//   `applyPatchApproval`. Sending it to a v2 approval is a malformed answer, so
//   it is treated as junk here.
//
//   `item/permissions/requestApproval` TAKES NO `decision` AT ALL. Its response
//   is PermissionsRequestApprovalResponse: `{ permissions, scope?,
//   strictAutoReview? }`, a granted profile rather than a word.
//
// AND THERE ARE TEN SERVER-TO-CLIENT REQUEST METHODS IN THE STABLE SCHEMA, NOT
// THREE. Beyond the three approvals: item/tool/requestUserInput, item/tool/call,
// mcpServer/elicitation/request, account/chatgptAuthTokens/refresh,
// attestation/generate, and the legacy applyPatchApproval and
// execCommandApproval, both of which are still in the stable dump. The
// experimental schema adds more (currentTime/read), so "ten" is a fact about
// the stable dump on 0.148.0 and not a ceiling. Every one of them hangs
// whatever raised it if it is left open, so ANY server request this file does
// not know how to answer gets the error frame. That is the honest answer and
// not a placeholder: refusing `account/chatgptAuthTokens/refresh` may well cost
// a long-lived process its token refresh, and the slice that wants that
// capability is the slice that gets to measure the shape and answer it
// properly. A refusal is a bug somebody can see; silence is not.
//
// ------------------------------------------------------------------------
// SCOPE. Transport and routing, nothing else. Nothing here turns an event into
// Agentbox's work lines or its trace, nothing here touches the approvals spool,
// and nothing here decides which engine a row runs on.
//
// IT IS NO LONGER INERT, AND THIS HEADER SAID IT WAS FOR A WHOLE SLICE AFTER IT
// HAD STOPPED BEING ONE. Three files depend on it now: main/supervisor.mjs spawns the
// process and holds the client, main/codex-session.mjs is the per-work-item
// facade over one thread of it, and main/codex-approvals.mjs is the handler on
// the other end of `onApproval` that this file was written around. The three
// sentences above still hold; the fourth was a fact about a Tuesday.
//
// The transport is injected so this whole file can be tested without `codex`
// being installed. That is not tidiness. Four tests in this suite already fail
// on any machine whose clock or installs differ from hers, and a transport test
// that shelled out to the real binary would be the fifth.

import { StringDecoder } from 'node:string_decoder';
import { NAME, Name, nameSlug } from '../shared/product-name.mjs';

/**
 * How this client names itself to the server. It comes back on `initialize` as
 * part of `userAgent` -- measured live as "astral/0.148.0 (Mac OS 15.6.1;
 * arm64) (astral; 1.0.0)", which is the app's name of the day rather than a
 * constant -- and it is what appears in Codex's own session records, so it says
 * this app rather than the name of whatever spike wrote it. READ, NEVER TYPED:
 * that measured line is why, it is a record written months ago under a name the
 * app no longer has.
 */
export const CLIENT_INFO = Object.freeze({ name: nameSlug, title: NAME, version: '1.0.0' });

/**
 * The four SCALAR answers this callback supports, read off the CLI's schema
 * dump rather than remembered.
 *
 * Not the whole v2 vocabulary: command approvals also accept two structured
 * amendment objects, which widen the execpolicy or pin a network rule for
 * future commands. Those are standing policy changes rather than an answer to
 * the question that was asked, they cannot be expressed as a word, and nothing
 * in Agentbox can produce one yet -- so a handler returning one is refused. That
 * is conservative in the safe direction, and it is a deliberate omission rather
 * than an oversight.
 *
 * `abort` is NOT here and reads like it should be. It is a legacy word.
 */
export const APPROVAL_DECISIONS = Object.freeze(['accept', 'acceptForSession', 'decline', 'cancel']);

/**
 * The three words an MCP elicitation takes, which is a SHORTER list than the
 * one above and not a subset by accident: `McpServerElicitationRequestResponse`
 * has no `acceptForSession`, so an approval that lasts a session cannot be
 * expressed here at all. Read off the CLI's schema dump 2026-09-22.
 */
export const ELICITATION_ACTIONS = Object.freeze(['accept', 'decline', 'cancel']);

/**
 * The refusal. `decline` and not `cancel`, deliberately: measured, `decline`
 * leaves the item `declined` and lets the agent carry on and try something
 * else, while `cancel` also interrupts the whole turn. A failure to reach the
 * founder should cost the command, not the work item.
 */
export const REFUSAL_DECISION = 'decline';

/** Her deadline, matching main/approval-prompt-server.mjs exactly. */
export const APPROVAL_TIMEOUT_MS = 15 * 60_000;

/**
 * How long ONE FRAME may be before the connection is called corrupt. Generous,
 * because `turn/diff/updated` carries a git-format diff of the whole turn and a
 * big refactor is a big diff; bounded, because an unterminated line is
 * otherwise a memory leak that ends in a dead app.
 *
 * IT APPLIES TO A TERMINATED LINE AS WELL AS TO A RUNAWAY ONE, and it did not.
 * The check ran on the residual buffer AFTER every newline-delimited frame had
 * been taken out of it, so it could only ever see a line with no end. A single
 * complete ten-megabyte line -- which is precisely what an enormous
 * `turn/diff/updated` is -- went straight past the bound to `JSON.parse` and on
 * to the handlers. Both halves are checked now: `read` refuses an oversized
 * line before it parses it, and the residual check still catches the one that
 * never terminates.
 */
export const MAX_FRAME_LENGTH = 16 * 1024 * 1024;

/**
 * HOW LONG AN ORDINARY REQUEST MAY GO UNANSWERED.
 *
 * The approval had a deadline from the first draft of this file, for the reason
 * written at the top: a request with an id that nobody answers is a worker
 * parked forever with no exit code and nothing on the row. EVERY REQUEST HAS
 * THAT SHAPE, and the ones that get a worker as far as raising an approval --
 * `initialize`, `config/read`, `thread/start`, `thread/resume`, `turn/start` --
 * had nothing to settle them at all. A live app-server that accepts the bytes
 * and never answers holds a work item and a fleet slot for the rest of the
 * session; the pipe is not broken, so nothing else here fires either.
 *
 * Two minutes, which is far above anything measured (a handshake and a
 * `config/read` answer in milliseconds, and `turn/start` resolves when the turn
 * is ACCEPTED rather than when it finishes) and far below a founder noticing a
 * row is stuck. The turn itself is not on this clock; only the request that
 * starts it is.
 *
 * ONE REQUEST GOES, NOT THE CONNECTION. A rejection frees the row and the slot,
 * which is the whole failure being closed, and the worker's own chain turns it
 * into a run that says why on stderr. Taking the shared process down over one
 * slow answer would charge every other thread for it.
 */
export const REQUEST_TIMEOUT_MS = 2 * 60_000;

/**
 * The server requests we know how to answer, and in which of the three shapes.
 *
 * `mcpServer/elicitation/request` IS AN APPROVAL AND NOT ONLY A FORM, which is
 * the correction this table carries. It is how Codex asks whether an MCP TOOL
 * CALL may run. Measured on this Mac 2026-09-22 against codex-cli 0.153.4, a
 * thread started exactly as `workerThreadParams` starts one, with one stdio MCP
 * server on it and the model asked to call its single tool:
 *
 *   item/started  mcpToolCall server=probe tool=ping status=inProgress
 *   REQUEST       mcpServer/elicitation/request
 *                 { serverName: "probe", mode: "form",
 *                   message: 'Allow the probe MCP server to run tool "ping"?',
 *                   _meta: { codex_approval_kind: "mcp_tool_call",
 *                            persist: ["session","always"],
 *                            tool_description: "...", tool_params: {} } }
 *
 * The method was not on this table, so it took the error frame below, and the
 * measured consequence was the whole integration rather than one lost call:
 *
 *   answered with the error frame  -> item/completed mcpToolCall status=failed,
 *                                     error "user rejected MCP tool call"
 *   answered `{action:"accept"}`   -> the tool ran and returned its result
 *
 * EVERY STORE TOOL A CODEX WORKER HAS IS AN MCP TOOL CALL, so the first row is
 * a worker that cannot claim, checkpoint or finish anything, and the only words
 * anybody sees are that sentence: a rejection nobody made, over a card that was
 * never drawn. `McpServerElicitationRequestResponse` is `{ action: "accept" |
 * "decline" | "cancel", content?, _meta? }`, which is a third answer shape, and
 * its vocabulary happens to be three of the words the decision shape speaks.
 */
const APPROVAL_SHAPE = new Map([
  ['item/commandExecution/requestApproval', 'decision'],
  ['item/fileChange/requestApproval', 'decision'],
  ['item/permissions/requestApproval', 'grant'],
  ['mcpServer/elicitation/request', 'elicitation'],
]);

const REFUSAL_ERROR = Object.freeze({
  code: -32001,
  message: `${Name} did not approve this request. Continue with what you are already allowed to do, and leave the rest for the founder to look at.`,
});

const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (keys, allowed) => keys.every((k) => allowed.includes(k));

/**
 * One long-lived `codex app-server`.
 *
 * Give it either a `transport` (anything child-process-shaped: `stdin.write`,
 * `stdin.end`, `stdout.on('data')`, an optional `stderr`, `on('exit')`,
 * `on('error')`, `kill`) or a `spawn` function that returns one. Production
 * passes a real child; the tests pass a notepad.
 *
 * `onNotification` catches every line that belongs to no watched thread: a
 * thread we have not been told about yet, and the notifications that carry no
 * thread at all. There are eighteen of those in the 0.148.0 stable schema --
 * account, config, process, filesystem and remote-control news, among them
 * `account/rateLimits/updated` and `remoteControl/status/changed` -- so this is
 * an ordinary channel rather than an error path.
 */
export function createCodexAppServer({
  transport = null,
  spawn = null,
  clientInfo = CLIENT_INFO,
  onNotification = null,
  approvalTimeoutMs = APPROVAL_TIMEOUT_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  maxFrameLength = MAX_FRAME_LENGTH,
  stderrLimit = 64 * 1024,
} = {}) {
  const child = transport ?? spawn?.();
  if (!child) throw new Error('createCodexAppServer needs a transport or a spawn that makes one');

  const pending = new Map();    // OUR request id -> { resolve, reject, method, onResult }
  const threads = new Map();    // thread id -> handlers
  const openCards = new Map();  // THEIR request id -> the deadline timer
  const decoder = new StringDecoder('utf8');
  let nextId = 1;
  let buffer = '';
  let stderrText = '';
  let gone = null;              // null while live; the closing reason once not
  let drained = false;          // stdout has ended, so the diagnostics are complete
  let finished = false;

  /* ------------------------------- writing -------------------------------- */

  /**
   * Put one message on the wire, or take the connection down.
   *
   * Three ways a real pipe fails and all three end here: it throws where it
   * stands, it accepts the bytes and reports the failure in the write callback,
   * or it raises `error` later. The callback is the one that is easy to miss
   * and the one that matters most, because a refusal that was "written" and
   * never arrived is indistinguishable from an approval.
   *
   * A `false` return is NOT a failure: that is ordinary backpressure and the
   * bytes are still queued. Only the callback and the throw are failures.
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
      // The deadline is armed BEFORE the write, so a request that is accepted
      // and then never answered cannot outlive it. See REQUEST_TIMEOUT_MS.
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

  /* ------------------------------- reading -------------------------------- */

  // The decoder rather than `chunk.toString`: a chunk boundary can fall in the
  // middle of a UTF-8 sequence, and agent messages stream through here one
  // delta at a time in whatever language the repo is written in.
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

  // The child writes tracing here, and the last line of it is usually the
  // reason something failed -- that is where "Rejected" showed up in the
  // measurements above. Worth keeping for a cause report, and NEVER worth
  // parsing: nothing on this pipe is protocol, however badly formed it looks,
  // so garbage here must not cost the founder a fleet. Only the tail is kept,
  // because a long run's tracing is unbounded and the useful part is always at
  // the end.
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
    // THE BOUND APPLIES TO A LINE THAT ENDED, TOO. The residual check below the
    // split can only ever see a frame with no newline in it, so a single
    // complete frame of any size walked past it into `JSON.parse`. See
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

    // Three kinds, and the test is `!== undefined` in both places because the
    // server's ids start at zero.
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
    // Synchronously, INSIDE the read loop, before the next line of this chunk
    // is looked at. A promise resolves on a microtask and the rest of the chunk
    // is read on this one, so registering the thread's handlers off the
    // resolved promise would miss any notification the server packed in behind
    // the response -- which for `thread/start` is the thread's own first event.
    try { waiting.onResult?.(msg.result); } catch { /* the caller's bookkeeping, not ours */ }
    waiting.resolve(msg.result);
  }

  function notification(msg) {
    const id = threadOf(msg.params);
    const handlers = id === null ? null : threads.get(id);
    if (handlers?.onNotification) call(() => handlers.onNotification(msg.method, msg.params));
    else call(() => onNotification?.(msg.method, msg.params));
  }

  /* ------------------------------- approvals ------------------------------ */

  /**
   * Answer a server request. NEVER awaits: the handler's promise is left to
   * settle on its own, because the founder may take fifteen minutes and every
   * other thread on this process reads through the same loop.
   */
  function serverRequest(msg) {
    // A SECOND REQUEST ON AN ID THAT IS STILL OPEN IS NOT A SECOND CARD.
    //
    // `openCards` is keyed by the server's request id, so a duplicate used to
    // overwrite the entry without clearing the timer it replaced. The first
    // card's deadline then went on running and denied the SECOND card at its
    // own hour, and the first card's real answer -- her click -- landed on a map
    // entry that had already been swapped and was dropped.
    //
    // There is no way to answer two open requests that share one id: whichever
    // we write, the server matches it to one of them and the other hangs. That
    // is the same unresolvable input as an unreadable frame, so it gets the same
    // answer this file gives every one of those. Loud, and with `finish` denying
    // every card that was open, so nothing is left waiting on a decision it can
    // never receive.
    if (openCards.has(msg.id)) {
      return fail('protocol', { note: `codex app-server raised a second request on id ${msg.id} while the first was still open, and one answer cannot settle two` });
    }
    const shape = APPROVAL_SHAPE.get(msg.method);
    if (!shape) return write({ jsonrpc: '2.0', id: msg.id, error: { ...REFUSAL_ERROR } });

    const id = threadOf(msg.params);
    const handler = id === null ? null : threads.get(id)?.onApproval;
    // A refusal that is already certain does not wait out the clock: there is
    // nobody to ask, so the turn hears no now rather than in fifteen minutes.
    if (typeof handler !== 'function') return write({ jsonrpc: '2.0', id: msg.id, ...refusal(shape) });

    openCard(msg.id, shape);
    Promise.resolve()
      .then(() => handler(msg.method, msg.params))
      .then((answered) => answerCard(msg.id, translate(shape, answered) ?? refusal(shape)))
      .catch(() => answerCard(msg.id, refusal(shape)));
  }

  /** Start her deadline. Expiry denies, once, and closes the card. */
  function openCard(id, shape) {
    const timer = setTimeout(() => {
      if (openCards.delete(id)) write({ jsonrpc: '2.0', id, ...refusal(shape) });
    }, approvalTimeoutMs);
    timer?.unref?.();
    openCards.set(id, timer);
  }

  /**
   * The one answer this card will ever get.
   *
   * A card the deadline has already denied is CLOSED, so her late click lands
   * here and is dropped rather than approving something the turn stopped
   * waiting for twenty minutes ago. Same for a card whose connection died.
   */
  function answerCard(id, body) {
    if (!openCards.has(id)) return;
    clearTimeout(openCards.get(id));
    openCards.delete(id);
    write({ jsonrpc: '2.0', id, ...body });
  }

  // A REFUSAL IS SAID IN THE VOCABULARY THE METHOD TAKES, which for an
  // elicitation is `decline` rather than an error frame. Both reach the model
  // as a no; the difference is that a declined elicitation leaves the tool call
  // declined and the turn running, while the error frame is a protocol failure
  // on a request the server expected an answer to.
  const refusal = (shape) => {
    if (shape === 'decision') return { result: { decision: REFUSAL_DECISION } };
    if (shape === 'elicitation') return { result: { action: REFUSAL_DECISION } };
    return { error: { ...REFUSAL_ERROR } };
  };

  /**
   * The handler's answer, in the shape the method actually takes, or null if it
   * is not one this protocol version can express. Null is the whole
   * deny-by-default rule: everything unrecognised lands there.
   *
   * The elicitation's three actions are `accept`, `decline` and `cancel`, read
   * off `McpServerElicitationRequestResponse` in the CLI's own schema dump on
   * 2026-09-22. `acceptForSession` is NOT among them, so a handler that answers
   * a tool call with the word a command approval uses is refused rather than
   * quietly turned into a yes. `content` is omitted: the accept this app sends
   * answers a permission question whose `requestedSchema` has no properties,
   * and a form that really does ask for typed input is not something Agentbox can
   * fill in for her.
   */
  function translate(shape, answered) {
    if (shape === 'decision') {
      return APPROVAL_DECISIONS.includes(answered) ? { result: { decision: answered } } : null;
    }
    if (shape === 'elicitation') {
      return ELICITATION_ACTIONS.includes(answered) ? { result: { action: answered } } : null;
    }
    const grant = grantFrom(answered);
    return grant ? { result: grant } : null;
  }

  /**
   * A permissions grant, CHECKED FIELD BY FIELD AND THEN BUILT FRESH.
   *
   * This is the one server request whose answer is a document rather than a
   * word, and the document widens a sandbox. Forwarding the caller's object
   * would mean checking one value and sending another: a `toJSON`, or a getter,
   * runs again inside JSON.stringify, and what reaches Codex is whatever it
   * returns the second time. So nothing the handler returned reaches the wire
   * by reference, every value is read exactly once, and an unknown key anywhere
   * -- on the object, in the profile, or in either area -- is a refusal rather
   * than something to pass along. Inherited properties do not count, so a grant
   * on a prototype is not a grant.
   *
   * The `entries` form of the filesystem profile is deliberately NOT accepted.
   * Its shape has three nested variants, none of them measured, and a grant
   * this file cannot check is a grant it has no business sending. The slice
   * that needs it measures it.
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
    // `turn` when nobody said, because it is the narrower of the two and a
    // grant that outlives the question it answered is not that answer.
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

  // Almost every line carries `params.threadId`. `thread/started` is the
  // exception and keeps it at `params.thread.id`, which is the thread's own
  // first event and therefore the worst one to lose.
  function threadOf(params) {
    if (!plain(params)) return null;
    if (typeof params.threadId === 'string') return params.threadId;
    if (typeof params.thread?.id === 'string') return params.thread.id;
    return null;
  }

  // A listener that throws must not take the read loop with it: one thread's
  // bad handler would otherwise stop every other thread on this process.
  function call(fn) {
    try { fn(); } catch { /* the caller's problem, and not worth the fleet */ }
  }

  /* ------------------------------ the ending ------------------------------ */

  /** Why this connection ended, in a sentence that names something actionable. */
  function cause() {
    const tail = stderrText.trim().split('\n').slice(-3).join(' ').trim();
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
   * The connection is over, whatever ended it.
   *
   * Marked SYNCHRONOUSLY, so that from this instant no further request is
   * accepted and no late approval can be written. Finished once stdout has
   * drained, so the tracing tail that explains it is complete rather than
   * whatever happened to have arrived by the moment `exit` fired -- exit
   * routinely beats the last of the pipe, and "exited with code 1" on its own
   * is not a cause anybody can act on.
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
   * Everything that was waiting finds out, once, and nothing stays registered.
   *
   * A promise nobody settles is exactly how a work item strands, so an
   * in-flight request rejects rather than staying pending, and every watched
   * thread is told rather than left listening to a dead pipe. Deadlines are
   * cancelled and registrations dropped: a card that can never be answered and
   * a thread that can never be spoken to are only holding this client alive.
   */
  function finish() {
    if (finished) return;
    finished = true;
    gone.stderr = stderrText;
    const why = cause();

    for (const timer of openCards.values()) clearTimeout(timer);
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

  /* -------------------------------- the API ------------------------------- */

  const watch = (threadId, handlers = {}) => { threads.set(threadId, handlers); return threadId; };

  return {
    /** Any client request, for the ones with no wrapper (`config/read`). */
    request: (method, params) => send(method, params),

    /**
     * The whole handshake, not half of it: the request, and then `initialized`
     * once the server has answered.
     *
     * `initialized` is the only client notification in the 0.148.0 schema and
     * the documented lifecycle puts it before any other operation. 0.148
     * tolerates its absence, which is why the first draft never noticed it was
     * missing; a later one need not. It is sent from the response hook, so it
     * can never overtake the response, and it is never sent at all if the
     * server refused the handshake.
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
     * Continue a thread we already know the id of, so the watch goes on first
     * and no event of the resumed thread can arrive unowned.
     *
     * A resume the server REFUSES never became a thread, so the watch is rolled
     * back. Left installed, it would hand every later line carrying that id to
     * a listener for a session that does not exist.
     */
    resumeThread: (params = {}, handlers = {}) => {
      const id = typeof params.threadId === 'string' ? params.threadId : null;
      if (id) watch(id, handlers);
      return send('thread/resume', params).catch((err) => {
        if (id && threads.get(id) === handlers) threads.delete(id);
        throw err;
      });
    },

    startTurn: (threadId, params = {}) => send('turn/start', { threadId, ...params }),

    /** Both ids: a turn is not identified by either one alone. */
    interruptTurn: (threadId, turnId) => send('turn/interrupt', { threadId, turnId }),
    steerTurn: (threadId, expectedTurnId, text) => send('turn/steer', {threadId, expectedTurnId, input:[{type:'text',text}]}),

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
