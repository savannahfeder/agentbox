// PURE. One of HER tasks, read as the conversation it already is.
//
// WHAT THIS REPLACES. A task used to open on exactly ONE field: the newest of
// the result, the checkpoint and the ask (`leadField` in recap.ts). Everything
// else on the row was either invisible or behind the time under the title. So
// one checkpoint written by a worker made the ask she had typed disappear off
// her own screen, a fault that kept recurring (and the row this file is for).
//
// The agent rows have not had that problem since, because there the item IS the
// conversation. This is that same shape, applied to the rows the app's own workers
// write, and it is the same component drawing both (components/Thread.tsx). The
// rule: only one screen style for a chat.
//
// NOTHING NEW IS STORED TO MAKE IT. Every message here is already a line in
// `work-items.jsonl` and every work line is already in a session trace on disk.
// This is the mapping from those two files to the shape the thread draws, and
// it is its own module for the reason thread-history.ts is: what is MISSING
// from a conversation has no symptom. A mapper that quietly drops half the
// events still renders a perfectly plausible thread.
//
// THE ORDER OF THE THREAD IS THE ORDER IT HAPPENED, which is not the order of
// the ledger. This used to say nothing was re-sorted, and it cost the one
// thing the screen is for. A run is a whole file of lines hanging off ONE
// ledger event, the claim, so pouring it out where the claim sits puts a line
// typed at 3:57pm above a checkpoint written at 3:34pm, and puts her own reply
// below both. The bottom of a live conversation then stops moving while the
// agent works.
//
// Sorting is still checkable against the file, which is what that rule was
// protecting: every node here carries the moment the ledger or the trace
// stamped it, and nothing is invented, dropped or merged to put them in order.

import { changedFile, plainCommand, saidCount, shortPath, threadWindow, unleaked, workVerb } from '../../shared/agents.mjs';
import { said, traceLines } from './terminal';
import type { TraceSession } from './notes';
import { threadEvents, withRuns, type LedgerLine, type ThreadEvent } from './thread-history';
import type { AgentEvent, AgentWork } from './types';

// `[Read] strategy/art-style.md` — how the supervisor writes a tool call into a
// trace (`traceStreamLine`, main/supervisor.mjs). The name is the tool and the
// rest is its key input, already flattened to one string on the way to disk.
const TOOL = /^\[([^\]]+)\]\s*(.*)$/;

/**
 * THE CONCISE ANSWER, KEPT WHOLE, AT THE FOOT OF THE CONVERSATION.
 *
 * The first cut put every message through the same chat block, and the agent's
 * finished word came out as the fortieth grey bubble in a stream: same size,
 * same name, same time, indistinguishable from a checkpoint written half an
 * hour earlier. What she opens a row FOR is the answer, and the pane used to
 * hand it to her whole, under its own label, at reading width.
 *
 * So it is held out of the stream here and drawn under it by ItemThread.tsx.
 * `field` is which of the two it is, because the pane labels a finished result
 * and a checkpoint differently and always has.
 *
 * IT IS ONLY EVER THE LAST THING SAID. If she has replied since, the newest
 * word on the row is HERS and there is no answer at the end to lift, and this is
 * null: the thread simply ends on her reply, which is the truth. Lifting a
 * result she has already answered down below her own reply would put a settled
 * answer at the bottom of the page pretending to be the live one.
 */
export interface ItemOutcome {
  at: number;
  text: string;
  field: 'result' | 'note';
}

/**
 * ONE MESSAGE OF HERS THAT IS ON ITS WAY AND NOT IN THE LEDGER YET.
 *
 * A reply typed while a worker is up does not go to the ledger first. It goes
 * to the running session, and `submitReply` (main/live-replies.mjs) writes the
 * row only once the provider has acknowledged it. Claude acknowledges by
 * replaying the message, which it does at its next break, and
 * `attachClaudeInput` lets that wait run to 120 seconds before it gives up. The
 * th not in the reply box, which had closed, and not in the conversation, which
 * had not heard of them.
 *
 * That is also the whole reason multiple follow-ups were confusing. Three messages
 * typed into that silence arrive together when the agent finally pauses, so
 * while she is typing them there is nothing on the screen saying which of them
 * got through, and no reason to believe any of them did.
 *
 * So the caller hands them in here and they are placed by the moment she
 * pressed send, the same way the agent's half-typed sentence is placed by the
 * moment it started. `at` is that moment. NOTHING IS STORED: the committed copy
 * arrives on the next read and cancels this one, one for one.
 */
