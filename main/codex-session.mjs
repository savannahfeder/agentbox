// ONE CODEX WORK ITEM, SHAPED LIKE A CHILD PROCESS.
//
// Agentbox spawns one child per work item and hangs everything off it: the
// supervisor's `session.child` is a ChildProcess and every other part of
// `spawnWorker` is written against that. A Codex worker has no per-item
// process. It is ONE shared `codex app-server` plus a thread inside it, proven
// on 2026-09-04 by running several concurrently: independent thread ids,
// interleaved progress, and no head-of-line blocking when one of them parked on
// an unanswered approval.
//
// So the question this file answers is whether the supervisor has to learn
// about threads, and the measured answer is no. `session.child` is referenced
// in exactly ONE place in the whole 4,273-line supervisor
// (`session.child.kill`), and the local `child` handle inside `spawnWorker` is
// used in exactly five ways:
//
//     child.once('spawn')      child.stderr.on('data')     child.kill
//     child.stdout.on('data')  child.on('exit')
//
// That five-method contract is the entire seam, and this module is a facade
// over one thread that satisfies it. The supervisor keeps being a file about
// running sessions rather than a file about two vendors' flag names, which is
// the sentence the deleted 08-25 design used to justify the same choice.
//
// FOUR OF THE FIVE ARE REAL AND ONE IS DELIBERATELY MISSING.
//
// `stdout` IS NOT FAKED. It would be easy to re-serialise every notification
// into a JSON line so the existing readers worked untouched, and it would be
// objects -> JSONL -> objects for no gain: it would also hide the real
// camelCase/snake_case divergence between `codex app-server` and the
// `codex exec` stream the removed August build parsed, which is precisely the
// thing that must stay visible. So this facade emits `event(method, params)`
// and the supervisor swaps its three readers once per session instead of once
// per line. See `readersFor` in main/supervisor.mjs.
//
// `stderr` IS REAL, and it is why this file writes to it at all. The supervisor
// classifies a dead run by reading the `stderr:` lines off the session tail
// (`sayTheRunDied` -> `troubleCause`), and Codex's own refusal wording -- "Not
// inside a trusted directory and --skip-git-repo-check was not specified" -- is
// what makes the difference between her reading "the folder is not one Codex
// will work in" and reading the generic sentence. A failure that never reaches
// this pipe is a failure filed as 'unknown'.
//
// AND THE ONE THING THIS FILE OWES `settleDelivery`: AN ENDING THAT WAS NOT THE
// WORK ITEM'S FAULT MUST BE TELLABLE FROM ONE THAT WAS. CLAUDE.md's rule is that a session WE killed does not
// spend one of an item's three delivery attempts, "because every restart kills
// the fleet and charging that to the item is how restarts strand work". The
// supervisor's own `_kill` writes `stoppedByUs` on the session, and this facade
// ALSO sets `signal` on the exit -- both halves, deliberately, because
// `settleDelivery` reads `signal || session.stoppedByUs` and a facade that
// reported a clean `null` signal on an interrupt would be lying about the one
// fact that protects her work.
//
// THE EXIT THEREFORE CARRIES A THIRD ARGUMENT, which a real ChildProcess never
// sends and the supervisor reads as undefined for every Claude worker. It says
// one thing today: the shared app-server died under this thread. ONE process
// carries the whole Codex fleet, so a single unreadable frame reaches every live
// thread at once, and each of those threads is a work item -- ending them with a
// bare `end(1, null)` spent one of every item's three delivery attempts on a
// fault none of them caused. See `onClosed` below.

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Name } from '../shared/product-name.mjs';
import { codexPosture } from '../shared/codex-modes.mjs';

