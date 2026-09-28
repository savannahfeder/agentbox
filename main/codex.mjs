// A CODEX TURN, IN THE WORDS AGENTBOX ALREADY DRAWS.
//
// main/codex-app-server.mjs is the transport: one child process speaking
// newline-delimited JSON-RPC 2.0, approvals answered or refused, threads
// routed. It hands its caller notifications and nothing else. THIS file is the
// layer above it, and its whole job is that a Codex run reaches her page
// looking like every other run.
//
// The supervisor runs four independent readers over every line a Claude Code
// worker prints (main/supervisor.mjs:4085-4290), and a fifth reader over the
// finished session (main/code-change.mjs):
//
//   captureStream       -> session.sessionId, session.result, session.resultIsError
//   streamingText       -> session.saying, the sentence being typed right now
//   traceStreamLine     -> the persisted trace, "HH:MM:SS  [Bash] <cmd>"
//   summarizeStreamLine -> the short In Progress tail
//   changeFromTranscript-> the artifact she opens, files and hunks and rows
//
// Each has a twin below producing THE SAME OUTPUT SHAPE, so a later slice can
// swap readers per engine and nothing downstream — the thread, the byline, the
// file chips, the diff pane, the header arithmetic — needs to know which engine
// ran. That is not a tidiness preference.
//
// ONE STRUCTURAL DIFFERENCE, AND IT IS IN EVERY SIGNATURE HERE. Claude Code's
// readers take a raw LINE and parse it themselves, five times over, because
// stdout is where the events arrive. app-server's events arrive already parsed:
// the transport does the framing, the JSON and the routing, and calls
// `onNotification(method, params)`. So every reader below takes `(method,
// params)` instead of a line, and none of them contains a `JSON.parse`. The
// try/catch is still there, because a reader that throws inside the
// supervisor's stdout loop takes the reader out for the rest of the session,
// which is a worker that keeps running and reports nothing — the exact silent
// shape CLAUDE.md files under "A WORKER THAT DID NOT FINISH DELIVERED NOTHING".
//
// `git show 258d71d^:main/codex.mjs` is the 08-25 original, worth reading for
// intent. ITS EVENT PARSING IS OBSOLETE TWICE OVER: it targeted `codex exec
// --json`, whose item types are snake_case (`agent_message`, `file_change`) and
// which carries neither `phase` nor a real diff. One thing is carried over
// deliberately and credited here rather than rediscovered — see the trace.
//
// ------------------------------------------------------------------------
// MEASURED ON THIS MAC 2026-09-04 AGAINST codex-cli 0.148.0, over a 223-frame
// capture of one real turn, plus the CLI's own
// `codex app-server generate-json-schema` dump for the cases that turn did not
// produce. Six things differ from the written brief, and each is a whole
// feature that fails silently rather than loudly:
//
// 1. A `fileChange` OF KIND `add` IS NOT A DIFF. The `update` entry read
//    "@@ -1 +1 @@\n-...\n+...\n"; the `add` entry in the same event was the
//    string "hello\n" — raw file content, no `@@` header. A reader that
//    assumes a unified diff per file finds zero hunks in every file a run
//    creates. `hunksFor` therefore branches on the EVIDENCE IN THE STRING, not
//    on the kind word, which also means a `delete` (which that run did not
//    produce) is read correctly whichever of the two shapes it turns out to be.
//
// 2. THERE IS NO `turn/failed` NOTIFICATION. `ServerNotification` lists
//    `turn/started`, `turn/completed` and `turn/moderationMetadata`, and the
//    string "turn/failed" appears in none of the schema files. Failure arrives
//    as `turn/completed` with `turn.status: "failed"` and a populated
//    `turn.error` — "Only populated when the Turn's status is failed". A reader
//    waiting for `turn/failed` marks every failed run a success. It is still
//    ANSWERED below, because a notification we drop is a run that reads as
//    unfinished forever, and being wrong in that direction costs nothing.
//
// 3. `TurnStatus` HAS FOUR VALUES: completed | interrupted | failed |
// inProgress. `interrupted` is what `turn/interrupt` leaves behind and it is a
// run with no answer exactly as much as `failed` is.
//
// 4. A COMMAND IN FLIGHT IS `inProgress`, camelCase, not `in_progress`.
//    `CommandExecutionStatus` = inProgress | completed | failed | declined, and
//    `declined` is the status an approval this app refuses produces.
//
// 5. `reasoning` ITEMS WERE EMPTY — all five of them, `summary: []` and
//    `content: []`. See the trace for what that settles.
//
// 6. `move_path` EXISTS ONLY ON THE `update` KIND. `PatchChangeKind` is a
//    three-way union and only `UpdatePatchChangeKind` carries the field. A
//    rename is an update that moved; `add` and `delete` have nothing but
//    `type`.
//
// WHAT THIS FILE DELIBERATELY DOES NOT READ, so the next slice does not have to
// re-derive that it is missing rather than broken. 0.148.0's `ThreadItem` union
// has eighteen members; five are handled here and the rest are ignored. The one
// that will matter first is `mcpToolCall` (`{server, tool, arguments, status,
// result, error, durationMs}`), because the store is an MCP server and a
// worker's claim/update/finish calls are therefore invisible in a Codex trace
// today where they are `[mcp__<store>__update_item]` lines in a Claude one.
// It is left out because no measured run has produced one and this repo's rule
// is that a mapping is verified by running it; `plan`, `webSearch`,
// `subAgentActivity` and `contextCompaction` are the same. None of them throws.