export interface PendingSaid {
  at: number;
  text: string;
  // Inside the three seconds in which Z still takes it back (w-5281ef1221).
  // The message carries it to its own head; see `held` in types.ts.
  held?: boolean;
}

export interface ItemThread {
  events: AgentEvent[];
  // The agent's last word, when the last word is the agent's. Not in `events`.
  outcome: ItemOutcome | null;
  // Every message on the row, which is what the head line counts. Work lines
  // are not messages: a run of forty tool calls is one thing that happened, and
  // a reply that stopped twice for a tool is one message drawn as three blocks.
  total: number;
  // How many of those are not on screen. A long row is windowed exactly as a
  // long Claude Code session is, by the same function, and the gap says its own
  // number where it bites.
  omitted: number;
}

/** One trace line that ran a tool, as the quiet line the thread draws. */
function workLine(at: number, name: string, hint: string): AgentWork {
  const subject = name === 'Bash' ? plainCommand(hint) : shortPath(hint);
  return {
    kind: 'work',
    at,
    verb: workVerb(name),
    subject,
    // THE FILE IT CHANGED, whole, which is what the thread turns into a chip
    // into the code. The trace writes one argument per line and for an edit
    // that argument IS the path, so the hint is the whole of it.
    ...(changedFile(name, { file_path: hint.trim() }) ? { file: hint.trim() } : {}),
    // The whole string, only when shortening changed it. Empty means the head
    // already shows all of it, and the line then opens onto nothing.
    ...(subject && subject !== hint.trim() ? { full: hint.trim() } : {}),
    output: '',
    lines: 0,
    failed: false,
  };
}

/**
 * One run, as the lines the thread draws for it.
 *
 * A worker's trace holds exactly the two things a Claude Code transcript holds:
 * sentences it typed and actions it took. So the sentences are its messages and
 * the actions are the quiet lines under them, which is the same split the agent
 * rows make and the reason one component can draw both.
 *
 * The second and later sentences of one run wear no name and no time (`same`),
 * because they are one agent still talking, not four messages from four people.
 * That flag is NOT decided here any more: a run's lines are interleaved with
 * whatever else was written while it ran, so whether a sentence still follows
 * its own run is only knowable once everything is in time order. See `placed`.
 */
export function runNodes(session: TraceSession): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const line of traceLines(session)) {
    if (line.kind === 'tool') {
      const parts = TOOL.exec(line.text);
      out.push(parts
        ? workLine(line.at, parts[1], parts[2])
        : workLine(line.at, '', line.text));
      continue;
    }
    out.push({ at: line.at, who: 'it', text: line.text });
  }
  return out;
}

/**
 * A ledger event with no words of its own: a rename, a close, a pause.
 *
 * These are not messages and they are not silence either. They draw as the same
 * quiet line a tool call draws, which is what keeps the thread honest: the
 * whole ledger is on the screen, in order, and nothing has to be recovered from
 * a second surface. It is also why the time under the title stopped being a
 * door — there is no longer a second list for it to open.
 */
function saidLine(event: ThreadEvent): AgentWork {
  return {
    kind: 'work',
    at: event.at,
    verb: event.said,
    subject: event.words ?? '',
    output: '',
    lines: 0,
    failed: false,
  };
}

/**
 * Her task, as a conversation. Every run in it, including the one happening now.
 *
 * THE RUN THAT IS HAPPENING RIGHT NOW USED TO BE LEFT OUT OF THIS. Its lines
 * were drawn in a block of their own above the conversation. Option D removed
 * that block, and it is gone.
 *
 * So a live run is read exactly as a finished one is, and its lines land in the
 * thread at the moment they were typed. Nothing is drawn twice, because there
 * is no second place left to draw it. The component reads the trace again every
 * few seconds while a session is up, so the newest line arrives in the stream
 * rather than in a panel.
 */
