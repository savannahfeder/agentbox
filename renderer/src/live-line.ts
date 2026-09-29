// WHETHER ANYTHING IS ACTUALLY HAPPENING ON THIS TASK.
//
// WHAT WAS THERE. The In progress LIST already said it at the right end of a
// row: "working · 4m", "queued", "stopped · 2h". The task itself said nothing.
// Opening one drew "the app · directive · last moved 3m ago" under the title and
// that was the whole of it, so the one screen she goes to when she wants to
// know what an agent is doing was the one screen that would not tell her.
//
// The app has known the answer the entire time. `supervisor.status` in
// main/supervisor.mjs returns the live sessions, the ids waiting for a slot,
// the ids whose worker died, the capacity and whether spawning is paused. Every
// one of those was already on the snapshot the pane is drawn from.
//
// So this decides WHICH of four things is true, and `Live.tsx` draws it. Pure,
// so the wording is pinned by tests rather than by a screenshot, and so that
// the two surfaces that say it cannot drift into two vocabularies.
//
// The nine looks she did not pick, and the block of prose she turned down
// before them, are gone; their copy is in decisions.md under 2026-08-24.
//
// THE FOURTH STATE IS THE ONE THAT COSTS SOMETHING TO ADMIT. A row sitting in
// In progress with no session, no place in the queue and no schedule is a row
// nothing is going to touch until something changes, and the honest word for it
// is that nothing is running. It happens: a worker took the row twice and gave
// nothing back, so the tick is resting it (`restingUntil`), or another Agentbox
// holds the claim. Saying "queued" there would be the lie this whole vocabulary
// was invented to stop telling (`queued` in supervisor.mjs, and the founder's
// own report on of a row reading "queued" under a sentence saying it was
// reading).

import { spanLabel } from './notes';
import type { RunningSession, WorkItem } from './types';

// THE FIFTH STATE, AND IT IS THE ONE SOMEBODY OUTSIDE THIS BUILDING ASKED FOR.
//
// Her pick of the three ways to fix it, 2026-08-31: "Say it on the row. When a
// run ends having written nothing, the row says so in the same voice the four
// live words use... She sees it in the inbox without opening anything. Small,
// honest, and it does not pretend to know what happened."
//
// So `silent` is a run that ENDED, cleanly, and wrote nothing down. It is not
// `idle`, which means nothing has happened here at all; the whole complaint is
// that those two looked identical while only one of them means somebody should
// go and check something. It is not `stalled` either, which is a worker that
// DIED and is already said in red by the bar above the conversation.
//
// AND IT DOES NOT PRETEND TO KNOW WHAT HAPPENED, which is her sentence and the
// hardest part to keep. The run may have opened a pull request or may have done
// nothing whatsoever; nothing on this side can tell, and a word that guessed
// would be worse than the silence it replaces.
export type LiveState = 'working' | 'queued' | 'paused' | 'silent' | 'idle';

export interface LiveLine {
  state: LiveState;
  /** The whole sentence. Never drawn; it is what the line is announced as. */
  line: string;
}

export interface LiveFacts {
  /** Non-null while a worker is on this row in this window. */
  session?: RunningSession | null;
  /** `supervisor.queued`: the ids a tick will spawn as soon as a slot frees. */
  queued?: string[];
  /** `supervisor.stalled`: a worker died on it. The stalled bar owns this. */
  stalled?: boolean;
  /**
   * `supervisor.silent[id]`: the last run ENDED here and wrote nothing down.
   *  `endedAt` is when, so the line can say how long the row has been quiet.
   *  Absent on the overwhelming majority of rows, which is why this reads as
   *  news when it does appear. */
  silent?: { runs: number; endedAt: number } | null;
  /** Spawning is off, globally or for this product. */
  paused?: boolean;
  /** How many workers are up, and how many may be. Both measured, both real. */
  running?: number;
  capacity?: number;
  /** The row is in In progress. Off her inbox this line has nothing to add. */
  inProgress?: boolean;
  /** A moment in the future this row is parked until. The schedule bar owns it. */
  scheduledUntil?: number;
  now?: number;
}

/* ------------------------------ the vocabulary ---------------------------- */
// ONE WORD, because one word is what she picked and one word is all the mark
// has room beside it. The sentence in `line` says the same thing at length for
// anything that reads the pane aloud.