import fs from 'node:fs';
import path from 'node:path';
import { shortPath } from './code-change.mjs';
import { filesFromPatch } from './git-change.mjs';

/**
 * A block of prose long enough that keeping it in memory is a bug rather than
 * a feature. Her longest single line of agent prose over 1,664 traces is 423
 * characters, so this is fifty times the worst real one; past it the block is
 * dropped and the trace is left to deliver it whole, which costs her the live
 * view of one paragraph and cannot cost the process anything.
 *
 * AND IT IS NOW THE ONLY COPY. It was written twice for one slice, because the
 * supervisor kept a module-private `const` that the reader slice was not
 * allowed to edit. Two copies of a rule become two different rules within a
 * week, and this pair drifting apart would be a live sentence one engine drops
 * at 20,000 characters and the other keeps, sitting under its own traced copy
 * on her screen forever. main/supervisor.mjs imports this one.
 */
export const SAYING_CAP = 20_000;

/**
 * The two guards that decide whether a path belongs in her artifact at all.
 *
 * COPIED, CHARACTER FOR CHARACTER, from `collector` in main/code-change.mjs,
 * which is module-private there and which this slice may not modify. CLAUDE.md
 * is right that two copies of a rule become two different rules within a week,
 * so the copies are EXPORTED and
 * tests/a-codex-turn-reads-like-every-other-run-on-her-page.test.mjs asserts
 * they still match the source text of the original. Edit either and the other
 * goes red naming the file it has to move with.
 *
 * They matter more here than they do there. Codex reports an absolute path for
 * every file it touches, including its own /tmp scratch, so these are the
 * common case rather than the corner one.
 */
export const NOT_CODE = /(^|\/)(node_modules|\.git)\//;
export const SCRATCH = /^\/(private\/)?(tmp|var\/folders)\//;

/* =============================== the answer =============================== */

/**
 * The final word of a turn, and the id a reply resumes.
 *
 * THE HARD DIFFERENCE FROM CLAUDE CODE, AND THE WHOLE REASON THIS FUNCTION IS
 * NOT A RENAME OF `captureStream`: app-server has no `result` event. Claude
 * Code's stream ends with one `{type:'result'}` line carrying the answer and an
 * `is_error` flag, and `captureStream` keys on it. There is nothing shaped like
 * that here. What replaces it is `phase` on an `agentMessage`: measured over
 * one real turn, five agent messages, four of them `commentary` and EXACTLY ONE
 * `final_answer`.
 *
 * So the answer is the final_answer message and nothing else. The 08-25 build
 * took the LAST message it saw, because `codex exec` gave it no phase to read;
 * doing that here puts a progress note on her row as the worker's finished
 * word, and `awaitingHer` (supervisor.mjs) then reports a row as waiting on her
 * when the work never finished. That is her 2026-08-06 incident — a `done` she
 * never saw — arriving through a new door.
 *
 * LAST-WINS SURVIVES AS THE COMPATIBILITY PATH AND ONLY THAT. The schema says
 * plainly that "providers do not emit this consistently, so callers must treat
 * None as 'phase unknown' and keep compatibility behavior for legacy models".
 * An unphased message therefore sets the answer — but never over a real
 * final_answer, and never after one has arrived.
 *
 * A TURN THAT ENDS WITH NO FINAL ANSWER GETS NO RESULT, ON PURPOSE. That is
 * what `saidNothingSheCanUse` is for: `result == null` is the first of the
 * three shapes CLAUDE.md names, "said nothing at all -> the supervisor speaks
 * for it", and there is already a writer for it in OUR words. Inventing a
 * result here would take that row away from the writer that exists and hand her
 * a guess in the agent's voice. The one thing worth doing is looking once more
 * where the answer might still be: `turn/completed` carries `turn.items`, and
 * in the measured run that array held exactly the final agentMessage even
 * though `itemsView` was "summary". So a run whose item events were missed
 * still has its answer in the last frame, for free.
 */