/**
 * It comes off the live session on the snapshot rather than off the trace,
 * because the trace only ever holds finished lines. `at` is when the block
 * started, so it lands in time order with everything else, and `run` is the
 * session that is typing it, so a sentence appearing under that session's own
 * work lines wears no second name.
 */
export interface LiveSaying {
  text: string;
  at: number;
  run: number;
}

/** One node with the moment it happened and the run it came from, before ordering. */
interface Placed {
  node: AgentEvent;
  run: number | null;
  answer: ItemOutcome | null;
}

// One message flattened, so two copies of it written through different surfaces
// compare equal. Nothing is ever shown from this; it only decides sameness.
const flat = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

// The first line with its bold markers off, which is the sentence she reads
// twice. `**Merge it.**` and `Merge it` are the same opening.
function opening(text: string): string {
  const line = (text.split('\n').find((l) => l.trim()) ?? '').trim();
  return flat(line.replace(/\*\*/g, '')).replace(/[.?!:]+$/, '');
}

// Below this a message is too short for one to be found inside another and mean
// anything. "Done." sits inside almost any paragraph; forty characters does not.
const ENOUGH = 40;

// The same message with its first line taken off and nothing else touched.
// Comes back null when there is nothing underneath that line, because a message
// that IS its opening has no body to keep and has to be left whole.
function withoutOpening(text: string): string | null {
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim());
  if (first < 0) return null;
  const rest = lines.slice(first + 1).join('\n').replace(/^\s+/, '');
  return rest.trim() ? rest : null;
}

function isSaid(node: AgentEvent): boolean {
  return node.kind !== 'work' && !!(node.text ?? '').trim();
}

// Tool-call scaffolding that leaked into the prose, cut off it. The rule and
// the row it comes from are in shared/agents.mjs, next to the write that stops
// it being stored in the first place; it is applied here as well because the
// rows that already carry it are still on her screen.

/**
 * ONE THING SAID ONCE.
 *
 * It is not the agents being sloppy. A worker says its answer on TWO surfaces
 * by design: it writes the row's `result`, and it types a closing message into
 * its own run. Both really happened and both are drawn, so the pane showed her
 * the same answer twice, two seconds apart, under two identical timestamps.
 * Measured across a real store, nearly half of the rows that carry an agent
 * message repeat an opening line back to back.
 *
 * TWO REPEATS ARE COLLAPSED HERE AND NOTHING ELSE IS.
 *
 *   THE SAME WORDS AGAIN, where one message contains the other whole and the
 *   shorter adds not a syllable. Most of those pairs were identical character
 *   for character: mostly an `update_work_item` that ran four times in twenty
 *   seconds, and a body rewritten to the result it was about to be handed. The
 *   fuller text always survives, so no sentence is ever lost to this rule.
 *
 *   THE CLOSING MESSAGE OF A RUN THAT ALREADY WROTE ITS ANSWER TO THE ROW.
 *   Same opening line, its own wording underneath, which is the common shape.
 *   Here one wording IS dropped, and that is the point: they are
 *   one answer typed twice. The ROW's copy survives, because it is the copy
 *   the inbox line reads and the copy the pane lifts to the foot under its own
 *   label, so the answer block comes back with it.
 *
 * AND THE THIRD SHAPE IS NOT COLLAPSED AT ALL. IT LOSES ITS HEADING.
 *
 *   TWO MESSAGES THAT MERELY OPEN ALIKE. Two different runs answering the same
 *   row, each with its own paragraph under one repeated bold line: the same
 *   thing in bold twice over. Two reminder runs sixteen minutes apart, with
 *   near-identical bold openers, are two different runs saying two different
 *   things, so folding one away would eat a paragraph.
 *
 *   So neither message goes. The SECOND one is drawn without its first line,
 *   because that line is already on the screen directly above it. Nothing is
 *   lost, she reads the bold sentence once, and both answers stay whole.
 *   A message that is nothing BUT its opening keeps it, since there would be
 *   no message left underneath.
 *
 * THE USER'S OWN WORDS ARE NEVER FOLDED AWAY, whatever they repeat.
 */

