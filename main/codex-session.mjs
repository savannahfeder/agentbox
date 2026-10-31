// One Codex work item, shaped like a child process.
//
// A Codex worker is a thread inside one shared `codex app-server`, not a process
// of its own. The supervisor uses five things on a worker's child:
// `once('spawn')`, `stdout.on('data')`, `stderr.on('data')`, `on('exit')` and
// `kill`. This module is a facade over one thread that provides them.
//
// It emits `event(method, params)` instead of faking JSON lines on stdout, so
// the field-name differences between app-server and `codex exec` stay visible.
// The supervisor swaps its readers per session (`readersFor` in
// main/supervisor.mjs).
//
// stderr is real. The supervisor classifies a dead run from its stderr lines
// (`troubleCause`), and Codex's own refusal wording is what lets it say why.
//
// The exit sets `signal` on our own kill, because `settleDelivery` reads it to
// keep a kill from spending a delivery attempt. It also carries a third
// argument a real ChildProcess never sends: `{ transportFault: true }` when the
// shared app-server died under this thread. See `onClosed` below.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Name } from '../shared/product-name.mjs';
import { codexPosture } from '../shared/codex-modes.mjs';

/**
 * What a worker thread may do. The sandbox is the wall; the approval policy
 * only decides who gets interrupted.
 *
 * `workspace-write` lets a worker write in its own folder and nowhere else,
 * with no network (`network_access` defaults to false). The sandbox refuses
 * anything else on its own, without a card. `on-request` is what the Codex app
 * runs: work inside the sandbox without asking, and ask only to get out.
 * `untrusted` asked about ordinary commands and contained nothing more.
 *
 * The sandbox refusing is only half of it: the model then asks to be let out,
 * and who answers that ask is `approvalsReviewer`, not this policy. See
 * `workerThreadParams`, which names it on every start.
 *
 * When a file-change approval reaches the person, its request carries no path
 * or diff. main/codex-approvals.mjs reads `item/started` for the same itemId.
 */
export const WORKER_APPROVAL_POLICY = 'on-request';
export const WORKER_SANDBOX = 'workspace-write';

/**
 * How long a worker waits for its store server before giving up on the run.
 * Codex retries a server that fails to start, and this leaves room for the retry.
 */
export const MCP_READY_MS = 30_000;

/**
 * The `mcp_servers` override for a worker: every server in the user's Codex
 * config switched off by name, plus the store server.
 *
 * Codex merges this onto the user's config, so an empty table switches nothing
 * off and each server has to be named with `enabled: false`. Only names that
 * exist may be used: an `enabled: false` entry with no server under it makes
 * `thread/start` refuse with "invalid transport". That is why the names are
 * read at every start, and why Codex's built-in `codex_apps` is not named here
 * (`features.apps` in `workerThreadParams` turns it off).
 *
 * The store server is written last, so it wins over a server of the user's
 * with the same name.
 */
export function mcpIsolation(names = [], storeServer = null) {
  // Null prototype, because a server may be named `__proto__`. On a plain
  // object that key hits the prototype setter, is never serialised, and the
  // server would stay on.
  const mcp_servers = Object.create(null);
  for (const name of names) {
    if (typeof name === 'string' && name) mcp_servers[name] = { enabled: false };
  }
  if (storeServer?.name && storeServer.command) {
    const entry = { command: storeServer.command, env: storeServer.env ?? {} };
    // Agentbox's own launcher has no args, but a server whose args are dropped
    // starts and never completes its handshake, so pass them when given.
    if (Array.isArray(storeServer.args) && storeServer.args.length) entry.args = [...storeServer.args];
    mcp_servers[storeServer.name] = entry;
  }
  return mcp_servers;
}

/**
 * Marks the thread's folder untrusted to Codex, so a `.codex/config.toml` inside
 * it cannot add MCP servers.
 *
 * That file is a config layer of its own. `config/read` does not return its
 * servers, and naming one with `enabled: false` makes `thread/start` refuse.
 * Without this, a cloned repository can plant a command that Codex launches
 * outside the sandbox and the approval path. A per-thread `trust_level` of
 * "untrusted" stops it, wins over a "trusted" entry in the home config, and
 * works even when the `.codex` folder sits above the cwd. It also stops
 * `thread/start` from writing a "trusted" entry for the cwd into the user's own
 * Codex config.
 *
 * A cwd that is not a non-empty string gives `{}`, because Codex refuses a
 * table with an empty key.
 */