/**
 * WHAT A WORKER THREAD IS ALLOWED TO DO. The sandbox is the wall; the approval
 * policy only decides who gets interrupted.
 *
 * THIS WAS `untrusted` UNTIL 2026-09-23 AND IT MADE CODEX UNUSABLE. The founder
 * reported that Codex asked about nearly everything it wanted to run, to the
 * point that the only viable way to use it was to leave this app and drive the
 * Codex app directly (w-07f98d5a1c).
 *
 * She was right, and the note that stood here was wrong in a way worth writing
 * down because it is easy to make twice. It said the other policies "did not
 * card a command" and concluded they gated nothing. NOT CARDING AND NOT
 * STOPPING ARE DIFFERENT THINGS. Under `workspace-write` the sandbox refuses on
 * its own, silently, and a card was never what held the wall up.
 *
 * MEASURED 2026-09-23 on codex-cli 0.153.4. Both scripts are kept:
 *
 *   scripts/count-what-codex-asks.mjs -- one ordinary task: read a file, edit
 *   it, run node to check the result.
 *     untrusted    3 interruptions, task completed
 *     on-request   0 interruptions, task completed, same edit
 *
 *   scripts/can-codex-escape-on-request.mjs -- the counter-test: write to $HOME
 *   and curl the open internet.
 *     untrusted    2 cards, both denied, nothing escaped
 *     on-request   0 cards, AND NOTHING ESCAPED EITHER. The sandbox answered
 *                  "operation not permitted" for the write and "could not
 *                  resolve host" for the curl.
 *
 * So `untrusted` bought three interruptions on ordinary work and no containment
 * `workspace-write` was not already giving us.
 *
 * WHAT THE SCHEMA SAYS, read off `codex app-server generate-json-schema` on that
 * same version rather than remembered: `AskForApproval` is
 * `untrusted | on-request | never | {granular:{...}}`, and
 * `SandboxWorkspaceWrite.network_access` DEFAULTS TO FALSE. Note that the
 * interactive CLI has dropped `untrusted` from `--ask-for-approval` altogether
 * and offers only `on-request` and `never`; the app-server protocol still
 * accepts it, which is how this went on working while being the wrong choice.
 *
 * `on-request` IS WHAT THE CODEX APP ITSELF RUNS, which is the whole of what she
 * asked for: work inside the sandbox unasked, ask only to get out. It keeps the
 * escape hatch rather than removing it, so a run that genuinely needs the
 * network can still request it and she still gets a card. One caveat stated
 * rather than implied: the escape probe TOLD the model not to work around a
 * refusal, so its zero cards prove the sandbox refuses by default, not that
 * `on-request` never asks for escalation.
 *
 * THE PATCH IS STILL CARDED WHERE IT MATTERS and that machinery is untouched:
 * `FileChangeRequestApprovalParams` carries no path and no diff, so
 * main/codex-approvals.mjs draws the card off the `item/started` for the same
 * itemId, which arrives first and carries the paths and the change.
 *
 * `workspace-write` is the sandbox and it does not move: a worker may write in
 * the folder it was given and nowhere else, and has no network. That is what
 * `--permission-mode acceptEdits` buys on the other engine.
 */
export const WORKER_APPROVAL_POLICY = 'on-request';
export const WORKER_SANDBOX = 'workspace-write';

/**
 * How long a worker waits for its store server before giving up on the run.
 *
 * Measured 2026-09-04: a working server went from `starting` to `ready` in well
 * under a second, and a broken one failed, was retried by Codex, and failed
 * again inside twenty-five seconds. Thirty covers the retry and still costs a
 * genuinely dead machine half a minute rather than her fifteen.
 */
export const MCP_READY_MS = 30_000;