/**
 * ONE ANSWER TYPED TWICE, when the two copies are not word for word.
 *
 * A run writes its answer to the row and then types it again as its closing
 * message, which is what every worker is told to do. The two copies used to
 * have to open on the same line to be recognised as one answer. On
 * w-b108b1d596 the closing message opened on a line of the run's own
 * housekeeping, "The row is clean now. Final message, the same words as the
 * row.", sitting above the very words it had just written to the row. That one
 * sentence was enough to make them look like two messages, and she read the
 * whole answer twice.
 *
 * So the same opening still counts, and so does the row's answer sitting whole
 * inside the typed copy with NOTHING under it but that first line. The second
 * test is as much the guard as the rule: a closing message that goes on to say
 * something of its own is not this shape at all, and folding it away would eat
 * the one sentence only it said.
 */
function oneAnswerTwice(answer: string, typed: string): boolean {
  if (opening(answer) === opening(typed)) return true;
  const words = flat(answer);
  const rest = withoutOpening(typed);
  if (!words || !rest || words.length < ENOUGH) return false;
  return flat(rest).replace(words, '').trim() === '';
}

/**
 * THE SAME FIELD WRITTEN AGAIN, WITH THE RUN TALKING IN BETWEEN.
 *
 * The fold below only ever compares a message with the one directly above it,
 * and a run's own aside is a message. So a run that rewrites its result twice
 * in nine seconds, saying one sentence between the writes, left every copy on
 * the screen. That is the other half of w-b108b1d596: three writes of the
 * result in nine seconds with a narration line among them, drawn as the answer,
 * an aside, and the answer again.
 *
 * An earlier write goes only when a LATER write of the same field says the same
 * words and SHE has not spoken in between. Her reply is the boundary that makes
 * two identical answers two real answers: a row picked up again after she
 * replies is a second round, and its result is a new message however familiar
 * it reads.
 */
function supersededFields(placed: Placed[]): Set<number> {
  const gone = new Set<number>();
  const seen = new Map<string, number>();
  placed.forEach((p, i) => {
    if (!isSaid(p.node)) return;
    if (p.node.who === 'you') { seen.clear(); return; }
    if (!p.answer) return;
    const key = `${p.answer.field}\n${flat(p.answer.text)}`;
    const before = seen.get(key);
    if (before !== undefined) gone.add(before);
    seen.set(key, i);
  });
  return gone;
}