/** The one word each state gets. */
export function shortWord(state: LiveState, helpers = 0): string {
  // THIS IS NOT A SECOND THING ON THE LINE. They were right that a count
  // belongs here and wrong that it needed its own words. So the count goes
  // INSIDE the word that is already there. Nothing is added to the line,
  // nothing is added to its height, and a run with no helpers reads exactly as
  // before.
  //
  // SUBAGENTS AND NOT AGENTS, and NOT HELPERS. Helper is our word and she has
  // never used it.
  //
  // NO HYPHEN, AND THAT WAS HER CALL WITH A CONDITION ON IT, 2026-08-27:
  // "4 Subagents Working -> remove the heiphen (unless that's super unusual.
  // If not then Sub-Agent is better." So the condition was measured rather than
  // guessed, in the Claude Code build on her own machine (2.1.246, the binary at
  // ~/.local/share/claude/versions): `subagent` 1033, `Subagent` 393,
  // `sub-agent` 25, and `Sub-agent` / `Sub-Agent` ZERO. Unhyphenated is the
  // house spelling by 57 to 1 and her fallback spelling does not occur at all,
  // so the condition is not met and the hyphen comes out.
  //
  // SHE IS RIGHT, AND THE OLD COMMENT HERE WAS THE MISTAKE. It claimed the lead
  // is "waiting on them, so four agents are what is working". Measured instead
  // of assumed this time, on Claude Code 2.1.246: a real run spawning three
  // sub-agents shows the lead issuing its OWN tool call (`Bash`, a top-level
  // assistant event with `parent_tool_use_id: null`) while one sub-agent was
  // still open. The lead is not idle. So at "1 Agent Working" two agents were
  // working, and the word counted one of them.
  //
  // `countHelpers` in main/supervisor.mjs only ever adds a `task_started` id,
  // so this number is subagents and can never be anything else. Naming what it
  // counts is the fix. Counting the lead as well was the alternative and it
  // costs more than it is worth: it would put "1 Agent Working" on every run in
  // Agentbox, including the overwhelming majority that spawn nothing, and she
  // asked for the opposite. She was offered that second way on 2026-08-27 and
  // did not take it, so it is settled.
  if (state === 'working' && helpers > 0) {
    return helpers === 1 ? '1 Subagent Working' : `${helpers} Subagents Working`;
  }
  if (state === 'working') return 'Working';
  if (state === 'queued') return 'Queued';
  if (state === 'paused') return 'Paused';
  // "NOTHING CAME BACK", AND THE PLAINNESS IS THE POINT.
  //
  // So not "silent", which is the state's name in the code and says nothing to
  // anybody reading a list. Not "empty run" or "no output", which are ours. The
  // words say the two things a person needs in the order they need them:
  // something ran, and it told you nothing. What to do about it is the sentence
  // below, where there is room for it.
  if (state === 'silent') return 'Nothing came back';
  return 'Nothing running';
}

