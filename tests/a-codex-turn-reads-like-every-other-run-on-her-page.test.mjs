// A CODEX TURN, TURNED INTO THE FOUR THINGS AGENTBOX ALREADY DRAWS.
//
// WHY THIS FILE EXISTS. This file is about the layer above it: the four readers
// the supervisor already runs over every Claude Code line (`captureStream`,
// `streamingText`, `traceStreamLine`, `summarizeStreamLine`,
// main/supervisor.mjs:4085-4290) and the change reader (`changeFromTranscript`,
// main/code-change.mjs), each given a Codex-shaped twin that produces THE SAME
// OUTPUT SHAPE. A later slice swaps them per engine; nothing downstream may
// notice which engine it was.
//
// It is that a Codex run reaches her page in the same words, with the same
// chips and the same arithmetic, as a Claude one.
//
// ------------------------------------------------------------------------
// EVERY EVENT BELOW IS COPIED VERBATIM OUT OF A REAL RUN, captured on this Mac
// 2026-09-04 against codex-cli 0.148.0. Nothing here is invented except where a
// case did not occur in that run, and each of those is marked SCHEMA rather
// than MEASURED, with the definition it was read out of.
//
// SIX FACTS THAT RUN CONTRADICTED, all pinned below rather than only written
// down, because each one is a whole feature that silently produces nothing:
//
// 1. A `fileChange` OF KIND `add` CARRIES RAW FILE CONTENT, NOT A DIFF. The
// `update` entry was "@@ -1 +1 @@\n-...\n+...\n"; the `add` entry in the same
// event was the two-word string "hello\n" with no `@@` header at all. A reader
// that assumes "a real unified diff per file" parses zero hunks for every file
// a run creates, and a run that only creates files produces an empty change —
// which is exactly the empty card a tester was shown on their onboarding call. So
// the parser branches on the EVIDENCE IN THE STRING (does it start with `@@`),
// never on the kind word.
//
// 2. THERE IS NO `turn/failed` NOTIFICATION IN 0.148.0. Checked against the
// CLI's own `codex app-server generate-json-schema` dump: `ServerNotification`
// lists `turn/started`, `turn/completed` and `turn/moderationMetadata`, and the
// string "turn/failed" appears nowhere in any schema file. Failure arrives as
// `turn/completed` with `turn.status: "failed"` and a populated `turn.error`. A
// reader that waits for `turn/failed` marks every failed run a success.
//
// 3. `TurnStatus` HAS FOUR VALUES, not two: completed | interrupted | failed |
//    inProgress. `interrupted` is what a `turn/interrupt` leaves behind, and it
//    is a run with no answer just as much as `failed` is.
//
// 4. A COMMAND'S IN-FLIGHT STATUS IS `inProgress`, camelCase. The written
//    reference said `in_progress`. Measured on the live `item/started`:
//    `"status":"inProgress"`. (`CommandExecutionStatus` = inProgress |
//    completed | failed | declined — and `declined` is what an approval this
//    app refuses produces, which is the one status that means the founder
//    said no.)
//
// 5. `reasoning` ITEMS WERE EMPTY, all five of them: `summary: []` and
// `content: []`. See the trace test below for what that buys.
//
// 6. `move_path` LIVES ONLY ON THE `update` KIND. `PatchChangeKind` is a
//    three-way union and only `UpdatePatchChangeKind` has the field; `add` and
//    `delete` have nothing but `type`. So a rename is an update that moved.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SAYING_CAP,
  captureCodexEvent,
  codexStreamingText,
  traceCodexEvent,
  summarizeCodexEvent,
  changeFromCodexTurn,
  NOT_CODE,
  SCRATCH,
} from '../main/codex.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------- the real captured frames ----------------------- */

const THREAD = '01a068ed-7f68-7ca3-9697-3e62e6fcd597';
const TURN = '01a068ed-8025-71b3-8e2c-70f3f11cf236';
const WORK = '/private/tmp/claude-501/-Users-sam-Desktop/8c0f63a4-b11a-49a5-8f40-7b4812689aab/scratchpad/shaperepo';

/** MEASURED. The id is at `params.thread.id`, never `params.threadId`. */
const threadStarted = () => ({
  method: 'thread/started',
  params: {
    thread: {
      id: THREAD,
      sessionId: THREAD,
      ephemeral: false,
      cwd: WORK,
      cliVersion: '0.148.0',
      path: `/Users/sam/.codex/sessions/2026/09/04/rollout-2026-09-04T00-19-50-${THREAD}.jsonl`,
      status: { type: 'idle' },
      turns: [],
    },
  },
});

/** MEASURED. Four of the five agent messages in that run carried this phase. */
const commentary = (text, id = 'msg_commentary') => ({
  method: 'item/completed',
  params: {
    item: { type: 'agentMessage', id, text, phase: 'commentary', memoryCitation: null },
    threadId: THREAD,
    turnId: TURN,
    completedAtMs: 1788466812000,
  },
  emittedAtMs: 1788466812001,
});

/** MEASURED. Exactly one of the five carried this, and its text was "DONE". */
const finalAnswer = (text = 'DONE') => ({
  method: 'item/completed',
  params: {
    item: {
      type: 'agentMessage',
      id: 'msg_0585aa2e7f5b358d016a99d68221fc87d2aa40233d7230ebc9',
      text,
      phase: 'final_answer',
      memoryCitation: null,
    },
    threadId: THREAD,
    turnId: TURN,
    completedAtMs: 1788466818000,
  },
  emittedAtMs: 1788466818001,
});

