/**
 * ONE TRANSPORT FOR EVERY AGENT THAT SPEAKS THE AGENT CLIENT PROTOCOL.
 *
 * Grok (`grok agent stdio`), pi, Gemini CLI and Hermes (`hermes acp`) all speak
 * it, so this file is what a user of ours asked for when they wrote
 * github.com/savannahfeder/agentbox/issues/21: one engine instead of one
 * adapter per tool. ACP is JSON-RPC 2.0 over stdio, one object per line, and
 * the reason it is worth a file of its own is that permission requests are IN
 * the protocol — an approval card can carry a real approval rather than one
 * inferred from the bottom of a terminal.
 *
 * WHAT THIS FILE IS AND IS NOT. It is the wire: framing, negotiation, the
 * session calls, and the two directions of request. It holds no opinion about
 * which tool is on the other end, no card drawing, and no admission policy. A
 * tool is not offered to anyone because this file works; see docs/harnesses.md.
 *
 * THE RULES IT EXISTS TO KEEP, every one of them a lesson
 * main/codex-app-server.mjs paid for first:
 *
 * - A PERMISSION REQUEST IS ALWAYS ANSWERED. The agent is blocked on us while
 *   it waits, so a dropped answer is not a missing card, it is a task parked
 *   forever with nothing on the row. If the asker throws, or never comes back
 *   inside the deadline, the answer is a refusal rather than silence.
 * - A REFUSAL IS SPOKEN IN THE AGENT'S OWN WORDS. Option ids belong to the
 *   tool, so "deny" means finding the option whose KIND rejects. If it offered
 *   none, the answer is `cancelled`: we never invent an id, and we never
 *   silently pick `allow_always` for someone who pressed Allow once.
 * - A CANCELLED TURN ANSWERS `cancelled`, which the protocol requires, so a
 *   card nobody pressed cannot land as an approval after the fact. And a
 *   request is answered ONCE.
 * - A DOOR WE NEVER OPENED IS REFUSED OUT LOUD. We advertise no filesystem and
 *   no terminal, so `fs/*` and `terminal/*` get a method-not-found error.
 *   Going quiet on a JSON-RPC request is the same hang in the other direction.
 * - READING NEVER STOPS WHILE A QUESTION WAITS, because the agent may still be
 *   streaming, and because its other sessions must not be held up by this one.
 */
import { StringDecoder } from 'node:string_decoder';

// The version this client negotiates. ACP numbers its protocol, and an agent
// that answers with another one has told us something we must not paper over.
export const ACP_PROTOCOL_VERSION = 1;

// What we lend the agent. Nothing: it has its own filesystem and its own
// terminal, and anything advertised here is a door we then have to police.
export const CLIENT_CAPABILITIES = Object.freeze({
  fs: Object.freeze({ readTextFile: false, writeTextFile: false }),
  terminal: false,
});

// The four kinds the protocol defines for a permission option. The ids beside
// them are the tool's own; only the kind is portable.
export const PERMISSION_KINDS = Object.freeze(['allow_once', 'allow_always', 'reject_once', 'reject_always']);
const REJECTIONS = Object.freeze(['reject_once', 'reject_always']);

// How long a question may stand before it is refused on the person's behalf.
// Matches the Codex spool, because it is the same person and the same patience.
export const PERMISSION_TIMEOUT_MS = 15 * 60_000;
export const REQUEST_TIMEOUT_MS = 2 * 60_000;
// A line that never ends is not a message, it is a leak.
export const MAX_FRAME_LENGTH = 16 * 1024 * 1024;

/**
 * THE OPTION THAT MEANS NO, out of the ones this agent actually offered.
 *
 * `reject_once` before `reject_always`, because refusing one operation is the
 * smaller claim and the only one a single card can honestly make: remembering
 * a refusal forever is a different decision that nobody pressed. Null when the
 * agent offered no refusal at all, which is answered by cancelling the turn.
 */
export function rejectionOption(options = []) {
  for (const kind of REJECTIONS) {
    const found = options.find(option => option?.kind === kind);
    if (found?.optionId) return found.optionId;
  }
  return null;
}