export function captureCodexEvent(session, method, params) {
  try {
    if (!session || typeof method !== 'string') return;
    const p = params ?? {};

    // The id `thread/resume` takes, and it is at `params.thread.id`. There is
    // no `params.threadId` on this notification; reading the one that does not
    // exist leaves every session unresumable with no symptom until she types a
    // reply on a finished row.
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
      // A turn that failed after saying something still failed, and her row
      // must not read as answered because a message got through first.
      session.result = turnTrouble(turn, status);
      session.resultIsError = true;
    }
  } catch { /* a reader that throws is a session that goes quiet */ }
}

/** completed | interrupted | failed | inProgress, defaulting to the method. */
function turnStatus(method, turn) {
  if (typeof turn?.status === 'string') return turn.status;
  return method === 'turn/failed' ? 'failed' : 'completed';
}

/** Why a turn did not finish, in whatever words the server gave us. */
function turnTrouble(turn, status) {
  const why = String(turn?.error?.message ?? '').trim();
  const more = String(turn?.error?.additionalDetails ?? '').trim();
  const head = why || (status === 'interrupted' ? 'the turn was interrupted' : `the turn ${status}`);
  return more ? `${head}\n${more}` : head;
}

/**
 * The final answer inside a turn's own item list, or null.
 *
 * ONLY a `final_answer` counts, never the last message in the list. The list
 * arrives as a summary view and a summary of a turn that narrated and then
 * died is narration.
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

/* ============================ the live sentence =========================== */

/**
 * THE SENTENCE THE AGENT IS TYPING RIGHT NOW, over app-server's own deltas.
 *
 * Claude Code's half of that is `streamingText` reading
 * `--include-partial-messages` frames; `item/agentMessage/delta` is the same
 * channel here, 157 frames in the measured turn, with the text at
 * `params.delta`.
 *
 * The three rules are the supervisor's, unchanged, and each of them is load
 * bearing (see supervisor.mjs:4131 for the long form):
 *
 * - ONE BLOCK AT A TIME. An `item/started` for an agentMessage starts the next
 *   one from empty, so the live string and the string the trace will carry are
 *   the same string, and the thread can drop the live copy the moment the
 *   traced one arrives rather than guessing.
 * - NOT CLEARED WHEN THE MESSAGE FINISHES. The trace is written on one channel
 *   and read on another; clearing here blinks the sentence off her screen for
 *   however long the read takes and then puts it back.
 * - DROPPED AT THE CAP, NEVER CUT. A cut string never matches the traced one
 *   and would sit under it on her screen forever.
 *
 * Returns true when the string moved, which is what earns a push.
 */