export function projectIsolation(cwd) {
  // Null prototype for the reason `mcpIsolation` gives: a path can be `__proto__`.
  const projects = Object.create(null);
  if (typeof cwd === 'string' && cwd) projects[cwd] = { trust_level: 'untrusted' };
  return projects;
}

/**
 * The server names in a `config/read` result.
 *
 * No servers at all (no `mcp_servers`, null, or an empty table) gives `[]`.
 * Any shape we cannot read is a THROW rather than a guess, because `[]` would
 * build an empty override that switches nothing off and the worker would start
 * every server the user has. `createCodexWorker` catches the throw and ends the
 * worker with the message on stderr.
 */
export function mcpServerNames(configRead) {
  const cannot = () => {
    throw new Error('could not read which MCP servers to switch off for this worker, so it is not starting rather than running every server the founder has');
  };
  if (!plainObject(configRead) || !plainObject(configRead.config)) cannot();
  const servers = configRead.config.mcp_servers;
  if (servers === undefined || servers === null) return [];
  if (!plainObject(servers)) cannot();
  return Object.keys(servers);
}

const plainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The `thread/start` params for one worker.
 *
 * `ephemeral: false` is set here on purpose: `thread/resume` on an ephemeral
 * thread fails with "no rollout found", and every reply is a resume.
 *
 * The isolation has three parts. `mcp_servers` switches off the user's
 * servers, `projects` blocks the folder's own config layer (see
 * `projectIsolation`), and `features.apps: false` turns off Codex's connector
 * to the apps linked to the user's ChatGPT account, which cannot be named in
 * `mcp_servers`. (`config.apps` is not that switch; Codex rejects a boolean
 * there.) The `apps` flag was only checked against Codex's own feature list
 * while signed out, so `createCodexWorker` also reports any server that starts
 * unasked (`sayUnasked`).
 */
export function workerThreadParams({ cwd, model = null, instructions = null, mcpServers = [], storeServer = null, mode = null, reviewer = null } = {}) {
  const posture = codexPosture(mode, { reviewer });
  const params = {
    cwd,
    ephemeral: false,
    approvalPolicy: posture.approvalPolicy,
    sandbox: posture.sandbox,
    // Omission inherits the account's reviewer, so every mode names its own.
    approvalsReviewer: posture.approvalsReviewer,
    config: {
      mcp_servers: mcpIsolation(mcpServers, storeServer),
      projects: projectIsolation(cwd),
      // Plugins can contribute MCP servers outside config.mcp_servers.
      // Keep this worker on the same explicit integration boundary.
      features: { apps: false, plugins: false, remote_plugin: false },
    },
  };
  if (model) params.model = model;
  // Standing instructions go in this engine's equivalent of
  // `--append-system-prompt`, not in the prompt.
  if (instructions) params.developerInstructions = instructions;
  return params;
}

/**
 * The `thread/resume` params. They carry the whole start table again, because
 * a resumed thread does not remember its overrides: resumed with only
 * `{threadId}`, the user's servers start and the store server is missing.
 * `ephemeral` is dropped because ThreadResumeParams does not take it.
 */
export function resumeThreadParams(threadId, params = {}) {
  const { ephemeral, ...rest } = params ?? {};
  return { threadId, ...rest };
}

/**
 * Where Codex put one session's transcript, or null.
 *
 * Codex writes `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl`, with
 * the id inside the filename, and there can be thousands. So the walk goes
 * newest first and gives up after `days` day folders; the only caller checks
 * that a session still exists before resuming it. The whole filename must
 * match, because a substring match could resume the wrong conversation.
 */
export function codexTranscriptFile(sessionId, { home = path.join(os.homedir(), '.codex'), days = 60 } = {}) {
  if (!sessionId || typeof sessionId !== 'string') return null;
  const wanted = new RegExp(`^rollout-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-${escapeForRegExp(sessionId)}\\.jsonl$`);
  const root = path.join(home, 'sessions');
  let looked = 0;
  for (const year of numericDesc(root)) {
    for (const month of numericDesc(path.join(root, year))) {
      for (const day of numericDesc(path.join(root, year, month))) {
        if (looked >= days) return null;
        looked += 1;
        const dir = path.join(root, year, month, day);
        let names = [];
        try { names = fs.readdirSync(dir); } catch { names = []; }
        const hit = names.find((name) => wanted.test(name));
        if (hit) return path.join(dir, hit);
      }
    }
  }
  return null;
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Newest first, numeric names only, so a stray entry cannot stop or reorder
// the walk.
function numericDesc(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => /^\d+$/.test(n)).sort((a, b) => Number(b) - Number(a));
}