/** MEASURED. `item/started` carries the phase already, and an empty text. */
const messageStarted = (phase = 'commentary', id = 'msg_commentary') => ({
  method: 'item/started',
  params: { item: { type: 'agentMessage', id, text: '', phase, memoryCitation: null }, threadId: THREAD, turnId: TURN },
});

/** MEASURED. 157 of these in the run; the text is at `params.delta`. */
const delta = (text, itemId = 'msg_commentary') => ({
  method: 'item/agentMessage/delta',
  params: { threadId: THREAD, turnId: TURN, itemId, delta: text },
  emittedAtMs: 1788466795248,
});

/** MEASURED, verbatim, including the `/bin/zsh -lc` wrapper Codex adds. */
const commandStarted = () => ({
  method: 'item/started',
  params: {
    item: {
      type: 'commandExecution',
      id: 'call_3iYdhZsXIyAs6NluDfXSwOrw',
      pluginId: null,
      scriptPath: null,
      command: '/bin/zsh -lc ls',
      cwd: WORK,
      processId: '64901',
      source: 'unifiedExecStartup',
      status: 'inProgress',
      commandActions: [{ type: 'listFiles', command: 'ls', path: null }],
      aggregatedOutput: null,
      exitCode: null,
      durationMs: null,
    },
    threadId: THREAD,
    turnId: TURN,
  },
});

const commandCompleted = () => ({
  method: 'item/completed',
  params: {
    item: {
      type: 'commandExecution',
      id: 'call_3iYdhZsXIyAs6NluDfXSwOrw',
      pluginId: null,
      scriptPath: null,
      command: '/bin/zsh -lc ls',
      cwd: WORK,
      processId: '64901',
      source: 'unifiedExecStartup',
      status: 'completed',
      commandActions: [{ type: 'listFiles', command: 'ls', path: null }],
      aggregatedOutput: 'math.js\n',
      exitCode: 0,
      durationMs: 0,
    },
    threadId: THREAD,
    turnId: TURN,
    completedAtMs: 1788466810000,
  },
  emittedAtMs: 1788466810001,
});

/**
 * MEASURED, verbatim: one event carrying an update and an add together, and
 * the two of them in DIFFERENT string formats. See fact 1 at the top.
 */
const fileChangeCompleted = () => ({
  method: 'item/completed',
  params: {
    item: {
      type: 'fileChange',
      id: 'call_1DZ6jb1mpeq0iOaUYYZimHDv',
      changes: [
        {
          path: `${WORK}/math.js`,
          kind: { type: 'update', move_path: null },
          diff: '@@ -1 +1 @@\n-export function add(a,b){return a+b}\n+export function add(a,b){return a-b}\n',
        },
        { path: `${WORK}/notes.txt`, kind: { type: 'add' }, diff: 'hello\n' },
      ],
      status: 'completed',
    },
    threadId: THREAD,
    turnId: TURN,
    completedAtMs: 1788466814342,
  },
  emittedAtMs: 1788466814343,
});

/** MEASURED. `turn.items` came back as the summary view holding the answer. */
const turnCompleted = ({ status = 'completed', error = null, items = [finalAnswer().params.item] } = {}) => ({
  method: 'turn/completed',
  params: {
    threadId: THREAD,
    turn: {
      id: TURN,
      items,
      itemsView: 'summary',
      status,
      error,
      startedAt: 1788466790,
      completedAt: 1788466818,
      durationMs: 27746,
    },
  },
  emittedAtMs: 1788466818500,
});

/**
 * SCHEMA, not measured: that run deleted nothing and renamed nothing.
 * `DeletePatchChangeKind` has only `type`; `UpdatePatchChangeKind` is the one
 * kind carrying `move_path`.
 */
const deleted = (path, diff) => ({
  method: 'item/completed',
  params: {
    item: { type: 'fileChange', id: 'call_delete', changes: [{ path, kind: { type: 'delete' }, diff }], status: 'completed' },
    threadId: THREAD,
    turnId: TURN,
    completedAtMs: 1788466815000,
  },
});

const renamed = (from, to, diff) => ({
  method: 'item/completed',
  params: {
    item: {
      type: 'fileChange',
      id: 'call_rename',
      changes: [{ path: from, kind: { type: 'update', move_path: to }, diff }],
      status: 'completed',
    },
    threadId: THREAD,
    turnId: TURN,
    completedAtMs: 1788466816000,
  },
});

const STAMPED = /^\d\d:\d\d:\d\d {2}/;
const bodies = (line) => String(line).split('\n').map((l) => l.replace(/^\d\d:\d\d:\d\d {2}/, ''));

/* ============================== the final word ============================ */