function collapseRepeats(placed: Placed[]): Placed[] {
  // The last thing each run typed. A run's answer sits there, and it is the
  // only line of a run the second rule may touch.
  const lastSaid = new Map<number, number>();
  placed.forEach((p, i) => { if (p.run !== null && isSaid(p.node)) lastSaid.set(p.run, i); });

  // A field rewritten is not two messages, however far apart the writes sit.
  // `supersededFields` says why this cannot wait for the neighbour test below.
  const gone = supersededFields(placed);
  // Messages kept whole but drawn without their first line, by index. Nothing
  // in this map is compared against: every test below reads the text as it was
  // written, so a third message repeating the heading is measured against the
  // same opening the first two were and loses its heading too. Otherwise the
  // line would come back every other message.
  const headless = new Map<number, string>();
  // The previous message still standing, so dropping one leaves its neighbours
  // adjacent and a third copy collapses against the survivor.
  let prev = -1;
  for (let i = 0; i < placed.length; i += 1) {
    const here = placed[i];
    if (!isSaid(here.node) || gone.has(i)) continue;
    const last = prev >= 0 ? placed[prev] : null;
    if (!last || last.node.who !== 'it' || here.node.who !== 'it') { prev = i; continue; }

    const a = flat(last.node.text ?? '');
    const b = flat(here.node.text ?? '');
    if (!a || !b) { prev = i; continue; }

    // Word for word. The row's own field wins over a copy typed into a run,
    // because that is the field the inbox reads; otherwise the later one wins,
    // so a live conversation still ends where it ended.
    if (a === b) {
      if (last.answer && !here.answer) gone.add(i);
      else { gone.add(prev); prev = i; }
      continue;
    }
    // The run's closing message against the answer that same run wrote to the
    // row. `answer` is set only on a ledger result or checkpoint and `run` only
    // on a sentence typed inside a run, so this can never fire on two ledger
    // fields, and never on two typed sentences.
    // On the RAW text, not on `a` and `b`: flattening has already taken the
    // line breaks out, and a first line asked for after that is the whole
    // message. That mistake makes this rule quietly never fire.
    //
    // AHEAD OF THE CONTAINMENT RULES UNDERNEATH, because a closing message that
    // opens on a line of its own housekeeping holds the row's answer whole and
    // is therefore the longer of the two. "The fuller text stays" would keep
    // the run's copy and drop the ROW's, which is the one the inbox line reads
    // and the one the pane lifts to the foot under its own label. Her answer
    // block would go quietly empty.
    const closingHere = here.run !== null && lastSaid.get(here.run) === i && !!last.answer;
    const closingLast = last.run !== null && lastSaid.get(last.run) === prev && !!here.answer;
    if (closingHere && oneAnswerTwice(last.node.text ?? '', here.node.text ?? '')) { gone.add(i); continue; }
    if (closingLast && oneAnswerTwice(here.node.text ?? '', last.node.text ?? '')) { gone.add(prev); prev = i; continue; }

    // One holds the other whole. The fuller text stays, always.
    if (b.includes(a) && a.length >= ENOUGH) { gone.add(prev); prev = i; continue; }
    if (a.includes(b) && b.length >= ENOUGH) { gone.add(i); continue; }

    if (opening(last.node.text ?? '') !== opening(here.node.text ?? '')) { prev = i; continue; }

    // Same opening, two genuinely different messages. Both stay; the second one
    // gives up the line she has just read. `answer` is untouched on purpose:
    // the block at the foot is drawn from it and has to keep its own heading.
    const rest = withoutOpening(here.node.text ?? '');
    if (rest) headless.set(i, rest);
    prev = i;
  }

  return placed
    .map((p, i) => {
      const rest = headless.get(i);
      return rest ? { ...p, node: { ...p.node, text: rest } } : p;
    })
    .filter((_, i) => !gone.has(i));
}

