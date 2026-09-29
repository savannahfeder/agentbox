// THE LINE UNDER THE TITLE, AND EVERY WORD IT IS ALLOWED TO SAY.
//
// WHERE THIS CAME FROM.What shipped until this file was:
//
//     Agentbox · directive · last moved 3m ago
//
// Three facts, and not one of them answered the question she opens a task to
// ask, which is whether anything is happening on it.
//
// TEN ARRANGEMENTS WENT TO HER, THEN EIGHT MORE. `components/Byline.tsx` is the
// arrangement. The seventeen she did not pick are written out verbatim in
// decisions.md under 2026-08-28, and are gone from the app rather than left
// switchable, which is her standing rule on option sets: anything still
// switchable is something she has to re-decide.
//
// FOUR THINGS SHE CUT, EACH IN HER OWN WORDS, AND THEY ARE CUT HERE RATHER
// THAN IN THE DRAWING, so no future arrangement can put one back by accident:
//
//   - THE MODEL. (08-27)
//   - THE KIND. (08-27) That is the answer to "what the heck is a directive":
//     the word does not appear.
//   - THE PROJECT. (08-28) PUT BACK 2026-09-28, see `project` below.
//   - THE SECOND CLOCK. See `lastChange` below, which is the whole of her third
//     question and the only one of the four that needed a fix rather than a
//     deletion.
//
// NOTHING IS INVENTED. Every fact below is already on the snapshot: the item
// itself, the supervisor's live sessions and queue, and the list rule in
// list-rules.ts that decides which tab a row is on.

import { liveLine, shortSpan, shortWord, type LiveFacts, type LiveState } from './live-line';
import { ago } from './format';
import { engineLabel } from '../../shared/engines.mjs';
import type { WorkItem } from './types';

/* ------------------------------ where it is ------------------------------- */
// THE TAB IT IS ON, IN THE TAB'S OWN WORD. The words here are the words on the
// tabs in App.tsx, with one addition: blocked, which is not a tab but is the
// one state where the row is in her inbox for a reason the tab cannot say.

export type Where = 'progress' | 'inbox' | 'scheduled' | 'closed' | 'blocked';

export interface WhereFacts {
  /** `belongsInProgress` for this row, passed in rather than recomputed. */
  inProgress?: boolean;
  /** A moment in the future this row is parked until. */
  scheduledUntil?: number;
  now?: number;
}

export function whereItIs(item: WorkItem, facts: WhereFacts = {}): Where {
  const { inProgress = false, scheduledUntil = 0, now = Date.now() } = facts;
  if (item.status === 'done') return 'closed';
  if (item.status === 'blocked') return 'blocked';
  if (scheduledUntil > now) return 'scheduled';
  return inProgress ? 'progress' : 'inbox';
}

/** The word for each, and it is the tab's word wherever there is a tab. */
export const WHERE_WORD: Record<Where, string> = {
  progress: 'In progress',
  inbox: 'In your inbox',
  scheduled: 'Scheduled',
  closed: 'Closed',
  blocked: 'Blocked',
};

/** The same fact said at length, for anything that reads the line aloud. */
export const WHERE_LINE: Record<Where, string> = {
  progress: 'This is in progress.',
  inbox: 'This is in your inbox, waiting for you.',
  scheduled: 'This is scheduled and is not running yet.',
  closed: 'This is closed.',
  blocked: 'This is blocked and is waiting for you.',
};

/* ------------------------------ the two clocks ---------------------------- */
// It indicated nothing. `item.updatedAt` is the timestamp of the NEWEST LINE in
// the ledger for that row, and the MCP server appends a keep-alive line every
// hundred seconds for as long as a worker holds the claim (`buildClaimLine` and
// LEASE_MS in shared/work-items.mjs; the fold in that file bumps `updatedAt`
// for a heartbeat exactly as it does for a real write). MEASURED on her own
// Agentbox ledger, 2026-08-28, on this very row: 215 lines, 161 of them
// heartbeats, median gap 100.0 seconds over 148 gaps. So "last moved 1m ago"
// under a four-minute run was the keep-alive ticking, and it could never read
// higher than about 1m40s while anything was running, whatever the row did.
//
// TWO FIXES, AND THE FIRST ONE IS THE ONE THAT MATTERS.
//
//   1. THE READING IS TAKEN OFF THE `wrote` MAP, NOT OFF `updatedAt`. The fold
//      records who last set each field and when, and a heartbeat sets no field,
//      so the newest stamp in that map is the last time the row ACTUALLY
//      changed. `lastFounderWrite` in main/supervisor.mjs already reads the map
//      this way for the resting rule; this is the same move with the source
//      filter taken off. It is right on a quiet row too, where a live claim
//      held by another Agentbox was making an untouched row look freshly moved.
//   2. WHILE A RUN IS UP, THE LINE CARRIES ONE CLOCK AND NOT TWO. The span
//      beside the turning mark IS the reading then, and a second age behind it
//      is the thing she could not read. `bylineFacts` returns a null `age` on a
//      running row for that reason, and the row goes back to saying it the
//      moment the run ends.