/* * * TURN THE FOUNDER'S OWN MCP SERVERS OFF FOR A WORKER, BY NAME. * * A bare `thread/start`
 inherits every MCP server in her `~/.codex/config.toml`. * Measured 2026-09-04 on codex-cli
 0.148.0, thread start only and no turn: a * plain start reported
 `mcpServer/startupStatus/updated` for `playwright`, * `context7` and `codex_apps`, so a
 the app worker would silently launch two npx * processes of hers on every spawn. Nobody asked
 for that and nothing on her * screen would say it happened. * * THE OBVIOUS FIX DOES NOT
 WORK, WHICH IS WHY THIS IS A LIST OF NAMES AND NOT * AN EMPTY TABLE. All measured the same
 day, same probe: * * `config: { mcp_servers: {} }` -> all three still started. It used to
 also be what an * unreadable `config/read` degraded to, and that was the whole of the bug:
 an * empty list is `{}`, `{}` is the no-op measured above, and the no-op starts * every
 server she has inside a headless worker. * * `codex_apps` IS NOT ON THIS TABLE AND CANNOT
 BE, measured 2026-09-04 on * codex-cli 0.148.0, thread start only: * * with `codex_apps:
 {enabled:false}` beside her two -> `thread/start` REFUSED, * -32600 "failed to load
 configuration: invalid transport in * `mcp_servers.codex_apps`" * with her two named off
 and `codex_apps` left alone -> the only startup * notifications on the thread were
 `codex_apps=starting`, `codex_apps=ready` * * An `enabled: false` entry is a MERGE onto a
 server that already exists in her * config; Codex's own built-in app connector is not in
 her config and has no * transport to merge onto, so naming it refuses the thread rather
 than * disabling it. It therefore stays enabled on every worker, deliberately. It is *
 Codex's own connector rather than a process of hers, so nothing of hers runs * because of
 it -- but it is not nothing, and the slice that needs it off is * the slice that finds the
 switch Codex actually offers for it. * * That measurement is also why the names must be
 READ AT EVERY START rather * than cached for the app-server's life: a name that is stale
 because she * deleted the server does not merely fail to disable anything, it refuses the *
 thread outright. * * AND THE STORE SERVER GOES BACK IN THROUGH THE SAME TABLE. Switching
 every * server off and adding nothing is what the first slice shipped, and it left a *
 Codex worker unable to claim, checkpoint or finish a row: CLAUDE.md's * 2026-08-05
 incident, "five sessions of analysis written to nowhere", arriving * through a second
 engine. Measured 2026-09-04 on codex-cli 0.148.0, one * `thread/start` and no turn: an
 entry added BESIDE the `enabled: false` ones * started and reported ready while
 `playwright` and `context7` still produced * nothing at all, so one table carries both
 halves and the isolation is intact. * * Ours is written LAST, deliberately. If she ever
 runs a server of her own * under this name the store is the one that has to win, because a
 worker with * no store is worse than a worker without her tool.
*/
export function mcpIsolation(names = [], storeServer = null) {
  // NULL-PROTOTYPE, BECAUSE ONE OF HER SERVERS MAY BE CALLED `__proto__`.
  // `{}[('__proto__')] = x` reaches Object.prototype's setter: the assignment
  // appears to work, `Object.keys` does not list it, and JSON.stringify does
  // not emit it -- so the one server named after the thing that hides it would
  // be the one server left running inside a worker. Nothing else here changes:
  // JSON.stringify treats a null-prototype object exactly as a plain one.
  const mcp_servers = Object.create(null);
  for (const name of names) {
    if (typeof name === 'string' && name) mcp_servers[name] = { enabled: false };
  }
  if (storeServer?.name && storeServer.command) {
    const entry = { command: storeServer.command, env: storeServer.env ?? {} };
    // `args` IS CARRIED WHEN THERE IS ONE, and Agentbox's own launcher has none:
    // `storeMcpCommand` is a single executable, exactly as the Claude path
    // passes it. It is here because dropping a caller's argv in silence is a
    // server that starts and never handshakes, which was measured against a
    // real app-server while writing this -- the process came up, waited on
    // stdin forever, and the only symptom was a run that stopped saying the
    // store never reported ready.
    if (Array.isArray(storeServer.args) && storeServer.args.length) entry.args = [...storeServer.args];
    mcp_servers[storeServer.name] = entry;
  }
  return mcp_servers;
}

/**
 * THE ONE FOLDER THIS THREAD RUNS IN, DECLARED UNTRUSTED TO CODEX.
 *
 * `mcpIsolation` above switches off the servers named in HER config, and that
 * is all it can do, because those are the only names `config/read` returns. A
 * `.codex/config.toml` sitting in the product folder is a config LAYER of
 * Codex's own, and the per-thread override is a deep merge, so a server that
 * layer declares was never named and never switched off. Measured on this Mac
 * 2026-09-05, codex-cli 0.148.0, real `codex app-server`, scratch CODEX_HOME:
 *
 *   proj/.codex/config.toml declares `planted` = sh -c "echo pwned > MARK"
 *   thread/start cwd=proj, mcp_servers = { herone: { enabled: false } }
 *     -> mcpServer/startupStatus/updated planted=starting, and MARK was on
 *        disk. The plant RAN.
 *
 * So a repository she cloned -- or an earlier worker writing inside one --
 * plants a command the next Codex thread LAUNCHES, outside the command sandbox
 * and outside the approval path, with no card and nothing on her screen.
 *
 * NAMING IT THE WAY `mcpIsolation` NAMES HERS DOES NOT WORK. Measured the same
 * hour: `{ planted: { enabled: false } }` answered -32600 "failed to load
 * configuration: invalid transport in `mcp_servers.planted`", because an
 * `enabled: false` entry is a merge onto a server in the TRUSTED config and an
 * untrusted project layer is not in it. Asking `config/read` WITH the thread's
 * cwd is no help either: it returned the same home names, and only
 * `includeLayers: true` showed the layer at all -- carrying a `disabledReason`
 * while `thread/start` went ahead and started the server regardless.
 *
 * CODEX'S OWN PROJECT-TRUST GATE IS THE SWITCH, AND IT IS PER THREAD. Measured
 * on the same probe:
 *
 *   config.projects[<cwd>].trust_level = "untrusted"
 *     -> no startup notification at all, MARK never written, and the store
 *        server Agentbox puts there itself still started beside it.
 *   with [projects."<proj>"] trust_level = "trusted" already in the home
 *        config.toml, the per-thread untrusted STILL won.
 *   cwd two levels below the `.codex` folder: unguarded the plant ran, and
 *        naming only the cwd stopped it.
 *
 * AND IT STOPS AGENTBOX WRITING IN HER CODEX CONFIG, which nothing had noticed.
 * Without this, `thread/start` appended [projects."<cwd>"] trust_level =
 * "trusted" to CODEX_HOME's own config.toml -- permanently, and for her
 * terminal too, so the first Agentbox run in a folder quietly made that folder's
 * `.codex` live for every `codex` she types afterwards. With it, nothing was
 * written.
 *
 * A cwd that is not a real string answers `{}` rather than a guess: a table
 * with an empty key is a table Codex refuses, and that would cost the run over
 * a fact nobody stated.
 */