// NEVER A SECONDS COUNTER.A run under a minute old has said nothing worth
// counting yet, so it reads "just now" and carries no number at all. FLOORED,
// NOT ROUNDED, and the suite caught this rather than a screenshot: at 59.6
// seconds a rounding reading said "1m" while `line`, which cuts at a whole
// minute, still said the run had just started. Two readings of one clock on one
// screen. Flooring also means the timing can never say more time has passed
// than has.
export function shortSpan(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/**
 * Has an agent actually written something here. `(withdrawn)` is the app's own
 *  word for a field that has been taken back, so it is not something to read. */
function said(text: string | null | undefined): boolean {
  const value = typeof text === 'string' ? text.trim() : '';
  return !!value && value !== '(withdrawn)';
}

/**
 * MAY THIS ROW SAY THAT NOTHING CAME BACK. One predicate, exported, because
 * THREE surfaces answer this question and they were not all answering it the
 * same way.
 *
 * Caught by a screenshot script rather than by a test, which is why it is worth
 * the export: `liveLine` below had her rule and the inbox row in List.tsx did
 * not, so the pane went quiet on a row carrying a result while the row beside it
 * still read "nothing came back". Two surfaces of one fact disagreeing on one
 * screen is the failure this whole vocabulary exists to prevent, and the row is
 * the one she reads first.
 *
 * a row with something on it to read has NOT come back empty, whatever the last
 * run did. `main/supervisor.mjs` refuses these too; this is the same rule kept
 * where the window can enforce it, because a renderer that trusts the main
 * process to be the only careful one is a renderer that draws whatever it is
 * sent.
 */
export function cameBackEmpty(
  item: { result?: string | null; note?: string | null },
  silent: { endedAt: number } | null | undefined,
): boolean {
  return !!silent && !said(item.result) && !said(item.note);
}

export function liveLine(item: WorkItem, facts: LiveFacts = {}): LiveLine | null {
  const {
    session = null, queued = [], stalled = false, paused = false, silent = null,
    inProgress = false, scheduledUntil = 0, now = Date.now(),
  } = facts;

  // An imported Claude Code session is not one of ours and has no place in any
  // of these lists; AgentThread draws its own liveness off the process.
  if (item.agent) return null;
  // Finished is finished. The result at the foot of the conversation is the
  // news, and a mark under it about agents would be an appendix to an ending.
  if (item.status === 'done') return null;

  if (session) {
    const elapsed = Math.max(0, now - session.startedAt);
    const helpers = session.helpers ?? 0;
    // The spoken sentence says the same fact at length. It has to move with
    // the word or the pane shows one number and says another. And it is the
    // one place with room to say the whole truth the word can only imply: the
    // lead is working AND the subagents are, which is what she asked about.
    if (helpers > 0) {
      const many = helpers === 1 ? 'one subagent' : `${helpers} subagents`;
      return {
        state: 'working',
        line: elapsed < 60_000
          ? `The agent just started on this, with ${many} out.`
          : `The agent is working with ${many}, ${spanLabel(elapsed)} in.`,
      };
    }
    return {
      state: 'working',
      line: elapsed < 60_000
        ? 'The agent just started on this.'
        : `The agent is working, ${spanLabel(elapsed)} in.`,
    };
  }

  // The two bars above the conversation already say these, in more words and
  // with the button that fixes them. Saying it twice on one screen is the
  // duplication this pane keeps having to be rescued from.
  if (stalled) return null;
  if (scheduledUntil > now) return null;

  // A RUN ENDED HERE AND WROTE NOTHING DOWN, so the row says so rather than
  // reading exactly like a row nothing has ever touched.
  //
  // ABOVE THE In-progress GATE, DELIBERATELY, AND THAT IS THE WHOLE POINT OF IT.
  // A row a run gave nothing back on is not in In progress; it is sitting in her
  // inbox looking untouched, which is precisely what the engineer described. A
  // check below the gate would be a sentence that only ever appeared on rows
  // that did not need it.
  //
  // It is below the session, stalled and scheduled tests because each of those
  // is something happening NOW, and news about a run that has already ended is
  // never the better answer than news about one that has not. AND NEVER UNDER
  // SOMETHING SHE CAN READ.
  //
  // She was looking at a finished result with three options on it, waiting on
  // her, and "Nothing came back" printed underneath. Both facts were true and
  // the pair was a lie: an agent had come back, at length.
  //
  // `_silentRows` in main/supervisor.mjs now refuses these too, and this is the
  // same rule kept where a test can hold it, because the pane must not depend on
  // the main process being the only careful one. A row with a result or a
  // checkpoint on it has news already; this state is only ever about a row with
  // NOTHING on it to read.
  if (cameBackEmpty(item, silent)) {
    const quiet = Math.max(0, now - (silent!.endedAt || now));
    return {
      state: 'silent',
      // WHAT TO DO ABOUT IT IS HERE AND NOT IN THE WORD, because the word is
      // read in a list of twenty and this is read by somebody who has stopped on
      // this one. Sending a message is genuinely the fix: it is what the
      // engineer did, and it is what got him his answer.
      line: quiet < 60_000
        ? 'The last agent finished without saying anything. Send it a message to find out what happened.'
        : `The last agent finished without saying anything, ${spanLabel(quiet)} ago. Send it a message to find out what happened.`,
    };
  }

  if (!inProgress) return null;

  if (queued.includes(item.id)) {
    return {
      state: 'queued',
      line: 'Queued. An agent starts on it as soon as one is free.',
    };
  }

  if (paused) {
    return {
      state: 'paused',
      line: 'Agents are paused, so nothing will start on this.',
    };
  }

  return {
    state: 'idle',
    line: 'No agent is on this, and none is waiting to start.',
  };
}