export function lastChange(item: WorkItem): number {
  let latest = 0;
  for (const w of Object.values(item.wrote ?? {})) {
    if (w && w.ts > latest) latest = w.ts;
  }
  // A row with no `wrote` map at all is an old line or an imported session.
  // Its `updatedAt` is the only reading there is, and it is not wrong there:
  // nothing ever heartbeat on it.
  return latest || item.updatedAt || 0;
}

/* -------------------------------- engines --------------------------------- */
// WHICH CODING AGENT — THE SLOT IS FILLED, AND ONLY WHERE THERE IS A CHOICE.
//
// Naming only the second one would make its ABSENCE the mark: she would learn
// that a row with no word here is the Claude Code row, and she would have been
// taught a symbol after all.
//
// AND A WORD THAT IS THE SAME ON EVERY ROW SHE WILL EVER READ IS FURNITURE.
// That was this slot's own standing objection to printing "Claude Code" for
// ever, and it still holds — so the condition is not about the row, it is about
// the Mac. `engineChoice` is false on a machine with one coding agent on it,
// and on every machine before she opens the gate; this is then null for every
// row, `Said` drops a null part, and the line is byte-identical to the one she
// picked on 08-28. On the machine that is really running two subscriptions,
// "which of them is this row spending" is the question the second engine exists
// to answer, and it differs from row to row.
//
// NEITHER FACT IS WORKED OUT HERE. Whether a choice is real needs the
// capability gate and the staleness rule, both of which live in main and are
// pinned to one file there by
// tests/a-codex-row-from-august-still-runs-on-claude.test.mjs. A byline that
// derived its own answer could print "Codex" over a row the supervisor was
// about to run on Claude Code, which is worse than saying nothing: it is the
// app telling her something it knows is not true. Both arrive already answered,
// on the snapshot.

export interface EngineFacts {
  /**
   * Whether this Mac offers a choice this build would actually honour.
   *  Answered by `Supervisor#engineChoices`, which holds the gate token. */
  engineChoice?: boolean;
  /**
   * Which engine THIS ROW runs on, resolved by main. Absent means the one a
   *  row that names nothing runs on. */
  engine?: string | null;
}

export function engineWordFor(facts: EngineFacts = {}): string | null {
  if (!facts.engineChoice) return null;
  return engineLabel(facts.engine ?? null);
}

/**
 * WHICH CODING AGENT IS ON THIS ROW RIGHT NOW, in the one word she reads
 * everywhere else. Null on every Mac with one agent, which is almost all of
 * them.
 *
 * WHAT IS RUNNING BEATS WHAT WOULD RUN, and that rule is the whole reason this
 * is a function rather than three call sites. `facts.engine` is the
 * supervisor's answer for the NEXT spawn on this row; `session.engine` is what
 * really started, written at the spawn. They agree except across a change she
 * has just made, and there the word has to be about the run in front of her,
 * because "which agent is working right now" is the question being asked. The
 * inbox row, the mark at the foot of the conversation and the byline over it
 * are three drawings of one fact, and three copies of this expression is three
 * chances for them to disagree on the same screen.
 */
export function agentAtWork(
  facts: EngineFacts & { session?: { engine?: string } | null } = {},
): string | null {
  return engineWordFor({ ...facts, engine: facts.session?.engine ?? facts.engine ?? null });
}

/* ------------------------------- everything ------------------------------- */