export function projectIsolation(cwd) {
  // NULL-PROTOTYPE for the reason `mcpIsolation` gives: a path is any string,
  // `__proto__` included, and a plain `{}` drops that one key in silence --
  // leaving the folder named after the thing that hides it the one folder that
  // is still trusted.
  const projects = Object.create(null);
  if (typeof cwd === 'string' && cwd) projects[cwd] = { trust_level: 'untrusted' };
  return projects;
}

/**
 * THE NAMES IN A `config/read` RESULT, OR A REFUSAL TO GUESS.
 *
 * This used to answer `[]` for every shape it did not recognise, on the reading
 * that isolation which cannot read her config should degrade to "turn nothing
 * off". IT DEGRADED TO THE OPPOSITE. `[]` builds `{}`, and `{}` is the deep
 * merge measured above that disables nothing at all -- so the failure path
 * started every MCP server she has inside a headless worker, on this Mac two
 * `npx` processes per spawn, with nothing on her screen saying it happened.
 *
 * So there are two answers now and they are not the same answer:
 *
 *   SHE HAS NONE -> `[]`. An empty table, no `mcp_servers` key at all, or an
 *     explicit null. The empty override really is correct here, because there
 *     is nothing of hers for it to fail to disable.
 *   WE COULD NOT TELL -> THROW. A read that errored, a result with no `config`,
 *     an `mcp_servers` that is a list or a string. The caller stops the worker
 *     before `thread/start` rather than starting one that inherits everything.
 *
 * A throw is safe on the spawn path by construction: `createCodexWorker` awaits
 * this inside its own promise chain, and the `catch` at the end of that chain
 * ends the worker with the message on the stderr `troubleCause` reads.
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
 * `ephemeral: false` IS NOT A DEFAULT WORTH RELYING ON HERE, even though
 * main/codex-app-server.mjs supplies the same value. It is the difference
 * between a row that can be replied to and one that cannot: measured
 * 2026-09-04, `thread/resume` on an ephemeral thread fails `no rollout found`,
 * and continuation-on-reply is most of what this app does. Written where a
 * reader of this file can see it rather than inherited from another one.
 *
 * `projects` IS THE SECOND HALF OF THE ISOLATION AND NOT AN EXTRA. `mcp_servers`
 * can only name the servers in HER config; `projects` is what keeps the config
 * layer inside the folder the thread runs in from contributing any of its own.
 * See `projectIsolation` for the measurement.
 *
 * `features.apps` IS THE THIRD, AND IT IS THE SWITCH `mcpIsolation` SPENT A
 * SLICE FAILING TO FIND. `codex_apps` cannot be named in `mcp_servers` -- that
 * refuses the thread, measured 2026-09-04 -- because it is not one of her
 * servers at all: it is Codex's own connector to the apps she has linked to her
 * ChatGPT account, and it is gated by a FEATURE. Measured 2026-09-05,
 * codex-cli 0.148.0, real app-server:
 *
 *   experimentalFeature/list -> { name: "apps", stage: "stable",
 *                                 enabled: true, defaultEnabled: true }
 *   thread/start config.features.apps = false -> accepted, no refusal
 *   experimentalFeature/list { threadId } for that thread -> apps enabled FALSE
 *   the same call for a thread started without it        -> apps enabled true
 *
 * (`config.apps` is not it and was tried first: `{ apps: { enabled: false } }`
 * answered "invalid type: boolean `false`, expected struct AppConfig in
 * `apps`".)
 *
 * WHAT IS NOT MEASURED, said plainly rather than implied away: the connector
 * needs a signed-in ChatGPT account and every probe ran against a scratch
 * CODEX_HOME that is signed out, so `codex_apps` never started in any of them.
 * What was watched is Codex's own registry reporting the flag off for the
 * thread, not the connector process failing to appear. Her real `~/.codex` was
 * not opened to close that gap. `createCodexWorker` therefore also WATCHES the
 * result -- see `sayUnasked` below -- so a flag that stops working is a line on
 * the run rather than a silence.
 */