describe('the one message that is her answer', () => {
  // app-server has no `result` event, which is the single hardest difference
  // from Claude Code's stream: `captureStream` keys everything on
  // `type === 'result'` and there is nothing shaped like that here. `phase`
  // is the replacement and it is the ONLY replacement.
  it('takes the final_answer as the result, the way a Claude result event is taken', () => {
    const session = {};
    captureCodexEvent(session, 'item/completed', finalAnswer('DONE').params);
    expect(session.result).toBe('DONE');
    expect(session.resultIsError).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH. Treating any agent message as the result
  // (which is what the removed 08-25 build did, last-one-wins over `codex
  // exec`'s snake_case stream) puts a progress note on her row as the worker's
  // finished word, and `awaitingHer` then says the row is waiting on her when
  // the work never finished.
  it('does NOT take a commentary message as the result', () => {
    const session = {};
    captureCodexEvent(session, 'item/completed', commentary('I am patching math.js now.').params);
    expect(session.result).toBeUndefined();
    expect(session.resultIsError).toBeUndefined();
  });

  // The boundary the other side: commentary AFTER a final answer must not
  // overwrite it either. Nothing in the measured run does this, but `phase` is
  // documented as inconsistently emitted, so the terminal word is pinned once.
  it('keeps the final answer when commentary follows it', () => {
    const session = {};
    captureCodexEvent(session, 'item/completed', finalAnswer('DONE').params);
    captureCodexEvent(session, 'item/completed', commentary('one more thought').params);
    expect(session.result).toBe('DONE');
  });

  // A model that emits no phase at all is the compatibility case the schema
  // names. Last-wins, exactly the 08-25 behaviour, but only while no real
  // final_answer has arrived.
  it('falls back to last-message-wins when a model emits no phase', () => {
    const session = {};
    const noPhase = (text) => ({ item: { type: 'agentMessage', id: 'm', text }, threadId: THREAD, turnId: TURN });
    captureCodexEvent(session, 'item/completed', noPhase('first'));
    captureCodexEvent(session, 'item/completed', noPhase('second'));
    expect(session.result).toBe('second');
  });

  it('never lets an unphased message overwrite a real final answer', () => {
    const session = {};
    captureCodexEvent(session, 'item/completed', finalAnswer('DONE').params);
    captureCodexEvent(session, 'item/completed', { item: { type: 'agentMessage', id: 'm', text: 'later' } });
    expect(session.result).toBe('DONE');
  });

  // The id a reply resumes. `thread/resume` takes this and nothing else, and
  // reading `params.threadId` (which does not exist) leaves every session
  // unresumable with no symptom until she types a reply.
  it('remembers the thread id off thread/started, from params.thread.id', () => {
    const session = {};
    captureCodexEvent(session, 'thread/started', threadStarted().params);
    expect(session.sessionId).toBe(THREAD);
  });
});

describe('a turn that ended without an answer', () => {
  // The case the brief asked to think about, and the answer is: say nothing,
  // because the supervisor already has a writer for exactly this. CLAUDE.md's
  // three shapes are read off `saidNothingSheCanUse`, which is true when
  // `result == null`. Inventing a result here would take that row away from
  // the writer that exists and hand her our guess in the agent's voice.
  it('leaves the result unset when a completed turn produced no final answer', () => {
    const session = {};
    captureCodexEvent(session, 'item/completed', commentary('working on it').params);
    captureCodexEvent(session, 'turn/completed', turnCompleted({ items: [] }).params);
    expect(session.result).toBeUndefined();
  });

  // AND THE SECOND CHANCE, which costs nothing: the measured `turn/completed`
  // carried `items` holding exactly the final agentMessage, even though
  // `itemsView` was "summary". So a run whose item events were missed still
  // has its answer in the last frame.
  it('recovers the final answer from turn.items when the item event was missed', () => {
    const session = {};
    captureCodexEvent(session, 'turn/completed', turnCompleted().params);
    expect(session.result).toBe('DONE');
    expect(session.resultIsError).toBe(false);
  });

  // THE CASE THAT MUST NOT MATCH, and it is the whole reason the recovery
  // above is safe: `turn.items` arrives as a SUMMARY view, and the summary of
  // a turn that narrated and then stopped is narration.
  it('does NOT take a commentary message out of turn.items', () => {
    const session = {};
    captureCodexEvent(session, 'turn/completed', turnCompleted({
      items: [commentary('I am patching math.js now.').params.item],
    }).params);
    expect(session.result).toBeUndefined();
  });

  it('does not overwrite an answer it already has with the summary copy', () => {
    const session = {};
    captureCodexEvent(session, 'item/completed', finalAnswer('the real answer').params);
    captureCodexEvent(session, 'turn/completed', turnCompleted().params);
    expect(session.result).toBe('the real answer');
  });
});

describe('a turn that failed', () => {
  // Fact 2 at the top: this arrives on `turn/completed`, not on a
  // `turn/failed` that does not exist in 0.148.0.
  it('marks a failed turn as an error and carries the message', () => {
    const session = {};
    captureCodexEvent(session, 'turn/completed', turnCompleted({
      status: 'failed',
      items: [],
      error: { message: 'usage limit reached', codexErrorInfo: 'usageLimitExceeded', additionalDetails: null },
    }).params);
    expect(session.resultIsError).toBe(true);
    expect(session.result).toContain('usage limit reached');
  });

  // A failed turn that had already said something still failed. Her row must
  // not read as answered because a commentary line got through first.
  it('overrides an answer already captured when the turn then fails', () => {
    const session = {};
    captureCodexEvent(session, 'item/completed', finalAnswer('all done').params);
    captureCodexEvent(session, 'turn/completed', turnCompleted({ status: 'failed', items: [], error: { message: 'stream disconnected' } }).params);
    expect(session.resultIsError).toBe(true);
    expect(session.result).toContain('stream disconnected');
  });

  // Fact 3: `interrupted` is the fourth status and it is equally answerless.
  it('treats an interrupted turn as an error too', () => {
    const session = {};
    captureCodexEvent(session, 'turn/completed', turnCompleted({ status: 'interrupted', items: [], error: null }).params);
    expect(session.resultIsError).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH: a plain completed turn is not an error, and
  // an in-flight `turn/started` settles nothing at all.
  it('does not mark a completed turn as an error', () => {
    const session = {};
    captureCodexEvent(session, 'turn/completed', turnCompleted().params);
    expect(session.resultIsError).toBe(false);
  });

  it('leaves everything alone on turn/started', () => {
    const session = {};
    captureCodexEvent(session, 'turn/started', { threadId: THREAD, turn: { id: TURN, items: [], status: 'inProgress' } });
    expect(session.result).toBeUndefined();
    expect(session.resultIsError).toBeUndefined();
  });

  // Defensive only. `turn/failed` is not in this CLI's schema (fact 2), but
  // the written brief asserted it exists, so it is answered rather than
  // ignored — a notification we drop is a run that reads as unfinished.
  it('still handles a turn/failed notification if a future CLI sends one', () => {
    const session = {};
    captureCodexEvent(session, 'turn/failed', { threadId: THREAD, turn: { id: TURN, status: 'failed', error: { message: 'boom' } } });
    expect(session.resultIsError).toBe(true);
    expect(session.result).toContain('boom');
  });
});

/* ============================ the live sentence =========================== */

describe('the sentence the agent is typing right now', () => {
  it('accumulates the deltas and says when the string moved', () => {
    const session = {};
    expect(codexStreamingText(session, 'item/agentMessage/delta', delta('I').params)).toBe(true);
    codexStreamingText(session, 'item/agentMessage/delta', delta('’ll').params);
    codexStreamingText(session, 'item/agentMessage/delta', delta(' first').params);
    expect(session.saying).toBe('I’ll first');
    expect(session.sayingAt).toBeGreaterThan(0);
  });

  it('starts the next message from empty', () => {
    const session = { saying: 'the last thing it said' };
    expect(codexStreamingText(session, 'item/started', messageStarted().params)).toBe(true);
    expect(session.saying).toBe('');
  });

  // Deliberately NOT cleared when the message finishes: the trace is written
  // on one channel and read on another, so clearing here blinks the sentence
  // off her screen and puts it back. Same rule as supervisor.mjs:4131.
  it('does not clear the live sentence when the message completes', () => {
    const session = {};
    codexStreamingText(session, 'item/agentMessage/delta', delta('half a sen').params);
    codexStreamingText(session, 'item/completed', finalAnswer('half a sentence').params);
    expect(session.saying).toBe('half a sen');
  });

  // The boundary either side of the cap. Past it the block is DROPPED rather
  // than cut, because a cut string never matches the traced one and would sit
  // under it on her screen forever.
  it('keeps a block right up to the cap', () => {
    const session = {};
    codexStreamingText(session, 'item/agentMessage/delta', delta('x'.repeat(SAYING_CAP)).params);
    expect(session.saying).toHaveLength(SAYING_CAP);
  });

  it('drops the block the moment it goes one character past the cap', () => {
    const session = {};
    codexStreamingText(session, 'item/agentMessage/delta', delta('x'.repeat(SAYING_CAP)).params);
    codexStreamingText(session, 'item/agentMessage/delta', delta('x').params);
    expect(session.saying).toBe('');
  });

  // THE CASE THAT MUST NOT MATCH. A command running or a file being written is
  // not prose, and returning true for them would push the renderer on every
  // frame of a long run for nothing.
  it('says nothing moved for a command, a file change or an empty delta', () => {
    const session = {};
    expect(codexStreamingText(session, 'item/started', commandStarted().params)).toBe(false);
    expect(codexStreamingText(session, 'item/completed', fileChangeCompleted().params)).toBe(false);
    expect(codexStreamingText(session, 'item/agentMessage/delta', delta('').params)).toBe(false);
    expect(codexStreamingText(session, 'turn/completed', turnCompleted().params)).toBe(false);
  });
});

/* =============================== the trace =============================== */

describe('the trace line she reads afterwards', () => {
  it('stamps a command with the same shape Claude Code stamps a tool call', () => {
    const line = traceCodexEvent('item/completed', commandCompleted().params);
    expect(line).toMatch(STAMPED);
    expect(bodies(line)).toEqual(['[Bash] /bin/zsh -lc ls']);
  });

  // THE CASE THAT MUST NOT MATCH, and the one the 08-25 build got right first:
  // `commandExecution` arrives on `item/started` AND on `item/completed`, with
  // the same id and the same command. Tracing both puts every command on her
  // page twice — 3 commands became 6 lines in the measured run.
  it('does NOT trace the started half of a command, only the completed one', () => {
    expect(traceCodexEvent('item/started', commandStarted().params)).toBeNull();
  });

  // Her instruction that harnesses are peers cuts BOTH ways. Codex reads by
  // running shell commands, so this really is a Bash line and not a Read one;
  // rewriting `sed -n '1,200p' math.js` as "[Read] math.js" would be Agentbox
  // claiming a tool call Codex never made.
  it('leaves a read done with sed spelt as the shell command it was', () => {
    const params = structuredClone(commandCompleted().params);
    params.item.command = `/bin/zsh -lc "sed -n '1,200p' math.js"`;
    params.item.commandActions = [{ type: 'read', command: "sed -n '1,200p' math.js", name: 'math.js', path: `${WORK}/math.js` }];
    const line = traceCodexEvent('item/completed', params);
    expect(bodies(line)).toEqual([`[Bash] /bin/zsh -lc "sed -n '1,200p' math.js"`]);
    expect(line).not.toContain('[Read]');
  });

  it('writes the agent prose as its own stamped line', () => {
    const line = traceCodexEvent('item/completed', commentary('I am patching math.js now.').params);
    expect(bodies(line)).toEqual(['I am patching math.js now.']);
  });

  it('says nothing for a message with no text in it', () => {
    expect(traceCodexEvent('item/started', messageStarted().params)).toBeNull();
    expect(traceCodexEvent('item/completed', commentary('   ').params)).toBeNull();
  });

  // Fact 5. All five reasoning items in the measured run were EMPTY, and
  // Claude Code's trace carries no thinking at all, so a reasoning line would
  // be five bare timestamps in a 28-second run and a second vocabulary on the
  // one surface both engines share.
  it('writes nothing for a reasoning item', () => {
    const params = { item: { type: 'reasoning', id: 'rs_1', summary: [], content: [] }, threadId: THREAD, turnId: TURN };
    expect(traceCodexEvent('item/completed', params)).toBeNull();
    // And nothing even when a future model does fill them in: this is a
    // decision about her page, not a workaround for an empty field.
    params.item.summary = ['Considering the two edits'];
    expect(traceCodexEvent('item/completed', params)).toBeNull();
  });

  // The four file verbs. `Write` and `Edit` are the trace's OWN vocabulary for
  // what happened to a file — the same bracket both engines already share for
  // `[Bash]` — and using them is what keeps renderer/src/run-files.ts able to
  // find a Codex run's output: it matches `/^(Write|Edit|NotebookEdit)$/` on
  // the bracket, so a Codex worker that wrote her an .html through its patch
  // tool would lose the chip on its card under any other word. THAT is what
  // marking Codex as lesser would actually look like in the product.
  it('names an add a Write and an update an Edit, one line each', () => {
    const line = traceCodexEvent('item/completed', fileChangeCompleted().params);
    expect(bodies(line)).toEqual([`[Edit] ${WORK}/math.js`, `[Write] ${WORK}/notes.txt`]);
  });

  it('names a delete a Delete', () => {
    const line = traceCodexEvent('item/completed', deleted(`${WORK}/old.js`, '@@ -1 +0,0 @@\n-gone\n').params);
    expect(bodies(line)).toEqual([`[Delete] ${WORK}/old.js`]);
  });

  // A rename shows BOTH ends, because the path she would go looking for is the
  // one it is at now and the path in the trace above it is the one it left.
  it('names a rename a Move and says where it went', () => {
    const line = traceCodexEvent('item/completed', renamed(`${WORK}/a.js`, `${WORK}/b.js`, '').params);
    expect(bodies(line)).toEqual([`[Move] ${WORK}/a.js -> ${WORK}/b.js`]);
  });

  // The footer, in the shape `renderer/src/run-files.ts` and her reading pane
  // already know: "\n<stamp>  == RESULT (...) ==\n<the answer>".
  it('closes the run with a RESULT footer carrying the final answer', () => {
    const line = traceCodexEvent('turn/completed', turnCompleted().params);
    expect(line.startsWith('\n')).toBe(true);
    expect(line).toContain('== RESULT (completed');
    expect(line.endsWith('\nDONE')).toBe(true);
  });

  it('says ERROR in the footer of a failed turn, with the reason', () => {
    const line = traceCodexEvent('turn/completed', turnCompleted({ status: 'failed', items: [], error: { message: 'usage limit reached' } }).params);
    expect(line).toContain('== RESULT (failed ERROR');
    expect(line).toContain('usage limit reached');
  });

  // Every trace line, whatever produced it, is stamped the way
  // renderer/src/run-files.ts parses: /^\d\d:\d\d:\d\d {2}(.*)$/.
  it('stamps every line it emits so the file chips can be read back out', () => {
    const events = [commandCompleted(), fileChangeCompleted(), commentary('a note'), finalAnswer()];
    for (const e of events) {
      for (const line of traceCodexEvent(e.method, e.params).split('\n')) {
        expect(line, JSON.stringify(line)).toMatch(/^\d\d:\d\d:\d\d {2}\S/);
      }
    }
  });
});

/* ============================== the tail ================================= */

describe('the In Progress tail', () => {
  it('says the tool for a command and for a file change, in Claude Code words', () => {
    expect(summarizeCodexEvent('item/completed', commandCompleted().params)).toBe('tool: Bash');
    expect(summarizeCodexEvent('item/completed', fileChangeCompleted().params)).toBe('tool: Edit, Write');
  });

  it('says the prose for a message and the answer for a finished turn', () => {
    expect(summarizeCodexEvent('item/completed', commentary('halfway there').params)).toBe('halfway there');
    expect(summarizeCodexEvent('turn/completed', turnCompleted().params)).toBe('done: DONE');
  });

  it('says nothing for a started item, so the tail is not written twice', () => {
    expect(summarizeCodexEvent('item/started', commandStarted().params)).toBeNull();
    expect(summarizeCodexEvent('item/agentMessage/delta', delta('x').params)).toBeNull();
  });
});

/* ======================= the things that must not throw ================== */

describe('nothing here may take the supervisor down', () => {
  // Every one of these readers runs inside the supervisor's stdout loop. A
  // throw there kills the reader for the rest of the session, which is a
  // worker that keeps running and reports nothing — the exact silent shape
  // CLAUDE.md files under "A WORKER THAT DID NOT FINISH DELIVERED NOTHING".
  const junk = [
    ['item/completed', undefined],
    ['item/completed', null],
    ['item/completed', {}],
    ['item/completed', { item: null }],
    ['item/completed', { item: { type: 'webSearch', id: 'ws', query: 'codex app-server' } }],
    ['item/completed', { item: { type: 'somethingNobodyHasShippedYet', id: 'x' } }],
    ['item/completed', { item: { type: 'fileChange', changes: null } }],
    ['item/completed', { item: { type: 'fileChange', changes: [{ path: null, kind: null, diff: null }] }, }],
    ['item/completed', { item: { type: 'commandExecution' } }],
    ['turn/completed', { turn: null }],
    ['turn/completed', {}],
    ['thread/started', { thread: null }],
    ['item/agentMessage/delta', {}],
    [undefined, undefined],
    ['', ''],
  ];

  it('ignores an unknown item type and a malformed event rather than throwing', () => {
    for (const [method, params] of junk) {
      const session = {};
      expect(() => captureCodexEvent(session, method, params)).not.toThrow();
      expect(() => codexStreamingText(session, method, params)).not.toThrow();
      expect(() => traceCodexEvent(method, params)).not.toThrow();
      expect(() => summarizeCodexEvent(method, params)).not.toThrow();
      expect(traceCodexEvent(method, params)).toBeNull();
      expect(summarizeCodexEvent(method, params)).toBeNull();
      expect(codexStreamingText(session, method, params)).toBe(false);
    }
  });

  it('reads a whole turn of junk into an empty change without throwing', () => {
    expect(() => changeFromCodexTurn(junk.map(([method, params]) => ({ method, params })), { roots: [WORK] })).not.toThrow();
    expect(changeFromCodexTurn([null, undefined, {}, { method: 'item/completed' }], { roots: [WORK] }).files).toEqual([]);
  });
});

/* ============================== the change =============================== */

describe('what the run changed, in the shape the artifact already draws', () => {
  const change = (events, opts = {}) => changeFromCodexTurn(events, { roots: [WORK], ...opts });

  // main/code-change.mjs is the contract: `{files:[{path, abs, hunks:[{rows,
  // plus, minus, said?, at?}], plus, minus, at}], roots, plus, minus,
  // editCount, withProse, startedAt, endedAt}`. The pane that draws it
  // (renderer/src/components/CodeArtifact.tsx) and the arithmetic under it
  // (renderer/src/code-artifact.ts) are unchanged by this slice, so the shape
  // is the whole deliverable.
  it('turns one measured turn into two files with git-shaped rows', () => {
    const out = change([commentary('I am patching math.js.'), fileChangeCompleted()]);
    expect(out.files.map((f) => f.path)).toEqual(['math.js', 'notes.txt']);
    const math = out.files.find((f) => f.path === 'math.js');
    expect(math.abs).toBe(`${WORK}/math.js`);
    expect(math.hunks[0].rows).toEqual([
      ['-', 'export function add(a,b){return a+b}'],
      ['+', 'export function add(a,b){return a-b}'],
    ]);
    expect(math.plus).toBe(1);
    expect(math.minus).toBe(1);
  });

  // Fact 1, pinned: an `add` is raw content, so every line of it is green and
  // there is no `@@` header to find.
  it('reads an added file as every line green even though its diff is raw content', () => {
    const out = change([fileChangeCompleted()]);
    const notes = out.files.find((f) => f.path === 'notes.txt');
    expect(notes.hunks[0].rows).toEqual([['+', 'hello']]);
    expect(notes.plus).toBe(1);
    expect(notes.minus).toBe(0);
  });

  it('adds up the way the header does', () => {
    const out = change([commentary('I am patching math.js.'), fileChangeCompleted()]);
    expect(out.plus).toBe(2);
    expect(out.minus).toBe(1);
    expect(out.editCount).toBe(2);
    expect(out.roots).toEqual([WORK]);
    expect(out.startedAt).toBe(1788466814342);
    expect(out.endedAt).toBe(1788466814342);
  });

  // The agent's own sentence beside the hunk, which is what `withProse`
  // counts. Claude Code takes it from the text blocks of the same message the
  // edit was in; Codex narrates in a separate `agentMessage` just before the
  // patch, so the nearest preceding one is the same sentence.
  it('keeps the message the agent said just before the patch', () => {
    const out = change([commentary('I am patching math.js to subtract.'), fileChangeCompleted()]);
    expect(out.files[0].hunks[0].said).toBe('I am patching math.js to subtract.');
    expect(out.withProse).toBe(2);
  });

  it('carries no prose when the run said nothing before the patch', () => {
    const out = change([fileChangeCompleted()]);
    expect(out.files[0].hunks[0].said).toBeUndefined();
    expect(out.withProse).toBe(0);
  });

  it('reads a delete as every line red', () => {
    const out = change([deleted(`${WORK}/old.js`, '@@ -1 +0,0 @@\n-gone\n')]);
    expect(out.files[0].path).toBe('old.js');
    expect(out.files[0].hunks[0].rows).toEqual([['-', 'gone']]);
    expect(out.minus).toBe(1);
  });

  // A delete did not occur in the measured run, so the parser must not depend
  // on which of the two string shapes it gets. Raw content, same answer.
  it('reads a delete whose diff is raw content as every line red too', () => {
    const out = change([deleted(`${WORK}/old.js`, 'gone\n')]);
    expect(out.files[0].hunks[0].rows).toEqual([['-', 'gone']]);
  });

  // Filed under where it now IS, which is the rule main/git-change.mjs already
  // states for a rename. A change she opens has to lead to a file that exists.
  it('files a rename under the path it moved to', () => {
    const out = change([renamed(`${WORK}/a.js`, `${WORK}/b.js`, '@@ -1 +1 @@\n-one\n+two\n')]);
    expect(out.files.map((f) => f.path)).toEqual(['b.js']);
    expect(out.files[0].abs).toBe(`${WORK}/b.js`);
    expect(out.files[0].hunks[0].rows).toEqual([['-', 'one'], ['+', 'two']]);
  });

  // THE CASE THAT MUST NOT MATCH, three ways. Codex reports absolute paths for
  // everything it touches, including its own scratch and the store's
  // bookkeeping, and code-change.mjs already refuses all three for Claude.
  it('drops node_modules, .git and /tmp scratch, and keeps a file outside the roots that is not scratch', () => {
    const out = change([
      deleted('/private/tmp/throwaway/probe.mjs', 'x\n'),
      deleted(`${WORK}/node_modules/left-pad/index.js`, 'x\n'),
      deleted(`${WORK}/.git/HEAD`, 'x\n'),
      deleted('/Users/you/Zero/elsewhere.js', 'x\n'),
    ]);
    expect(out.files.map((f) => f.path)).toEqual(['/Users/you/Zero/elsewhere.js']);
  });

  // Its own scratch INSIDE a root is still her product's file: the same rule
  // code-change.mjs states.
  it('keeps a file under a root even when the root is itself under /tmp', () => {
    const out = change([deleted(`${WORK}/tmp/shelf-shots.mjs`, 'x\n')]);
    expect(out.files.map((f) => f.path)).toEqual(['tmp/shelf-shots.mjs']);
  });

  // The measurement that produced the SCRATCH/roots rule in the first place
  // (code-change.mjs, 2026-08-26): the app knows the checkout as /tmp/x and the
  // tool reports /private/tmp/x. Codex reports the resolved spelling for
  // everything, so this is the COMMON case here rather than the rare one.
  it('matches a root given in the unresolved spelling of a symlinked /tmp', () => {
    // The measured frame names /private/tmp, which is what macOS calls /tmp.
    // The rule is the symlink, not that spelling: the app is handed the link
    // and Codex reports the path the link resolves to. Build that pair here
    // so the same assertion runs where /tmp is not a link to /private/tmp.
    const real = realpathSync(mkdtempSync(join(tmpdir(), 'codex-real-')));
    const linkDir = mkdtempSync(join(tmpdir(), 'codex-link-'));
    const link = join(linkDir, 'repo');
    symlinkSync(real, link);
    const event = fileChangeCompleted();
    for (const change of event.params.item.changes) change.path = change.path.replace(WORK, real);
    try {
      const out = changeFromCodexTurn([event], { roots: [link] });
      expect(out.files.map((f) => f.path)).toEqual(['math.js', 'notes.txt']);
    } finally {
      rmSync(real, { recursive: true, force: true });
      rmSync(linkDir, { recursive: true, force: true });
    }
  });

  it('drops everything written before the moment it was told to start from', () => {
    const out = change([fileChangeCompleted()], { since: 1788466814343 });
    expect(out.files).toEqual([]);
    const kept = change([fileChangeCompleted()], { since: 1788466814342 });
    expect(kept.files).toHaveLength(2);
  });

  // A run that answered a question and touched nothing must leave no artifact
  // behind at all: `writeChangeForRun` refuses to write when files is empty.
  it('reads a turn that changed nothing as an empty change', () => {
    const out = change([commentary('here is what I found'), commandCompleted(), finalAnswer(), turnCompleted()]);
    expect(out.files).toEqual([]);
    expect(out.plus).toBe(0);
    expect(out.editCount).toBe(0);
  });

  // THE CASE THAT MUST NOT MATCH: an `item/started` fileChange carries the
  // same changes as its completion, so counting both doubles every line in the
  // arithmetic under her card.
  it('counts a file change once, not once per started and once per completed', () => {
    const started = structuredClone(fileChangeCompleted());
    started.method = 'item/started';
    started.params.item.status = 'inProgress';
    const out = change([started, fileChangeCompleted()]);
    expect(out.files).toHaveLength(2);
    expect(out.plus).toBe(2);
    expect(out.editCount).toBe(2);
  });
});

/* ===================== the rule that lives in two files =================== */

describe('the two guards this file had to copy', () => {
  // CLAUDE.md's standing rule is that two copies of a rule become two
  // different rules within a week. `NOT_CODE` and `SCRATCH` are the two lines
  // of code-change.mjs that decide whether a path belongs in her artifact at
  // all, and they live inside a module-private `collector` there — this slice
  // may not modify that file, so they are copied. This test is the thing that
  // stops the copies drifting apart in silence: edit either one and the other
  // goes red, naming the file it has to be edited in.
  //
  // THE SLICE THAT SWAPS READERS PER ENGINE SHOULD EXPORT `collector` FROM
  // code-change.mjs AND DELETE BOTH COPIES, and then this test with them.
  const source = readFileSync(join(repo, 'main', 'code-change.mjs'), 'utf8');

  it('still matches the copies in main/code-change.mjs, character for character', () => {
    expect(source).toContain(`const NOT_CODE = ${NOT_CODE.toString()};`);
    expect(source).toContain(`const SCRATCH = ${SCRATCH.toString()};`);
  });
});

/* ========================== and it stays inert =========================== */

describe('this file is wired to nothing yet', () => {
  // shared/engines.mjs is CLOSED behind a capability token and
  // tests/a-codex-row-from-august-still-runs-on-claude.test.mjs holds that
  // nothing in main/ or renderer/src references it. This module is the
  // translation layer, not the wiring, and importing it from the supervisor is
  // the slice that has to answer for her approval path.
  it('opens no gate of its own', () => {
    const codex = readFileSync(join(repo, 'main', 'codex.mjs'), 'utf8');
    expect(codex).not.toContain('ENGINE_CHOICE_ENABLED');
    expect(codex).not.toContain('availableEngines');
  });

  // THIS USED TO SAY "imported by nothing", AND THE SLICE THAT CHANGED IT IS
  // THE ONE THIS COMMENT ASKED FOR. The line above it read: "importing it from
  // the supervisor is the slice that has to answer for her approval path." That
  // slice landed on 2026-09-04 -- the supervisor can now hold a Codex worker in
  // the same `session` shape it holds a Claude one -- so the honest tripwire is
  // no longer "nobody imports this" but "exactly one thing does, and it is the
  // supervisor, and it takes the readers and nothing else".
  //
  // That is a STRONGER claim than the old one, not a weaker one. What the old
  // line was really protecting was that this module cannot become a second way
  // into the second engine, and a second importer -- a renderer file drawing a
  // picker off `changeFromCodexTurn`, say -- is exactly how that would happen.
  // The gate itself is still held where it always was, by
  // tests/a-codex-row-from-august-still-runs-on-claude.test.mjs, which asserts
  // that the capability Symbol's name appears in no source under main/ or
  // renderer/src at all.
  //
  // THERE ARE TWO IMPORTERS NOW AND THE SECOND IS ARGUED FOR HERE, which is
  // what this test asked of whoever added one. main/codex-approvals.mjs takes
  // `fileVerbWord` and nothing else: the four words a file change is described
  // by are drawn on her approval card BEFORE the patch is applied and in her
  // trace after it, and a second copy of that mapping is one edit away from a
  // trace saying `[Write]` under a card that said `Edit` about the same change.
  //
  // It is not the thing the tripwire is for. That is a SECOND WAY INTO THE
  // SECOND ENGINE -- a renderer file drawing a picker off `changeFromCodexTurn`
  // -- and codex-approvals.mjs is the Codex approval path itself, already
  // engine-specific and already reached only through the supervisor. So the
  // claim is kept exactly as strong by naming what each importer may take: a
  // reader arriving in the approvals file goes red here and has to be argued
  // for in its turn.
  it('is imported by the supervisor and the approvals path, and by nothing else under main/, renderer/src or shared/', () => {
    const sources = (dir) => {
      const out = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...sources(full));
        else if (/\.(mjs|cjs|js|ts|tsx)$/.test(entry)) out.push(full);
      }
      return out;
    };
    const app = [
      ...sources(join(repo, 'main')),
      ...sources(join(repo, 'renderer', 'src')),
      ...sources(join(repo, 'shared')),
    ].filter((f) => !f.endsWith(join('main', 'codex.mjs')));
    const importers = app.filter((f) => /from\s+['"][^'"]*\bcodex\.mjs['"]/.test(readFileSync(f, 'utf8')));
    expect(importers.sort()).toEqual([
      join(repo, 'main', 'codex-approvals.mjs'),
      join(repo, 'main', 'supervisor.mjs'),
    ]);
  });

  it('lends the approvals path the one word rule and no reader at all', () => {
    const source = readFileSync(join(repo, 'main', 'codex-approvals.mjs'), 'utf8');
    const block = source.match(/import\s*\{([^}]*)\}\s*from\s+'\.\/codex\.mjs'/);
    expect(block).toBeTruthy();
    expect(block[1].split(',').map((n) => n.trim()).filter(Boolean)).toEqual(['fileVerbWord']);
  });

  // AND WHAT IT TAKES, asserted whole rather than searched for, so a new import
  // goes red here and has to be argued for. IT WAS FOUR AND IT IS NOW SEVEN,
  // and each of the three is one sentence:
  //
  //   `changeFromCodexTurn` and `rememberCodexChange` are the code artifact's
  //   conversation half. The reader slice deliberately left them unimported and
  //   this test is where it said so; the slice that wired them brought the
  //   writer that takes a prepared change, and its own tests, with it
  //   (tests/a-codex-run-shows-her-the-code-it-changed.test.mjs).
  //
  //   `SAYING_CAP` moves the other way: the number went OUT of the supervisor
  //   and into this module, which is what the note at main/codex.mjs:111 asked
  //   for. It was a module-private const in both files for exactly as long as
  //   the reader slice was not allowed to edit the supervisor.
  it('takes the four readers, both halves of the change, and the one cap', () => {
    const source = readFileSync(join(repo, 'main', 'supervisor.mjs'), 'utf8');
    // Matched as a BLOCK and not a line: the import is written across several
    // lines now, and a line-at-a-time reader would find no names at all and
    // pass this assertion against an empty list.
    const block = source.match(/import\s*\{([^}]*)\}\s*from\s+'\.\/codex\.mjs'/);
    expect(block).toBeTruthy();
    const named = block[1].split(',').map((n) => n.trim()).filter(Boolean);
    expect(named.sort()).toEqual([
      'SAYING_CAP', 'captureCodexEvent', 'changeFromCodexTurn', 'codexStreamingText',
      'rememberCodexChange', 'summarizeCodexEvent', 'traceCodexEvent',
    ]);
  });
});
