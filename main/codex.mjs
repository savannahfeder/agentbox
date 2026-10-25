// Readers that turn Codex app-server notifications into the same session
// fields, trace lines, tail and code artifact that the Claude Code readers
// produce, so nothing downstream needs to know which engine ran. They take
// `(method, params)` because the transport (main/codex-app-server.mjs) has
// already parsed each event. Each reader catches its own errors, because one
// that throws inside the supervisor's stream loop goes silent for the rest of
// the session.
//
// Facts about the Codex protocol that the code depends on:
//
// - A `fileChange` `diff` is a unified diff for an `update` but raw file
//   content for an `add`, so `hunksFor` checks the string, not the kind.
// - There is no `turn/failed` notification. A failure is `turn/completed` with
//   `turn.status: "failed"` and `turn.error`. `turn/failed` is still handled in
//   case a release adds it.
// - `TurnStatus` is completed, interrupted, failed or inProgress. An
//   interrupted turn has no answer, the same as a failed one.
// - `move_path` exists only on the `update` kind, so a rename is an update
//   that moved.
// - `reasoning` items arrive empty, so they are not traced.
//
// Item types not handled here, such as `mcpToolCall`, `plan` and `webSearch`,
// are ignored.

import fs from 'node:fs';
import path from 'node:path';
import { shortPath } from './code-change.mjs';
import { filesFromPatch } from './git-change.mjs';

/**
 * The longest live sentence kept in memory. Past it the live text is dropped
 * and the trace delivers the block whole. This is the only copy; the Claude
 * Code stream reader (main/harnesses/claude-stream.mjs) imports it.
 */
export const SAYING_CAP = 20_000;

/**
 * Paths that never belong in a run's code artifact. Copied from main/code-change.mjs;
 * tests/a-codex-turn-reads-like-every-other-run-on-her-page.test.mjs checks the
 * two copies still match.
 */
export const NOT_CODE = /(^|\/)(node_modules|\.git)\//;
export const SCRATCH = /^\/(private\/)?(tmp|var\/folders)\//;

/**
 * Sets the session's id and its final answer. app-server has no `result`
 * event, so the answer is the `agentMessage` with `phase: "final_answer"`.
 * A `commentary` message is never the answer, or a progress note would read as
 * the finished word. A message with no phase still counts, because Codex's
 * schema says older models may not send one, but never over a final answer.
 * A turn that ends with no final answer gets no result, so the supervisor's own
 * "said nothing" handling takes over.
 */
export function captureCodexEvent(session, method, params) {
  try {
    if (!session || typeof method !== 'string') return;
    const p = params ?? {};

    // The id `thread/resume` takes is at `params.thread.id`. This notification
    // has no `params.threadId`.
    if (method === 'thread/started') {
      const id = p.thread?.id;
      if (id) session.sessionId = String(id);
      return;
    }

    if (method === 'item/completed') {
      const item = p.item ?? {};
      if (item.type === 'exitedReviewMode' && typeof item.review === 'string' && item.review.trim()) {
        session.result = item.review;
        session.resultIsError = false;
        session.codexFinalAnswer = true;
        return;
      }
      if (item?.type !== 'agentMessage') return;
      const phase = typeof item.phase === 'string' ? item.phase : null;
      if (phase === 'commentary') return;
      if (session.codexFinalAnswer && phase !== 'final_answer') return;
      session.result = String(item.text ?? '');
      session.resultIsError = false;
      if (phase === 'final_answer') session.codexFinalAnswer = true;
      return;
    }

    if (method === 'turn/completed' || method === 'turn/failed') {
      const turn = p.turn;
      if (!turn || typeof turn !== 'object') return;
      const status = turnStatus(method, turn);
      if (status === 'completed') {
        if (session.result != null) return;
        const answer = finalAnswerIn(turn.items);
        if (answer == null) return;
        session.result = answer;
        session.resultIsError = false;
        session.codexFinalAnswer = true;
        return;
      }
      // A turn that failed after a message got through still failed.
      session.result = turnTrouble(turn, status);
      session.resultIsError = true;
    }
  } catch { /* see the note at the top of this file */ }
}

function turnStatus(method, turn) {
  if (typeof turn?.status === 'string') return turn.status;
  return method === 'turn/failed' ? 'failed' : 'completed';
}

function turnTrouble(turn, status) {
  const why = String(turn?.error?.message ?? '').trim();
  const more = String(turn?.error?.additionalDetails ?? '').trim();
  const head = why || (status === 'interrupted' ? 'the turn was interrupted' : `the turn ${status}`);
  return more ? `${head}\n${more}` : head;
}