export function workerThreadParams({ cwd, model = null, instructions = null, mcpServers = [], storeServer = null, mode = null } = {}) {
  // THE MODE SHE PICKED, OR THE PAIR OF CONSTANTS. `mode` is one of the three in
  // shared/codex-modes.mjs, and it decides BOTH the sandbox and the approval
  // policy, because on this engine those two are one choice rather than two
  // (that file says why). Passing nothing means the default posture, which is
  // what every caller did before there was a picker, so a caller that has not
  // been updated keeps the behaviour it had.
  const posture = mode
    ? codexPosture(mode)
    : { approvalPolicy: WORKER_APPROVAL_POLICY, sandbox: WORKER_SANDBOX };
  const params = {
    cwd,
    ephemeral: false,
    approvalPolicy: posture.approvalPolicy,
    sandbox: posture.sandbox,
    ...(posture.approvalsReviewer ? { approvalsReviewer: posture.approvalsReviewer } : {}),
    config: {
      mcp_servers: mcpIsolation(mcpServers, storeServer),
      projects: projectIsolation(cwd),
      // Plugins can contribute MCP servers outside config.mcp_servers.
      // Keep this worker on the same explicit integration boundary.
      features: { apps: false, plugins: false, remote_plugin: false },
    },
  };
  if (model) params.model = model;
  // Her standing instructions and the project's, in the slot that is this
  // engine's `--append-system-prompt`: a rule pasted above a 200-line brief is
  // a rule that gets buried, which is the reason the Claude path uses a system
  // prompt too.
  if (instructions) params.developerInstructions = instructions;
  return params;
}

/**
 * THE SAME THREAD, CONTINUED, AND IT HAS TO CARRY THE WHOLE TABLE AGAIN.
 *
 * The harness resumed with `{threadId}` and nothing else, on the reasonable
 * assumption that a thread remembers what it was started with. IT DOES NOT.
 * Measured 2026-09-04 on codex-cli 0.148.0, one thread and three connections to
 * the same rollout:
 *
 *   resume WITH this override  -> the store server started and reported ready, and
 *                                 `playwright` and `context7` stayed off.
 *   resume with `{threadId}`   -> `playwright` and `context7` BOTH started and
 *                                 reported ready, and the thread had no store
 *                                 server on it at all. Two npx processes of
 *                                 hers were left running on the Mac by that
 *                                 probe and had to be killed by hand.
 *
 * A reply she writes is a continuation, and continuations are most of what this
 * app does, so without this the isolation held for a row's first turn only and
 * every reply afterwards ran her servers and no store.
 *
 * `ephemeral` IS DROPPED RATHER THAN PASSED THROUGH. ThreadResumeParams takes
 * approvalPolicy, approvalsReviewer, baseInstructions, config, cwd,
 * developerInstructions, model, modelProvider, personality, sandbox,
 * serviceTier and threadId, and `ephemeral` is not among them: it is a fact
 * about creating a thread, and this one already exists.
 */
export function resumeThreadParams(threadId, params = {}) {
  const { ephemeral, ...rest } = params ?? {};
  return { threadId, ...rest };
}