export interface BylineFacts {
  /**
   * WHICH PROJECT THIS IS, FIRST ON THE LINE. Cut on 08-28 on the grounds that
   *  the side panel named it, with the caveat written down that day that the
   *  panel goes when the code is open and "the project is named nowhere. One
   *  line to put back if it ever bites." It bit, w-b8c8958a12, 2026-09-28:
   *  "In a task itself I can't see which project it is." The sidebar now lists
   *  no projects at all, so this line is the only place a task says it. First,
   *  because `.fm-said` cuts from the right, so the project is the last word to
   *  go on a narrow card. */
  project: string | null;
  where: Where;
  whereWord: string;
  /** Null when nothing can be said: an imported session, or a closed row. */
  state: LiveState | null;
  /** "Working", "Queued", "Paused", "Nothing running". */
  stateWord: string | null;
  /** How long the run has been up. Only ever the age of a REAL session. */
  span: string | null;
  /** Null on any Mac with one coding agent; see `engineWordFor` above. */
  engineWord: string | null;
  /**
   * "3m", "Aug 13" — when the row last really changed. NULL while a run is
   *  up, because the span above is the reading then and two clocks on one line
   *  is the thing she could not read. */
  age: string | null;
  /** The whole thing as one sentence, for a screen reader. */
  line: string;
}

export function bylineFacts(
  item: WorkItem,
  facts: LiveFacts & WhereFacts & EngineFacts = {},
): BylineFacts {
  const now = facts.now ?? Date.now();
  const where = whereItIs(item, facts);
  const live = liveLine(item, { ...facts, now });
  // WHAT IS RUNNING BEATS WHAT WOULD RUN, and `agentAtWork` above is where that
  // rule lives now: the inbox row and the mark at the foot of the conversation
  // ask it the same question, and a second copy of the expression here is a
  // second chance for the header to disagree with the line six inches below it.
  // A CODEX CONVERSATION IS CODEX'S WHATEVER WOULD RUN HERE. The header on her
  // screenshot read "Claude Code" over a row that was a Codex thread asking to
  // be imported, because this slot names the engine the supervisor would spawn
  // next. Nothing spawns on these rows; the conversation happened in Codex and
  // that is the fact the slot is for. Said whether or not the Mac offers a
  // choice, because here it is not a choice.
  const codexRow = (item.labels ?? []).some((l) => l === 'codex' || l === 'codex-import' || l === 'not-imported');
  const engineWord = codexRow ? engineLabel('codex') : agentAtWork(facts);
  const span = facts.session ? shortSpan(Math.max(0, now - facts.session.startedAt)) : null;
  const stateWord = live ? shortWord(live.state, facts.session?.helpers ?? 0) : null;

  const project = item.productName?.trim() || null;

  return {
    project,
    where,
    whereWord: WHERE_WORD[where],
    state: live?.state ?? null,
    stateWord,
    span,
    engineWord,
    age: span ? null : ago(lastChange(item), now),
    line: (project ? `${project}. ` : '') + spokenLine({ where, live: live?.line ?? null, engineWord, span }),
  };
}

/**
 * The whole line as one plain sentence, for whatever reads the pane aloud,
 * because a mark and three fragments is a picture and a picture has to be
 * captioned. The engine is only named when there is one to name.
 */
function spokenLine(
  { where, live, engineWord, span }:
  { where: Where; live: string | null; engineWord: string | null; span: string | null },
): string {
  if (where === 'closed') return WHERE_LINE[where];
  // A LIVE RUN IS COMPOSED HERE RATHER THAN BORROWED. `live-line.ts` says "The
  // agent is working, 4 minutes in", which is right at the foot of a
  // conversation and says "agent" twice once a harness is named beside it.
  // Editing its words with a regex would be worse than writing our own: the day
  // that file rewords, the patch silently stops matching and nobody hears.
  // AND IT STILL SAYS WHICH LIST IT IS ON. "Working on this for 4m" implies in
  // progress to us and does not say it to her, and telling the two lists apart
  // is half of what she asked for.
  const agent = engineWord ?? 'The agent';
  if (span) return `${WHERE_LINE[where]} ${agent} has been working on this for ${span}.`;
  if (live && !engineWord) return `${WHERE_LINE[where]} ${live}`;
  if (live) return `${WHERE_LINE[where]} ${live} It will run on ${engineWord}.`;
  if (!engineWord) return WHERE_LINE[where];
  return `${WHERE_LINE[where]} It will run on ${engineWord}.`;
}