export function itemThread(
  lines: LedgerLine[],
  sessions: TraceSession[],
  live?: LiveSaying | null,
  // `whole`: SHE PRESSED THE GAP AND ASKED FOR THE MIDDLE BACK. Every message
  // on the row is drawn and `omitted` comes back zero, so the gap line takes
  // itself off the screen. The work stays capped either way.
  //
  // `engine`: which coding agent this row runs on, carried straight through to
  // `threadEvents`, where it decides one sentence. Absent means Claude Code, so
  // every caller written before the second engine came back is untouched.
  //
  // `pending`: WHAT SHE HAS JUST SENT AND THE LEDGER DOES NOT HAVE YET. See
  // `PendingSaid`.
  opts: { whole?: boolean; engine?: string | null; pending?: PendingSaid[] } = {},
): ItemThread {
  // The pickup-to-run match is thread-history's, not a second copy of it: it is
  // the part that can be wrong while the screen still looks perfect (a run
  // credited to the wrong pickup reads exactly like one credited to the right
  // one), and it is pinned in tests/one-door-one-list.test.mjs. `readNotes` is
  // given one session at a time there, so a run's `raw` IS that session's text.
  const events = withRuns(threadEvents(lines, opts.engine), sessions);
  const out: AgentEvent[] = [];
  // Where the newest thing SAID sits, and which ledger message it was. A run's
  // narration is a message on the screen too, so it counts here: a row picked
  // up again after a result has the agent talking below that result, and the
  // result is then no longer the end of the conversation.
  let spokeAt = -1;
  let answer: { i: number; at: number; text: string; field: 'result' | 'note' } | null = null;

  // EVERY NODE WITH THE MOMENT IT HAPPENED, BEFORE ANYTHING IS PUT IN ORDER.
  //
  // A run used to be poured out whole at the point its pickup sits in the
  // ledger, and everything written DURING that run — the agent's own
  // checkpoint, her reply to it — was appended after all of it, however much
  // later the run's last line was typed. On one row that put 76 lines
  // covering 3:33pm to 3:57pm ABOVE a checkpoint stamped 3:34pm, and her two
  // messages under them. The bottom of a live conversation is the only part
  // anyone reads, and it was frozen at whatever the running agent last wrote
  // to the row.
  const placed: Placed[] = [];
  // Personal workers do not claim a store item. Their traces still contain
  // real messages and diagnostics; place them by their own timestamps rather
  // than requiring a claim that this kind of session never writes.
  if (!events.some(event => event.pickup)) {
    for (const session of sessions) {
      if (!session?.text) continue;
      for (const node of runNodes(session)) {
        placed.push({ node, run: session.startedAt, answer: null });
      }
    }
  }
  for (const event of events) {
    if (event.pickup) {
      // A pickup IS its run: the sentence "An agent picked it up" says nothing
      // the lines underneath do not say better. What it draws instead is those
      // lines. A claim whose session left no trace on disk keeps the sentence,
      // because the row genuinely has claims with nothing behind them and a
      // thread that silently loses one cannot be checked against the file.
      const runs = event.runs ?? [];
      if (!runs.length) {
        placed.push({ node: saidLine(event), run: null, answer: null });
        continue;
      }
      for (const run of runs) {
        for (const node of runNodes({ startedAt: run.startedAt, text: run.raw })) {
          placed.push({ node, run: run.startedAt, answer: null });
        }
      }
      continue;
    }
    if (event.message && event.words) {
      const isAnswer = event.who === 'agent' && (event.field === 'result' || event.field === 'note');
      placed.push({
        node: { at: event.at, who: event.who === 'you' ? 'you' : 'it', text: event.words, ...(event.by ? { by: event.by } : {}) },
        run: null,
        answer: isAnswer ? { at: event.at, text: event.words, field: event.field as 'result' | 'note' } : null,
      });
      continue;
    }
    placed.push({ node: saidLine(event), run: null, answer: null });
  }

  // AND THE SENTENCE BEING TYPED RIGHT NOW, IF THE TRACE HAS NOT CAUGHT IT YET.
  //
  // The supervisor holds the current block of prose on the live session and
  // does NOT clear it when the message finishes, because the finished words
  // travel to this screen on a different channel (the trace file) than the
  // live ones (the snapshot). Clearing it there would blink the sentence off
  // and back on for however long a read takes. So the drop is decided here, by
  // asking whether the same words are already in the thread — a comparison,
  // not a race.
  //
  // BOTH SIDES ARE NORMALISED BY THE SAME FUNCTION. `traceLines` puts every
  // line of prose through `said` on the way in, so a live string compared raw
  // would differ by a trailing space and print itself twice, one under the
  // other, for the rest of the run.
  if (live?.text) {
    const now = said(live.text);
    const already = placed.some((p) => p.node.kind !== 'work'
      && p.node.who === 'it' && said(p.node.text ?? '') === now);
    if (now && !already) {
      placed.push({ node: { at: live.at, who: 'it', text: now }, run: live.run, answer: null });
    }
  }

  // AND WHAT SHE HAS JUST SENT, WHICH THE LEDGER WILL NOT HAVE FOR A WHILE.
  // `PendingSaid` above holds why this exists and what the wait really is.
  //
  // ONE COMMITTED COPY CANCELS ONE PENDING COPY, OLDEST FIRST. Matching on the
  // words alone would be wrong in the one case this row is about: she says
  // "yes" twice into the same silence, the first lands, and the second would
  // hide itself behind it and be a message of hers missing from her own screen.
  // So each committed message is spent once, and only against a send it could
  // actually be, which is one made before it. The ledger line is written after
  // the press, by the same machine's clock, so that test holds.
  //
  // BOTH SIDES THROUGH `said`, for the reason the live sentence above is: the
  // ledger has been normalised on the way in and a raw string differing by one
  // trailing newline draws her message twice, one under the other.
  const spent = new Set<Placed>();
  for (const mine of [...(opts.pending ?? [])].sort((a, b) => a.at - b.at)) {
    const words = said(mine.text);
    if (!words) continue;
    const landed = placed.find((p) => !spent.has(p) && p.node.kind !== 'work'
      && p.node.who === 'you' && (p.node.at ?? 0) >= mine.at
      && said(p.node.text ?? '') === words);
    if (landed) { spent.add(landed); continue; }
    placed.push({ node: { at: mine.at, who: 'you', text: mine.text, pending: true, held: mine.held }, run: null, answer: null });
  }

  // TOOL-CALL SCAFFOLDING OFF EVERY MESSAGE FIRST, before two of them are
  // compared or one of them is drawn. `unleaked` says why, and why it cannot
  // wait: a leak makes one copy of an answer longer than the copy that replaced
  // it, and the fold keeps the longer one.
  const readable = placed.map((p) => {
    if (p.node.kind === 'work') return p;
    const text = unleaked(p.node.text ?? '');
    if (text === (p.node.text ?? '')) return p;
    return { ...p, node: { ...p.node, text }, answer: p.answer ? { ...p.answer, text } : null };
  });

  // IN THE ORDER IT HAPPENED. Array sort is stable, so two things stamped the
  // same second keep the order the ledger and the trace put them in.
  readable.sort((a, b) => (a.node.at ?? 0) - (b.node.at ?? 0));

  // AND THEN ONCE EACH. This has to come after the sort and before anything
  // reads a neighbour: two copies of one answer are only adjacent once
  // everything is in time order, and `same` below means "the message above this
  // one", which is a different message when one has just been folded away.
  const once = collapseRepeats(readable);

  let prevRun: number | null | undefined;
  for (const p of once) {
    if (p.node.kind === 'work') { out.push(p.node); continue; }
    const same = p.run !== null && p.run === prevRun;
    prevRun = p.run;
    spokeAt = out.length;
    // A run's own narration does not clear the answer; it moves `spokeAt` past
    // it, which is what the outcome test below reads. Only a ledger message
    // that is not itself an answer wipes it.
    if (p.answer) answer = { i: out.length, ...p.answer };
    else if (p.run === null) answer = null;
    out.push(same ? { ...p.node, same: true } : p.node);
  }

  // THE ANSWER COMES OUT OF THE STREAM, and only when it is still the newest
  // word on the row. `answer` was cleared by anything said after it — her
  // reply, or another run's narration — so what survives here is an agent's
  // finished result or checkpoint with nothing spoken under it. See ItemOutcome
  // above for why this exists and what draws it.
  const outcome: ItemOutcome | null = answer && answer.i === spokeAt
    ? { at: answer.at, text: answer.text, field: answer.field }
    : null;
  // Counted before it is lifted: it is still a message on this task, and the
  // head line says how many there are, not how many are in the stream.
  const spoken = saidCount(out);
  if (outcome) out.splice(answer!.i, 1);

  // THE SAME WINDOW A LONG CLAUDE CODE SESSION GETS, and for the same reason.
  // Measured on a real row: six sessions, 122 messages, 73 work lines
  // and an 18,100px page, which is a scroll bar rather than a conversation and
  // is the length budget broken by a wide margin. Windowed it is the opening,
  // the end, and one line saying how many are in between. `threadWindow` is
  // message-aware, so a run of tool calls can never push the user's own words out of
  // the window, and it caps the work as well.
  //
  // THE TWO NUMBERS COUNT THE SAME THING. `threadWindow` counts BLOCKS, and a
  // reply that stopped twice for a tool is three blocks and one message
  // (`saidCount`, the reason the head does not read "122 messages" over a
  // conversation she remembers having six times). Taking the window's own
  // `omitted` would have put "82 messages in between, not shown" under a head
  // saying there are 23 on the row. So the gap is counted in messages too, by
  // subtracting what survived from what there was.
  //
  // AND THE ANSWER AT THE FOOT IS NEITHER WINDOWED NOR MISSING. It is on the
  // page, in full, below the stream, so it counts toward the head's total and
  // never toward the gap's.
  const windowed = threadWindow(out, { whole: !!opts.whole }) as { events: AgentEvent[]; omitted: number };
  const shown = saidCount(windowed.events) + (outcome ? 1 : 0);
  return { events: windowed.events, outcome, total: spoken, omitted: spoken - shown };
}