/**
 * WHERE CODEX PUT THE TRANSCRIPT OF ONE SESSION.
 *
 * Claude Code keeps `<home>/projects/<slug>/<id>.jsonl`, so the supervisor can
 * test one path and be done. Codex writes
 * `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl` and the id is
 * INSIDE the filename, so finding one means looking. There were 1,700 of these
 * on the machine this was written on, counted with `find ~/.codex/sessions -name
 * 'rollout-*.jsonl' | wc -l`, so "look at all of them" is not an answer.
 *
 * NEWEST FIRST AND BOUNDED. The directory tree is already sorted by date, so
 * walking it year-desc, month-desc, day-desc finds a recent session in one
 * readdir and gives up after `days` day-folders rather than scanning the lot.
 * Sixty is the bound because the only caller is a "does this still exist"
 * check before a resume, and a session two months old is one nothing is going
 * back to.
 *
 * THE MATCH IS THE WHOLE FILENAME, NOT A SUBSTRING. `includes(id)` would match
 * a neighbouring rollout whose own uuid merely ends with the same characters,
 * and handing `thread/resume` the wrong thread is worse than handing it
 * nothing: it would resume a stranger's conversation onto her row.
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

// Newest first, and only the entries that are dated: a stray file or a folder
// Codex renames under us must not stop the walk or reorder it.
function numericDesc(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names.filter((n) => /^\d+$/.test(n)).sort((a, b) => Number(b) - Number(a));
}

/* * * ONE WORK ITEM'S THREAD, WEARING A CHILD PROCESS'S FACE. * * `server` is a
 main/codex-app-server.mjs client, shared with every other * worker on this Mac. `ready` is
 the handshake: `initialize` must land before * `thread/start`, and awaiting it here rather
 than at every call site is what * lets the supervisor treat starting a Codex worker as one
 synchronous call * that returns a handle, exactly like `spawn`. * * WHAT IT EMITS, AND
 WHEN: * * 'spawn' the work is really up: the thread exists AND the * store server it needs
 has reported ready. Without it the transport refuses every * server request on this thread
 immediately -- which is still the correct * behaviour and is what a worker with nobody to
 ask should hear, rather than * parking for fifteen minutes. main/codex-approvals.mjs is the
 handler the * supervisor passes. * * `requireMcpServer` IS THE STORE, AND THE TURN WAITS
 FOR IT. Measured * 2026-09-04: a `mcp_servers` entry whose command does not exist leaves *
 `thread/start` resolving normally and the turn free to run, with the failure * arriving
 only as a notification. That is a worker doing a whole job it cannot * file anywhere, which
 CLAUDE.md prices at five sessions. So the turn does not * start until
 `mcpServer/startupStatus/updated` says `ready` for this server, * and if that never comes
 the run dies with the reason on stderr. Null when no * store server was configured, which
 is every downloaded copy of Agentbox: there * is nothing to wait for and a worker that
 waited would never run. * * ONE `failed` IS NOT THE VERDICT, THE DEADLINE IS. Codex retries
 a server that * failed to start -- measured, twice inside twenty-five seconds -- so a run *
 killed on the first failure would be a run killed on a hiccup. The last * failure's own
 words are kept, and they are what the run dies saying.
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
  worker.steer = async text => {
    if (ended || !worker.threadId || !worker.turnId) throw Error('The turn is not running. Send again when the conversation is ready.');
    const expected=worker.turnId;
    const result=await server.steerTurn(worker.threadId,expected,text);
    if(result?.turnId!==expected)throw Error('The provider did not confirm the active turn.');
    return result;
  };

  const say = (text) => {
    const line = String(text ?? '').trim();
    if (line) stderr.emit('data', line);
  };

  /* --------------------------- the store's gate --------------------------- */

  // `ready` more than once is ordinary: measured, the store server reported ready at
  // the thread's start and again while the turn ran. So the wait settles once
  // and every later notification is a no-op.
  //
  // THIS DEPENDS ON THE STARTUP NOTIFICATION ARRIVING AFTER THE RESPONSE THAT
  // NAMES THE THREAD, which is what was observed on every measured run: the
  // watch is installed inside `startThread`'s result hook, synchronously in the
  // read loop, so anything the server packs in BEHIND the response is caught,
  // and a `ready` that somehow came in AHEAD of it would belong to no watched
  // thread and be dropped -- costing a healthy worker its run at the deadline.
  // The resume road has no such window, because `resumeThread` watches before
  // it sends. If a Codex release ever reorders that, this is the sentence that
  // says where to look.
  let storeIsUp = !requireMcpServer;
  let storeTrouble = '';
  const waiting = [];

  /**
   * A SERVER CAME UP ON THIS THREAD THAT AGENTBOX DID NOT PUT THERE.
   *
   * The isolation is three tables now -- her servers off by name, the folder's
   * own config layer gated, and Codex's apps connector switched off by feature
   * -- and every one of them is a claim about a version of `codex app-server`.
   * A claim nobody checks is how the last two holes lasted: an empty
   * `mcp_servers` table "disabled" everything for a slice, and `codex_apps` was
   * left running for a slice after that, both without a symptom on any screen.
   *
   * So the result is watched rather than assumed. `starting` is the status that
   * means a process was really launched (`failed` launched nothing, and a
   * `ready` follows a `starting` we have already spoken about), and this is the
   * pipe `troubleCause` reads and the run trace records, so the line reaches her
   * row rather than a log nobody opens.
   *
   * ONCE PER SERVER. A line repeated on every beat is a line she stops reading,
   * which is the 2026-08-05 card flood in a different shape.
   *
   * AND THE WORDING IS LOAD-BEARING. `troubleCause`'s WORKSPACE list matches the
   * bare word "untrusted" and its INTERRUPTED list matches "connection", so a
   * sentence carrying either would relabel every Codex run that died of
   * something else. tests/a-codex-worker-does-not-reach-her-connected-apps
   * pins that against the real classifier rather than against this note.
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
    });
  };

  /**
   * The one ending this worker will ever have.
   *
   * The thread is RELEASED here and not only on a kill: a watch left installed
   * on a finished thread hands every later line carrying that id to a listener
   * for a session that no longer exists, and the transport keeps the whole
   * client alive holding it.
   */
  const end = (code, signal = null, how = null) => {
    if (ended) return;
    ended = true;
    if (worker.threadId) { try { server.unwatch(worker.threadId); } catch { /* already gone */ } }
    worker.emit('exit', code, signal, how);
  };

  const handlers = {
    onNotification: (method, params) => {
      // The turn id arrives on the notification as well as on the `turn/start`
      // response, and this is the earlier of the two: `turn/start` resolves
      // when the turn is ACCEPTED, and the server can pack `turn/started` in
      // behind that response. `turn/interrupt` needs both ids, so the earliest
      // honest moment to know the second one is here.
      const id = params?.turn?.id ?? params?.turnId;
      if (typeof id === 'string' && id) worker.turnId = id;

      if (method === 'mcpServer/startupStatus/updated') readStoreStatus(params);

      worker.emit('event', method, params);

      if (method !== 'turn/completed' && method !== 'turn/failed') return;
      // `turn/failed` is handled even though the 0.148.0 schema does not list
      // it: failure arrives as `turn/completed` with `turn.status: "failed"`.
      // Dropping a notification means a run that reads as unfinished forever,
      // and being wrong in this direction is free.
      const status = typeof params?.turn?.status === 'string'
        ? params.turn.status
        : (method === 'turn/failed' ? 'failed' : 'completed');
      if (status === 'inProgress') return;
      if (status !== 'completed') say(troubleText(params?.turn));
      end(status === 'completed' ? 0 : 1, null);
    },
    // THE CONNECTION DIED UNDER THIS THREAD, AND THAT IS NOT THIS ITEM'S DOING.
    //
    // The process crashed, the pipe broke, one line nobody could read took the
    // whole app-server down, or Agentbox closed it. `gone.stderr` is the
    // app-server's own tracing tail, which is where Codex's refusal wording
    // actually appears.
    //
    // ONE app-server carries the WHOLE fleet, so every one of these events
    // reaches every live thread at once. Ending them `end(1, null)` -- no
    // signal, nothing saying it was not the item -- had `settleDelivery` read
    // each of them as a run that tried and failed and spend one of that item's
    // three delivery attempts. Three such events and rows she had answered read
    // "stopped", which CLAUDE.md calls the loudest word this app has and says
    // must never mean "and nothing will retry". A whole-turn `turn/diff/updated`
    // is the biggest frame on this wire, so the fault arrives exactly when the
    // most work has been done.
    //
    // `transportFault` is the fact, told rather than faked. A signal would have
    // been the cheap way to reach the same branch and it would be a lie: nothing
    // signalled this worker, and `noteExitForBackoff` must still record the
    // failure against the Codex account, because a broken app-server IS evidence
    // about Codex on this Mac. Only the DELIVERY attempt is spared.
    onClosed: (gone) => {
      say(gone?.stderr);
      end(1, null, { transportFault: true });
    },
  };
  // Only when there is somebody to ask. The transport tests for a FUNCTION and
  // refuses the request outright when it finds none, which is the right answer
  // for a worker whose card would reach nobody.
  if (typeof onApproval === 'function') handlers.onApproval = onApproval;

  ready
    // A FUNCTION, BECAUSE ONE OF THE PARAMS IS NOT KNOWN YET WHEN THE
    // SUPERVISOR ASKS FOR A WORKER. The MCP servers a thread must switch off
    // are read from the app-server itself, and her servers launch at
    // `thread/start` -- so the list has to be in hand before the start rather
    // than filled in on the second spawn. Whatever `ready` resolves to is
    // handed here, and a plain object is still accepted unchanged.
    .then((settled) => {
      // CANCELLATION IS CHECKED IN FRONT OF EVERY RPC, NOT ONLY AFTER THE FIRST
      // ONE. The first `ended` test used to sit AFTER the start had already been
      // sent, so a worker killed during the handshake still launched a thread,
      // still started whatever MCP processes that thread carries, and still
      // installed a watcher -- all for a run the supervisor had already given
      // up on. A quit kills the whole fleet at once, so this is the ordinary
      // case rather than a corner one.
      if (ended) return null;
      const params = typeof threadParams === 'function' ? threadParams(settled) : threadParams;
      // THE SAME PARAMS ON BOTH ROADS. A resume that carries only the thread id
      // gets her own MCP servers back and no store at all (measured; see
      // `resumeThreadParams`), and a reply is the commonest thing this app does.
      return resumeThreadId
        ? server.resumeThread(resumeThreadParams(resumeThreadId, params), handlers).then(() => ({ threadId: resumeThreadId }))
        : server.startThread(params, handlers);
    })
    .then((started) => {
      if (!started) return null;
      const threadId = started.threadId ?? resumeThreadId ?? null;
      // A THREAD THAT ARRIVES AFTER THE KILL IS STILL A THREAD, AND IT IS OURS
      // TO LET GO OF. `end` releases `worker.threadId`, and at a kill during
      // startup there was not one yet, so the watch this response just installed
      // would have outlived the worker: every later line carrying that id
      // handed to a listener for a session that no longer exists, with the
      // transport kept alive holding it.
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
        // The loudest thing this file can do, on the pipe `troubleCause` reads.
        // A run that stops here has written nothing and spent nothing, which is
        // the whole point: the alternative is a worker doing the entire job and
        // filing it nowhere.
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
      // A thread that never started, a resume the server refused, a turn it
      // would not accept. All three are a worker that did no work, and all
      // three carry the sentence that says why -- including the app-server's
      // stderr tail, which main/codex-app-server.mjs appends to every rejection.
      // No signal here: a kill has already ended this worker with one, and
      // `end` only ever fires once, so anything reaching this line is a real
      // failure rather than something we did.
      say(err?.message ?? String(err));
      end(1, null);
    });

  /**
   * OUR KILL, AND IT LOOKS LIKE ONE FROM THE OUTSIDE.
   *
   * `turn/interrupt` takes BOTH ids -- a turn is not identified by either one
   * alone -- so a kill before the turn id has arrived can only release the
   * thread, which it does. The exit is emitted immediately rather than waiting
   * for the server to confirm: the supervisor kills the whole fleet on quit and
   * on every restart, and an ending that waits on a process we are shutting
   * down is an ending that may never come.
   *
   * `signal` is set here and nowhere else. That is the fact `settleDelivery`
   * reads to keep our own kill from spending one of an item's three delivery
   * attempts, and a later `turn/completed` saying `interrupted` cannot undo it
   * because `end` only fires once.
   */
  worker.kill = () => {
    if (ended) return false;
    if (worker.threadId && worker.turnId) {
      try { server.interruptTurn(worker.threadId, worker.turnId)?.catch?.(() => {}); } catch { /* dying anyway */ }
    }
    // 143 is what the Claude CLI reports for the same event (it traps SIGTERM
    // and exits under its own power), so the two engines hand the exit handler
    // the same pair of numbers for the same thing.
    end(143, 'SIGTERM');
    return true;
  };

  return worker;
}