/** Whether an id the asker chose is one the agent really put on the table. */
export function offeredOption(options = [], optionId) {
  return options.some(option => option?.optionId === optionId) ? optionId : null;
}

export function createAcpClient({
  transport = null,
  spawn = null,
  clientInfo = { name: 'agentbox', version: '1.0.0' },
  onNotification = null,
  onPermission = null,
  permissionTimeoutMs = PERMISSION_TIMEOUT_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  maxFrameLength = MAX_FRAME_LENGTH,
  stderrLimit = 64 * 1024,
} = {}) {
  const child = transport ?? spawn?.();
  if (!child) throw Error('createAcpClient needs a transport or a spawn that makes one');

  const pending = new Map();      // our request id -> { resolve, reject, timer, method }
  const permissions = new Map();  // their request id -> { sessionId, options, answer }
  const decoder = new StringDecoder('utf8');
  let nextId = 1;
  let buffer = '';
  let stderrText = '';
  let gone = null;                // null while live; the reason once not
  let negotiated = null;          // what initialize came back with

  /* ------------------------------- writing -------------------------------- */

  function write(message) {
    if (gone) return false;
    const line = `${JSON.stringify(message)}\n`;
    try {
      // A write that is accepted and then fails reports it in the callback,
      // and that is the one that matters: a refusal that was "written" and
      // never arrived cannot be told apart from an approval.
      child.stdin.write(line, error => { if (error) close(`Write failed: ${error.message}`); });
    } catch (error) {
      close(`Write failed: ${error.message}`);
      return false;
    }
    return true;
  }

  function request(method, params) {
    if (gone) return Promise.reject(Error(gone));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`${method} did not answer within ${requestTimeoutMs}ms`));
      }, requestTimeoutMs);
      timer.unref?.();
      pending.set(id, { resolve, reject, timer, method });
      if (!write({ jsonrpc: '2.0', id, method, params })) {
        clearTimeout(timer);
        pending.delete(id);
        reject(Error(gone ?? 'The agent connection is gone'));
      }
    });
  }

  const notify = (method, params) => write({ jsonrpc: '2.0', method, params });

  /* ------------------------------ permissions ------------------------------ */

  /**
   * Answer one permission request, once.
   *
   * `optionId` when the person chose one of the offered options; null for
   * `cancelled`, which is what a cancelled turn and an agent that offered no
   * refusal both come to. The entry is dropped before the write, so a late
   * answer from a card, a deadline and a cancellation racing each other still
   * only ever put one response on the wire.
   */
  function settlePermission(id, optionId) {
    const entry = permissions.get(id);
    if (!entry) return false;
    permissions.delete(id);
    clearTimeout(entry.timer);
    const outcome = optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' };
    write({ jsonrpc: '2.0', id, result: { outcome } });
    return true;
  }

  function askPermission(id, params) {
    const options = Array.isArray(params?.options) ? params.options : [];
    const deny = () => settlePermission(id, rejectionOption(options));
    const timer = setTimeout(deny, permissionTimeoutMs);
    timer.unref?.();
    permissions.set(id, { sessionId: params?.sessionId ?? null, options, timer });
    if (!onPermission) return deny();
    // The asker may answer whenever: the reading loop is not waiting on it.
    (async () => onPermission({ requestId: id, ...params }))()
      .then(chosen => settlePermission(id, offeredOption(options, chosen)))
      .catch(() => deny());
    return true;
  }

  /* ------------------------------- reading -------------------------------- */

  function handle(message) {
    if (message.id != null && (message.result !== undefined || message.error !== undefined)) {
      const waiting = pending.get(message.id);
      if (!waiting) return;                       // a response to something we gave up on
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error) waiting.reject(Error(`${waiting.method}: ${message.error.message ?? 'failed'}`));
      else waiting.resolve(message.result);
      return;
    }
    if (message.id != null && message.method) {
      if (message.method === 'session/request_permission') return void askPermission(message.id, message.params);
      // Everything else is a capability we did not advertise. Say so.
      write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `${message.method} is not supported by this client` } });
      return;
    }
    if (message.method) onNotification?.(message.method, message.params ?? {});
  }

  function absorb(chunk) {
    if (gone) return;
    buffer += decoder.write(chunk);
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      let message = null;
      try { message = JSON.parse(line); } catch { continue; } // a line we cannot read is not a reason to die
      if (message && typeof message === 'object') handle(message);
    }
    if (buffer.length > maxFrameLength) close(`A frame longer than ${maxFrameLength} bytes was too long to be a message`);
  }

  function close(reason) {
    if (gone) return gone;
    gone = reason;
    // Every question still standing goes with the connection: an answer whose
    // asker has quit is worth nothing, and the agent is already gone.
    for (const id of [...permissions.keys()]) {
      const entry = permissions.get(id);
      permissions.delete(id);
      clearTimeout(entry.timer);
    }
    for (const [id, waiting] of [...pending]) {
      pending.delete(id);
      clearTimeout(waiting.timer);
      waiting.reject(Error(reason));
    }
    try { child.stdin.end(); } catch {}
    try { child.kill?.(); } catch {}
    return gone;
  }

  child.stdout?.on('data', absorb);
  child.stdout?.on('end', () => close(gone ?? 'The agent closed its output'));
  child.stderr?.on('data', chunk => {
    if (stderrText.length < stderrLimit) stderrText += chunk.toString().slice(0, stderrLimit - stderrText.length);
  });
  child.on?.('error', error => close(`The agent could not be run: ${error.message}`));
  child.on?.('exit', code => close(gone ?? `The agent exited with code ${code}`));

  /* -------------------------------- the API -------------------------------- */

  return {
    async initialize() {
      negotiated = await request('initialize', {
        protocolVersion: ACP_PROTOCOL_VERSION,
        clientCapabilities: { fs: { ...CLIENT_CAPABILITIES.fs }, terminal: CLIENT_CAPABILITIES.terminal },
        clientInfo,
      });
      return negotiated;
    },
    /**
     * WHAT THE AGENT SAID IT CAN DO, and nothing we assumed. Speaking ACP does
     * not make a tool resumable: `loadSession` is optional in the protocol, so
     * a tool that cannot do it must be read as cannot rather than as untested.
     */
    can(capability) {
      const agent = negotiated?.agentCapabilities ?? {};
      if (capability === 'image' || capability === 'audio' || capability === 'embeddedContext') {
        return agent.promptCapabilities?.[capability] === true;
      }
      return agent[capability] === true;
    },
    authMethods: () => negotiated?.authMethods ?? [],
    authenticate: methodId => request('authenticate', { methodId }),
    newSession: ({ cwd, mcpServers = [], additionalDirectories }) =>
      request('session/new', { cwd, mcpServers, ...(additionalDirectories ? { additionalDirectories } : {}) }),
    loadSession({ sessionId, cwd, mcpServers = [] }) {
      // Refused before anything reaches the wire, so a thread cannot be
      // silently restarted as an empty conversation on a tool that cannot
      // resume. The caller's job is then to say so on the row.
      if (!this.can('loadSession')) return Promise.reject(Error('This agent cannot resume a session, so there is no thread to load'));
      return request('session/load', { sessionId, cwd, mcpServers });
    },
    prompt: ({ sessionId, text, blocks = null }) =>
      request('session/prompt', { sessionId, prompt: blocks ?? [{ type: 'text', text }] }),
    /**
     * Stop the turn, and answer what it was parked on. The protocol says a
     * cancelled turn MUST be answered `cancelled`, and this is the only place
     * that is true of, so it happens here rather than at a call site.
     */
    cancel(sessionId) {
      for (const [id, entry] of [...permissions]) {
        if (!sessionId || entry.sessionId === sessionId) settlePermission(id, null);
      }
      return notify('session/cancel', { sessionId });
    },
    /** An answer from a card. False when the question is no longer standing. */
    answerPermission: (requestId, optionId) => settlePermission(requestId, optionId),
    openPermissions: () => permissions.size,
    closed: () => gone,
    close,
    diagnostics: () => stderrText,
  };
}