/**
 * The final answer in `turn.items`, which still holds it when the item events
 * were missed. Only a `final_answer` counts, never the last message.
 */
function finalAnswerIn(items) {
  if (!Array.isArray(items)) return null;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item?.type === 'exitedReviewMode' && typeof item.review === 'string' && item.review.trim()) return item.review;
    if (item?.type === 'agentMessage' && item?.phase === 'final_answer') return String(item.text ?? '');
  }
  return null;
}

/**
 * The sentence the agent is typing now, built from `item/agentMessage/delta`.
 * Returns true when `session.saying` changed.
 *
 * - Each agentMessage starts from empty, so the live text matches the traced
 *   block and the thread can drop it when the trace arrives.
 * - It is not cleared when the message finishes, or it would blink off screen
 *   until the trace is read.
 * - Past `SAYING_CAP` it is dropped, never cut, because a cut string never
 *   matches the traced one.
 */
export function codexStreamingText(session, method, params) {
  try {
    if (!session) return false;
    const p = params ?? {};

    if (method === 'item/started') {
      // Only a new message resets it. A command or patch starting leaves the
      // typed block on screen until the trace delivers it.
      if (p.item?.type !== 'agentMessage') return false;
      session.saying = '';
      session.sayingAt = Date.now();
      return true;
    }

    if (method !== 'item/agentMessage/delta') return false;
    const piece = String(p.delta ?? '');
    if (!piece) return false;
    if (!session.sayingAt) session.sayingAt = Date.now();
    const next = (session.saying ?? '') + piece;
    session.saying = next.length > SAYING_CAP ? '' : next;
    return true;
  } catch {
    return false;
  }
}

/**
 * One persisted trace line, in the format renderer/src/run-files.ts parses:
 * `HH:MM:SS  [Tool] argument`.
 *
 * Only `item/completed` is traced, because `item/started` carries the same item
 * with empty output. Codex reads files with shell commands, and they are traced
 * as `[Bash]`, the command it really ran. File changes use `Write` and `Edit`,
 * because run-files.ts finds a run's files by those words.
 */
export function traceCodexEvent(method, params) {
  try {
    const p = params ?? {};
    const at = new Date().toISOString().slice(11, 19);

    if (method === 'item/completed') {
      const item = p.item ?? {};

      if (item.type === 'exitedReviewMode' && typeof item.review === 'string') {
        return item.review.trim() ? `${at}  ${item.review.trim()}` : null;
      }

      if (item?.type === 'agentMessage') {
        const text = String(item.text ?? '').trim();
        return text ? `${at}  ${text}` : null;
      }

      if (item?.type === 'commandExecution') {
        const command = String(item.command ?? '').trim();
        return command ? `${at}  [Bash] ${command.slice(0, 200)}` : null;
      }

      if (item?.type === 'fileChange') {
        const lines = changesOf(item)
          .map(fileVerb)
          .filter(Boolean)
          .map((body) => `${at}  ${body}`);
        return lines.length ? lines.join('\n') : null;
      }

      return null;
    }

    if (method === 'turn/completed' || method === 'turn/failed') {
      const turn = p.turn;
      if (!turn || typeof turn !== 'object') return null;
      const status = turnStatus(method, turn);
      const bad = status !== 'completed';
      // A Codex run is always one turn, so the footer shows the duration where
      // Claude Code's shows a turn count.
      const span = Number.isFinite(turn.durationMs) ? `${(turn.durationMs / 1000).toFixed(1)}s` : '?s';
      const said = bad ? turnTrouble(turn, status) : (finalAnswerIn(turn.items) ?? '');
      return `\n${at}  == RESULT (${status}${bad ? ' ERROR' : ''} · ${span}) ==\n${said.slice(0, 4000)}`;
    }

    return null;
  } catch {
    return null;
  }
}

function changesOf(item) {
  return Array.isArray(item?.changes) ? item.changes : [];
}

/**
 * What one file change did, as Write, Delete, Move or Edit, or null when it
 * names no file. The approval card in main/codex-approvals.mjs uses the same
 * function, so the card and the trace use the same word.
 */
export function fileVerbWord(change) {
  const from = String(change?.path ?? '').trim();
  if (!from) return null;
  const kind = change?.kind ?? {};
  const to = typeof kind.move_path === 'string' ? kind.move_path.trim() : '';
  if (kind.type === 'add') return 'Write';
  if (kind.type === 'delete') return 'Delete';
  if (to && to !== from) return 'Move';
  if (kind.type === 'update') return 'Edit';
  return null;
}

