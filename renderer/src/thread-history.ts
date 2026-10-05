// PURE. Everything that happened on one task, turned into sentences.
//
// Design A: the time under the title is the way into this history. Nothing new
// is stored to make it work. Every write to a work item is already an appended
// line in work-items.jsonl carrying a timestamp and who did it, so this file
// is the mapping from those lines to what a person would say happened, and the
// main process only has to hand the lines over.
//
// THREE RULES CAME OUT OF REVIEWING the first drawing:
//
// So a day is never abbreviated and never sits inside a time: dayHeading
// writes it out and the time column only ever holds a time.
//
// ONE LINE MAKES AT MOST ONE EVENT. A line can patch several fields at once (a
// worker rewriting a row sets title and body together), so the fields are
// ranked and the most newsworthy one speaks. Bookkeeping says nothing at all:
// priority, labels, answeredThrough, epochs, lease heartbeats and releases are
// how the machinery keeps its place, not things that happened to her.

import { readNotes, type Notes, type TraceSession } from './notes';
import { commandPrompt } from '../../shared/claude-commands.mjs';
import { DEFAULT_ENGINE } from '../../shared/engines.mjs';

export interface LedgerLine {
  id: string;
  ts: number;
  source: string;                       // 'founder' | 'agent' | 'system'
  patch?: Record<string, unknown> | null;
  claim?: { holder: string; leaseUntil: number } | null;
  heartbeat?: boolean;
  release?: boolean;
  epoch?: number;
  // Who wrote it, on a signed-in Mac (the team version). Absent on every line
  // of the single-person app.
  by?: string;
}

export interface ThreadEvent {
  at: number;
  // WHICH PERSON SAID IT, when a teammate did: their person id, off the
  // ledger line's `by`. The thread draws their face and name instead of "You".
  by?: string;
  // Hers reads at full strength, an agent's is quiet. The same split the pane
  // already makes everywhere else.
  who: 'you' | 'agent';
  // One sentence in the past tense, the whole event when there are no words.
  said: string;
  // A run started here. Flagged rather than matched on the sentence, because
  // withRuns below hangs a whole session's diary off these and a wording
  // change must never quietly empty it.
  pickup?: true;
  // SOMEBODY SAID SOMETHING HERE, rather than something merely happening. The
  // ask, her reply, a checkpoint and a result are messages; a rename, a pause
  // and a close are events that carry a fragment ("was \"…\"", "until Tuesday")
  // which is not a message and must never be drawn at reading size.
  //
  // Flagged rather than inferred from `said`, for the same reason `pickup` is:
  // item-thread.ts splits the thread on this, and a reworded sentence must not
  // quietly turn every result on every row into a grey one-liner.
  message?: true;
  // WHICH FIELD OF THE ROW THIS MESSAGE IS, when it is one.
  //
  // Set for the same reason `message` and `pickup` are flagged rather than read
  // back off `said`: item-thread.ts holds the agent's LAST word out of the
  // stream so the pane can draw it in full at the foot of the conversation. A
  // sentence someone rewords must never quietly turn that block off, because a
  // thread with no answer at the end of it still draws.
  field?: 'body' | 'answer' | 'result' | 'note';
  // The runs that began at this pickup, oldest first. Set by withRuns, and
  // an array because a session that never got its claim in still has to land
  // somewhere rather than disappear.
  runs?: Notes[];
  // What was actually written, in full. The component shows the beginning and
  // opens the rest in place; nothing here decides how much is shown.
  words?: string;
  // AN ACTION OF HERS THAT ANSWERED THE AGENT, though it is not a message: a
  // picked option. The conversation treats it as her reply for what comes
  // after it, so the agent's result stays above it instead of being lifted
  // under it.
  answers?: true;
}

// '(withdrawn)' is the tombstone an undone send leaves behind, not words.
function words(text: unknown): string | null {
  const clean = typeof text === 'string' ? text.trim() : '';
  return clean && clean !== '(withdrawn)' ? clean : null;
}

function has(patch: Record<string, unknown> | null | undefined, key: string): boolean {
  return !!patch && Object.prototype.hasOwnProperty.call(patch, key);
}

/**
 * "until tomorrow 9:00am", said from the moment of the snooze, not from now.
 *
 * The line already carries when it was snoozed, so the day it runs to is said
 * relative to that: the same day is a bare time, the next is "tomorrow", the
 * rest of the week is a weekday, and further than that gets its date. The full
 * "Fri, Oct 2, 9:00 AM" it used to print on every line is what made three
 * snoozes read as a table rather than as three things you did.
 */