/**
 * One work item's thread, shaped like a child process.
 *
 * `server` is a main/codex-app-server.mjs client shared by every worker.
 * `ready` is the handshake (`initialize` must land before `thread/start`),
 * awaited here so the supervisor can start a worker with one synchronous call,
 * like `spawn`.
 *
 * 'spawn' fires once the thread exists and the store server
 * (`requireMcpServer`) has reported ready. A store server that fails to start
 * does not stop `thread/start` or the turn; Codex only sends a notification.
 * So the turn waits for `ready`, and if the deadline passes the run ends with
 * the reason on stderr. Codex retries a failed server, so one `failed` is not
 * the end, but its words are kept for that reason. With no store server
 * configured, `requireMcpServer` is null and nothing waits.
 */
export function createCodexWorker({
  server,
  ready = Promise.resolve(),
  threadParams = {},
  turnParams = {},
  resumeThreadId = null,
  onApproval = null,
  requireMcpServer = null,
  mcpReadyMs = MCP_READY_MS,
} = {}) {
  if (!server) throw new Error('createCodexWorker needs a codex app-server client');

  const worker = new EventEmitter();
  const stderr = new EventEmitter();
  worker.stderr = stderr;
  worker.threadId = resumeThreadId ?? null;
  worker.turnId = null;

  let ended = false;
  worker.steer = async (text, pictures = []) => {
    if (ended || !worker.threadId || !worker.turnId) throw Error('The turn is not running. Send again when the conversation is ready.');
    const expected=worker.turnId;
    const result=await server.steerTurn(worker.threadId,expected,text,pictures);
    if(result?.turnId!==expected)throw Error('The provider did not confirm the active turn.');
    return result;
  };

  const say = (text) => {
    const line = String(text ?? '').trim();
    if (line) stderr.emit('data', line);
  };

  // The store can report `ready` more than once, so the wait settles once.
  // On a start, the watch goes on in `startThread`'s result hook, which catches
  // a startup notification sent right behind the response; one sent before it
  // would be dropped. A resumed thread that is already loaded does not repeat
  // its startup notifications, so a resume also asks for the store's current
  // status.
  let storeIsUp = !requireMcpServer;
  let storeTrouble = '';
  const waiting = [];

  /**
   * Says on stderr, once per server, when a server starts on this thread that
   * Agentbox did not put there. The isolation rests on Codex behaviour that can
   * change between versions, so the result is checked. `failed` launched
   * nothing, so only `starting` and `ready` count.
   *
   * `troubleCause` matches "untrusted" and "connection", so the message must
   * contain neither. Pinned by
   * tests/a-codex-worker-does-not-reach-her-connected-apps.test.mjs.
   */
  const spoken = new Set();
  const sayUnasked = (params) => {
    const name = typeof params?.name === 'string' ? params.name : '';
    if (!name || name === requireMcpServer) return;
    if (params.status !== 'starting' && params.status !== 'ready') return;
    if (spoken.has(name)) return;
    spoken.add(name);
    say(`${Name} did not put the MCP server "${name}" on this run and it started anyway; whatever it offers is outside the command sandbox and outside the approval path.`);
  };

  const readStoreStatus = (params) => {
    sayUnasked(params);
    if (!requireMcpServer || params?.name !== requireMcpServer) return;
    if (params.status === 'ready') {
      storeIsUp = true;
      for (const wake of waiting.splice(0)) wake(true);
      return;
    }
    if (params.status !== 'failed' && params.status !== 'cancelled') return;
    storeTrouble = String(params.error ?? '').trim() || `it ${params.status}`;
  };

  const storeReady = () => {
    if (storeIsUp) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (up) => { if (settled) return; settled = true; clearTimeout(timer); resolve(up); };
      const timer = setTimeout(() => done(false), mcpReadyMs);
      timer?.unref?.();
      waiting.push(done);
      if (resumeThreadId) {
        const checkExistingStore = async () => {
          let cursor;
          const seen = new Set();
          do {
            if (ended || settled || storeIsUp) return;
            const inventory = await server.request('mcpServerStatus/list', {
              threadId: worker.threadId,
              serverName: requireMcpServer,
              detail: 'toolsAndAuthOnly',
              ...(cursor ? { cursor } : {}),
            });
            if (ended || settled || storeIsUp) return;
            const store = inventory?.data?.find(s => s.name === requireMcpServer);
            // Newer Codex reports connection state. Older versions only offer
            // discovered tools; a configured name alone is never proof.
            if (store?.runtimeStatus === 'connected'
              || (store && store.runtimeStatus == null && Object.keys(store.tools ?? {}).length > 0)) {
              readStoreStatus({ name: requireMcpServer, status: 'ready' });
              return;
            }
            if (store?.runtimeStatus) storeTrouble = `its connection is ${store.runtimeStatus}`;
            cursor = inventory?.nextCursor;
            if (cursor && seen.has(cursor)) throw new Error('store inventory repeated its pagination cursor');
            if (cursor) seen.add(cursor);
          } while (cursor);
        };
        // The existing deadline still owns the wait, even if this RPC hangs.
        // A startup notification can also settle it while inventory is read.
        checkExistingStore().catch(err => {
          if (!ended && !settled && !storeIsUp) storeTrouble = err?.message ?? String(err);
        });
      }
    });
  };

  /**
   * The only ending this worker has. It releases the thread's watch, so later
   * lines for that id do not reach a dead session or keep the client alive.
   */
  const end = (code, signal = null, how = null) => {
    if (ended) return;
    ended = true;
    for (const wake of waiting.splice(0)) wake(false);
    if (worker.threadId) { try { server.unwatch(worker.threadId); } catch { /* already gone */ } }
    worker.emit('exit', code, signal, how);
  };

  const handlers = {
    onNotification: (method, params) => {
      // `turn/started` can arrive before the `turn/start` response resolves,
      // and `turn/interrupt` needs the turn id, so take it from the earlier one.
      const id = params?.turn?.id ?? params?.turnId;
      if (typeof id === 'string' && id) worker.turnId = id;

      if (method === 'mcpServer/startupStatus/updated') readStoreStatus(params);

      worker.emit('event', method, params);

      if (method !== 'turn/completed' && method !== 'turn/failed') return;
      // The 0.148.0 schema reports failure as `turn/completed` with status
      // "failed" and has no `turn/failed`, but handling it costs nothing.
      const status = typeof params?.turn?.status === 'string'
        ? params.turn.status
        : (method === 'turn/failed' ? 'failed' : 'completed');
      if (status === 'inProgress') return;
      if (status !== 'completed') say(troubleText(params?.turn));
      end(status === 'completed' ? 0 : 1, null);
    },
    // The shared app-server died under this thread (a crash, a broken pipe, an
    // unreadable frame, or Agentbox closed it). That is not this item's fault,
    // and it reaches every live thread at once. `transportFault` lets
    // `settleDelivery` spare the delivery attempt, while `noteExitForBackoff`
    // still counts the failure against the Codex account. A fake signal would
    // skip that count. `gone.stderr` is the app-server's tracing tail, where
    // Codex's refusal wording appears; it goes last because the account books
    // read the last line for a cause.
    onClosed: (gone) => {
      say(gone?.why);
      say(gone?.stderr);
      end(1, null, { transportFault: true });
    },
  };
  // Only when there is someone to ask. With no handler, the transport refuses
  // every server request at once.
  if (typeof onApproval === 'function') handlers.onApproval = onApproval;

  ready
    // `threadParams` may be a function of what `ready` resolves to, because
    // the servers to switch off are read from the app-server before the start.
    .then((settled) => {
      // Check for a kill before every request, so a worker killed during the
      // handshake starts no thread and no MCP servers.
      if (ended) return null;
      const params = typeof threadParams === 'function' ? threadParams(settled) : threadParams;
      // A resume needs the same params as a start. See `resumeThreadParams`.
      return resumeThreadId
        ? server.resumeThread(resumeThreadParams(resumeThreadId, params), handlers).then(() => ({ threadId: resumeThreadId }))
        : server.startThread(params, handlers);
    })
    .then((started) => {
      if (!started) return null;
      const threadId = started.threadId ?? resumeThreadId ?? null;
      // A thread that arrives after a kill still needs its watch released,
      // because `end` ran before there was a thread id to release.
      if (ended) {
        if (threadId) { try { server.unwatch(threadId); } catch { /* already gone */ } }
        return null;
      }
      worker.threadId = threadId;
      if (!worker.threadId) throw new Error('codex app-server started a thread with no id');
      return storeReady();
    })
    .then((up) => {
      if (ended) return null;
      if (!up) {
        // Stop before the turn rather than let a worker do the job with no way
        // to write it to the store.
        say(`the ${requireMcpServer} store server did not start (${storeTrouble || 'it never reported ready'}), so this run is stopping rather than working with no way to write to her store`);
        end(1, null);
        return null;
      }
      worker.emit('spawn');
      return turnParams.reviewTarget
        ? server.request('review/start', { threadId: worker.threadId, target: turnParams.reviewTarget, delivery: 'inline' })
        : server.startTurn(worker.threadId, turnParams);
    })
    .then((accepted) => {
      const id = accepted?.turn?.id;
      if (typeof id === 'string' && id) worker.turnId = id;
    })
    .catch((err) => {
      // No thread, a refused resume, or a refused turn. The message includes the
      // app-server's stderr tail. No signal: a kill has already ended this
      // worker, and `end` fires only once.
      say(err?.message ?? String(err));
      end(1, null);
    });

  /**
   * Our kill. `turn/interrupt` needs both the thread and turn ids, so before
   * the turn id arrives this only releases the thread. The exit fires at once
   * rather than waiting for the server, which may be shutting down too.
   *
   * `signal` is set only here. `settleDelivery` reads it so our kill does not
   * spend a delivery attempt, and a later "interrupted" turn cannot undo that
   * because `end` fires once.
   */
  worker.kill = () => {
    if (ended) return false;
    if (worker.threadId && worker.turnId) {
      try { server.interruptTurn(worker.threadId, worker.turnId)?.catch?.(() => {}); } catch { /* dying anyway */ }
    }
    // The Claude CLI traps SIGTERM and exits 143, so both engines report a kill
    // the same way.
    end(143, 'SIGTERM');
    return true;
  };

  return worker;
}