export function codexStreamingText(session, method, params) {
  try {
    if (!session) return false;
    const p = params ?? {};

    if (method === 'item/started') {
      // Only prose resets it. A command starting or a patch being applied
      // means this turn has moved on from talking, and the block already typed
      // stays on screen until the trace delivers the same words.
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

/* ================================ the trace =============================== */

/**
 * The persisted trace line, in the format renderer/src/run-files.ts parses:
 * `/^\d\d:\d\d:\d\d {2}(.*)$/`, with a tool in brackets and its key argument
 * after it. Fuller than the tail, because "tool: Bash" answers nothing when the
 * founder asks what a session actually did.
 *
 * ONLY `item/completed` IS TRACED, AND THE 08-25 BUILD ALREADY KNEW WHY: the
 * same item arrives on `item/started` with an empty output and again on
 * `item/completed` with the real one. Tracing both puts every command on her
 * page twice — three commands became six lines in the measured turn.
 *
 * A READ DONE WITH `sed` IS TRACED AS THE SHELL COMMAND IT WAS. Codex reads and
 * searches by running shell commands rather than by calling tools named Read
 * and Grep, so its work lines really are `[Bash] sed -n '1,200p' math.js` where
 * Claude Code's would be `[Read] math.js`. Rewriting one into the other is
 * Agentbox claiming a tool call Codex never made — and the command is also the
 * thing an approval card is raised about, so the honest spelling is the only
 * one that stays true next to the card. Her peers instruction cuts this way as
 * well as the other: equivalent does not mean identical.
 *
 * AND THE BRACKETS ON A FILE CHANGE ARE `Write` AND `Edit` ANYWAY, which is the
 * same call read the other way round. The bracket is the trace's own shared
 * vocabulary — `[Bash]` is already Claude Code's word for a shell command and
 * both engines use it — and renderer/src/run-files.ts matches
 * `/^(Write|Edit|NotebookEdit)$/` on it to find the files a run made for her.
 * A Codex worker that wrote her an .html through its patch tool would lose the
 * chip on its card under any other word. THAT is what marking Codex as lesser
 * would actually look like in the product. `Delete` and `Move` are new words
 * because Claude Code has no tool that does either, so there is nothing to
 * borrow and nothing to misrepresent.
 *
 * NOTHING IS WRITTEN FOR A `reasoning` ITEM. Claude Code's trace carries no
 * thinking, one surface should not grow two vocabularies, and the measurement
 * settles it besides: all five reasoning items in the captured turn had
 * `summary: []` and `content: []`, so a reasoning line would have been five
 * bare timestamps in a twenty-eight second run.
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
      // Claude Code's footer counts turns; Codex has exactly one turn per run,
      // so that number would read "1 turns" forever and tell her nothing. The
      // duration goes in its place, which is the fact the turn actually
      // carries (`durationMs`, 27746 in the measured run).
      const span = Number.isFinite(turn.durationMs) ? `${(turn.durationMs / 1000).toFixed(1)}s` : '?s';
      const said = bad ? turnTrouble(turn, status) : (finalAnswerIn(turn.items) ?? '');
      return `\n${at}  == RESULT (${status}${bad ? ' ERROR' : ''} · ${span}) ==\n${said.slice(0, 4000)}`;
    }

    return null;
  } catch {
    return null;
  }
}

/** The changes on a fileChange item, always an array. */
function changesOf(item) {
  return Array.isArray(item?.changes) ? item.changes : [];
}

/**
 * WHAT ONE FILE CHANGE DID, IN ONE WORD, AND THE ONLY COPY OF THAT RULE. Null
 * when the change names no file, which is the one shape that cannot be said out
 * loud at all.
 *
 * Exported because main/codex-approvals.mjs needs the same four words on the
 * approval card she reads BEFORE a patch is applied. A second copy of it would
 * be one edit away from a trace line saying `[Write]` under a card that said
 * `Edit` about the same change. `move_path` lives only on the `update` kind
 * (measurement 6 at the top of this file), so a rename is an update that moved.
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

/** One file change as its bracket and its path. Null when there is no path. */
function fileVerb(change) {
  const word = fileVerbWord(change);
  if (!word) return null;
  const from = String(change.path).trim().slice(0, 200);
  // Both ends of a move, because the path she would go looking for is the one
  // it is at now and the one above it is the one it left.
  if (word === 'Move') return `[Move] ${from} -> ${String(change.kind.move_path).trim().slice(0, 200)}`;
  return `[${word}] ${from}`;
}

/* ================================= the tail =============================== */

/** The In Progress tail wants the gist, in the same words Claude Code's does. */
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

/* =============================== the change =============================== */

/**
 * HOW MANY FRAMES OF ONE RUN ARE WORTH HOLDING FOR ITS ARTIFACT.
 *
 * The other engine's conversation is on disk and is read once at the exit, so
 * it costs nothing while the run goes on. There is no such file here: an
 * app-server notification is delivered once and gone, so the only place the
 * conversation half of a Codex artifact can be assembled from is memory.
 *
 * The measured turn was 223 frames end to end and left five of the two kinds
 * this keeps, so five thousand is more than twenty times a whole real run's
 * frames and a thousand times its edits. Past it nothing further is kept and
 * the artifact is short by whatever came after -- which is a partial card and
 * not a broken one, because the DISK half is read independently and wins
 * wherever the two disagree (`mergeChange`, main/code-change.mjs). Growing
 * without a bound is the alternative, and a run that edits in a loop would take
 * her app down with it.
 */
export const CHANGE_FRAME_CAP = 5_000;

/**
 * AND HOW MANY BYTES, BECAUSE A FRAME CAP IS NOT A MEMORY CAP.
 *
 * The count above bounds how MANY frames are kept and says nothing about how
 * big each one is, and each one may carry up to the transport's own frame limit
 * (MAX_FRAME_LENGTH, 16 MiB). Five thousand of those is eighty gigabytes, which
 * is not a bound at all: it is her app dying on the exact run this cap was
 * written to survive, the one that edits in a loop.
 *
 * Sixteen mebibytes, which is one whole frame's worth of everything. The
 * measured turn's five kept frames were a few kilobytes between them, so this
 * is thousands of times a real run and still a number the process can hold. Past
 * it nothing further is kept and the artifact is short by whatever came after --
 * a partial card and not a broken one, because the DISK half is read
 * independently and wins wherever the two disagree (`mergeChange`,
 * main/code-change.mjs).
 */
export const CHANGE_BYTE_CAP = 16 * 1024 * 1024;

/**
 * KEEP THE FRAMES THE ARTIFACT WILL NEED, AND NOTHING ELSE.
 *
 * Two kinds out of the eighteen in `ThreadItem`: the `fileChange` items, which
 * are the edits themselves, and the `agentMessage` items, which are where the
 * sentence beside a hunk comes from. Their ORDER is the whole of how the second
 * attaches to the first (`changeFromCodexTurn` takes the nearest preceding
 * message), so they are kept in one list rather than two.
 *
 * Called on the session's own event path, so it is written to be unable to
 * throw there: a reader that throws inside the supervisor's stream loop takes
 * itself out for the rest of the session, which is a worker that keeps running
 * and reports nothing.
 */
export function rememberCodexChange(session, method, params) {
  try {
    if (!session || method !== 'item/completed') return;
    const type = params?.item?.type;
    if (type !== 'fileChange' && type !== 'agentMessage') return;
    const kept = session.codexChange ?? (session.codexChange = []);
    if (kept.length >= CHANGE_FRAME_CAP) return;
    // AND THE SIZE OF WHAT IS ALREADY HELD, WHICH THE COUNT DOES NOT BOUND.
    // A fileChange frame carries the whole per-file diff, so five thousand of
    // them is only a bound if each one is small, and the one run this cap was
    // written for -- the one that edits in a loop -- is exactly the run where
    // they are not. Measured off the frame itself rather than off a guess: a
    // diff is a string, and its length is the number that matters.
    const size = frameSize(params);
    const held = session.codexChangeBytes ?? 0;
    if (held + size > CHANGE_BYTE_CAP) return;
    session.codexChangeBytes = held + size;
    kept.push({ method, params });
  } catch { /* an artifact is never worth a session */ }
}

/**
 * Roughly how much of one frame this is going to hold on to.
 *
 * The two fields that actually carry weight are the per-file `diff` and the
 * agent's `text`; everything else on a `ThreadItem` is ids and enums. Counted
 * rather than JSON.stringify'd because this runs on the session's own event
 * path, once per item, and serialising a ten-megabyte diff to measure it is the
 * cost the cap exists to avoid.
 */
function frameSize(params) {
  const item = params?.item ?? {};
  let n = String(item.text ?? '').length;
  for (const change of changesOf(item)) n += String(change?.diff ?? '').length;
  return n;
}

/**
 * WHAT THE RUN CHANGED, in the shape main/code-change.mjs already produces.
 *
 * The pane that draws it (renderer/src/components/CodeArtifact.tsx), the
 * arithmetic under it (renderer/src/code-artifact.ts) and the chip on the card
 * (renderer/src/run-files.ts) are untouched by this slice, so matching the
 * shape exactly IS the deliverable: `{files:[{path, abs, hunks:[{rows, plus,
 * minus, said?, at?}], plus, minus, at}], roots, plus, minus, editCount,
 * withProse, startedAt, endedAt}`.
 *
 * AND CODEX HANDS US THE HALF THAT WAS EXPENSIVE. The 08-25 build needed a
 * 161-line V4A patch parser to reconstruct what a run had changed out of
 * `codex exec`'s patch text. `item/completed` now carries a real per-file diff,
 * so the rows come out of the same unified-diff reader git's own changes go
 * through (`filesFromPatch`, main/git-change.mjs) rather than a second copy of
 * one. The only thing synthesized is the two-line file header that reader
 * expects; the hunk bodies are the server's own bytes.
 *
 * `events` are the notifications as the transport delivered them, `{method,
 * params}`, in order. `roots` are the checkouts this run's work happened in and
 * `since` is the moment to start from, both exactly as code-change.mjs means
 * them. `rememberCodexChange` below is what collects them.
 */
export function changeFromCodexTurn(events, { roots = [], since = 0 } = {}) {
  const into = collector({ roots });
  // The agent's own sentence beside the hunk. Claude Code takes it from the
  // text blocks of the same message the edit was in; Codex narrates in a
  // separate agentMessage just before it applies the patch, so the nearest
  // preceding message is the same sentence.
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

/**
 * Where the file IS once the change has landed.
 *
 * A rename is filed under the path it moved to, which is the rule
 * main/git-change.mjs already states for git's own renames. A change she
 * opens has to lead to a file that exists.
 */
function destinationOf(change) {
  const to = typeof change?.kind?.move_path === 'string' ? change.kind.move_path.trim() : '';
  const from = String(change?.path ?? '').trim();
  return to || from || null;
}

/**
 * One file change as hunks of rows.
 *
 * THE BRANCH IS ON THE STRING, NOT ON THE KIND, and that is the measurement
 * from the top of this file: an `update` arrived as "@@ -1 +1 @@\n-...\n+...",
 * an `add` in the SAME event arrived as "hello\n". A delete did not occur in
 * that run at all, so guessing which shape it uses would be exactly the kind of
 * unverified mapping this repo refuses; asking the string instead answers for
 * every kind, including ones this CLI has not shipped yet.
 */
function hunksFor(change) {
  const diff = String(change?.diff ?? '');
  if (!diff) return [];
  if (diff.startsWith('@@')) {
    // The two header lines `filesFromPatch` opens a file on. A placeholder
    // name rather than the real path, because that reader strips `a/` and `b/`
    // prefixes and trims, and a real path with a space in it would come back
    // wrong; the path is already known here and is never read back out of this.
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

/** One line of what the agent said, the same shape code-change.mjs keeps. */
function proseFrom(text) {
  const said = String(text ?? '').trim();
  if (!said) return '';
  const first = said.split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '';
  return first.slice(0, 400);
}

/**
 * Each root, and also what the filesystem really calls it.
 *
 * Measured in main/code-change.mjs on 2026-08-26 and it bites harder here: the
 * app knew a checkout as `/tmp/proof/widget-repo` and an edit against
 * `/private/tmp/proof/widget-repo/math.js` matched no root and was dropped, so
 * a run that really did change her code finished with an artifact that did not
 * mention it. Codex reports the RESOLVED spelling for every path it touches, so
 * for this engine that is the ordinary case rather than the corner one.
 *
 * Resolved off the deepest ancestor that still exists rather than off the root
 * itself, because this runs after the work is over and CLAUDE.md's process
 * etiquette asks a session to remove its worktree as the last thing it does.
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

/**
 * The tally, and the two rules that decide whether a file belongs in her
 * artifact at all. The same collector code-change.mjs keeps private, over
 * absolute paths that arrived in an event instead of in a transcript.
 */
function collector({ roots = [] } = {}) {
  const files = new Map();
  const totals = { plus: 0, minus: 0, editCount: 0, withProse: 0, startedAt: 0, endedAt: 0 };
  const spellings = rootSpellings(roots);

  return {
    add(abs, rows, { said = '', stamp = 0 } = {}) {
      abs = String(abs ?? '').trim();
      if (!abs || NOT_CODE.test(abs)) return;
      const rel = shortPath(abs, spellings);
      // Inside one of this run's own roots it is the product, wherever it
      // sits. Outside all of them AND under scratch, it is nobody's.
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