/**
 * Why a turn did not finish, in whatever words the server gave us -- AND IN THE
 * ONE WORD IT GIVES US THAT IS NOT PROSE.
 *
 * `TurnError` is `{ message, additionalDetails, codexErrorInfo }`, and
 * `CodexErrorInfo` is an enum: `usageLimitExceeded`, `unauthorized`,
 * `contextWindowExceeded`, `sessionBudgetExceeded`, `other`, and a handful of
 * nested variants carrying an HTTP status. That is off `codex app-server
 * generate-json-schema`, the binary's own generator, run on this Mac against
 * codex-cli 0.148.0 on 2026-09-05.
 *
 * THE CODE WAS BEING THROWN AWAY AND THE SENTENCE CLASSIFIED INSTEAD, which is
 * the wrong way round: shared/spawn-trouble.mjs has to decide whether a dead
 * run was a signed-out login or a limit, and a name published by the vendor
 * cannot drift the way a sentence can. Measured the same day: a signed-out run
 * does not even produce Codex's own words -- the app-server passes the raw HTTP
 * text through, so the prose is the transport's rather than the tool's.
 *
 * IN FRONT, NOT BEHIND. `noteExitForBackoff` classifies the LAST stderr line
 * cut to 300 characters, and the measured 401 message is already 200 of them
 * before any detail is appended; a code on the end would be the first thing
 * lost. Only a plain string code is carried -- a nested variant is an object and
 * would arrive as "[object Object]" -- and `other` is dropped, because it is the
 * schema's own way of saying nothing and would be noise in front of the sentence
 * that says something.
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