/**
 * A WORKER THAT WAS NEVER STARTED, AND SAYS WHY, in the shape `spawnWorker`
 * holds: the sentence on stderr and an exit of 1, both on a later tick,
 * because the supervisor attaches its listeners after this returns (the same
 * reason `codexThreadParamsFor` throws inside the worker's chain rather than
 * speaking early). No 'spawn' is emitted, so no delivery mark is written and
 * no one-off permission mode is spent.
 */
export function refusedCodexWorker(sentence) {
  const worker = new EventEmitter();
  worker.stderr = new EventEmitter();
  worker.threadId = null;
  worker.turnId = null;
  worker.steer = async () => { throw Error('The turn is not running.'); };
  let ended = false;
  worker.kill = () => false;
  setImmediate(() => {
    if (ended) return;
    ended = true;
    worker.stderr.emit('data', sentence);
    worker.emit('exit', 1, null);
  });
  return worker;
}

/**
 * Why a turn did not finish: the server's message, with the `codexErrorInfo`
 * code in front when it is a plain string.
 *
 * shared/spawn-trouble.mjs classifies on that code (for example
 * `usageLimitExceeded` or `unauthorized`), which cannot drift the way prose
 * can; a signed-out run carries raw HTTP text, not Codex's words. The code goes
 * first because `noteExitForBackoff` cuts the last stderr line to 300
 * characters. Object variants and `other` are left out.
 */
function troubleText(turn) {
  const why = String(turn?.error?.message ?? '').trim();
  const more = String(turn?.error?.additionalDetails ?? '').trim();
  const info = turn?.error?.codexErrorInfo;
  const code = typeof info === 'string' && info && info !== 'other' ? info : '';
  const head = why || `the turn ${turn?.status ?? 'did not finish'}`;
  const said = code ? `${code}: ${head}` : head;
  return more ? `${said}\n${more}` : said;
}
