// The approval handler for Codex workers. It writes each card into the same
// spool as Claude Code's (main/approvals.mjs), so the renderer draws one card
// format for both engines, and a file change goes on the same card as a command.
//
// The founder's answer never comes off the disk on this path. It arrives
// through main/ipc.mjs and reaches `settle` in process. The spool is inside the
// store root, which workers can write, so any `<id>.answer.json` that appears
// for a waiting request is a forgery, and the poll deletes it.
//
// Codex's `workspace-write` sandbox stops a worker's commands from writing to
// the store root, but it leaves /tmp and $TMPDIR writable, so a store root under
// either is reachable. main/approvals.mjs explains why a forged answer file
// still hides no card.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { appendSpoolLine, cardDigest, removeSpoolEntry, spoolDir, spoolEntryExists, writeSpoolFile } from './approvals.mjs';

import { REFUSAL_DECISION } from './codex-app-server.mjs';

import { fileVerbWord } from './codex.mjs';
import { Name, isOurSlug } from '../shared/product-name.mjs';

/** How often a waiting card sweeps a forged answer and puts itself back on screen. */
export const POLL_MS = 2_000;

const ACCEPT_DECISION = 'accept';

/**
 * The most characters of a command or patch that go on a card, and the only
 * place that limit is set. What the card shows must be what the answer
 * authorises, so the renderer must not cut it again. Past the cap the end is
 * cut once, with a mark saying how much went.
 */
export const CARD_CAP = 4_000;

/** The protocol values in Codex's `NetworkApprovalProtocol` schema. Any other value is not printed. */
const NETWORK_PROTOCOLS = ['http', 'https', 'socks5Tcp', 'socks5Udp'];

function networkHost(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return '';
  const host = typeof context.host === 'string' ? context.host.trim() : '';
  if (!host) return '';
  const protocol = typeof context.protocol === 'string' ? context.protocol.trim() : '';
  return NETWORK_PROTOCOLS.includes(protocol) ? `${host} over ${protocol}` : host;
}

/**
 * The `_meta.codex_approval_kind` value that marks an elicitation as an MCP
 * tool-call approval rather than a form asking for typed input. Under
 * `approvalPolicy: untrusted`, Codex sends every MCP tool call as
 * `mcpServer/elicitation/request` with this mark and a `message` naming the
 * server and tool.
 */
export const MCP_TOOL_CALL_KIND = 'mcp_tool_call';

export function isMcpToolCall(params) {
  const meta = params?._meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false;
  return meta.codex_approval_kind === MCP_TOOL_CALL_KIND;
}

export function elicitationServer(params) {
  return typeof params?.serverName === 'string' ? params.serverName.trim() : '';
}

/**
 * True when the elicitation comes from Agentbox's own store server. Any of the
 * app's past names also counts, because resuming a Codex thread merges over its
 * old config, so a thread started before a rename still calls the store by the
 * old name. Only names this app has had match, and a run with no store server
 * never matches.
 */
export function isStoreElicitation(params, storeServer) {
  if (!storeServer) return false;
  const server = elicitationServer(params);
  if (!server) return false;
  return server === String(storeServer).trim() || isOurSlug(server);
}

/**
 * One MCP tool call as a card: the server, Codex's sentence naming the tool,
 * and the arguments. Returns null when Codex sent no sentence, so `ask` refuses
 * rather than drawing a card nobody can answer.
 */
export function mcpToolCard(params) {
  // The same channel carries an MCP server's own request for typed input, which
  // an allow-or-deny card cannot answer, so `ask` refuses it.
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
    } catch { /* arguments that cannot be serialised are left off */ }
  }
  return { tool: 'Mcp', input };
}

function readable(text) {
  if (text.length <= CARD_CAP) return text;
  const dropped = text.length - CARD_CAP;
  return `${text.slice(0, CARD_CAP)}\n[+${dropped} character${dropped === 1 ? '' : 's'} not shown]`;
}

/**
 * One `fileChange` item as the card its approval will be drawn as, or null when
 * it names no file. Every change in the item goes on the card, because one
 * patch can touch several files. `diff` is a unified diff for an update but raw
 * file content for an add, so it is printed as it came and never parsed.
 * `tool` is the one verb when every change shares it, and `Edit` otherwise.
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
    // Drop one trailing newline only, as `splitLines` in main/codex.mjs does, so
    // a file that really ends in blank lines still shows them.
    const body = String(change.diff ?? '').replace(/\n$/, '');
    blocks.push(body ? `${head}\n${body}` : head);
    if (!words.includes(word)) words.push(word);
  }
  if (!blocks.length) return null;
  return { tool: words.length === 1 ? words[0] : 'Edit', input: { changes: readable(blocks.join('\n\n')) } };
}

/**
 * How many file-change cards one worker holds while waiting for the approvals
 * that name them. Codex sends the approval right after `item/started`, but that
 * is observed, not promised, and a turn can have several patches in flight.
 * Each card is already cut to `CARD_CAP`, so this bounds memory too.
 */