function fileVerb(change) {
  const word = fileVerbWord(change);
  if (!word) return null;
  const from = String(change.path).trim().slice(0, 200);
  if (word === 'Move') return `[Move] ${from} -> ${String(change.kind.move_path).trim().slice(0, 200)}`;
  return `[${word}] ${from}`;
}

/** The short In Progress tail, in the same words the Claude Code reader uses. */
export function summarizeCodexEvent(method, params) {
  try {
    const p = params ?? {};

    if (method === 'item/completed') {
      const item = p.item ?? {};
      if (item?.type === 'agentMessage') return String(item.text ?? '').slice(0, 300) || null;
      if (item?.type === 'commandExecution') return String(item.command ?? '').trim() ? 'tool: Bash' : null;
      if (item?.type === 'fileChange') {
        const words = [];
        for (const change of changesOf(item)) {
          const verb = fileVerb(change);
          if (!verb) continue;
          const word = verb.slice(1, verb.indexOf(']'));
          if (!words.includes(word)) words.push(word);
        }
        return words.length ? `tool: ${words.join(', ')}` : null;
      }
      return null;
    }

    if (method === 'turn/completed' || method === 'turn/failed') {
      const turn = p.turn;
      if (!turn || typeof turn !== 'object') return null;
      const status = turnStatus(method, turn);
      const said = status === 'completed' ? (finalAnswerIn(turn.items) ?? '') : turnTrouble(turn, status);
      return `done: ${said.slice(0, 200)}`;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * The most frames one run keeps for its code artifact. app-server events are
 * not saved to disk, so this half of the artifact can only be built from
 * memory. Past the cap the artifact is partial, and the disk half read by
 * `mergeChange` (main/code-change.mjs) still wins where the two disagree.
 */
export const CHANGE_FRAME_CAP = 5_000;

/**
 * The most characters of diff and text one run keeps, because a frame can be
 * as large as the transport's 16 MiB frame limit, so a frame count alone does
 * not bound memory.
 */
export const CHANGE_BYTE_CAP = 16 * 1024 * 1024;

/**
 * Keeps the `fileChange` and `agentMessage` frames the artifact needs, in one
 * list, because `changeFromCodexTurn` pairs each change with the message just
 * before it.
 */
export function rememberCodexChange(session, method, params) {
  try {
    if (!session || method !== 'item/completed') return;
    const type = params?.item?.type;
    if (type !== 'fileChange' && type !== 'agentMessage') return;
    const kept = session.codexChange ?? (session.codexChange = []);
    if (kept.length >= CHANGE_FRAME_CAP) return;
    const size = frameSize(params);
    const held = session.codexChangeBytes ?? 0;
    if (held + size > CHANGE_BYTE_CAP) return;
    session.codexChangeBytes = held + size;
    kept.push({ method, params });
  } catch { /* see the note at the top of this file */ }
}

/**
 * Roughly how big one frame is: the length of its `text` and each `diff`.
 * Not JSON.stringify, which would cost the very memory the cap guards.
 */
function frameSize(params) {
  const item = params?.item ?? {};
  let n = String(item.text ?? '').length;
  for (const change of changesOf(item)) n += String(change?.diff ?? '').length;
  return n;
}

/**
 * What the run changed, in exactly the shape main/code-change.mjs produces:
 * `{files:[{path, abs, hunks:[{rows, plus, minus, said?, at?}], plus, minus,
 * at}], roots, plus, minus, editCount, withProse, startedAt, endedAt}`.
 *
 * `events` are the `{method, params}` frames `rememberCodexChange` kept, in
 * order. `roots` and `since` mean what they mean in code-change.mjs.
 */
export function changeFromCodexTurn(events, { roots = [], since = 0 } = {}) {
  const into = collector({ roots });
  // Codex narrates in a separate agentMessage just before it applies a patch,
  // so the sentence beside a hunk is the nearest preceding message.
  let said = '';

  for (const event of Array.isArray(events) ? events : []) {
    if (event?.method !== 'item/completed') continue;
    const p = event.params ?? {};
    const item = p.item ?? {};

    if (item?.type === 'agentMessage') {
      said = proseFrom(item.text);
      continue;
    }
    if (item?.type !== 'fileChange') continue;

    const stamp = Number(p.completedAtMs ?? event.emittedAtMs ?? 0) || 0;
    if (since && stamp && stamp < since) continue;

    for (const change of changesOf(item)) {
      const abs = destinationOf(change);
      if (!abs) continue;
      for (const hunk of hunksFor(change)) into.add(abs, hunk.rows, { said, stamp });
    }
  }

  return into.done();
}

/** Where the file is after the change. A rename is filed under its new path, as in main/git-change.mjs. */
function destinationOf(change) {
  const to = typeof change?.kind?.move_path === 'string' ? change.kind.move_path.trim() : '';
  const from = String(change?.path ?? '').trim();
  return to || from || null;
}

/**
 * One file change as hunks of rows. It checks whether the string is a unified
 * diff rather than trusting the kind, because an add arrives as raw content and
 * the shape of a delete has not been observed.
 */
function hunksFor(change) {
  const diff = String(change?.diff ?? '');
  if (!diff) return [];
  if (diff.startsWith('@@')) {
    // `filesFromPatch` needs a file header. A placeholder name is used because
    // that reader trims names, and the real path is never read back from it.
    return filesFromPatch(`--- a/f\n+++ b/f\n${diff}`)[0]?.hunks ?? [];
  }
  const mark = change?.kind?.type === 'delete' ? '-' : '+';
  const rows = splitLines(diff).map((line) => [mark, line]);
  return rows.length ? [{ rows }] : [];
}

/** A trailing newline is a line terminator, not an empty last line. */
function splitLines(text) {
  const out = String(text ?? '').split('\n');
  if (out.length > 1 && out[out.length - 1] === '') out.pop();
  return out;
}

/** The last non-empty line of what the agent said, as code-change.mjs keeps it. */
function proseFrom(text) {
  const said = String(text ?? '').trim();
  if (!said) return '';
  const first = said.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';
  return first.slice(0, 400);
}

/**
 * Each root as given and as its real path. Codex reports resolved paths, such
 * as /private/tmp for /tmp on macOS, which would otherwise match no root. The
 * real path is taken from the deepest ancestor that still exists, because the
 * worktree may already be removed when this runs.
 */
function rootSpellings(roots) {
  const out = new Set();
  for (const root of roots.filter(Boolean)) {
    const given = path.resolve(root);
    out.add(given);
    let head = given;
    const tail = [];
    for (let i = 0; i < 64; i += 1) {
      try {
        const real = fs.realpathSync(head);
        out.add(tail.length ? path.join(real, ...tail) : real);
        break;
      } catch { /* not there; try its parent */ }
      const parent = path.dirname(head);
      if (parent === head) break;
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
  return [...out];
}

/** The same tally as the private collector in code-change.mjs, over absolute paths from events. */
function collector({ roots = [] } = {}) {
  const files = new Map();
  const totals = { plus: 0, minus: 0, editCount: 0, withProse: 0, startedAt: 0, endedAt: 0 };
  const spellings = rootSpellings(roots);

  return {
    add(abs, rows, { said = '', stamp = 0 } = {}) {
      abs = String(abs ?? '').trim();
      if (!abs || NOT_CODE.test(abs)) return;
      const rel = shortPath(abs, spellings);
      // A path inside a root always counts, even under /tmp. Scratch outside
      // every root is dropped.
      if (rel === null && SCRATCH.test(abs)) return;
      if (!rows.length) return;
      const p = rows.filter((r) => r[0] === '+').length;
      const m = rows.filter((r) => r[0] === '-').length;
      if (!p && !m) return;
      const key = rel ?? abs;
      const file = files.get(key) ?? { path: key, abs, hunks: [], plus: 0, minus: 0, at: stamp };
      file.hunks.push({ rows, said: said || undefined, at: stamp || undefined, plus: p, minus: m });
      file.plus += p; file.minus += m;
      files.set(key, file);
      totals.plus += p; totals.minus += m;
      totals.editCount += 1;
      if (said) totals.withProse += 1;
      if (stamp) {
        if (!totals.startedAt || stamp < totals.startedAt) totals.startedAt = stamp;
        if (stamp > totals.endedAt) totals.endedAt = stamp;
      }
    },
    done() {
      return {
        files: [...files.values()],
        roots: [...roots].filter(Boolean),
        plus: totals.plus,
        minus: totals.minus,
        editCount: totals.editCount,
        withProse: totals.withProse,
        startedAt: totals.startedAt || undefined,
        endedAt: totals.endedAt || undefined,
      };
    },
  };
}