export function snoozeWords(runAt: number, from: number): string {
  const days = Math.round((startOfDay(runAt) - startOfDay(from)) / 86_400_000);
  const time = clock(runAt);
  if (days <= 0) return `until ${time}`;
  if (days === 1) return `until tomorrow ${time}`;
  if (days < 7) return `until ${new Date(runAt).toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return `until ${new Date(runAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
}

// A PICKED OPTION IS WRITTEN AS "Option 2: <its words>" (pickOption in
// App.tsx), one line. A typed reply that merely starts the same way and goes on
// to say more is still a message of hers, so the match is the whole answer.
const PICK = /^Option (\d+): ([^\n]+)$/;

// HOW LONG AFTER YOUR REPLY A LIFTED SNOOZE STILL BELONGS TO IT. The app
// writes the two one after the other, milliseconds apart; a minute leaves room
// for a slow disk and is still far shorter than anyone bringing a thread back
// by hand after answering it.
const REPLY_LIFTS_MS = 60_000;

/**
 * The ledger's lines for ONE item, oldest first, as sentences.
 *
 * Lines arrive in the order they were appended, which is the order things
 * happened; nothing is re-sorted, because a ledger that reorders itself is a
 * ledger nobody can check against the file.
 *
 * `engine` IS WHICH CODING AGENT THIS ROW RUNS ON, and exactly one sentence in
 * the whole list depends on it: see `askedACommand` below. It is the word the
 * pane was handed on the snapshot (`byItem[id] ?? workspace`), passed down
 * through `itemThread`. Absent means Claude Code, which is what every Mac with
 * one coding agent answers.
 */
export function threadEvents(lines: LedgerLine[], engine?: string | null): ThreadEvent[] {
  const events: ThreadEvent[] = [];
  // Folded forward as we walk, so a rename can say what the name WAS. The fold
  // keeps only the latest value per field, so this is the one place the old
  // title still exists.
  let title: string | null = null;
  let first = true;
  // WHETHER THE ASK HAS BEEN SAID YET, and it is not the same as `first`.
  //
  // The store writes a new row as TWO lines: the system stamps the title, the
  // kind and the priority, and the user's own line lands a millisecond later
  // carrying the title again and the body. So on every row the user wrote
  // herself, `first` was consumed by the system line, which has no body, and
  // the line that actually held the user's words fell through to the rename
  // branch and came out as `was "…"`. THE ASK WAS NEVER IN THIS LIST AT ALL.
  // Measured on one row: 30 ledger lines, the body on line 2, not one event
  // carrying it.
  //
  // That was invisible while this fed a fold nobody opened. It is not invisible
  // now that the thread IS the page (item-thread.ts), so the first body to
  // arrive opens the row whichever line it arrives on.
  let opened = false;
  // Whether the newest thing she sent was one of Claude Code's eight commands,
  // ON A ROW THAT REALLY RAN IT. Read by the `blocked` branch, which is what a
  // finished command looks like in the ledger, and cleared the moment it is
  // used.
  //
  // THE ENGINE IS HALF OF THE QUESTION AND WAS MISSING FROM IT. `commandPrompt`
  // says the reply is one of the eight WORDS; whether the CLI was ever handed
  // it as a command is the supervisor's test and it guards the same call with
  // the engine (`continuation && engine === DEFAULT_ENGINE ?
  // commandPrompt(...)`). Codex knows none of the eight, so `/usage` reached it
  // as an ordinary message with the brief still attached, and `blocked` on that
  // row means exactly what it means on every other row: it has something to ask
  // her.
  const claudeCode = (engine ?? DEFAULT_ENGINE) === DEFAULT_ENGINE;
  let askedACommand = false;
  // The short written name, folded forward like `title`. Read once at the end:
  // see `withTitleSaid`.
  let label: string | null = null;
  // WHO SAID EACH EVENT, for a teammate's line (the team version). Every event
  // a line produced is tagged with its writer when the next line begins, and
  // once more after the last, which leaves the loop below exactly as it was.
  let markAt = 0;
  let markBy: string | undefined;
  // YOUR LAST REPLY, read by the `runAt` branch. A reply lifts a snooze
  // (`replyClearsSchedule`, list-rules), and the app writes that a moment
  // after the answer, so it is part of the reply and not a second thing you
  // did. It read "Brought it back" under a teammate's "Working on it" and
  // they could not think why they had (w-2b0cd0f741).
  let replied: { at: number; by: string | undefined } | null = null;
  const tagWriter = () => {
    if (markBy) for (let k = markAt; k < events.length; k += 1) if (!events[k].by) events[k].by = markBy;
  };

  for (const [at_, line] of lines.entries()) {
    tagWriter();
    markAt = events.length;
    markBy = typeof line.by === 'string' ? line.by : undefined;
    const patch = line.patch ?? null;
    if (has(patch, 'label')) label = String(patch!.label ?? '');
    const mine = line.source === 'founder';
    const who: ThreadEvent['who'] = mine ? 'you' : 'agent';
    const at = line.ts;

    // The lease. A heartbeat extends it, a release ends it, and neither is
    // news: an agent that held a task for an hour did one thing, not thirty.
    if (line.heartbeat || line.release) continue;
    if (line.claim) {
      events.push({ at, who: 'agent', said: 'An agent picked it up', pickup: true });
      continue;
    }

    // The row's birth. Its body is the ask, whoever wrote it: she composes
    // directives, agents file most of the inbox, and putting her name on an
    // agent's words inside her own thread is the one thing this must not do.
    if (first && has(patch, 'title')) {
      // A PERSON'S OWN APP STAMPED IT (the team version). On a signed-in Mac
      // every line carries who wrote it, so the system's wordless stamp that
      // comes straight before a person's words is that person sending a task,
      // and "An agent opened this" over their face would be false. Their own
      // line opens the thread instead, so the stamp leaves `first` alone. With
      // nobody signed in no line carries `by`, and this reads as it always has.
      //
      // THEIR LINE MAY HOLD ONLY A TITLE. A task typed as one line has no body,
      // and requiring one is what opened a tester's thread as the agent's on
      // 2026-10-01 (tests/team-a-one-line-task-opens-as-yours-not-the-agents).
      const next = lines[at_ + 1];
      const theirs = line.source === 'system' && !!line.by && !words(patch!.body)
        && next?.source === 'founder' && next.by === line.by;
      // Their line carries the title too, so it is the birth.
      if (theirs && has(next!.patch, 'title')) continue;
      first = false;
      title = String(patch!.title ?? '');
      if (words(patch!.body)) opened = true;
      // Their words with no title: the ask branch below opens the thread.
      if (theirs && words(next!.patch?.body)) continue;
      events.push({
        at, who,
        said: mine ? 'You opened this' : 'An agent opened this',
        ...(words(patch!.body) ? { words: words(patch!.body)!, message: true as const, field: 'body' as const } : {}),
      });
      continue;
    }

    if (!patch || !Object.keys(patch).length) continue;

    // The ask, on whichever line it arrived. See `opened` above: on her own
    // rows that is the line after the one this list used to call the birth.
    if (!opened && words(patch.body) && !has(patch, 'answer') && !words(patch.result) && !words(patch.note)) {
      opened = true;
      if (has(patch, 'title')) title = String(patch.title ?? '');
      events.push({
        at, who,
        said: mine ? 'You opened this' : 'An agent opened this',
        words: words(patch.body)!,
        message: true,
        field: 'body',
      });
      continue;
    }

    // THE ASK, REWRITTEN BY THE SIDE THAT WROTE IT.
    //
    // Agents patch the rows they own as a matter of course, and the fold keeps
    // the newest body, so the inbox line and the options strip already read the
    // rewrite. This list did not: a later body line fell through every branch
    // below and the opening kept the words it was born with. The OTHER side's
    // body never lands: the fold ignores an agent's body on a row the user wrote,
    // and the pane must not draw an agent's words under her name.
    if (opened && words(patch.body) && !has(patch, 'answer') && !words(patch.result) && !words(patch.note)) {
      const i = events.findIndex((e) => e.field === 'body');
      if (i >= 0 && events[i].who === who) {
        const next = words(patch.body)!;
        if (events[i].words !== next) events[i] = { ...events[i], words: next };
      }
      // A title on the same line is still a rename, and the branch below says so.
      if (!has(patch, 'title')) continue;
    }

    // Ranked, most newsworthy first. Her reply outranks anything an agent set
    // on the same line; an agent's finished word outranks its progress.
    if (has(patch, 'answer')) {
      const said = words(patch.answer);
      replied = mine && said ? { at, by: markBy } : null;
      // WAS THE LAST THING SHE SENT ONE OF CLAUDE CODE'S COMMANDS. The blocked
      // line below reads differently after one, and this is the only place that
      // can tell: by the time the status arrives, the ledger line carrying
      // `/usage` is three events back. See that branch for what it cost.
      askedACommand = claudeCode && !!said && commandPrompt(said) !== null;
      // A PICK IS AN ACTION, NOT SOMETHING SHE TYPED (w-49b4e45403). It used to
      // be drawn as her message reading "Option 1: …". It is a quiet line of
      // hers now, the option's own words beside it, and `answers` tells the
      // conversation it still answered the agent (item-thread.ts).
      const picked = said ? PICK.exec(said) : null;
      if (picked) {
        events.push({
          at, who: 'you', said: `You picked option ${picked[1]}`,
          words: picked[2].replace(/\s*\(recommended\)\s*$/i, '').trim(),
          field: 'answer', answers: true,
        });
        continue;
      }
      events.push(said
        ? { at, who: 'you', said: 'You replied', words: said, message: true, field: 'answer' }
        : { at, who: 'you', said: 'You withdrew your reply' });
      continue;
    }

    if (words(patch.result)) {
      events.push({ at, who: 'agent', said: 'It came back to you', words: words(patch.result)!, message: true, field: 'result' });
      continue;
    }

    if (words(patch.note)) {
      events.push({ at, who: 'agent', said: 'It checked in', words: words(patch.note)!, message: true, field: 'note' });
      continue;
    }

    // THE SAME TITLE AGAIN IS NOT A RENAME. It falls through, so whatever else
    // the line set (a close, a pause) still speaks. "You renamed it" over a
    // name that never changed is what sat above a tester's agent's first
    // steps on 2026-10-01.
    if (has(patch, 'title') && String(patch.title ?? '') !== title) {
      const was = title;
      title = String(patch.title ?? '');
      events.push({
        at, who,
        said: mine ? 'You renamed it' : 'It renamed itself',
        ...(was ? { words: `was "${was}"` } : {}),
      });
      continue;
    }

    if (has(patch, 'runAt')) {
      const runAt = Number(patch.runAt) || 0;
      if (!runAt) {
        if (mine && replied && replied.by === markBy && at - replied.at <= REPLY_LIFTS_MS) continue;
        events.push({ at, who, said: mine ? 'You brought it back' : 'It let this run now' });
      } else {
        events.push({
          at, who,
          said: mine ? 'You snoozed it' : 'It paused this',
          words: snoozeWords(runAt, at),
        });
      }
      continue;
    }

    if (has(patch, 'status')) {
      const status = String(patch.status ?? '');
      // 'claimed' with no claim beside it is a lease line that lost its claim,
      // and the pickup above already said it.
      if (status === 'claimed') continue;
      if (status === 'done') {
        events.push({ at, who, said: mine ? 'You marked it done' : 'It closed this' });
        continue;
      }
      if (status === 'blocked') {
        // HER OWN BLOCKED IS NOT THE AGENT STOPPING. She has no control that
        // writes it; the one thing that does is a Z putting a row back where
        // her reply found it (`withdrawReply`), and it read as "It stopped and
        // asked you" under the agent's name (w-c78d1e1607).
        if (mine) continue;
        // BLOCKED AFTER A SLASH COMMAND IS NOT A STOP AND IS NOT A QUESTION.
        // `blocked` is the one status that carries a finished answer back into
        // her inbox (`recordSessionResult`, main/store.mjs), and the supervisor
        // now uses it for a command on every install.
        events.push({ at, who: 'agent', said: askedACommand ? 'It answered you' : 'It stopped and asked you' });
        askedACommand = false;
        continue;
      }
      if (status === 'open') {
        events.push({ at, who, said: mine ? 'You sent it back' : 'It handed this back' });
        continue;
      }
    }
    // Anything else is bookkeeping and stays silent.
  }
  tagWriter();

  return withTitleSaid(events, title, label);
}

// WHEN THE HEADER SHOWS THE SHORT NAME, THE TITLE IS SAID IN THE OPENING.
//
// An opened task is now headed by the same name as its row
// (`rowTitle`, w-b8c8958a12), not by its title. On a lot of user-written rows
// the title is the only place the first sentence lives: measured on a real
// store, over a quarter of them had a title that appears nowhere in the body,
// usually because the body is just a pasted picture. Unsaid here, those words would be
// on no screen at all. So the opening message carries the title above the body
// whenever the header is showing something else and the body does not already
// contain it.
function withTitleSaid(events: ThreadEvent[], title: string | null, label: string | null): ThreadEvent[] {
  const named = (label ?? '').trim();
  const said = (title ?? '').trim();
  if (!named || !said || named === said) return events;
  // Her rows open twice, the system's stamp and then her own line; the one
  // carrying the body is the opening she reads.
  const bodied = events.findIndex((e) => e.field === 'body');
  const i = bodied >= 0 ? bodied : events.findIndex((e) => /opened this$/.test(e.said));
  if (i < 0) return events;
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const head = squash(said.replace(/…$/, '')).slice(0, 40);
  const body = events[i].words ?? '';
  if (head && squash(body).includes(head)) return events;
  const out = events.slice();
  out[i] = { ...events[i], words: body ? `${said}\n\n${body}` : said, message: true, field: 'body' };
  return out;
}

/**
 * The runs, hung under the pickups that started them.
 *
 * Design A, one door and one list: the run log is not a peer of this
 * history, it is the inside of one line of it. So a session's diary belongs to
 * the pickup it began at, and the history's spine puts the eight runs on this
 * row into the order and the days they actually happened in — which the
 * flattened header fold could not do, and why its clock read 5:01am, 12:15am,
 * 4:29am, 7:11pm.
 *
 * THE MATCH IS BY TIME, AND THE DIRECTION IS NOT OBVIOUS. A worker claims its
 * row as its first action, so the claim line always lands AFTER the session
 * started, and the gap is not small: measured across the nine sessions of
 * one row it was 10s, 18s and 32s six times, and 52 minutes and 1h40m
 * twice, when the laptop slept before the agent got its first call away. So
 * each pickup takes the LATEST session that had already started when it
 * happened, oldest pickup first; matching the nearest session AFTER a pickup
 * instead credits every run to the wrong one.
 *
 * A pickup with nothing left to take shows no run at all, which is the truth:
 * this row has a claim at 13:12 whose session left no trace on disk. Sessions
 * older than every pickup hang under the first one rather than vanish.
 */
export function withRuns(events: ThreadEvent[], sessions: TraceSession[]): ThreadEvent[] {
  const pickups = events.filter((e) => e.pickup);
  const ordered = [...sessions].filter((s) => s && s.text).sort((a, b) => a.startedAt - b.startedAt);
  if (!pickups.length || !ordered.length) return events;

  const taken = ordered.map(() => false);
  const mine = new Map<ThreadEvent, TraceSession[]>();
  for (const pickup of pickups) {
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      if (taken[i] || ordered[i].startedAt > pickup.at) continue;
      taken[i] = true;
      mine.set(pickup, [ordered[i]]);
      break;
    }
  }

  const orphans = ordered.filter((_, i) => !taken[i]);
  if (orphans.length) {
    const first = [...orphans, ...(mine.get(pickups[0]) ?? [])].sort((a, b) => a.startedAt - b.startedAt);
    mine.set(pickups[0], first);
  }

  return events.map((event) => {
    const its = mine.get(event);
    if (!its?.length) return event;
    const runs = its
      .map((session) => readNotes([session]))
      .filter((notes): notes is Notes => !!notes);
    return runs.length ? { ...event, runs } : event;
  });
}

/**
 * A quote, not a rendering. Workers write markdown, and inside a ledger line
 * the syntax is noise: an image is a filename in brackets nobody can read, a
 * link prints its own URL beside itself. This is the words with the format's
 * punctuation taken off, and it keeps the line breaks, because a reply she
 * wrote as a list is not one paragraph.
 *
 * The message itself is never far: it is the row, in the pane.
 */
export function readable(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // images: unreadable as text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // links: keep what it said
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')            // heading marks
    .replace(/^\s{0,3}>\s?/gm, '')                 // quote marks
    .replace(/\*\*|`/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The day an event belongs to, written out.
 *
 * Never abbreviated, and never inside the time. "Yest 6:07pm" was misread as
 * "yes to 6:07 p.m.", and it was the drawing's only right-aligned row, so
 * both problems had one cause.
 */
export function dayHeading(ts: number, now = Date.now()): string {
  const days = Math.floor((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** The time column, which only ever holds a time. */
export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(/\s?([AP])M/i, (_m, p) => p.toLowerCase() + 'm');
}

// Anything with a moment on it groups the same way, because the two lists that
// do this — the ledger behind a task's time, and an agent's conversation — are
// the same reading problem and a five-day-old thread with no day headings is
// forty times of day in a column.
export function byDay<T extends { at: number }>(events: T[], now = Date.now()): Array<{ day: string; events: T[] }> {
  const days: Array<{ day: string; events: T[] }> = [];
  for (const event of events) {
    const day = dayHeading(event.at, now);
    if (days[days.length - 1]?.day !== day) days.push({ day, events: [] });
    days[days.length - 1].events.push(event);
  }
  return days;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