export const REMEMBERED_CHANGES = 32;

/**
 * One approval request as a card, or null, which `ask` refuses. `Bash` and
 * `command` are the keys renderer/src/App.tsx already reads off `input`.
 *
 * A file-change approval carries no path and no diff. Codex sends the same
 * item on `item/started` before the approval, so the card comes from `seen`,
 * which `remember` fills per worker. An approval for an item this worker never
 * saw is refused, so the founder never answers a card she cannot read.
 *
 * `item/permissions/requestApproval` is always refused, because its params say
 * nothing about what would be allowed.
 *
 * A command approval shows every entry of `commandActions`, not the first, and
 * the network host it would open, so the card shows all that a yes allows.
 *
 * Codex also offers decisions that write a lasting rule for a command shape or
 * a host. This app only ever answers `accept` or `decline`, so a yes to one
 * command never becomes a standing grant.
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
    // Codex's schema says a set `grantRoot` asks to allow writes under that root
    // for the rest of the session, so an accept can open more than the diff
    // shows, and the card must say so.
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
  // The same command means different things in different folders, so the card
  // shows where it would run when Codex says.
  const cwd = typeof p.cwd === 'string' ? p.cwd.trim() : '';
  if (cwd) input.cwd = cwd;
  const reason = typeof p.reason === 'string' ? p.reason.trim() : '';
  if (reason) input.description = reason;
  return { tool: 'Bash', input };
}

/**
 * The Codex side of the approval spool, one per supervisor and shared by every
 * Codex worker. `uuid`, `now` and `pollMs` are injectable for tests.
 *
 * A CARD WAITS FOR THE PERSON IT ASKS, AND NO CLOCK ANSWERS FOR THEM
 * (w-4b00022acb). There was a fifteen-minute deadline here, and what it sent
 * at the end of it was a deny the turn could not tell from theirs: work nobody
 * had refused came back refused. It was safe only while a waiting card was
 * invisible, and it is not now, because the row reads Asking and sits in Needs
 * you (w-fe48447cab). So what settles a card is always an event: their answer,
 * the worker stopping (`close` on its scope), the app shutting down, the
 * connection breaking.
 */
export function createCodexApprovals({
  storeRoot,
  pollMs = POLL_MS,
  uuid = () => crypto.randomUUID(),
  now = () => Date.now(),
  onChange = null,
} = {}) {
  const dir = spoolDir(storeRoot);
  const open = new Map(); // id -> { request, scope, decide, poll }

  /**
   * The promise main/codex-app-server.mjs holds the server request open on.
   * It always resolves, with accept or the refusal, and never rejects or hangs,
   * because an unsettled promise parks the worker forever.
   */
  const ask = (context, method, params, seen = null) => new Promise((resolve) => {
    // Calls to Agentbox's own store server are allowed without a card, as the
    // Claude Code path allows them in `worker-permissions.json`. The server name
    // comes from the app through `scope`, not from the worker, and
    // `mcpIsolation` makes sure the only MCP servers on a worker thread are ours.
    // Every other MCP tool call still goes to the founder as a card.
    if (method === 'mcpServer/elicitation/request'
      && isMcpToolCall(params)
      && isStoreElicitation(params, context?.storeServer)) {
      resolve(ACCEPT_DECISION);
      return;
    }

    const card = codexApprovalCard(method, params, seen);
    if (!card) {
      // Anything that cannot be described is refused. The refusal goes to the
      // worker's own stderr through `context.say`, so `troubleCause` and the run
      // trace both show it, and it names its reason. An unseen file change
      // means `remember` missed an item, which is a bug to look into.
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

    // The spool is worker-writable, so every file operation on it goes through
    // main/approvals.mjs, the one place that guards against planted files and
    // links.
    let put = false;
    try {
      fs.mkdirSync(dir, { recursive: true });
      put = writeSpoolFile(dir, `${id}.request.json`, JSON.stringify(request));
    } catch (err) {
      console.warn('zero: could not put a codex approval in the spool:', err?.message ?? err);
    }
    if (!put) {
      resolve(REFUSAL_DECISION);
      return;
    }

    const entry = {
      request,
      // The worker that asked, so `close` can deny its cards when it stops.
      scope: context?.scope ?? null,
      decide(allow, note, extra) {
        if (!open.delete(id)) return false;
        clearInterval(entry.poll);
        finish(id, request, { allow: !!allow, note: note ?? null, at: now(), ...extra });
        resolve(allow ? ACCEPT_DECISION : REFUSAL_DECISION);
        return true;
      },
    };
    // The real answer comes through `settle`, so an answer file is a worker's
    // forgery and is deleted unread. The same beat puts the request back if
    // anything took it out of the spool while this card was still waiting.
    entry.poll = setInterval(() => tend(id), pollMs);
    entry.poll?.unref?.();
    open.set(id, entry);
    onChange?.();
  });

  /**
   * One beat of a waiting card: sweep an answer nobody signed, and put the
   * request back on screen if it has gone.
   *
   * THE SPOOL REAPS WHAT NOBODY IS WAITING ON, AND THIS IS HOW IT KNOWS.
   * `listPending` cannot read this map, and a card that waits for a person
   * outlives its REQUEST_TTL_MS, so whoever is waiting keeps its own request
   * there and the sweep only ever takes one nobody is holding up.
   */
  function tend(id) {
    const entry = open.get(id);
    if (!entry) return;
    const forged = `${id}.answer.json`;
    // These helpers also catch a dangling link, which `existsSync` misses, and
    // a directory squatting the name, which `unlink` cannot remove.
    if (spoolEntryExists(dir, forged)) {
      removeSpoolEntry(dir, forged);
      console.warn(`zero: an answer file appeared for approval ${id} that the founder did not write; it has been deleted and the card is still waiting`);
      onChange?.();
    }
    const name = `${id}.request.json`;
    if (spoolEntryExists(dir, name)) return;
    // Written from the request this process has held all along, never read back
    // off the disk: the card that comes back is the card that went.
    if (writeSpoolFile(dir, name, JSON.stringify(entry.request))) { onChange?.(); return; }
    // Failing here leaves the worker parked with nothing on screen, which is
    // the one way the wait goes bad, so it is said out loud. Once per card:
    // this beat runs every two seconds.
    if (!entry.saidItCouldNotGoBack) {
      entry.saidItCouldNotGoBack = true;
      console.warn(`zero: approval ${id} left the spool and could not be put back, so the worker waiting on it has no card on screen`);
    }
  }

  /** Writes one audit line per decision and removes the request and answer files. */
  function finish(id, request, decided) {
    // A failed log write must not block the decision, so the return is ignored.
    appendSpoolLine(dir, 'log.jsonl', `${JSON.stringify({ ...request, answer: decided, decidedAt: now() })}\n`);
    for (const f of [`${id}.request.json`, `${id}.answer.json`]) removeSpoolEntry(dir, f);
    onChange?.();
  }

  let scopes = 0;

  return {
    /**
     * One worker's cards. The worker's exit must call `close`, which denies its
     * open cards through `decide`. Otherwise a dead worker's card sits first in
     * `listPending`, and the founder's next answer goes to it instead of the card
     * she is reading.
     */
    scope: (context = {}) => {
      const id = `scope-${scopes += 1}`;
      const bound = { ...context, scope: id };
      // Kept per worker because item ids are only unique within one thread, and
      // a shared map would let one thread's patch answer another's approval.
      const seen = new Map(); // itemId -> the card its approval will be drawn as
      return {
        /**
         * Remembers the card for each file change on `item/started`, which
         * arrives before the approval. `item/completed` arrives only after it.
         * Must never throw, because it runs inside the supervisor's stream loop.
         */
        remember: (method, params) => {
          try {
            if (method !== 'item/started') return;
            const item = params?.item;
            if (item?.type !== 'fileChange' || typeof item.id !== 'string' || !item.id) return;
            const card = fileChangeCard(item);
            if (!card) return;
            seen.set(item.id, card);
            // Drops the oldest. A Map keeps insertion order, so the first key is
            // the oldest change.
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
     * The founder's answer, and the only way a Codex card is approved. Called by
     * main/ipc.mjs beside `approvals.answer`. Returns false for anything that is
     * not an open Codex card, so a late click on a timed-out card approves nothing.
     */
    settle: (id, allow, note) => open.get(String(id))?.decide(allow, note) ?? false,

    /**
     * True when the card the founder saw differs from the request held in
     * memory. The renderer draws the card from the worker-writable spool, so a
     * worker could rewrite it. `shown` is `approvals.cardShown`. A digest that
     * cannot be taken counts as changed. Returns false for ids this engine does
     * not hold, such as Claude Code cards, so it never turns their answer into a
     * deny.
     */
    changed: (id, shown) => {
      const entry = open.get(String(id));
      if (!entry) return false;
      const mine = cardDigest(entry.request);
      return !mine || mine !== shown;
    },

    /** Denies every open card, for app shutdown. */
    close: (why = `${Name} is shutting down`) => {
      for (const entry of [...open.values()]) entry.decide(false, why, { closed: true });
    },

    pending: () => [...open.keys()],
  };
}
