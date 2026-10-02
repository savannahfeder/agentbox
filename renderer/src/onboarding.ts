// THE FIRST RUN. The walk, built on 2026-08-21.
//
// Five rounds of drawings came before this file and none of them was code. What
// started it: the coaching line has to point at the thing it is talking about.
//
// NOTHING ELSE IN THE WALK IS REOPENED. The welcome (corner to corner), the one
// button folder screen, the name second and prefilled, no notes screen, no five
// keys screen, and the example task as the spine were all settled in earlier
// rounds. Claude Code missing is the LINE ONLY. The slow task is wait and
// bound it, and a Mac with no other agents is left alone: both taken as
// recommended on the round five page, and either can be overruled in a word.
//
// This module is the part with no React in it, so the walk can be tested
// without a window.

import { PRACTICE_NAME, PRACTICE_TASK } from '../../shared/first-run-practice.mjs';
import { NAME, Name } from '../../shared/product-name.mjs';
import { DONE } from './done-word';

/**
 * THE BEATS. `landed` is the end and draws nothing over the app.
 *
 * ROUND FOUR, 2026-08-21, and the order is off the approved drawing.
 * Two things moved and two things are new:
 *
 * - ⌘K IS LAST, NOT FIRST.So the palette no longer opens itself over an empty
 * app, and beat four points at the plus instead. - `open` IS NEW.
 *
 * AND THE AGENTS QUESTION IS NOT A SCREEN AT ALL ANY MORE.It spent a day as the
 * eighth of ten and a few hours as the tenth, and both of those are a full
 * screen form standing on its own. It is now part of the finish card: the card
 * says she is ready and offers to bring her agents in the same breath.
 *
 * A Mac with no agent files now has no offer on the card at all, so there is no
 * screen left to contradict itself and the walk ends on the ending.
 */
/*
 * Clearing the three now goes straight on
 * to ⌘K. The deleted copy is in decisions.md, 08-23, verbatim. */
export type Step =
  | 'welcome' | 'folder' | 'name'
  //  IT SITS FOURTH, BEFORE THE INTRODUCTION, so the four screens after it are
  //  already wearing the pick and the whole window repaints under the hand as
  //  it is made. A picker at the end of the walk would have been a question
  //  about a window somebody had already stopped looking at.
  | 'look'
  // Three slabs, then the hand-off into the practice project. None of these
  // four is the app: they are words on a screen, which is the point of them.
  //
  // AND THE SIDEBAR NOTE IS NOT ONE OF THEM.
  | 'inbox' | 'away' | 'goal' | 'hand'
  | 'make' | 'who' | 'task' | 'working' | 'open' | 'answer'
  // THERE WAS A `note` BEAT HERE, pointing at the project rail's notes panel.
  // The rail is retired on every screen, so the beat drew no ring and no card
  // and only Enter moved it on: a silent screen in the middle of the tutorial.
  // It went with w-ec62ab6b38 (2026-09-28). A walk saved at `note` resumes at
  // `clear` (`liveStep`).
  | 'clear' | 'snooze' | 'unblock' | 'where' | 'board' | 'command' | 'done' | 'landed';

/**
 * HOW MANY BEATS THE WALK HAS. It stays because the walk still has a
 * length and the tests still hold it to one. */
export const N_BEATS = 20;

/**
 * WHICH BEAT EACH SCREEN IS. One pair shares one: `working` and `open` are one
 *  beat, a task going away and coming back, and so are `done` and `landed`.
 *
 *  This was `DOT` and it lit a dot; it is the walk's own numbering now and
 *  draws nothing. What it is still for is ORDER, which the tests read: the look
 *  step comes after the introduction and before the practice, the tab tour
 *  comes after the inbox is cleared, and the finish card is last. Those are
 *  real claims about the walk whether or not anybody is counting on screen. */
export const BEAT: Record<Step, number> = {
  welcome: 1, folder: 2, name: 3,
  // The introduction is four beats of its own and it counts, because a walk
  // that says it is nine long and then keeps going is a walk that lied about how
  // long it was. It went to four slabs on the morning of 2026-08-24 and back to
  // three that evening, when the sidebar note moved out of it.
  inbox: 4, away: 5, goal: 6,
  // PICKING THE LOOK IS BEAT SEVEN, and it is a beat rather than a detour: it
  // is a screen somebody presses through the same as the two before it. It was
  // beat four until 2026-08-25, when it moved down to the practice round.
  // THE COUNT DID NOT MOVE, because nothing was added or taken away: the four
  // screens it stepped over each came up one and it took the seventh.
  look: 7, hand: 8,
  // WRITING ONE IS TWO BEATS SINCE 2026-10-01: the card opens, you see who it
  // is to, then you send it. Everything after shifted by one.
  make: 9, who: 10, task: 11,
  working: 12, open: 12, answer: 13,
  // `clear` closes the two that are finished and `unblock` answers the one that
  // is not, which is the difference the product exists to teach. AND THE THREE
  // WAYS A ROW LEAVES THE INBOX ARE THREE BEATS. `clear` closes the two that
  // are finished, `snooze` puts off the one that is real work and not for
  // today, and `unblock` answers the one an agent is stopped on. The rail's
  // note beat that sat at thirteen is gone with the rail.
  clear: 14, snooze: 15, unblock: 16,
  // AND BEAT FIFTEEN IS THE TOUR OF THE OTHER TWO TABS. It is one beat even
  // though it takes three presses of Tab, the same way `working` and `open`
  // share beat ten: it is one thing happening, which is somebody being shown
  // where the work they just did has gone.
  where: 17,
  // AND THE BOARD IS THE BEAT AFTER THE TOUR (2026-10-01). The tour says where
  // the work went; the board is the same work laid out by what is happening to
  // it, which is the one view the walk never opened. The walk has to show the
  // view somebody uses to see what a whole team is up to, not only the tabs.
  board: 18,
  command: 19, done: 20, landed: 20,
};

export interface FirstRun {
  step: Step;
  /**
   * WHETHER THIS IS THE TUTORIAL RATHER THAN THE WHOLE ONBOARDING.
   *
   * Two things were one thing until this row. A tester only found the practice
   * round because they were told out loud to press ⌘K and type onboarding.
   *
   *  So the walk splits, and it splits along a line that was already there. The
   *  beats before `make` are SETUP — welcome, folder, name, the theme, the three
   *  introduction slabs — and they only make sense on a Mac that has never had
   *  Agentbox on it. The beats from `hand` to `command` are the TUTORIAL: a
   *  pretend project, four pretend rows, and the keys. A tutorial run starts at
   *  `hand` and ends when the ⌘K beat is over; it never draws a setup screen and
   *  it never draws the import card, because the person running it set Agentbox up
   *  weeks ago and ⌘K has its own row for importing agents.
   *
   *  IT IS A FIELD ON THE RUN RATHER THAN A SECOND STATE MACHINE. Everything
   *  between `hand` and `command` is identical in both, which is the whole point
   *  of the split: one walk, entered at two doors and left at two. A second copy
   *  of those eleven beats is a second copy that drifts. */
  tutorial?: boolean;
  /**
   * The folder they pointed at. Saved as answered, so quitting halfway and
   *  reopening resumes rather than asking again. */
  folder: string | null;
  name: string;
  /**
   * The project once it is really in the store. The user's own, the one they named,
   *  the one they land in at the end. Nothing in the walk is ever done to it. */
  product: string | null;
  /**
   * THE PRACTICE PROJECT, once it is really in the store.So it is not a card
   * and not a mock: it is a real project in the real store, and every beat
   * from `make` to `command` happens inside it with the whole app scoped to
   * it. It is archived the moment the walk ends, which is what takes it back
   * off the screen. */
  practice: string | null;
  /** The example task once it is really in the store. */
  item: string | null;
  /** When the example task was sent, so the line can change if it runs long. */
  sentAt: number | null;
  /**
   * The three example rows of beat eight, once they are really in the store.
   *  Empty until her own first task is closed, which is what stages them. It
   *  used to be the agents screen that did it, and that screen is at the end of
   *  the walk now. */
  examples: string[];
}

export const START: FirstRun = {
  step: 'welcome', folder: null, name: '', product: null, practice: null,
  item: null, sentAt: null, examples: [],
};

/**
 * THE TUTORIAL, AS A RUN. It starts on the hand-off card — "This is a practice
 *  project", the one screen that says nothing in here is yours — because that
 *  card is the whole preamble the tutorial needs and it is already written.
 *
 * `product` IS WHERE THEY COME BACK TO, and it is not decoration. `finishRun`
 * hands the compose card's remembered slot back to `run.product` when the walk
 * ends, which is what stops the card still saying Practice afterwards. A
 * tutorial run makes no project of its own, so it carries the project the
 * person was already in: the one they just made, or the one they were looking
 * at when they typed practise into ⌘K. */
export function tutorialRun(product: string | null): FirstRun {
  return { ...START, tutorial: true, step: 'hand', product };
}

/**
 * WHAT FOLLOWS THE ⌘K BEAT, which is the one place the two walks part company.
 *
 *  The onboarding goes on to `done`, which is the import card and then the
 *  confetti. The tutorial ENDS: the person running it has had Agentbox for weeks,
 *  their agents are already imported, and ⌘K has a row of its own for importing
 *  more. A card offering to set up something already set up is the success
 *  page a tester pressed past without reading (2026-08-24).
 *
 *  It is a function rather than a branch inside the effect that calls it so the
 *  rule can be tested without a window, the same as `finishCard` above. */
export function afterCommand(run: { tutorial?: boolean } | null): 'done' | 'end' {
  return run?.tutorial ? 'end' : 'done';
}

export type Event =
  | { t: 'start' }
  | { t: 'folder'; path: string }
  // NO FOLDER (2026-10-01): somebody who has none goes on without one, and the
  // project is made with no folder of its own (see `folderNone` in COPY).
  | { t: 'noFolder' }
  | { t: 'name'; name: string }
  | { t: 'made'; product: string }
  | { t: 'practice'; product: string; examples: string[] }
  | { t: 'sent'; item: string; at: number }
  | { t: 'answered' }
  | { t: 'staged'; examples: string[] }
  | { t: 'finish' };

/**
 * THE WALK, as a pure function. Every step forward in the first run is one of
 *  these, and none of them is a click on a Next that means nothing: `folder`
 *  arrives when a folder was really chosen, `made` when the store really took
 *  the project, `sent` when the task really exists. */
export function advance(s: FirstRun, e: Event): FirstRun {
  switch (e.t) {
    case 'start':
      return s.step === 'welcome' ? { ...s, step: 'folder' } : s;
    case 'folder':
      // The name comes off the folder: name second, prefilled.
      // A name already typed by hand outranks the proposal.
      // A name that was only ever the last folder's proposal follows the new
      // folder; one typed by hand stays.
      return {
        ...s,
        folder: e.path,
        name: !s.name || (s.folder && s.name === nameFromFolder(s.folder)) ? nameFromFolder(e.path) : s.name,
      };
    case 'noFolder':
      // The same rule as a folder's proposed name: one typed by hand stays, and
      // one that only came off the last folder gives way.
      return {
        ...s,
        folder: null,
        name: !s.name.trim() || (s.folder && s.name === nameFromFolder(s.folder)) ? COPY.noFolderName : s.name,
      };
    case 'name':
      return { ...s, name: e.name };
    case 'made':
      // AND THE PROJECT IS MADE BEFORE THE INTRODUCTION, NOT AFTER IT. It sits
      // there empty and untouched for the whole of the walk; what the person
      // practises in is a different project entirely. The old walk went from
      // here straight to the plus.
      //
      // AND WHAT COMES NEXT IS THE INTRODUCTION.It is the last screen before
      // the hand-off now, so nothing is between naming the project and being
      // shown what the product is for.
      return { ...s, product: e.product, step: 'inbox' };
    case 'practice':
      // THE THREE WAITING ROWS ARE WRITTEN NOW, not eight beats later. They are
      // in the practice project from the moment it exists, the way an inbox
      // somebody walks into really would be, and `walkRows` is what keeps them
      // off the screen until the beat that clears them. The old walk staged
      // them mid-flight because they went into the person's own project and
      // could not be there a moment sooner than they were needed.
      return { ...s, practice: e.product, examples: e.examples, step: 'make' };
    case 'sent':
      return { ...s, item: e.item, sentAt: e.at, step: 'working' };
    // AND IT DOES NOT OPEN ITSELF.
    case 'answered':
      return s.step === 'working' ? { ...s, step: 'open' } : s;
    case 'staged':
      // The rows arrive and clearing them is the very next beat.
      return { ...s, examples: e.examples, step: 'clear' };
    case 'finish':
      return { ...s, step: 'landed' };
  }
}

/**
 * The step the folder screen leaves, and the one the name screen leaves. Kept
 *  apart from `advance` because both are a plain move with nothing to record. */
export function stepTo(s: FirstRun, step: Step): FirstRun {
  return { ...s, step };
}

/**
 * THE WAY BACK, AND WHICH SCREENS HAVE ONE.
 *
 *  A tester picked a project folder and could not get back off that
 *  screen. It had no Back on it and nothing listened for Escape, so the only
 *  backwards move in the whole of setup was Escape on the NEXT screen, typed
 *  into a field, which nothing said out loud.
 *
 *  ONLY THE TWO SETUP SCREENS HAVE A WAY BACK, and this is a written-out pair
 *  rather than the previous entry in `STEPS`, on purpose. Everything from the
 *  introduction on is downstream of a project that has really been made in the
 *  store: walking back into the name screen from the first slab would offer to
 *  rename something that already exists, and back from the practice round would
 *  offer to make a second one. A screen you can undo is only honest while
 *  nothing has been written down yet.
 *
 *  Anything else answers null, which is what both the key and the button read
 *  to decide whether they are drawn at all. A Back that leads nowhere is the
 *  dead key `tests/the-walk-promises-no-dead-keys.test.mjs` exists to forbid. */
export function stepBack(step: Step): Step | null {
  if (step === 'folder') return 'welcome';
  if (step === 'name') return 'folder';
  return null;
}

/**
 * THE NAME IS TAKEN FROM THE FOLDER. `~/Desktop/dev/agentbox-v2` reads as
 *  `Agentbox v2`, because the folder is a path and the name is a name. */
export function nameFromFolder(path: string): string {
  const base = path.replace(/\/+$/, '').split('/').pop() ?? '';
  return base
    .replace(/[-_.]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * THE FOLDERS SOMEBODY ALREADY RUNS AGENTS IN, for the setup's folder screen
 *  (w-ec62ab6b38). The old screen asking where the code is was hard to
 *  understand, so it was redone from scratch.
 *
 *  A developer arriving here already has Claude Code or Codex conversations,
 *  and every one of them names the folder it ran in. So the screen offers
 *  those folders, newest first, one click each, and the Mac chooser is the
 *  last row rather than the whole screen. Read from the same conversation
 *  list the import card reads, which touches no guarded folder.
 */
export interface RecentFolder {
  folder: string;
  name: string;
  short: string;
  when: number;
  via: Array<'claude' | 'codex'>;
}
export function recentFolders(
  threads: Array<{ folder?: string; short?: string; when?: number; source?: string }>,
  { home = '', max = 6 }: { home?: string; max?: number } = {},
): RecentFolder[] {
  const byFolder = new Map<string, RecentFolder>();
  const h = home.replace(/\/+$/, '');
  for (const t of threads) {
    const folder = String(t.folder ?? '').replace(/\/+$/, '');
    if (!folder || folder === h || folder === '/') continue;
    const via = t.source === 'codex' ? 'codex' : 'claude';
    const had = byFolder.get(folder);
    if (had) {
      had.when = Math.max(had.when, t.when ?? 0);
      if (!had.via.includes(via)) had.via.push(via);
      continue;
    }
    byFolder.set(folder, {
      folder,
      name: folder.split('/').pop() ?? folder,
      short: t.short || shortPath(folder, home),
      when: t.when ?? 0,
      via: [via],
    });
  }
  return [...byFolder.values()].sort((a, b) => b.when - a.when).slice(0, max);
}

/**
 * `~` back, so the screen says what she calls the folder rather than what the
 *  filesystem does. */
export function shortPath(path: string, home?: string): string {
  const h = (home ?? '').replace(/\/+$/, '');
  return h && path.startsWith(h + '/') ? '~' + path.slice(h.length) : path;
}

/**
 * WHETHER THE WALK RUNS AT ALL. A store with no projects in it has never been
 *  used, which is the only honest test of a first run; `?firstrun=1` forces it
 *  so the walk can be looked at without wiping anything, and `done` is written
 *  once at the end so it never comes back on its own. */
export function firstRunNeeded(p: { products: number; done: boolean; forced?: boolean }): boolean {
  if (p.forced) return true;
  return !p.done && p.products === 0;
}

// ---------------------------------------------------------------------------
// THE EXAMPLE TASK.
//
// THE TASK CHANGED ON 2026-08-21.
//
// The number is measured. The readme version of this was
// tried first and run over 29 real project folders: it gave a
// sentence saying what the project was for 16 of them and something wrong or
// empty for the other 13, because 10 of those folders have no description
// written down anywhere.
//
// So the question is now one whose answer is always there to be read, and the
// sentence that answers it is ours with their numbers in it
// (shared/first-run-shape.mjs). Correct on 29 of 29, in a median of 7.5ms.
// AND ON 2026-08-23 IT MOVED AGAIN, INTO THE PRACTICE PROJECT. Everything
// above is still true of the old task and none of it is true of this one, so
// the reasoning is kept rather than deleted: the readme-reading answer exists
// because the task ran against somebody's own folder, and this one does not run
// against a folder at all. As in Superhuman, the practice project is still the
// whole UI. A task sent inside a project that is not theirs cannot
// honestly report on their code, so the question and the answer are both
// written down in shared/first-run-practice.mjs, and the answer is a decision
// an agent made on its own — which is the shape the very next beat teaches
// them to close.
//
// main/first-run.mjs and shared/first-run-shape.mjs are UNCHANGED and still
// read a folder: that path is what answers a task in a real project, and the
// walk simply no longer sends one there.
export const TASK_TITLE = PRACTICE_TASK.title;
export const TASK_BODY = PRACTICE_TASK.body;

/** The line changes at fifteen seconds. Taken as recommended, round four. */
export const SLOW_AFTER_MS = 15_000;

// ---------------------------------------------------------------------------
// AND THE TASK IS NOT AN AGENT.
//
// Why is on the row and it is measured. A real first task was
// created at 10:12:16, started at 10:12:29 after thirteen seconds queued behind
// the directive the walk itself had composed eight seconds earlier, and
// answered at 10:13:15. That is 59.6 seconds under a sentence promising a few,
// and at fifteen seconds the line said it was still reading while the row said
// queued. It was not reading. It had not started.
//
// So the row, the reading pane, the ledger and the result are all real, and the
// answer is read out of the folder chosen two screens earlier: see
// main/first-run.mjs. Nothing about it can queue, stall or need the network.

/**
 * The mark on the walk's own row. The supervisor never spawns fresh work on a
 *  row carrying it, and the queued list never advertises one. */
export const FIRST_RUN_LABEL = 'first-run';

/**
 * How long the row is left working before the answer is written. It is not a
 *  fake delay for its own sake: pressing a key and being answered in the same
 *  frame teaches nothing about what a task IS, and the sentence beside the row
 *  is the thing being read during it. About two seconds is the promise the copy
 *  makes and this is that promise. */
export const ANSWER_AFTER_MS = 2_000;

/**
 * WHAT THE LIST HOLDS WHILE THE WALK IS RUNNING.
 *
 *  One row, and it is the row being pointed at. Anything else is work the
 *  person has not been introduced to yet, and on the In progress step it is
 *  also ink directly under the ring: the sentence about her task gets pushed
 *  down until it clears whatever is in the way, so with other rows in the list
 *  it is printed under somebody else's. Everything arrives when the walk ends,
 *  which is one render later. */
export function walkRows<T extends { id: string }>(rows: T[], run: FirstRun | null): T[] {
  // NOTHING IS IN THE LIST UNTIL SHE PRESSES THE BUTTON. `landed` is the walk
  // over, and it is the first moment anything the app found on the machine is
  // hers to see.
  if (!run || run.step === 'landed') return rows;
  // AND THE FINISH CARD STANDS OVER AN EMPTY INBOX, because that is what it
  // says. Those two rows were Claude Code sessions already running on her Mac,
  // which Agentbox finds by itself and which have nothing to do with the import
  // the card is offering. The card had just told her the inbox was empty and
  // no agent was waiting on her, and the list under it was saying otherwise.
  // Measured on this walk the same night: at the finish card the list held two
  // rows saying other sessions on the Mac had been quiet for a minute.
  if (run.step === 'done') return [];
  // BEAT EIGHT IS THE ONE BEAT WITH A FULL INBOX, and it holds exactly the three
  // examples the walk staged. Everything else the store has by now (the
  // directive that making the project composed, and the example task she has
  // already closed) stays out until the walk ends, one render later.
  if (run.step === 'clear' || run.step === 'snooze' || run.step === 'unblock') {
    const keep = new Set(run.examples);
    return rows.filter((r) => keep.has(r.id));
  }
  // AND THE TOUR SEES HER OWN TASK TOO. Beat fifteen walks Inbox, In progress
  // and Closed, and what is in Closed is the two examples she closed AND the
  // task written and closed at beat twelve. Leaving that one out would
  // draw a Closed tab holding two of the three things she finished, which is
  // the sort of quiet lie a person notices later and cannot place.
  //
  // The directive the project's making composed is still filtered out, because
  // this keeps a named set rather than dropping the filter.
  if (run.step === 'where') {
    const keep = new Set([...run.examples, run.item].filter(Boolean) as string[]);
    return rows.filter((r) => keep.has(r.id));
  }
  return rows.filter((r) => r.id === run.item);
}

/* ---------------- THE TWO HALVES OF BEAT THIRTEEN ------------------------- */
/* * WHY THERE ARE TWO. The old beat thirteen said "Close all three with E" over three rows,
 and one of those three is an agent STOPPED on a question. So the climax of the walk taught
 somebody to close a blocked agent, and the inbox it left behind was empty with nothing
 running, which is the opposite of the thing this product is for.

   Empty is not the lesson. Nothing waiting on you and every agent running is
   the lesson, and it cannot be taught by a sentence on a card while the screen
   shows the other thing. So the two finished rows are closed, the third is
   ANSWERED, and the app's own rules do the teaching: an answered question is In
   progress (`belongsInProgress`, list-rules.ts) so it leaves the inbox and
   STAYS on the rail under Active agents. The last frame of the walk is an empty
   inbox with an agent running in it, which is the picture the third
   introduction slab promised four beats earlier.

   `waiting` is a field on the row rather than a guess from its kind, because
   which of the three is stopped is the whole content of the lesson and it must
   not be inferable wrongly. See shared/first-run-practice.mjs.
*/

/**
 * Which of the staged examples is the one an agent is stopped on. The rows are
 *  staged in the order they are declared, so the index is the link between the
 *  ids the store handed back and the copy that describes them. */
export function waitingIndex(rows: { waiting?: boolean }[]): number {
  return rows.findIndex((r) => r.waiting);
}

/**
 * And which of them is the one that is real work and not for today, which is
 *  the row beat fourteen snoozes. Same reasoning as `waitingIndex`: it is a
 *  field on the row rather than a guess from its kind, because which row is
 *  which IS the lesson and it must not be inferable wrongly. */
export function laterIndex(rows: { later?: boolean }[]): number {
  return rows.findIndex((r) => r.later);
}

/**
 * WHETHER THE TWO FINISHED ROWS ARE BOTH GONE, which is what ends `clear`.
 *  The one that is waiting is not counted: closing it would end the beat by
 *  doing the exact thing the next beat exists to prevent. */
export function finishedCleared(
  rows: { id: string }[],
  run: FirstRun | null,
  waitingAt: number,
  /**
   * And the one that is real work but not for today, which beat fourteen
   *  snoozes. Closing it would end this beat by teaching the wrong key on it,
   *  exactly as closing the stopped one would. */
  laterAt: number,
): boolean {
  if (!run || !run.examples.length) return false;
  const there = new Set(rows.map((r) => r.id));
  return !run.examples.some((id, i) => i !== waitingAt && i !== laterAt && there.has(id));
}

/**
 * WHICH FINISHED ROWS ARE STILL IN THE INBOX, in the order they are drawn.
 *
 * THE BEAT USED TO NAME NONE OF THEM AND THAT WAS THE FAULT.
 * The card read "Two of these are finished. The other two are not." over four
 * rows, with the ring on whichever row happened to be first, so working out
 * WHICH two was left to the person walking.
 *
 *  The pointer was on the row an agent is stopped on, which is what the E
 *  key acts on (`pointed` in App.tsx: the hovered row outranks the keyboard's),
 *  so the card said press E and the app answered "Open it and answer it". Two
 *  instructions on one screen, and the second one arrived only because the
 *  first would not say which row it meant.
 *
 *  So the beat points at ONE row, the way `snooze` and `unblock` already do,
 *  and this is the list it walks down. Both are still closed with E and the two
 *  lights still count them out; what is gone is the puzzle. */
export function clearIds(
  rows: { id: string }[],
  run: FirstRun | null,
  waitingAt: number,
  laterAt: number,
): string[] {
  if (!run) return [];
  const there = new Set(rows.map((r) => r.id));
  return run.examples.filter((id, i) => i !== waitingAt && i !== laterAt && there.has(id));
}

/**
 * The id of the row beat fourteen is about, or null, for the same reason
 *  `waitingId` exists: a row cleared out of order would otherwise put the ring
 *  round whatever happened to be left. */
export function laterId(run: FirstRun | null, laterAt: number): string | null {
  if (!run || laterAt < 0) return null;
  return run.examples[laterAt] ?? null;
}

/**
 * WHETHER BEAT FOURTEEN IS OVER: the snoozeable row is out of the inbox. Any
 *  way out counts, the same as `finishedCleared`, so nobody is ever stranded
 *  pointing at a row that is not there. */
export function laterCleared(
  rows: { id: string }[],
  run: FirstRun | null,
  laterAt: number,
): boolean {
  const id = laterId(run, laterAt);
  if (!id) return false;
  return !rows.some((r) => r.id === id);
}

/**
 * The id of the row beat fourteen is about, or null. The walk points at it by
 *  id rather than at "whatever is left", because a row closed out of order
 *  would otherwise put the ring round the wrong thing. */
export function waitingId(run: FirstRun | null, waitingAt: number): string | null {
  if (!run || waitingAt < 0) return null;
  return run.examples[waitingAt] ?? null;
}

/**
 * THE ROWS E MAY NOT TAKE OUT WHILE THE WALK IS ON, and the sentence to say
 *  when it is pressed on one of them.
 *
 * MEASURED ON A REAL WALK, 2026-08-27, not reasoned about. The ledger has the
 * order the four rows were taken in, and it is not the order the walk assumes:
 *
 *    +0s   the STOPPED one, closed with E
 *    +4s   a finished one, closed
 *    +7s   the other finished one, closed
 *    +11s  the one that is not for today, snoozed
 *
 *  Every beat here ends on "that row left the inbox". So `clear` ended at
 *  +7s, `snooze` ended at +11s, and `unblock` began with its row
 *  already eleven seconds gone: `inboxCleared` was true the moment the beat
 *  started and it handed straight on to `where`. The card that says press 1 was
 *  on the screen for no frames at all. Four scripted walks in the same ledger
 *  all reach it, because a script presses the keys in the order the beats
 *  expect and a person does not.
 *
 *  The old rule tolerated a row closed out of order on purpose, so nobody was
 *  ever left pointing at a row that is not there. It bought that with the one
 *  beat this whole product is for. Closing an agent that is stopped waiting on
 *  you is the move the walk exists to teach people NOT to make, and it was the
 *  easiest move to make on that screen. So the tolerance moves one step
 *  earlier: the row cannot leave that way at all, and the key says why rather
 *  than doing nothing, which is the call G already makes in the inbox.
 *
 *  It is only ever the walk's own staged rows, and only while the walk is on.
 *
 *  ONE SENTENCE IN ONE PLACE for the stopped row, because E and L say the same
 *  thing about it and two wordings of it is two lessons. It names the row the
 *  way the beat that is coming names it, so the toast and the card agree. */
const STOPPED_REFUSAL = 'That one is an agent stopped, waiting on you. Open it and answer it.';

export function closingRefused(
  run: FirstRun | null,
  id: string,
  waitingAt: number,
  laterAt: number,
): string | null {
  if (!run || run.step === 'landed') return null;
  if (id === waitingId(run, waitingAt)) return STOPPED_REFUSAL;
  if (id === laterId(run, laterAt)) return 'That one is not finished. Press L to deal with it later.';
  return null;
}

/**
 * AND THE SAME FOR L, on the one row it is also wrong on. Scheduling the
 *  stopped row takes it out of the inbox exactly as closing it does, and takes
 *  the same beat with it. L IS RIGHT on the row that is not for today, which is
 *  why that one is absent here and present above. The key was S until
 *  2026-10-01, when S became the summary everywhere; nothing else here moved. */
export function snoozeRefused(
  run: FirstRun | null,
  id: string,
  waitingAt: number,
): string | null {
  if (!run || run.step === 'landed') return null;
  return id === waitingId(run, waitingAt) ? STOPPED_REFUSAL : null;
}

/* ------------- THE ROWS THE BEAT'S OWN KEY IS RIGHT FOR ------------------- */
/* * WHY THIS EXISTS AT ALL, and it is the other half of the fault found on 2026-08-27.
 `closingRefused` above stops E on the wrong row and says a sentence about it, in a toast,
 at the bottom of the window. That sentence is true and it is well meant and it is a SECOND
 instruction: the card beside the list is still saying press E while the toast says open it
 and answer it.

 The walk already knows the answer to this, one level up. This is the same rule for the
 right key aimed at the wrong ROW: the press does not reach the app, the cap pulses, the
 ring stays where it is, and there is never a second sentence anywhere on the screen.

   IT IS A SET, NOT A ROW, and that matters. The clearing beat has two rows E is
   right for and the ring can only be round one of them at a time. Swallowing E
   on the second finished row because the ring is on the first would be the walk
   refusing a move that is correct, which is a worse fault than the one being
   fixed. So the ring points at the first and the key is live on both.
*/

/**
 * THE ROWS THIS BEAT'S KEY MAY ACT ON, in the order they are drawn. Empty
 *  means the beat is not about a particular row and nothing is guarded. The
 *  ring goes round the first of them. */
export function beatRows(
  step: Step,
  run: FirstRun | null,
  rows: { id: string }[],
  waitingAt: number,
  laterAt: number,
  /**
   * The two beats that are half in the list and half in something drawn over
   *  it. Once the picker or the reading pane is up, the press is about THAT and
   *  no row is being pointed at any more. */
  ctx: { opened?: boolean; picking?: boolean } = {},
): string[] {
  if (!run) return [];
  const there = new Set(rows.map((r) => r.id));
  const one = (id: string | null) => (id && there.has(id) ? [id] : []);
  if (step === 'clear') return clearIds(rows, run, waitingAt, laterAt);
  if (step === 'snooze') return ctx.picking ? [] : one(laterId(run, laterAt));
  if (step === 'unblock') return ctx.opened ? [] : one(waitingId(run, waitingAt));
  return [];
}

/**
 * Whether a press of the beat's own key is aimed somewhere the beat is not
 *  about. Pure, so the rule is a value the tests pin rather than a branch in a
 *  listener. Nothing is guarded when the beat names no rows, and nothing is
 *  guarded when there is no row under the keys at all. */
export function pressAtWrongRow(beat: string[], pointed: string | null | undefined): boolean {
  if (!beat.length || !pointed) return false;
  return !beat.includes(pointed);
}

// ---------------------------------------------------------------------------
// BEAT EIGHT: THREE TASKS, AND CLEARING THEM IS THE GOAL.
//
// STAGED WAS CHOSEN, as recommended on the round four page. The alternative was really running
// three of the agents just imported, which spends somebody's tokens in their
// first minute and does nothing at all on a Mac that had no agent files on it.
//
// THEY SAY ON THEIR FACE THAT THEY ARE EXAMPLES. Every one of the three opens
// its result with the word, because a person who clears three tasks in an
// onboarding and later finds them in their closed list should never wonder
// whether they were real.
//
// THE THREE SHAPES ARE FROM ROUND ONE: a question, a finished piece of work,
// and a decision an agent made without her. Between them they are the whole of
// what an inbox holds.

// The three rows themselves are written by the main process and their copy
// lives in shared/first-run-examples.mjs, so there is one place they are said.

/**
 * WHETHER BEAT EIGHT IS OVER. It is over when none of the three is left in the
 *  inbox, and both ways of ending a task get there: closing one takes it out,
 *  and replying to one puts her word on it, which is the same thing to a list
 *  that only holds rows waiting on her. */
export function inboxCleared(rows: { id: string }[], run: FirstRun | null): boolean {
  if (!run || !run.examples.length) return false;
  const there = new Set(rows.map((r) => r.id));
  return !run.examples.some((id) => there.has(id));
}

/*
 * THE EMPTY INBOX IS NOT A BEAT OF ITS OWN ANY MORE. It used to be held for
   four seconds behind a card reading "This is inbox zero. Get back here every
   day.", which was removed on 2026-08-23 because it reads like the
   end of the walk with ⌘K and the finish card still to come. Clearing the
   three goes straight on to ⌘K, and `ZERO_HOLD_MS` is gone with the beat. */

// ---------------------------------------------------------------------------
// THE WORDS. Every one of these was either picked from a drawing or written
// into an approved one. Nothing here is improvised.

export const COPY = {
  // The product is an inbox for managing dozens of agents at a time, and it
  // is not Claude Code specific: it works with Codex too.
  // REWRITTEN FOR THE WHOLE TEAM (2026-10-01). A persona test of an executive
  // assistant found "coding agents" and "Claude Code and Codex" written for
  // programmers, and the team version is for designers, assistants and PMs too. The product is threads: you write one, an agent does
  // the work on your Mac, and it comes back when it needs you.
  head: 'Hand work to agents and get it back in one inbox.',
  headSub: 'Write a thread, an agent works on it, and it comes back when it needs you.',
  terms: 'Get started means you agree to the terms and the privacy policy.',
  getStarted: 'Get started',
  page: 'Set up your first project.',
  folderQ: 'Where is your code?',
  folderPick: 'Choose a folder on this Mac',
  // THE SENTENCE MOVED OUT OF THE CARD. It is a quiet line under the card.
  folderClause: 'This is the folder the agents will run in.',
  folderAgain: 'Choose a different one',
  // THE FOLDER SCREEN, REBUILT (w-ec62ab6b38). A heading that asks the real
  // question, one short line under it, then the folders to click.
  //
  // AND IT NO LONGER ASSUMES A CODE FOLDER (2026-10-01). An assistant has no
  // project folder and the screen had no way past it. `folderNone` is that way
  // past: the project is made with no folder, and its agents work in a folder
  // the app keeps for it (`productFolder` in main/supervisor.mjs falls back to
  // the project's own directory in the store).
  folderHead: 'Pick a folder for your first project.',
  folderLede: 'Agents can read and change the files in it. Any folder of documents works.',
  folderRecent: 'Folders you used recently',
  folderNone: 'I do not have one, skip for now',
  folderOther: 'Choose another folder',
  folderFirst: 'Choose a folder',
  nameIn: 'Agents will work in',
  // THE NAME SCREEN WHEN THERE IS NO FOLDER. Says where the work goes instead,
  // and the link beside it goes back to choosing one.
  nameInNone: 'Agents will work in a new folder made for this project.',
  nameChoose: 'Choose a folder',
  // The name a project with no folder starts with. Hers to change.
  noFolderName: 'My work',
  nameChange: 'Change',
  nameGo: 'Continue',
  // CLAUDE CODE MISSING IS THE LINE ONLY. One quiet line here and
  // no screen of its own anywhere: the walk never stops and never gains a step.
  missing: `${Name} could not find Claude Code or Codex on this Mac, and your agents run on one of them.`,
  missingLink: 'Get Claude Code',
  nameQ: 'What is this project called?',
  // The clause is kept here and drawn nowhere, because deleting the words is
  // how a later session finds out they were once on the screen.
  nameClause: 'Taken from the folder. Change it to anything you like.',
  next: 'Next',
  // WHEN THE PROJECT CANNOT BE MADE, THE CARD SAYS SO. See `whyNotMade` below
  // for what happened without this and why it is on the card rather than in a
  // toast. The second half of each of these is the way out, because a sentence
  // that only names the problem leaves her exactly as stuck as silence did.
  takenName: (name: string) => `You already have a project called ${name}. Give this one another name.`,
  emptyName: 'A project needs a name with letters or numbers in it.',
  notMade: (why: string) => `${Name} could not make the project. ${why}`,
  // THE CORNER OF A SETUP CARD IS A BUTTON, NOT A PICTURE OF A KEY.
  //
  // Round four left a bare ↵ in that corner when the Command-Enter button came
  // off. Enter really did work, so it was not a dead key by the rule in
  // `tests/the-walk-promises-no-dead-keys.test.mjs`, but it was drawn in a
  // bordered box the size and shape of a button and it did nothing when it was
  // clicked, which is the same broken promise read the other way round. Submit
  // is the chosen word, so it is the one on the screen, and it says the same
  // thing on both setup cards because there is only one thing to learn.
  submit: 'Submit',
  // A tester chose a folder and could not get back. One plain word, quiet, under
  // the card rather than on it, because the card is the question and this is
  // not part of the question. It says the same thing on both setup screens for
  // the same reason `submit` does: there is only one thing to learn.
  back: 'Back',

  /* ---------------------------- PICKING THE LOOK ------------------------- */
  /* THE TILES ARE THE ONES SETTINGS ALREADY DRAWS, not a set made for this
     screen. Each one wears the same three layers in the same order as the
     window does, so a tile cannot drift from the theme it stands for, and
     picking one repaints the window under the hand rather than promising
     something for later.

     AND THE LINE SAYS WHERE IT LIVES AFTERWARDS, which is the half about the
     command bar: the rows are already there
     (`lookRows` in palette-rows.ts, found by the word theme or by the
     picture's own name), and nothing in the app had ever said so.
  */
  lookQ: `Pick how ${NAME} looks.`,
  /* 
  */
  lookMore: 'Randomize my theme',
  /* * THE SETTINGS SENTENCE THAT WAS CUT IS NOT BACK.

     AND IT NOW SAYS WHAT TO TYPE, w-042c27ffcb, 2026-08-31.

     THE ROW WAS ALWAYS THERE AND THAT IS THE POINT. Measured on the packaged
     build under test: pressing ⌘K opens a list of THIRTY-FIVE rows, NINE
     of them on the screen at once, and "Themes…" is the TWENTY-SECOND. Nothing
     in those nine says theme, look, dark or light. So the old sentence sent her
     to a bar and left her to scan thirteen rows past the fold for a word it
     never gave her. Typing "theme" finds it at every beat of the walk, which is
     why naming the word is the whole fix and no row was moved: the eight rows
     above the fold are Reply, Close, Snooze and the rest of what she does all
     day, and demoting those to surface a setting would be the worse trade.

     "type theme" IS NOT JARGON AND IT IS NOT A METAPHOR. It is the literal
     word, and the ⌘K row it lands on is called Themes.
  */
  lookClause: 'Press ⌘K and type theme to change it later.',
  lookGo: 'Next',

  /* --------------------------- THE INTRODUCTION -------------------------- */
  /* A tester asked for the same thing: to meet the lesson before the app
     opens at all.

     EACH SLAB SHOWS THE PART OF THE PRODUCT IT IS TALKING ABOUT, AT FULL SIZE.

     THE REASON IT CAME OFF WAS A MISREADING, and it is written down here so nobody takes it
     off again. It was never about these pieces. The piece beside a slab is drawn at the
     size the app draws it, in the app's own stylesheet, and it runs off the right edge of
     the window rather than being scaled down to fit. Nothing here is a picture and nothing
     here is smaller than the real thing.
  */
  /* * THESE THREE ARE THE BIGGEST TYPE IN THE WALK AND THE ROUND THAT REWROTE THE
     SMALL PRINT LEFT THEM ALONE (w-45e9cd9573, 2026-08-28, second pass).

     The round before this one read that as being about the grey coach lines and
     fixed those. It is, but the flagged phrase was ALSO the headline of slab
     two, set in the largest type this product ever uses, and slabs one and three
     had the same fault: "finishes into one list" and "Agentbox is finished when
     the list is empty" are sentences nobody says out loud. Every head now names
     the agent rather than saying "it", and every line is one sentence joined
     with "so" or "and" rather than two short ones side by side, which is the
     standing rule on the positioning copy.

     LENGTH WAS NOT ALLOWED TO PAY FOR CLARITY: 97 words across the three slabs
     before, 98 after, measured by scripts/count-the-walks-words.mjs. There was
     already too much text, so a line made clearer by being made longer would
     have traded one fault for the other.
     The three previous versions are in decisions.md, verbatim.
  */
  intro: [
    // THREE POINTS, ONE SLIDE EACH (w-ec62ab6b38). The old copy was too long
    // and too vague for developers. The three points: every agent, from Claude
    // Code, Codex or anything else, ends up in one organized inbox; you only
    // see an agent when it needs you; and that lets one person manage many more
    // agents at once. Inbox zero is taught in the tutorial instead; the old
    // third slide and the one-sentence slide are in decisions.md, 09-28.
    // ONE IDEA PER SENTENCE, NO COMMAS OR FULL STOPS. A slogan that is not
    // really a sentence reads as marketing fluff, so each line is one idea,
    // ideally with no commas or periods in it.
    {
      head: 'Write a thread and an agent picks it up',
      line: 'It works on your Mac and writes back here when it finishes or gets stuck',
      piece: 'list' as const,
    },
    {
      head: 'A thread comes back to you only when it needs you',
      line: 'The rest keep running until they finish or have a question',
      piece: 'progress' as const,
    },
    {
      head: 'An empty inbox means nothing is waiting on you',
      line: 'Your agents keep working in the background while you get on with your day',
      piece: 'empty' as const,
    },
  ],
  /*
   * THE WORDS INSIDE THE THIRD PIECE. It is the only one of the three that
     cannot be built out of rows that already exist, because what it shows is an
     inbox with nothing in it and three agents running under the rail. That
     picture IS the goal, which is the half the walk otherwise never teaches:
     the whole lesson is to get to inbox zero. */
  pieceEmpty: 'Nothing is waiting on you.',
  pieceAgents: 'Active agents',
  /* * AND THERE IS NO COUNTER ON THESE SCREENS ANY MORE (2026-10-01).

     IT SAID "3 OF 3" AND THEN THE WALK CARRIED ON FOR TWELVE MORE SCREENS. A PM
     and an office manager both walked it on 2026-10-01: the third slab reads 3
     of 3, and the next thing after it is the theme picker, and the thing after
     that is a card headed "This is the tutorial." A counter that ends before the
     steps do is worse than no counter, because it is the one thing on the screen
     somebody trusts to tell them how much is left.

     IT WAS `${n} of ${COPY.intro.length}`, so it was honest about what it was
     counting, which was the three introduction slabs. Nobody reading it knows
     that: on the screen it is a number over a heading, and what it looks like
     it is counting is the walk.

     SO IT IS GONE RATHER THAN RE-COUNTED, and the choice was between those two.
     Re-counting means every screen the walk shows, which is eighteen beats, and
     the walk's own numbering (`BEAT`) deliberately draws nothing: a walk that
     opens by saying it is eighteen long is a walk nobody starts. Any counter
     drawn on a prefix of it ends before the steps do, which is the fault itself.
     Three screens with a Next button on each do not need a tally anyway.

     `introNext` stays: the button is how anybody gets off the screen. */
  introNext: 'Next',

  /* * THE MOUSE RULE IS DELETED, AND IT IS NOT COMING BACK AS A LINE SOMEWHERE ELSE.

     It was cut once it was seen built. THE KEYBOARD ITSELF IS NOT CUT: every beat still names
     its key, the cap still breathes when nobody presses it, and a wrong press still
     answers. The walk simply stops telling anyone to put their hand somewhere. `ruleHead`,
     `ruleLine` and `ruleGo` are in decisions.md, 08-24, verbatim.
     `tests/the-practice-project-is-the-whole-app.test.mjs` fails if any of the three comes
     back, and it greps the whole of COPY for the word rather than only the three keys, so
     it also catches the rule reappearing as a line somewhere quieter.
  */

  /* * THE HAND-OFF INTO THE PRACTICE PROJECT.

     AND IT DOES NOT SAY THEIR PROJECT'S NAME ANY MORE. It used to open `${name} is made and
     it is waiting behind this`, where `name` is the project they made one screen earlier,
     taken off the folder they chose. On one shot, the folder was a worktree and
     the name came out `Wt 77df`, so the screen headed "This is a practice project" went on
     to name something called Wt 77df.

     A name is not what the screen is for. What it has to say is that nothing in
     here is theirs and their own project is untouched, and it says both without
     naming anything.

     AND IT IS SPELT THE WAY THE PROJECT IS. Measured 2026-08-27: this was the ONLY British
     spelling anywhere in the app's user-visible copy. Every other one in the tree (colour,
     behaviour, recognise, centre) is in a comment or a variable name, which nobody using
     Agentbox reads. So the fix is the button and nothing else.

     AND THE THING IS CALLED THE TUTORIAL NOW (w-9a6ea066d6, 2026-08-28).
  */
  handHead: 'This is the tutorial.',
  handLine: 'A practice project with a few example threads, and nothing you do in here is saved. Your own project is made already and it is waiting behind this.',
  handGo: 'Start the tutorial',

  /* * THE QUIET WAY OUT, AND THE LINE THAT ASKS THEM TO STAY.

     SO IT IS FINDABLE AND IT IS NOT AN OFFER. One dim word at the foot of the
     window, the same corner on every screen of the walk, no key on it and
     nothing pointing at it. Somebody looking for a way out finds it in the
     place they would look; somebody following the card never has a reason to
     read down there.

     AND THE LINE IS NOT A WARNING. It says what the walk is good for and that
     it can be had again, which is the friendly half of the brief.
     There is no number in it, because nobody has timed the walk.
  */
  leave: 'Skip',
  leaveHead: 'Stay for the tutorial?',
  leaveLine: `It is the quickest way to learn how threads work in ${NAME}. You can leave now and start it again whenever you like from ⌘K.`,
  leaveStay: 'Keep going',
  leaveGo: 'Skip it',

  /* ------------- THE TUTORIAL, OFFERING ITSELF ON A NEW PROJECT ----------- */
  /* A NEW PROJECT IS THE MOMENT, and it is the moment for a plain reason: it is
     the only point in this app where somebody has just said they are about to
     start work in a place they have never worked before. Everything else is
     either too early (a person who has not made anything has nothing to be
     shown around) or a guess.

     IT IS THIS CARD AND NOT A SCREEN. The setup screens are corner-to-corner
     and they are for a Mac that has never had Agentbox on it; drawing one over
     somebody's running inbox because they made a project would be the app
     taking the window off them. This is the shape the walk's own way-out card
     already has (`.fr-stay` in styles.css): 360 points, two lines, two words on
     two buttons, no colour and no alarm anywhere on it. Same register, because
     it is the same question asked from the other side.

     AND IT IS ASKED ONCE, EVER. That is the general rule, and it is why there
     is no counter here and no "ask me later": anything that reads as nagging is
     out, and an offer that comes back on the fifth project is the
     definition of it. The bit is written the moment it is ANSWERED, either way,
     and a walk that reached the end writes it too — somebody who has just been
     shown around does not need offering. See renderer/src/tutorial.ts.

     It names the key AND the word to type, because being told to hit Command+K and nothing
     else is exactly what did not work with a tester, who also had to be told out loud what
     to type.
  */
  offerHead: 'Take the tutorial first?',
  /* * TWO SENTENCES: what it is, and what it costs. NO NUMBER OF MINUTES IS CLAIMED
     anywhere here, for the same reason `leaveLine` claims none: nobody has timed the walk.
  */
  offerLine: 'A practice project with a few example threads, so you can see how it all works. Nothing in it is yours and nothing in it is kept.',
  /*
   * THE SAME WORD THE HAND-OFF CARD USES, because pressing it opens that card.
     A button promising one thing and delivering a screen headed another is the
     small lie that makes somebody stop trusting the buttons. */
  offerGo: 'Start the tutorial',
  offerNot: 'Not now',
  /*
   * AND THE WORD IS THE ONE THE ROW ANSWERS TO. It was "type practise", which
     was our word for it and the British spelling of it as well; the word
     people use is tutorial (w-9a6ea066d6) and the row in ⌘K now reads Take the
     tutorial. Typing either still finds it, because practice stays in the row's
     keywords, but the sentence teaches the word people use. */
  offerLater: 'Any time: press ⌘K and type tutorial.',

  /* * THE BAND. It is on screen for every second the practice project is, which
     is the whole of the thing a tester got wrong: a practice task on a real
     screen read as real work, and they tried to answer it.

     IT SAYS PRACTICE ONCE.

     AND THE TAG SAYS TUTORIAL, NOT THE PROJECT'S NAME (w-9a6ea066d6, 2026-08-28). It read
     `Practice`, which is the pretend project's name and is also on the row in the rail two
     inches below it, so the band spent its one word repeating something already on the
     screen. a tester forgot she was in practice mode with that band up.
  */
  bandTag: 'Tutorial',
  band: 'Nothing in here is yours and nothing is saved.',
  bandLine: 'nothing in here is real',
  // So this is one line over the list rather than a headline over a screen, and
  // the headline it used to be is deleted (`agentsHead`, `agentsHeadNone` and
  // `agentsNone` are in decisions.md, 08-23, verbatim).
  //
  // The line says what is true and no more. Agentbox does not copy an agent
  // file, does not move one, and does not make one work that was not working:
  // Claude Code loads the home folder set in every session it starts by
  // itself. What is new is that Agentbox knows they are there and remembers
  // which ones this project is for.
  //
  // Every name on that list was read off her own Mac by main/agent-files.mjs
  // and nothing on the card said so, so the only honest reading of four
  // unfamiliar names on a setup screen is that they are samples. The line names
  // where they came from, and the folder each side was read out of is printed
  // under the switch (`agentsFrom` below).
  /* * THE LAST CARD IS THE AGENTS CARD NOW, AND ITS HEADLINE IS THE THING TO DO.

     It read as a success page, because that is what it was. A success page is a page
     you press past.

     So the celebration is not on this card any more. On a Mac with no agent files there is
     no card at all and the walk goes straight into her own project, which is the same rule
     as 08-23, that a Mac with no agent files is offered nothing, read one step further along.
  */
  /* * AND THE HEADLINE SAYS WHAT THE CARD DOES. What the press actually does is give the
     agent files already on this Mac an inbox in Agentbox, so that is what the two lines say
     now, and the folder-to-folder metaphor is gone.
  */
  bringHead: 'Add the agents already on this Mac.',
  agentsOffer: `${Name} watches them and puts what they send you in your inbox.`,
  // ONE LINE, AND IT IS AT THE BOTTOM.So agentsRead, at the foot, is the only
  // sentence under the list. The deleted copy is in decisions.md, 08-21,
  // verbatim. WHERE A SIDE'S AGENTS CAME FROM, drawn under the switch as the
  // real folder path with the home folder shortened. It is the shortest thing
  // that cannot be read as a placeholder: a path is either on this Mac or it
  // is not.
  agentsFrom: (dir: string) => `Read from ${dir}`,
  agentsAll: 'Every project',
  agentsHere: 'Only this project',
  // The two empty sides of the switch. Each says what that side would hold, so
  // an empty list still teaches what the choice above it means.
  agentsNoneAll: 'No agents in your home folder yet. Anything you put there works in every project.',
  agentsNoneHere: 'No agents in this project folder yet. Anything you put there works here only.',
  /*
   * AND THE "NOTHING TO BRING OVER" LINE IS NOT HERE, though it was written for
     this row on 2026-08-24 and approved on 08-27.

     It was a sentence for the last card to say when the read came back empty,
     because a promised feature that draws nothing cannot be told apart from one
     that is broken, which is how a tester read it. Between its approval and
     this merge, w-7fd38422b5 made that card the ⌘K import card, and its rule
     is NO AGENTS, NO CARD, NO PRESS: a Mac with nothing to offer is
     walked straight into the inbox with the confetti falling. So there is no
     longer a card for the line to sit on, and a copy string no screen can reach
     is worse than none. The wording is kept verbatim in decisions.md, 08-27, in
     case the straight-in is ever reconsidered. */
  // AND WHERE THEY GO, which is the half this line did not have. Until this row
  // the press wrote the ticked names into a settings file nothing in the app
  // ever read, so the only true thing the card could say about the offer was
  // that nothing moved. Now they do, so the line says so first and keeps the
  // "never moves one" clause behind it. Still one line, still at the foot: the
  // rule against too much text over this list has not changed.
  agentsRead: `Each one you keep lands in your inbox. ${Name} never moves the file.`,
  // THE END OF THE WALK SAYS SO.Before this the walk simply stopped: ⌘K opened
  // the palette, the card vanished mid-keystroke, and nothing anywhere said it
  // was over. The headline says so plainly.
  //
  // AND IT HAPPENS IN HER OWN PROJECT NOW, NOT ON A CARD BEFORE IT.So these two
  // lines and the burst are the LANDING (`Landed` in
  // components/Onboarding.tsx): they fall over her own inbox, over the app she
  // is about to work in, and nothing has to be pressed to get past them. The
  // card they used to sit on is the agents card above.
  // AND IT SAYS THE TUTORIAL IS OVER (2026-10-01). The persona test ended on a
  // blank inbox with nothing saying she was done. The head says so in words.
  finishHead: 'You finished the tutorial.',
  // WHAT SHE LEARNED, IN ONE LINE, AND NOTHING ELSE. The beats are not listed
  // back at her: a summary of the last two minutes is reading, and the point of
  // this card is that there is nothing left to read. AND "THAT IS THE WHOLE
  // JOB" IS CUT. The question form of it was cut on 08-21, and the statement
  // form survived here and in `finishLineAgents` below. The first sentence is
  // the whole of what the card has to say, so the second one goes and the word
  // goal replaces it on the card that cannot claim an empty inbox.
  finishLine: 'Your inbox is empty and no agent is waiting on you.',
  // THE SAME LESSON ON THE CARD THAT IS ABOUT TO FILL THE INBOX. The line
  // above stays on every card that leaves the inbox empty. Same lesson, minus
  // the sentence that stops being true.
  finishLineAgents: 'Getting your inbox back to empty is the goal.',
  // WHAT TO TRY NEXT, which is the other half of an ending. Two lines, and the
  // second is the only place the walk names the Team page and messaging a
  // person, which are half the product and were never mentioned.
  finishNext: [
    'Next, start a real thread. Press N or click New thread.',
    'Open Team to see what your teammates are working on. To message one, start a thread and pick them in To.',
  ] as readonly string[],
  finishGo: 'Open my inbox',
  // --------------------------------------------------------------------- AND
  // WHEN CLAUDE CODE REALLY IS MISSING, THE CARD IS NOT A CELEBRATION.
  //
  // So the footnote under the button is gone. On the rare Mac that gets here,
  // the card is about the one thing standing in the way and nothing else: the
  // headline names it, `missing` above says what was looked for, and the two
  // buttons are the way through. `finishGo` is not drawn at all, because a
  // button that opens an inbox nobody can work in is a broken promise.
  gateHead: `${Name} needs Claude Code or Codex.`,
  gateDo: `Install either one, then check again. Your inbox opens as soon as ${NAME} can see it.`,
  gateCheck: 'Check again',
  gateChecking: 'Looking',
  // AFTER A CHECK THAT FOUND NOTHING. It is a different sentence from the one
  // above it, because repeating the first sentence at somebody who has just
  // pressed a button reads as a screen that did not notice the press.
  gateStill: 'Still nothing here. A fresh install can take a moment to appear.',
} as const;

/* ------------------------- WHAT THE LAST CARD IS -------------------------- */
/*
 * ONE PLACE SAYS WHETHER THE WALK MAY END, and it is this function rather than
   a condition inside a component, so the rule can be tested without a window.

   THE GATE ONLY EVER CLOSES ON A CERTAIN ANSWER, and that is the safety of it.
   `missing` is true only after `main/claude-bin.mjs` has looked in fifteen
   places, read the version manager folders, asked up to three shells and had
   every one of them exit properly, and found no trace of Claude Code anywhere
   on the Mac — `installEvidence` vetoes certainty on so much as a
   `~/.claude.json` or a dangling symlink. A search that merely failed leaves
   `missing` false and this card is the approved ending, untouched.
   Anything less than certainty must never lock somebody out of their own app. */

export interface FinishCard {
  /**
   * Whether a card is drawn at all. False in ONE state now: her Mac has not
   *  finished being read. */
  show: boolean;
  /** Whether Claude Code is standing in the way. */
  blocked: boolean;
  /** Whether the way into the inbox is drawn at all. */
  go: boolean;
  head: string;
  line: string;
}

/**
 * THE LAST CARD, AND WHETHER THERE IS ONE.
 *
 *  Claude Code missing is the gate and it wins over
 *  everything: no way in, no offer, no celebration.
 *
 *  Her Mac still being read is neither drawn nor ended. The read starts a beat
 *  early (on ⌘K) so this state is usually over before anyone gets here, but a
 *  slow disk must not tip somebody into the inbox before the offer has had a
 *  chance to exist.
 *
 * AND EVERY OTHER MAC GETS THE CARD, INCLUDING THE ONE WITH NO AGENTS ON IT.
 * This reverses 08-24, and `straightIn` is deleted with the rule it carried.
 *
 * The old rule — an offer with nothing behind it contradicts itself — is still
 * true of an OFFER. What was wrong was the conclusion drawn from it: the SCREEN
 * was deleted instead of the contradiction. MEASURED 2026-08-28, driving the
 * real walk on a Mac with no agent files (scripts/shot-the-import-screen.mjs):
 * no card of any kind and straight into the inbox, so the one person who most
 * needs telling that Agentbox brings Claude Code agents across — the person who
 * has none yet — is the one person never told. a tester was on that Mac.
 *
 *  So the card appears and ANSWERS rather than offering: the headline says there
 *  is nothing to bring across yet, the line under it says where Agentbox looked,
 *  one sentence says how to come back to it, and Look again re-reads the Mac for
 *  somebody who installs Claude Code with the walk still open. The words are
 *  `CARD.headNone`, `CARD.noneWhere`, `CARD.noneLater` and `CARD.lookAgain` in
 *  ../agent-import-card.ts, because this is the card ⌘K opens and there is one
 *  of them. */
export function finishCard(
  claude: { missing: boolean },
  agents: { read: boolean; some: boolean },
): FinishCard {
  if (claude.missing) {
    return { show: true, blocked: true, go: false, head: COPY.gateHead, line: COPY.missing };
  }
  if (!agents.read) {
    return { show: false, blocked: false, go: false, head: '', line: '' };
  }
  return { show: true, blocked: false, go: true, head: COPY.bringHead, line: COPY.agentsOffer };
}

/**
 * WHETHER THE WALK MAY END. The one question `finishRun` asks before it writes
 *  the walk off as done, so a press that arrives from anywhere — the button,
 *  the return key, a keystroke that reached the window some other way — is
 *  answered the same way. */
export function mayOpenInbox(claude: { missing: boolean }): boolean {
  return !claude.missing;
}

/**
 * WHETHER THIS MAC HAS NO CODING AGENT AT ALL, which is the only thing the
 *  last card shuts the inbox for. Claude Code or Codex is enough, so it takes a
 *  certain "not here" about BOTH. An unsure search about either one keeps the
 *  door open, for the reason `certain` exists everywhere else in this file. */
export function noCodingAgent(claude: { found: boolean; certain: boolean }, codex: { found: boolean; certain: boolean }): boolean {
  return claude.certain && !claude.found && codex.certain && !codex.found;
}

/* ------------------------------ THE CARD ---------------------------------- */
/* * TWO LINES, AND THE SECOND ONE IS THE INSTRUCTION. The quiet line says where you are and
 the loud line says the one key, with the key drawn as a key.

 AND NO STEP COUNT IS SAID ANYWHERE ANY MORE. So the walk no longer tells anybody how long
 it is.
*/

export interface Coach {
  /** The small faint line: where you are. */
  quiet: string;
  /** The bold line, split round its key so the key can be drawn as one. */
  lead: string;
  key: string | null;
  tail: string;
  /**
   * HOW MANY PRESSES THIS BEAT WANTS, when it wants more than one.
   *
   * ONE BEAT HAS IT AND THAT IS THE POINT OF IT. Beat thirteen is the one
   * nobody took in: three rows, three presses of E, and one small grey
   * sentence in the empty half of the pane. Three lights going out one at a
   * time give it something to watch and something to finish. Every other beat
   * is one press and one cap, which is the whole card already, and a row of one
   * light would be a progress bar with one step. */
  caps?: number;
  /* * AND THERE IS NO `why` ANY MORE, WHICH IS THE TWO-LINE BUDGET (w-9a6ea066d6,
     2026-08-28). Four beats carried a third sentence under a hairline rule saying why the
     beat mattered.

     SO THE BUDGET IS A TYPE, NOT A HABIT. A `Coach` has a quiet line and a
     loud line and there is nowhere to put a third, so a later session that
     wants to say one more thing has to shorten one of the two rather than add
     to the pile. The four sentences are not deleted: each is folded into the
     quiet line of its own beat below, and each fold is written up where it
     happened. The old strings are in decisions.md, 2026-08-28, verbatim.
  */
}

const say = (
  quiet: string, lead: string, key: string | null = null, tail = '',
  extra: { caps?: number } = {},
): Coach => ({ quiet, lead, key, tail, ...extra });

/**
 * THE ROTATION TO ASSUME WHEN NOBODY SAYS. The app always hands its own
 *  `tabOrder` in, and this is what is left for a caller that does not: the
 *  three tabs that are on the screen whatever else is true. Scheduled is
 *  deliberately not in it, because Scheduled is the one that comes and goes. */
export const TAB_TOUR_FLOOR: readonly string[] = ['inbox', 'progress', 'done'];

/**
 * WHICH TAB THE NEXT PRESS OF ⇥ OPENS, read off the strip the app is drawing.
 *
 * ONE COPY OF THIS, USED BY BOTH THE RING AND THE WORDS. It lived in
 * components/Onboarding.tsx and was used only for the ring; the card's
 * sentences named the next tab from a fixed list written out by hand. So the
 * ring and the sentence beside it were two answers to one question, kept in
 * step by nothing.
 *
 *  A VIEW THAT IS NOT IN THE ORDER GOES TO THE FRONT OF IT, and that is not a
 *  guess: it is what App.tsx's own rotation does with `order.indexOf(v)` coming
 *  back -1. It really happens. Scheduled is DRAWN while a repeat rule exists
 *  and is in the ROTATION only while something is actually snoozed, so somebody
 *  standing on Scheduled when the last snoozed row comes back is standing on a
 *  tab the rotation has never heard of, and the next press takes them to the
 *  Inbox. The card has to say so rather than promise the tab after Scheduled. */
export function nextTab(tabs: readonly string[] | undefined, view: string | undefined): string {
  const order = tabs?.length ? tabs : TAB_TOUR_FLOOR;
  return order[(order.indexOf(view ?? 'inbox') + 1) % order.length];
}

/**
 * WHAT EACH TAB IS CALLED WHEN IT IS THE PLACE YOU ARE BEING SENT, in the
 *  words of the thing that is in it rather than the label on it. Every one of
 *  these is the sentence that was already on the card for that hop; nothing is
 *  reworded, they are picked by destination now instead of by position. "Once
 *  more" belongs to the Inbox alone, because coming back is the only hop that
 *  ends the tour, and which hop that is depends on the strip.
 *
 *  NO "AGAIN" ANY MORE (w-ec62ab6b38). It was one key, Tab, pressed again and
 *  again. Each hop is its own key now, ⌘2 then ⌘3 then ⌘4, so "Press ⌘3 again"
 *  named a key she had not pressed yet. Coming back is ⌘1, also new, so it
 *  loses "once more" too. */
/**
 * THE TEAM LAYOUT'S STATE TABS, in the order threads/Pages.tsx draws them
 *  (`INBOX_TABS` there; a test holds the two lists together). Those buttons
 *  carry no `data-tab`, so the tab tour finds one by its place in the strip.
 *  Without this the tour rang the sidebar, which in that layout holds only
 *  Inbox and Team (2026-10-01). */
export const TEAM_TABS: readonly string[] = ['inbox', 'progress', 'snoozed', 'done', 'all'];

/** And the words on those tabs, the same ones Pages.tsx draws. */
export const TEAM_TAB_NAMES: Readonly<Record<string, string>> = {
  inbox: 'Needs you', progress: 'In progress', snoozed: 'Scheduled', done: DONE.short, all: 'All',
};

export function teamTab(view: string | null | undefined): string | null {
  const at = view ? TEAM_TABS.indexOf(view) : -1;
  return at >= 0 ? `.th-bar .tm-tab:nth-child(${at + 1})` : null;
}

const TAB_TOUR_SENDS_YOU: Record<string, string> = {
  inbox: ' to come back.',
  snoozed: ' for the one you put off.',
  progress: ' for the agent you answered.',
  done: ' for everything you closed.',
};

/* * * THE WORDS OF THE WALK. Every one of these is off the approved round four drawing,
 and none of them is improvised here.
*/
export function coach(
  step: Step,
  sinceSent: number,
  /**
   * WHAT BEAT FOURTEEN NEEDS TO KNOW: whether the stopped row is open in the
   *  reading pane yet. It is one beat with two sentences rather than two beats,
   *  because opening a row and answering it is one move.
   *
   *  AND WHAT BEAT FIFTEEN NEEDS: which tab is up. That beat is a walk across
   *  the three tabs and each one has a different thing to say, so the card is a
   *  function of where somebody currently is rather than of how many times they
   *  have pressed. Pressing Tab twice quickly cannot get the card out of step
   *  with the screen that way. */
  //  AND WHAT BEAT FOURTEEN NEEDS: whether the snooze picker is open over the
  //  row yet, which is the same two-halves shape as beat fifteen.
  //  AND WHAT THE CLEARING BEAT NEEDS: how many finished rows are still in the
  //  inbox, so the second card can say "too" rather than repeating the first
  //  word for word. Counted off the drawn list by `beatRows`, never off a tally
  //  of key presses, for the reason `Lights` gives.
  //  AND WHAT THE LAST BEAT NEEDS: whether the palette is open yet. Same two
  //  halves as the snooze and unblock beats above, and it is here for the same
  //  reason: a thing that opens over the app with nothing said about it is a
  //  screen somebody has to work out on their own.
  //  AND WHAT BEAT FIFTEEN ALSO NEEDS: the tabs the app is drawing, in the
  //  order it rotates them. `view` alone says where somebody is standing and
  //  says nothing about where the next press lands, which is the half of the
  //  sentence that was being guessed. See `nextTab`.
  ctx: {
    opened?: boolean; view?: string; picking?: boolean; left?: number; palette?: boolean;
    tabs?: readonly string[];
    /** The team strip's tab names, when that strip is what is drawn. */
    tabNames?: Readonly<Record<string, string>>;
  } = {},
): Coach | null {
  switch (step) {
    case 'make':
      // "Thread", not task, the word since w-ec62ab6b38 (2026-09-28).
      // AND IT NAMES THE BUTTON AS WELL AS THE KEY (2026-10-01). Somebody who
      // has never used a keyboard shortcut reads "Press N" as a riddle; the
      // button is on the screen with those words on it.
      return say('A thread is a job you hand to an agent.', 'Press ', 'N', ' or click New thread to write your first one.');
    /* * AND THE GREY LINE IS GONE FROM THIS BEAT.
    */
    /* * WHO THE THREAD IS FOR, which is the card's first line and was the
       biggest thing the walk never said (2026-10-01). Her note: "we're missing
       important stuff like: selecting who it's to etc. and sending messages to
       both people and agents."

       THE QUIET LINE CARRIES THE HALF THE SCREEN CANNOT SHOW. On a Mac with no
       teammates the list is one row, Agent, because the People half of it is
       drawn only once there is somebody to draw (threads/ThreadComposer.tsx).
       So the sentence says both, and the list shows whichever is true of the
       Mac it is on. It is not a promise about this screen; it is what the card
       does, and it starts being visible the day somebody joins.

       AND IT OPENS THE LIST RATHER THAN CHANGING ANYTHING. The beat ends when
       the list is open, not when a different recipient is picked: the walk's
       task is for an agent, and a tutorial that quietly re-addressed it would
       then have to explain itself. Looking is the lesson.

       AND IT IS THE ONE BEAT IN THE WALK WITH NO KEY, because the app has no
       key for To: the row is a button and that is the whole of how it opens.
       The loud line is therefore the click alone, with no cap, rather than a
       cap invented to keep the shape of the other cards. */
    case 'who':
      return say('Every thread goes to an agent, or to a person on your team.',
        'Click To at the top of the card to see who it can go to.');
    // AND IT NAMES THE BUTTON TOO (2026-10-01). Same round and same reason as
    // `make` above: the card's own button is the thing the ring is round, and
    // ⌘↵ is the least guessable cap in the walk.
    //
    // THE WORD IS "SEND" AND NOT "START IT" SINCE THE WALK MOVED TO THE REAL
    // CARD (2026-10-01). The one-line card it used to open said Start it; the
    // new thread card is drawn as an email and its button says Send, so the
    // sentence says what is written on the button somebody is looking at.
    case 'task':
      return say('', 'Press ', '⌘↵', ' or click Send.');
    case 'working':
      return sinceSent >= SLOW_AFTER_MS
        ? say('Your agent is running.',
          'Still reading. A bigger project takes longer than this one, and the answer will be here when it comes.')
        : say('Your agent is running.', 'It comes back in a few seconds.');
    /* * THREE "IT"S AND NOT ONE NOUN.
    */
    // AND THE ROW IS THE CLICK (2026-10-01). The ring is round the row itself,
    // so clicking it is already allowed and already opens it; the card simply
    // had not said so.
    case 'open':
      return say('Your agent worked on its own, and this row is what it sent back.',
        'Press ', '↵', ' or click the row to open it.');
    /* * AND THE REQUESTED SENTENCE.

       So the grey line goes, the instruction stays exactly as it was because it is the
       part that works, and the requested sentence is under it. It is true two beats
       later, on `unblock`, where it still stands word for word.
    */
    // AND THE THIRD LINE IS GONE, WHICH IS A MEASUREMENT AND NOT A PREFERENCE.
    // It read "Closing ends the task and replying restarts the agent", and one
    // draft before that "Closing it means the agent is done, and replying sends
    // it back to work", which wraps to two at this card's width. Measured at
    // 1752x986 by driving the walk: that made the card 120 tall, the ring on
    // close this task ends at 772 and the reply box starts at 898, so the card
    // laid its bottom edge 12 points into the box the same sentence is telling
    // her she may type in. The rig prints that number now, as `overDock`, so
    // the next line that grows is caught by the walk rather than by somebody
    // looking at a picture. What the line said is in the quiet line instead: a
    // task ending one of two ways IS closing it or replying to it.
    // AND THE REPLY HALF NAMES THE BOX (2026-10-01). "Reply to it" is a thing
    // to do and not a thing to click, and the ring is round the box, so the
    // card now points at it in words. CLOSING HAS NO BUTTON ON THIS SCREEN and
    // the card does not invent one: Mark done is a row inside the menu beside
    // Summary, which is two clicks behind a three-dot button, and naming it
    // would make this the longest line in the walk. The mouse route on this
    // beat is replying, which is the half somebody is here to learn.
    case 'answer':
      return say('Every thread ends one of two ways.', 'Click the box below to reply, or press ', 'E', ' to close it.');
    // THE THREE ARE EXAMPLES AND THE CARD HAS TO SAY SO.
    //
    // The old line was 'Three of these are waiting on you.' over 'Clear them.
    // Reply, or press E'. Reply came first on a row nobody can usefully reply
    // to, so the card sent her into three canned questions looking for the
    // sense in them. Beat seven already taught that a task ends either way;
    // this beat is about clearing, so it names one verb and one key.
    //
    // AND IT COUNTS THEM OUT LOUD NOW.Three lights sit under the sentence and
    // one goes out per press, so the card has something happening on it rather
    // than one grey line in the empty half of a pane. TWO OF THE THREE ARE
    // FINISHED AND THE THIRD IS NOT, and saying so is the whole of this beat.
    // The old line was 'Close all three with E', which taught the one move this
    // product exists to stop: closing an agent that is stopped waiting on you.
    // See the two halves above `waitingIndex`. AND IT TEACHES UNDO, which is
    // the half of this beat that could not be read.
    //
    // What was on screen was real and it was two faults at once. The toast is
    // fixed in App.tsx (`deferCommit`). This is the other half: the card says
    // what the key is for, in words, on the beat where somebody has just used
    // the key that makes it matter. Four rows are in the list now and E is
    // about to take two of them out; a person who does not know E is reversible
    // has to be careful with it, and careful is the opposite of what this walk
    // is teaching.
    /* * AND IT NAMES ONE ROW AT A TIME. The line above was "Two of these are finished. The
       other two are not." over "Close the two that are finished with E", with the ring
       round whichever row the list drew first, and the two lights under it. Every word of
       it is true and it asks somebody to look at four rows and work out which two it means.

       So it is the same shape as `snooze` and `unblock` below, which have pointed at their
       own row since the day they were written: the ring is on ONE row, the card says what
       that row is, and the key is the one key that row is for.

       THE SECOND CARD SAYS "TOO" and that is not decoration. `left` is the number of
       finished rows still in the inbox, counted off the drawn list.
    */
    /* * THE UNDO IS IN THE QUIET LINE NOW, NOT ON A THIRD ONE ( 2026-08-28). The card was
       'This one is finished.' over 'Press E to close it.' over two lights over 'Nothing you
       close here is lost.

       Z now rides in the first card's quiet line, where it is said ONCE, on the first
       close, which is the only press where knowing it changes what somebody dares to do.
       The second card drops it rather than repeating it: it has the "too" that tells her
       the app noticed her first press, and a sentence she has already read reads as
       the app failing to notice she answered.
    */
    case 'clear':
      return say(
        ctx.left === 1
          ? 'This one is finished too.'
          : 'This one is finished. Z brings back anything you close.',
        // AND THIS BEAT NAMES NO CLICK, WHICH IS THE ONE PLACE THE ROUND OF
        // 2026-10-01 COULD NOT GO. Every other beat now says what to click as
        // well as what to press, because every other beat rings something the
        // app really answers a click on. This one ringed a row, and a row
        // answers a click by OPENING, not by closing.
        //
        // IT SAID "or click Done on the row" FOR AN HOUR AND THAT WAS WORSE
        // THAN SAYING NOTHING. The chip at the row's right end was made a
        // button to make the sentence true, and the founder caught it the same
        // day: "you can't actually click Done in the app... I think it's sort
        // of misleading users because you can't actually do that in the real
        // app." She is right, and the reason is that the chip is drawn ONLY
        // while the walk is on (`walk &&` in components/List.tsx). The tutorial
        // would have taught a control that exists nowhere else: somebody learns
        // to close by clicking, finishes the walk, and the button is gone.
        //
        // THE REAL GAP IS IN THE APP AND NOT IN THIS SENTENCE. From the list
        // there is no way to close a thread with the mouse at all: the hover
        // plate is `pointer-events: none` on purpose (components/HintPlate.tsx)
        // and Mark done is a row in the three-dot menu inside an opened thread
        // (threads/ThreadMenu.tsx). Until the app grows one, the honest card is
        // the key alone. Same for `snooze` below.
        'Press ', 'E', ' to close it.',
        { caps: 2 },
      );
    /* * ---------------------------------------------------------------------
       AND THE THIRD WAY A ROW LEAVES.

       IT NEEDED A ROW OF ITS OWN AND IT HAS ONE. The two finished rows are
       right to close and the stopped one is right to answer, so teaching S on
       either would be teaching a key on a row it is wrong for. The fourth
       practice row is real work that is nobody's emergency, and it is the shape
       S exists for: see `later` in shared/first-run-practice.mjs.

       TWO HALVES, LIKE `unblock`. The first is the row in the list, where the
       press happens; the second is the picker that opens over it, because a
       modal appearing with no word about it is a screen somebody has to work
       out on their own, which is the fault this whole round is about.
    */
    /*
     * AND THE GOAL IS IN THE QUIET LINE. The third
       line here read 'An empty inbox is the goal. Putting something off is how
       you get there honestly.' Two sentences to carry one idea, on a card that
       already had two lines. The idea survives in five words on the line above
       the key, which is where somebody deciding whether to press S is looking
       anyway; what went is the second sentence, because "honestly" was
       answering an objection nobody has made yet. */
    case 'snooze':
      return ctx.picking
        ? say('Pick when it should come back.', 'It leaves your inbox until then and comes back on its own.')
        : say(
          // L, NOT S, SINCE 2026-10-01. S had come to mean the summary inside a
          // thread and still opened this picker everywhere else, so one letter
          // taught two things; the walk teaches the one the app now answers.
          //
          // AND NO CLICK NAMED HERE EITHER, for the reason written out on
          // `clear` above: the row's chip is drawn only while the walk is on,
          // so a card telling somebody to click Later would teach a button that
          // is gone the moment the tutorial ends.
          'Real work, but not for today. An empty inbox is the goal.',
          'Press ', 'L', ' to deal with it later.',
          // AND THE THIRD LINE IS FOLDED IN RATHER THAN DROPPED.
        );
    // AND THE ONE THAT IS LEFT IS THE POINT. Half of this beat is in the list
    // and half is in the reading pane, because opening a row and answering it
    // is one move and splitting it into two beats would put a screen between
    // somebody and the thing they are learning.
    // AND THE REASON IS ON THE FIRST HALF, NOT THE SECOND, WHICH IS BOTH THE
    // BETTER PLACE FOR IT AND THE ONLY ONE THAT FITS.
    //
    // BETTER, because the first half is where the decision is: the row is in
    // the list and closing it with E is still what a person's hand wants to do,
    // having just closed two. By the second half the row is open and answering
    // it is the only thing on offer, so the warning is arriving after the
    // moment it was for.
    //
    // AND IT FITS. Measured on the built app at 1752x986: the strip of options
    // is 157 tall and ends at 904, so a card under it starts at 918, and the
    // five-line version was 146 and ran to 1064. Two lines are 62 and clear the
    // window with the lift's own 10px floor to spare. Photographed both ways
    // before this was decided.
    case 'unblock':
      return ctx.opened
        ? say(
          // AND THE STRIP IS THE CLICK (2026-10-01). The ring is round the
          // strip of options, so the first of them is already clickable.
          'Your agent gave you three answers to pick from.',
          'Press ', '1', ' or click the first answer to send it.',
        )
        /*
         * AND THE WARNING IS IN THE QUIET LINE.
           The third line read 'Closing it would leave the agent stopped for
           good. Answering it puts it back to work.' This is the one move the
           product exists to stop somebody making, so the danger could not be
           dropped; it is folded into the sentence that describes the row,
           which is now one sentence doing both jobs. The second half of the
           old line — that answering puts the agent back to work — is not lost
           either: it is the whole of beat seventeen, where she watches the
           agent she answered running again in In progress. */
        // AND THE DANGER STAYS IN THE SENTENCE, WHICH IS WHY THE OTHER WORDING
        // LOST HERE. That warning has nowhere else to live now the third line
        // is gone, and tests/the-coaching-card-is-two-lines asserts "stopped
        // for good" is on this card.
        : say(
          'An agent is stopped here. Closing it leaves it stopped for good.',
          'Press ', '↵', ' or click the row to open it.',
        );
    // AND CLEARING THEM GOES STRAIGHT ON TO ⌘K. The finish card says the same
    // thing two beats later, where it is the end and where it is true. THE
    // LESSON, AS THE TWO THINGS SHE JUST DID RATHER THAN AS A CLAIM ABOUT THE
    // SCREEN. The agent really is running, in In progress, and there was
    // nothing anywhere in the window saying so. A card that describes something
    // invisible is the fault this whole round is about, one layer down.
    //
    // What IS visible is the empty inbox, and what is certain is what she did.
    // So the line names the distinction that is the whole lesson — close the
    // finished ones, answer the stuck one — and claims nothing else. The reason
    // answering beats closing is said on the beat where the stuck row is on the
    // screen, which is `unblock` above.
    //
    // IT IS STILL NOT A SCREEN. There was a card of its own here once reading
    // "This is inbox zero. Get back here every day.", and it was cut on
    // 2026-08-23 because it read as an ending with two beats still to come.
    // This is one line on the card that was
    // already up, and the walk does not stop for it.
    /* * ---------------------------------------------------------------------
       BEAT FIFTEEN: WHERE IT ALL WENT. This beat did not exist until 2026-08-24 and it is
       the answer to the half of the problem that the `unblock` beat above does not touch.

       WHAT THE WALK NEVER TAUGHT. Somebody finished it having only ever seen
       the Inbox tab. In progress and Closed were on the screen from beat nine
       onward and nothing ever said what they were, so the mental model the
       whole product rests on — the inbox is what needs YOU, the work carries on
       next door — was never handed over. An empty inbox with no idea where the
       work went does not read as inbox zero. It reads as an app with nothing
       in it, which was reported three rounds running.

       IT FOLLOWS A REFERENCE, NOT AN INVENTION. Half of that walk's beats exist purely to
       say where a thing went and what just changed, and ours had none.

       THREE PRESSES OF Tab, ONE BEAT. Tab is the app's own key for
       this (App.tsx, the `order` array) and it already rotates Inbox, In
       progress, Closed. Nothing is added to the app to make this beat work: it
       is the tabs somebody will use every day, pressed once each.

       THE SURPRISE IS ON THE MIDDLE SCREEN AND SO IS THE LESSON. In progress
       holds the agent she answered a moment ago, running again because she
       answered it instead of closing it. That is the payoff of the beat before
       and it is the one thing on this tour that is not merely tidy.
    */
    case 'where': {
      /* * AND WHERE THE NEXT PRESS GOES IS LOOKED UP, NEVER ASSUMED (w-f3eec8b8af,
         2026-09-02). Each of the three sentences below used to end by naming the tab that
         came next IN A LIST WRITTEN OUT HERE: Scheduled, then In progress, then Closed,
         then back. The strip is not that list. Scheduled is drawn only some of the time and
         is in the rotation on a different rule again, so the card could promise the agent
         she answered while the ring, and the press, went to the Inbox.

         So the tail is now chosen by DESTINATION. `nextTab` is the app's own
         rotation, the same one the ring is drawn off and the same one the press
         obeys, and `TAB_TOUR_SENDS_YOU` is the sentence for whatever comes
         back. Not one word changed on the ordinary walk; what changed is that a
         strip in any other shape now gets sentences that match it.
      */
      // THE CAP IS THE DESTINATION'S OWN NUMBER, and it is looked up for the
      // same reason the sentence below it is: Scheduled is drawn only some of
      // the time, so the tab that comes next is in a different position on
      // different days and a cap written out here would send her to the wrong
      // one. `tabCap` reads the same list the ring and the press obey.
      const cap = tabCap(ctx.tabs ?? [], nextTab(ctx.tabs, ctx.view));
      // AND THE TAB'S NAME FOR SOMEBODY WHO CLICKS (2026-10-01). The tour is now
      // walked by people who have never used a shortcut, and the ringed tab is
      // clickable, so where the strip has names on it the card says the name.
      const named = ctx.tabNames?.[nextTab(ctx.tabs, ctx.view)];
      const or = named ? ` or click ${named}` : '';
      const sends = or + (TAB_TOUR_SENDS_YOU[nextTab(ctx.tabs, ctx.view)]
        // A TAB THIS FILE HAS NO WORDS FOR SAYS SO PLAINLY rather than borrow
        // the words of a different one. Nothing in the app reaches this today;
        // it is here so that adding a fifth tab is a card that reads a little
        // thin rather than a card that lies.
        ?? ' for the next one.');
      // AND THE FIRST STOP IS WHERE THE ONE SHE PUT OFF WENT (2026-08-24). The
      // snooze beat gives the app a Scheduled tab it did not have a minute ago,
      // and a tab appearing on the screen with nothing said about it is the
      // exact fault this whole beat exists to fix.A row put off is only
      // honestly out of the inbox if somebody knows where it went and that it
      // is coming back.
      if (ctx.view === 'snoozed') {
        return say(
          'The one you put off is here, and it comes back on its own.',
          'Press ', cap, sends,
        );
      }
      /*
       * AND THE EASIEST OF THE FOUR FOLDS. The
         third line here read 'An empty inbox does not mean nothing is
         happening. It means nothing is happening that needs you.' — thirty-one
         words explaining a screen that is at that moment SHOWING her an agent
         running with an empty inbox behind it. The quiet line names the thing
         she is looking at and the screen makes the point better than the
         sentence did; five words carry what the sentence added. */
      if (ctx.view === 'progress') {
        return say(
          'The agent you answered is here, working without you.',
          'Press ', cap, sends,
          // AND THE THIRD LINE IS FOLDED IN RATHER THAN DROPPED.
        );
      }
      if (ctx.view === 'done') {
        return say(
          'Everything you finished is kept here.',
          'Press ', cap, sends,
        );
      }
      // AND THIS IS THE ONE TAIL THAT IS NOT LOOKED UP, because it names no tab
      // to be wrong about. "Where it all went" is true of whichever of them the
      // strip puts second, which is the whole of what the tour is for. Naming
      // it here would also spoil the beat: the first press is the one somebody
      // is meant to be surprised by.
      // INBOX ZERO IS NAMED HERE, AS THE GOAL (w-ec62ab6b38). People need to be
      // told the goal, and the tutorial is the better place for it than the
      // intro. This is the moment she has just reached it, and the intro no
      // longer says it. The first sentence stays word for word in front of it.
      return say(
        'Great! Your inbox is now empty. That is inbox zero, and it is the goal.',
        'Press ', cap, `${or} to see where it all went.`,
      );
    }
    /*
     * AND THE LAST CARD SAYS WHAT SHE DOES NEXT.
       It read 'Back at an empty inbox, which is where a day ends.' over
       'Everything you just did is one key away. Press ⌘K any time.' and then
       it stopped. Every card before it in the walk ends on a next step, so the
       pattern breaks on the one card where breaking it costs the most, and
       a tester got to the end of the practice and did not know what to do.

       "ANY TIME" IS WHY. It is a permission, not an instruction: it says the
       key is always available and never says to press it now, so a card whose
       whole job is to be pressed past ended on the softest sentence in the
       walk. The loud line names the press and then names the thing on the
       other side of it, which is the only thing she is actually there to do —
       her own first real task, in her own project, which is what opens when
       this beat is over.

       AND IT DOES NOT CLAIM TO BE THE END. There was a card here once reading
       "This is inbox zero. Get back here every day." and it was cut on
       2026-08-23 for reading as an ending while the walk carried on. The
       agents card and the confetti still come after this one, so this says
       what to press and where it goes, and nothing about being over.

       TWO LINES, like every other card, which is why the ⌘K fact moved up into
       the quiet line rather than sitting in front of the instruction: the loud
       line was two sentences and wrapped to two of its own. */
    /* * AND IT IS WHERE THE WALK SAYS WHERE THE WALK LIVES ( 2026-08-28, the second round
       on this card).

       IT IS THE QUIET LINE AND NOT A THIRD ONE. The quiet line was seven words saying ⌘K
       holds everything; it now spends six more saying that this walk is one of the things
       ⌘K holds, and NAMES THE WORD TO TYPE. The key alone was not enough on the call and it
       is not enough here: the palette is eighty rows long and "press ⌘K" tells nobody which
       of them to look for.

       THE WORD IS THE ROW'S OWN LABEL. ⌘K matches a typed word against a row's
       label and keywords (palette-rows.ts), and the tutorial's row reads "Take
       the tutorial", so typing tutorial lands on exactly one row. If that label
       is ever reworded, this sentence is wrong, which is why
       tests/the-tutorial-and-the-onboarding-are-two-things.test.mjs asserts the
       two against each other rather than each alone.

       AND THE LOUD LINE IS UNTOUCHED. What she does next is still her own first real task,
       and this walk is still not what she is being sent to do.
    */
    /* * ---------------------------------------------------------------------
       AND IT HAS TWO HALVES, WHICH IS THE OTHER ROUND ON THIS SAME CARD
       (w-45e9cd9573, 2026-08-28, folded in when the two rounds met).

       WHAT WAS PHOTOGRAPHED. The card said "Press ⌘K any time", the palette
       opened, AND THE CARD WENT OFF THE SCREEN. What is left is nine command
       rows, no sentence anywhere on the window, and nothing saying how to get
       out. The one beat that exists to teach ⌘K says nothing at the moment
       somebody is actually looking at ⌘K.

       The ring was on the ⌘ button in the corner, which is OUTSIDE the palette, so the card
       correctly went quiet. The fix is not to weaken that rule. It is to ring something
       INSIDE the palette, which is what the press was about in the first place:
       ANCHOR.command has the palette's own list in front of the button now, so the card
       comes back the moment the palette is up.

    /* * THE BOARD, which is the same work stood up in columns (2026-10-01).
       THE WALK MUST OPEN THE BOARD, because seeing what a whole team is up to
       is the question the board answers and no tab does.

       IT FOLLOWS THE TOUR BECAUSE IT ANSWERS THE SAME QUESTION ONE LAYER UP.
       The tour walks the tabs and says where each thing went; the board is all
       of it at once, sorted by what is happening to it, which is the view
       somebody with a team opens in the morning.

       ONE CARD FOR TWO PRESSES, which is unlike the beats around it and is the
       honest shape here: the board is not a tab, it is a choice inside the View
       and filters menu, so getting to it really is a button and then a row. The
       ring does not need telling which half it is on, because `ANCHOR.board`
       prefers the open menu and falls back to the button that opens it.

       IT SAYS "YOUR TEAM" WITHOUT PROMISING ONE. On a Mac with nobody else the
       board is your own work in the same columns, which is worth knowing on its
       own; the sentence names the columns rather than the people, so it is true
       either way. */
    case 'board':
      return say(
        'The board is everything at once, in columns for what is happening to it.',
        'Click View and filters at the top right, then Board.',
      );
    /* * AND IT SAYS WHAT THE LIST IS RATHER THAN NAMING THE SCREEN. Then the one key
       that leaves, because esc is also what ends the walk.
    */
    case 'command':
      return ctx.palette
        // AND THIS HALF NAMES NO CLICK, WHICH IS THE ONE EXCEPTION IN THE WALK
        // (2026-10-01). Every other beat now says what to click as well as what
        // to press; here there is nothing honest to point at. The ring is round
        // the palette itself, so the only things inside it are the field and the
        // command rows, and "click a row" would run one of eighty commands
        // instead of closing the list. esc is not a shortcut anybody has to
        // remember, which is the whole worry this round is about: it is the key
        // every window on the Mac closes on.
        ? say(
          `Every command in ${NAME} is in this list.`,
          'Press ', 'esc', ' to close it.',
        )
        // AND THE QUIET LINE ON THIS HALF IS NOT THE ONE THAT ROUND CUT. That
        // round emptied it, and it was right to: it said "Back at an empty
        // inbox, which is where a day ends", a sentence about how to feel over
        // a loud line that named nothing. That sentence is gone and stays gone.
        // Wha the budget is two lines, the other half is only read if she
        // presses, and being told out loud on a call is what this exists to
        // stop.
        : say(
          'Everything you just did is one key away. So is this: type tutorial.',
          // ⌘K finds commands; N starts a thread. The old line read as if ⌘K
          // started one (a persona test, 2026-10-01).
          //
          // AND IT NAMES THE BUTTON, WHICH IS THE LAST BEAT THAT DID NOT
          // (2026-10-01). ⌘K is the least guessable press in the walk and this
          // is the beat that exists to teach it, so a card that names only the
          // chord is the beat failing at its one job for anybody who does not
          // use shortcuts. The ⌘ button in the corner is inside the ring
          // (`ANCHOR.command`) and opens the same list. "to find any command"
          // comes out to pay for it: the other half of this beat already says
          // `Every command in ${NAME} is in this list.` over the open list, and
          // the loud line has to stay ONE sentence
          // (tests/the-coaching-card-is-two-lines.test.mjs).
          'Press ', '⌘K', ' or click the ⌘ button, or N for your first real thread.',
        );
    default:
      return null;
  }
}


/* ------------------------- HOW A KEY BEHAVES ------------------------------ */
/* So both fixes are here and neither of them shakes:

     A WRONG KEY PULSES the cap once and is over in half a second.
     A KEY NOBODY HAS PRESSED starts breathing after four seconds.

 The reason it matters is a tester who missed the key, not decoration.
*/

/**
 * How long a wrong press is shown for. Long enough to be seen, short enough
 *  that two wrong presses in a row read as two answers rather than one. */
export const WRONG_MS = 620;
/**
 * And how long a cap waits before it starts breathing on its own.*/
export const BREATHE_AFTER_MS = 4_000;

/**
 * A KEYSTROKE AS THE CAP IT WOULD BE DRAWN AS, or null for a press that is not
 *  a shortcut at all.
 *
 *  NULL IS NOT "WRONG", AND THE DIFFERENCE IS THE WHOLE OF THIS FUNCTION. An
 *  arrow key moves down the list and a ⌘R reloads the window: both are ordinary
 *  things to do in the middle of a walk and neither is somebody missing. Only a
 *  press that IS one of these five caps, and is the wrong one of them, is an
 *  answer worth giving. The five are the walk's own: C, ⌘↵, ↵, E and ⌘K. */
export function keyToken(e: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }): string | null {
  const k = e.key ?? '';
  // ⌘ AND A NUMBER, one per section. It was ⌘⌥ and an arrow until 2026-09-23,
  // when three keys proved too many and the chord was caught by a
  // window-tiling app before it ever reached this window. The walk teaches ⌘2,
  // because the tour's next stop is always the section under the one she is on
  // and In progress is the second row; the cap is written out rather than
  // computed so the walk cannot promise a key the handler does not run.
  if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && /^[1-4]$/.test(k)) return `⌘${k}`;
  const cmd = !!e.metaKey || !!e.ctrlKey;
  if (cmd && k === 'Enter') return '⌘↵';
  if (cmd && k.toLowerCase() === 'k') return '⌘K';
  if (cmd) return null;
  if (k === 'Enter') return '↵';
  // TAB, BECAUSE BEAT FIFTEEN ASKS FOR IT. Without this line the walk cannot
  // tell a correct Tab from no press at all: the cap keeps its four-second
  // clock running and starts breathing at somebody who is pressing exactly the
  // right key, which reads as the walk not noticing them. Shift-Tab is the same
  // token on purpose, because it is the same rotation going the other way and
  // both of them are right answers to this card.
  if (k === 'Tab') return '⇥';
  if (k.length === 1 && /[a-z0-9]/i.test(k)) return k.toUpperCase();
  return null;
}

/* ---------------------- THE NAME BESIDE THE GLYPH ------------------------- */
/* * A TESTER DID NOT KNOW WHAT ⇥ WAS.

   The rule this settled on, and the reason for
   each half of it:

     A CAP IS NAMED WHEN ITS WHOLE FACE IS ONE SYMBOL THAT SAYS NOTHING.
     ⇥ and ↵ are the only two the walk draws. Neither is a word, neither is
     printed on the key she is looking for in any way that helps (the Mac key
     she needs for ⇥ is the wide blank one on the far left; ↵ is the big one
     she calls Enter), and neither can be read aloud by somebody who does not
     already know it. Those two get their name drawn inside the same cap.

 A CAP WITH A LETTER OR A NUMBER ON IT IS NOT NAMED. C, E, S and 1 already say their own
 name; "E Ee" is a joke.

 AND A COMBINATION IS NOT NAMED EITHER. ⌘K and ⌘↵ carry ⌘, which everybody on a Mac reads as
 command and which nobody has ever asked us about, and naming them would print "Command
 Return" into the loud line of a card we are shortening in the same breath (see the two-line
 budget on `Coach`).

   It is a MAP RATHER THAN A GUESS off the glyph, so a cap that is added later
   is named on purpose or not at all, and never by accident. And it is here,
   beside `keyToken`, because the cap and its name are one object: the walk has
   exactly one way of drawing a key and this extends it rather than adding a
   second.
*/
export const KEY_NAMES: Readonly<Record<string, string>> = {
  '⇥': 'Tab',
  // ⌘1 TO ⌘4 CARRY NO WORD (w-ec62ab6b38, 2026-09-28). The cap drew "⌘2
  // Command–2", which is the same key said twice. The glyphs read on their own, the way ⌘K's cap already does.
  '↵': 'Return',
};

/**
 * THE CAP FOR A TAB, counting from one in the order the sidebar draws them.
 *
 *  Falls back to the first, which is the only honest answer for a tab that is
 *  not in the list at all: the walk would rather send somebody to their inbox
 *  than print a key that goes nowhere.
 */
export function tabCap(tabs: readonly string[], dest: string): string {
  const at = tabs.indexOf(dest);
  return at >= 0 && at < 4 ? `⌘${at + 1}` : '⌘1';
}

/**
 * The word that goes inside the cap beside the glyph, or null for a cap that
 *  already says its own name. */
export function keyName(cap: string | null | undefined): string | null {
  if (!cap) return null;
  return KEY_NAMES[cap] ?? null;
}

/** Whether this press is the walk saying no. */
export function wrongPress(
  want: string | null,
  e: { key: string; metaKey?: boolean; ctrlKey?: boolean },
): boolean {
  if (!want) return false;
  const token = keyToken(e);
  return token !== null && token !== want;
}

/**
 * WHAT A PRESS IS EVEN AIMED AT. Only a press aimed at the walk can be a wrong
 *  answer to the walk, and two things on this screen are not the walk.
 *
 *  A FIELD. The compose card is open on beat ten with its title already
 *  written, and every letter typed into it would otherwise be a wrong key.
 *
 * AND THE CARD THAT ASKS WHETHER TO LEAVE. It is drawn OVER the walk and it is
 * the one thing on the screen whose whole job is to end the walk, so a press
 * inside it belongs to it. a tester pressed Return on that card and nothing
 * happened at all: the coaching card's capture listener saw Return, called it a
 * wrong cap for the `make` beat — which it is, for the walk — and
 * `preventDefault` cancelled the focused button's own activation before the
 * browser could act on it. So the card had two buttons, neither of them
 * reachable from the keyboard, over a walk she had already said she wanted to
 * leave. Answering a mistake is right; answering something that was never aimed
 * at you is how somebody gets trapped. */
export const NOT_THE_WALK = 'input, textarea, [contenteditable="true"], [contenteditable=""], .fr-stay-scrim';

export function pressCounts(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return true;
  return !el.closest(NOT_THE_WALK);
}

/* --------------- AND A WRONG KEY DOES NOT REACH THE APP -------------------- */
/* The pulse above already existed and it said so; what it did NOT do is stop
   the press. `Card` answered the key and then let the app have it exactly as it
   would have had it, so her E closed a real row and took the snooze lesson with
   it. Answering a mistake and then committing it is worse than either.

   WHAT IS SWALLOWED IS THE WALK'S OWN ALPHABET AND NOTHING ELSE. `keyToken`
   already draws that line for the pulse: an arrow key, ⌘R, ⌘Q and Escape are
   not caps and answer null, so they go through untouched and the window is
   never trapped. Two deliberate exceptions on top of that:

     ⇥ IS NEVER SWALLOWED. Tab moves the focus ring, which is not a command
     being processed, and eating it would take the keyboard away from anybody
     who navigates by it.

     A PRESS INSIDE A FIELD IS NEVER SWALLOWED, the same rule the pulse uses
     (`pressCounts`). The compose card is open on the task beat with its title
     already in it.
*/

/** The one cap that is a wrong press and still has to reach the app. */
const NEVER_SWALLOWED = '⇥';

/**
 * Whether the walk should eat this press before the app underneath sees it.
 *  Pure, so the rule is a value the tests can pin rather than a branch buried
 *  in a listener. */
export function swallowPress(
  want: string | null,
  e: { key: string; metaKey?: boolean; ctrlKey?: boolean },
  target: EventTarget | null,
): boolean {
  if (!pressCounts(target)) return false;
  if (!wrongPress(want, e)) return false;
  return keyToken(e) !== NEVER_SWALLOWED;
}

/* -------------- AND A CLICK ON WHAT THE BEAT IS NOT ABOUT ------------------ */
/* * A TESTER WANDERED, AND WAS NOT LOST.

   The tester READ the card and went somewhere else anyway, out of curiosity,
   and the card that would have called them back was in a corner they looked at
   second. A walk that only refuses is a walk that answers curiosity with
   silence.

 THIS IS THE KEYBOARD'S RULE, NOT A SECOND RULE. This is the same sentence with the word
 click in it: the press does not reach the app, and the walk answers it where the answer is
 useful, which is on the thing she is supposed to press.

   WHAT IS ALLOWED IS WHAT THE RING IS ROUND, AND NOTHING IS WRITTEN DOWN TWICE.
   `ANCHOR` below already says what each beat is about, the component resolves
   it live with `firstOf`, and the ring is drawn round the answer. So the
   allowed element is that same element, handed in. A second list of selectors
   here would be one edit away from disagreeing with the ring, and a ring round
   a thing the walk refuses to let anybody press is the worst screen in this
   file.

   FOUR THINGS ARE NEVER HELD, and each of them costs somebody something real.

     A FIELD. `pressCounts` already says a key typed into a field is not a key
     at the walk; a click into one is not a click at the walk either. Beat ten
     has the compose card open with her task already in it.

 THE WAY OUT AND THE CARD IT OPENS. A lock that can take the door with it is not shipping
 again.

     THE WALK'S OWN FURNITURE. The card, the ring, the veil and the practice
     strip are ours, not the app's; there is nothing under them to hold.

     AND A BEAT WITH NOTHING ON THE SCREEN TO POINT AT. If the thing the ring is
     round is not drawn, the walk has no way to say where to go instead, and a
     click that does nothing with nothing to look at is a dead app — which is
     its own kind of confusing and is the fault this whole round is about. The
     caller passes what it found; an empty hand holds nothing.
*/

/**
 * THINGS THAT ARE THE WALK RATHER THAN THE APP, so a click on one is not a
 *  click at anything that could be held. `.fr-out` is in here and not in
 *  `NOT_THE_WALK` on purpose: a press inside the leave CARD belongs to that
 *  card, and the button that opens it belongs to the walk. */
export const NOT_THE_APP = '.fr-tether, .fr-ring, .fr-veil, .fr-band, .fr-out';

/**
 * THE SECOND THING A BEAT IS ABOUT, on the beats whose own card offers a
 *  second route.
 *
 *  THIS IS NOT A SPARE COPY OF `ANCHOR` AND IT MUST NEVER BECOME ONE. Every
 *  entry here is something the card SAYS OUT LOUD and the ring cannot be round
 *  at the same time, and there is exactly one of them:
 *
 * unblock 'It gave you three answers to pick from.
 *
 *  A beat whose card names one thing has no entry here. If a later round adds
 *  one, the test that reads these against `coach` is what says whether the card
 *  really offers it.
 *
 * AND `answer` CAME OUT ON 2026-09-01, because the ring is the reply box now.
 * It was here while the ring was round a close-this-task button that no longer
 * exists; with the box itself ringed, an entry naming the box would be the
 * spare copy of `ANCHOR` the paragraph above forbids. The half of that card the
 * ring is not round is the key E, and a key needs no unlocking. */
export const ALSO: Partial<Record<Step, string[]>> = {
  unblock: ['.focus-dock'],
};

/**
 * Whether the walk should eat this click before the app underneath sees it.
 *
 *  `live` is what the beat is about, already resolved by the component off
 *  `ANCHOR` and `ALSO` — the same elements the ring is drawn round. Pure, so
 *  the rule is a value the tests pin rather than a branch buried in a listener,
 *  exactly as `swallowPress` is. */
export function strayClick(
  target: EventTarget | null,
  live: readonly (Element | null | undefined)[],
): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  // A field, or the card that asks whether to leave. The keyboard's own rule.
  if (!pressCounts(el)) return false;
  // The walk's own furniture, and the way out drawn beside it.
  if (el.closest(NOT_THE_APP)) return false;
  const there = live.filter((e): e is Element => !!e);
  // Nothing to point at is nothing to hold her to.
  if (!there.length) return false;
  return !there.some((e) => e === el || (typeof e.contains === 'function' && e.contains(el)));
}

/**
 * THE EVENTS THE BEAT IS HELD ON, and the ones it deliberately is not.
 *
 *  ALL FIVE OF THESE ARE ONE PRESS OF THE MOUSE arriving five times, and the
 *  app listens on more than one of them, so stopping only `click` would leave a
 *  row selecting itself on `mousedown` under a walk that had refused the click.
 *
 *  WHAT IS NOT HERE MATTERS MORE. There is no `wheel`, no `scroll`, no
 *  `mousemove`, no `mouseenter`, no `keydown` and no `resize`: scrolling,
 *  hovering, moving the pointer and resizing the window are harmless and
 *  reassuring, and a window that will not scroll does not read as a tutorial
 *  holding the beat, it reads as an app that has crashed. Nothing here is
 *  allowed to make Agentbox look broken. */
export const HELD_EVENTS = ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'] as const;

/*
 * AND THE WALK STOPS THE APP HEARING IT WITHOUT STOPPING THE BROWSER BEING A
   BROWSER. `stopImmediatePropagation` on the way down takes the press away from
   every handler the app has, which is the whole of what is wanted;
   `preventDefault` on `mousedown` would additionally cancel the browser's own
   default, which is where text selection and focus live. That is the same
   distinction `swallowPress` already draws for ⇥ — moving the focus ring is not
   a command being processed — so selecting a word in an agent's message still
   works while the row underneath it stays shut. Only `click` is
   default-prevented, because that is the one carrying a link's navigation. */

/* * * THE STEPS THAT ARE NOT A SCREEN.
*/
export const COACHED: Step[] = ['make', 'who', 'task', 'working', 'open', 'answer', 'clear', 'snooze', 'unblock', 'where', 'board', 'command'];

/**
 * What the tether points AT, per step, as a CSS selector into the real app.
 *  Never a rectangle of our own: the whole defect found on 08-21 was a line
 *  positioned off the window rather than off the thing it is talking about. The
 *  ring is drawn round the run of this element real children, not round the
 *  element, because half of these are flex rows wider than what is in them. */
/*
 * IN ORDER OF PREFERENCE, NOT AS A COMMA LIST. querySelector given 'a, b'
 * returns whichever of the two comes first in the DOCUMENT, so the old 'the
 * working row, else any row' read as 'the top row, always'. Measured on,
 * 2026-08-21. The component walks this array and takes the first entry that
 * matches. */
export const ANCHOR: Partial<Record<Step, string[]>> = {
  /* * BEAT FOUR IS THE PLUS. The palette used to open itself here and fill the
     middle of an empty window with rows that mean nothing yet.

     AND IT IS THE PLUS ALONE, OVER THE ARGUMENT FOR THE FIELD (w-45e9cd9573). A round
     put `.idle-field` in front of the plus here, on the argument that the idle page's
     compose field is 710px wide, sits mid-window and already wears a `C` cap, while the
     plus is a 34px icon in the corner. The walk teaches the control that is on the screen
     every day, and the idle field is on the screen only at inbox zero, which is the one
     state a person with work in front of them is not in. A beat that teaches a control most
     people cannot find afterwards has taught nothing. DO NOT PUT THE IDLE FIELD BACK IN
     THIS LIST.
  */
  // AND THE TEAM HEADER'S BUTTON AFTER IT (2026-10-01). The team layout draws
  // no plus: its New thread button is `.th-new` in the header, with no
  // aria-label, so this list matched nothing there and the first beat of the
  // tutorial drew no card at all. A persona test sat on that blank screen for
  // over thirty seconds.
  make: ['button[aria-label="New thread"]', '.th-right button[data-hint="new-task"]', 'button.th-new'],
  // THE CARD'S FIRST LINE, which is who the thread is for. The row is a button
  // that opens the list of everyone it could go to, and that list is the whole
  // of the beat.
  who: ['.tc-card .tc-to-menu', '.tc-card .tc-word'],
  // THE NEW THREAD CARD'S OWN SEND (2026-10-01). It was `.modal.compose
  // .dock-send`, the retired one-line card, which the walk kept for one round
  // after the rest of the app moved: "the tutorial is using the wrong
  // component here, we no longer use this". The card is `.tc-card` now and its
  // send is `.tc-send-main`, beside the caret that opens Send later.
  task: ['.tc-card .tc-send-main'],
  // THE ROW, AND ONLY THE ROW. The walk hands its own item's row in front of
  // this one; this is the fallback for the moment before that row is drawn.
  // AND THE RUNNING TAB WHEN THE ROW IS NOT IN THE LIST (2026-10-01). The team
  // layout keeps a running thread out of Needs you, so the row she just sent
  // is not drawn there; the ring goes to the tab it went to instead.
  working: ['.list-pane .row', '.th-bar .tm-tab:nth-child(2)'],
  open: ['.list-pane .row'],
  // THE REPLY BOX, BECAUSE THE BUTTON THIS USED TO RING NO LONGER EXISTS. On
  // 2026-08-27 that button was taken out, and `.focus-actions` itself is
  // now drawn only on a row that can be unscheduled, revealed, stopped or
  // unblocked, which a finished practice task is none of.
  //
  // SO THIS BEAT HAD NO ANCHOR, AND A BEAT WITH NO ANCHOR IS A DEAD APP.
  // `Ringed` ends `if (!geo) return null`, so no ring and no card were drawn,
  // and the click lock is deliberately inert with nothing to point at (`if
  // (!drawn.current) return`) — so every other rule in this file switched
  // itself off at the same moment. Reproduced by driving the built walk end to
  // end: beat twelve was the one beat of nineteen that printed no sentence and
  // no ring.
  //
  // THE RING GOES ROUND THE REPLY BOX AND THE BUTTON DOES NOT COME BACK. It
  // was taken out on purpose and nothing here is allowed to undo that. What the
  // card says is "Reply to it, or press E to close it", and of those two the
  // reply box is the half with something on the screen to point at; E is a key,
  // and the two beats either side of this one name a key with no button of
  // their own too. The box sits on the bottom edge of the window, so `ring`
  // flips the sentence above it into the empty middle of the pane rather than
  // off the screen.
  answer: ['.focus-dock .dock-card', '.focus-dock'],
  clear: ['.list-pane .row'],
  // BEAT FOURTEEN, IN ORDER OF PREFERENCE, the same shape as beat fifteen
  // below: the picker wins while it is open and the row itself is what the
  // ring finds before that. The component hands the snoozeable row's own id in
  // front of both.
  snooze: ['.modal.snooze .palette-list', '.list-pane .row'],
  // BEAT FOURTEEN, IN ORDER OF PREFERENCE. The strip of options only exists
  // once the row is open, so it wins when it is there and the row itself is
  // what the ring finds before that. The component hands the stopped row's own
  // id in front of both, the way it does for her task on beats ten and eleven.
  unblock: ['.opt-strip', '.list-pane .row'],
  // Beat eight's second half has no ring on purpose: there is nothing left to
  // point at, which is the point of it. `zero` is absent from this map.
  // BEAT FIFTEEN RINGS THE TAB SOMEBODY IS BEING SENT TO, not the one they are
  // standing on, so the ring says where the press goes. Which tab that is
  // depends on where they are, so the component puts the right selector in
  // front of this list; what is left here is the floor, the tab strip itself,
  // for the render between two views where neither is up yet.
  // The sidebar is what is drawn during the walk now (w-ec62ab6b38); the old
  // strip stays as a floor only for a window that somehow has no sidebar.
  // AND THE TEAM LAYOUT'S OWN STRIP FIRST (2026-10-01), the Needs you,
  // Running, Scheduled, Done and All tabs over the list. The sidebar there
  // carries Inbox and Team only, so ringing it pointed at the wrong thing.
  where: ['.th-bar .tm-tabs', '.workspace-navigation .workspace-tabs', '.tabs'],
  // THE BOARD, IN ORDER OF PREFERENCE, the same shape as `snooze` and
  // `unblock`: the thing that is only on the screen part of the time wins while
  // it is there. The View and filters button is where the board lives, and the
  // menu it opens is what the second half of the sentence points at, so the
  // ring follows the press from the button to the menu without the beat having
  // to know which half it is on.
  board: ['.th-pop', '.th-right .th-disp'],
  // THE PALETTE FIRST, THEN THE KEY THAT OPENS IT. Same order-of-preference
  // shape as `snooze` and `unblock` above: the thing that is only on the screen
  // part of the time wins while it is there. Before this the only anchor was
  // the ⌘ button in the corner, which sits OUTSIDE the palette, so the walk
  // went silent the moment the palette opened and the beat that teaches ⌘K had
  // no words on the one screen it is for. See `command` in `coach` for the
  // photograph.
  //
  // AND IT IS THE PALETTE, NOT THE LIST INSIDE IT. `.palette-list` was tried
  // first and photographed: the ring came out 630 by 1449 in a 986 tall window
  // and ran off the bottom of the screen. The list scrolls, so the run of its
  // children is the height of everything in it rather than the height of what
  // is on show. The modal's own children are the field and the list box, both
  // of which end where the screen ends.
  command: ['.modal.palette', 'button[aria-label="Commands"]'],
};

/**
 * WHERE THE CARD DROPS TO WHEN THE THING IS ONE OF A STACK. Measured on beat
 *  nine: the ring is on the first of three waiting rows and the card landed
 *  squarely on the second and third, so two of the three tasks she was being
 *  told to clear sat behind the words telling her to clear them. The ring still
 *  says where to start; the card goes under the whole stack. */
export const UNDER: Partial<Record<Step, string>> = {
  clear: '.list-pane .row:last-of-type',
  // Two rows are still in the list on beat fourteen and the ring is on the
  // first of them, so the card goes under both for the same reason.
  snooze: '.list-pane .row:last-of-type',
};

// ---------------------------------------------------------------------------
// THE SHAPE OF THE COACHING LINE: THE SOFT RING.
//
// So there is no dot and no line any more. A ring is drawn around the thing
// itself and the sentence sits directly under it, sharing the thing own left
// edge. The five other shapes looked at are closed: straight leader, tucked
// above, the curve, left of the pane, and plate and pointer are not offered
// again and their drawings are kept in decisions.md.
//
// THE RING IS DRAWN ROUND THE THING, NEVER ROUND ITS BOX. That was the defect
// in the elbow this replaces: it hung off `.focus-actions`, a flex row as wide
// as the whole text column, so the mark sat 365 pixels to the right of the last
// button and the sentence landed on the rail. `anchorOf` in the component takes
// the run of the real children instead, and everything below is measured off
// that.

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * WHAT THE RING IS ACTUALLY DRAWN ROUND, given a box and what is inside it.
 *
 *  An element that only holds other elements is a box, and the thing is the run
 *  of what is inside it. That much was already true, and it is why the ring
 *  stopped landing 365px to the right of the last button.
 *
 *  WHAT IS NEW IS THE FILTER, and it is measured. A shot of the In progress
 *  step on 2026-08-21 showed the text still misaligned. A row's children are the select box, the two lines of text
 *  and the right end. The select box is positioned absolutely in the row's left
 *  gutter and is invisible until the pointer is on it (styles.css, .mark), but
 *  it has width, so it was counted, and it put the run's left edge at x=30
 *  while every word on the row starts at x=54. The sentence therefore drew 24px
 *  left of the row's own text, which is the one thing the list is not allowed to do:
 *  everything in a row starts at --text-x and nothing is indented past anything
 *  else (styles.css:809).
 *
 *  So something taken out of the flow is furniture round the thing rather than
 *  part of it, and it is not measured. */
export function runOf(box: Rect, kids: (Rect & { position: string })[]): Rect {
  const keep = kids.filter(
    (k) => k.w > 0 && k.h > 0 && k.position !== 'absolute' && k.position !== 'fixed',
  );
  if (!keep.length) return box;
  const left = Math.min(...keep.map((k) => k.x));
  const top = Math.min(...keep.map((k) => k.y));
  return {
    x: left,
    y: top,
    w: Math.max(...keep.map((k) => k.x + k.w)) - left,
    h: Math.max(...keep.map((k) => k.y + k.h)) - top,
  };
}


export interface Ring {
  /** The rounded rectangle, in window coordinates. */
  ring: { x: number; y: number; w: number; h: number; r: number };
  /**
   * Where the card starts, and how wide it may run. `right` instead of `x`
   *  when the thing is against the right edge of the window. */
  text: { x: number; y: number; w: number; right: number | null };
  /** Whether the card sits under the ring or above it. */
  below: boolean;
}

/**
 * Three pixels off the pad and one off the halo's stroke, measured in the
 * shots: the drawn ring stood 24px clear of the row's own ink at its widest
 * and this one stands 15px clear, so it is a fifth smaller each way and still
 *  the same ring. */

/**
 *  One flat pad could not be right for both ends of what the walk points at. It
 *  points at an 18px icon and at the run of words in a 75px inbox row, and 5px
 *  of air is generous round the icon and nothing at all round the row: measured
 *  in the shots, the ring stood 5px off the "T" of the row's title and its glow
 *  finished 3px short of the row underneath.
 *
 *  So the pad is a share of the SHORT side of the thing, floored and capped.
 *  Measured on the built walk at 1440x900: the ⌘ and the plus keep the 6 they
 *  effectively had, the two buttons take 10 and 12, and the inbox row takes 14.
 *
 * THE ROW GETS THE REQUESTED NUMBER. A pad of 14 puts it at 81, which is the
 * middle of the two, and it leaves 13px of clear ground between the glow
 *  and the words of the rows above and below instead of 3. */
export const RING_PAD_MIN = 6;
export const RING_PAD_MAX = 14;
export const RING_PAD_SHARE = 0.34;
export function padFor(anchor: { w: number; h: number }): number {
  const short = Math.min(anchor.w, anchor.h);
  return Math.max(RING_PAD_MIN, Math.min(RING_PAD_MAX, Math.round(short * RING_PAD_SHARE)));
}

/**
 * HALFWAY TO THE NEIGHBOUR AND NO FURTHER. Growing the pad found a second edge
 * of the same complaint from the other side: on the beat that says close this
 * task, "close this task" and "esc back" sit 10px apart, so a pad of 12 put 8px
 * of glow inside the button she was told NOT to press.
 *
 *  So the pad is whichever is smaller, the share of the thing and half the gap
 *  to whatever is beside it. Only things that really are beside it count: a
 *  sibling is measured on the axis where it clears the anchor, and one that
 *  overlaps the anchor on both axes is inside it and is not a neighbour.
 *
 *  Nothing in a list loses by this. Measured on the built walk, the run of words
 *  in one inbox row clears the run in the next by 33px, so half of it is 16 and
 *  the row keeps the 14 the share gives it. */
export function roomFor(anchor: Rect, neighbours: Rect[]): number {
  let room = Infinity;
  for (const n of neighbours) {
    const dx = Math.max(anchor.x - (n.x + n.w), n.x - (anchor.x + anchor.w));
    const dy = Math.max(anchor.y - (n.y + n.h), n.y - (anchor.y + anchor.h));
    const gap = Math.max(dx, dy);
    if (gap < 0) continue;
    room = Math.min(room, gap / 2);
  }
  return room;
}

/**
 * THE CORNER, AND WHY IT IS NO LONGER ONE NUMBER.
 *
 *  The cause is measurable. A flat 12 is a twelfth of the
 *  corner on a 1000px row and it is 40% of the side on the 30px ring round the
 *  ⌘, and at 40% a rounded rectangle has almost no straight edge left. The grey
 *  hairline that used to show the true corner is deleted for good, so the only
 *  thing drawing the shape is a 6px stroke under a 3px blur, which rounds it
 *  further. The small rings were discs.
 *
 *  So the corner is a share of the short side too, capped at the old 12. On the
 *  ⌘ that is 8, which leaves 14px of straight edge on each side of a 30px ring,
 *  and it reads as a square with rounded corners. Nothing 46px or taller moves:
 *  both buttons and every row keep the 12 they have. */
export const RING_R = 12;
export const RING_R_MIN = 6;
export const RING_R_SHARE = 0.26;
export function radiusFor(box: { w: number; h: number }): number {
  const short = Math.min(box.w, box.h);
  return Math.max(RING_R_MIN, Math.min(RING_R, Math.round(short * RING_R_SHARE)));
}
/**
 * The air between the ring and the top edge of the card.
 *
 * This is the middle of the
 *  two, and it is the approved one. */
export const TEXT_GAP = 18;
/**
 * As wide as the card is allowed to run, and as narrow. 360 is what the round
 *  four drawing used: past that a two line card becomes a one line banner and
 *  stops reading as a card beside a thing. */
export const TEXT_MAX = 360;
export const TEXT_MIN = 180;
/**
 * How close to the right edge of the window a thing has to be before the card
 *  hangs off its RIGHT edge instead of its left. A corner anchor is the case:
 *  against the plus in the top right, starting the card at the plus ran it 85px
 *  off a 1440 window. Measured round two, finding 4. */
export const NEAR_RIGHT = 220;
/**
 * Room one line of the sentence needs: the flip test at the bottom edge uses
 *  it, and so does the probe that keeps the sentence off other people's text. */
export const LINE_H = 22;

/**
 * Draw the ring and place the sentence. Pure, so the geometry is tested rather
 *  than eyeballed: tests/the-coach-ring-lands-on-the-thing.test.mjs. */
export function ring(
  anchor: Rect,
  bounds: { left: number; right: number },
  view: { w: number; h: number },
  beside = Infinity,
): Ring {
  const pad = Math.max(RING_PAD_MIN, Math.min(padFor(anchor), Math.floor(beside)));
  const x = Math.round(anchor.x - pad);
  const y = Math.round(anchor.y - pad);
  const w = Math.round(anchor.w + pad * 2);
  const h = Math.round(anchor.h + pad * 2);

  // A CORNER ANCHOR RUNS OFF THE WINDOW. Against the plus in the top right the
  // clamp used to start the card at x=1345 and run it 85px past a 1440 window,
  // so a thing near the right edge gets a card hanging off its right edge.
  const nearRight = anchor.x + anchor.w > view.w - NEAR_RIGHT;
  const tx = Math.round(anchor.x);
  const right = Math.min(bounds.right, view.w);
  const room = nearRight ? anchor.x + anchor.w : right - tx - 32;
  const tw = Math.max(TEXT_MIN, Math.min(TEXT_MAX, room));

  // Under the thing is the chosen shape. The one case that cannot have it
  // is a thing sitting on the bottom edge of the window, and there the card
  // goes above rather than off the screen.
  const under = y + h + TEXT_GAP;
  const below = under + LINE_H * 2 + 16 <= view.h;
  const ty = below ? under : Math.round(y - TEXT_GAP - LINE_H);

  return {
    ring: { x, y, w, h, r: radiusFor({ w, h }) },
    text: {
      x: tx, y: ty, w: tw,
      right: nearRight ? Math.round(view.w - (anchor.x + anchor.w)) : null,
    },
    below,
  };
}

/**
 * WHERE THE SENTENCE ACTUALLY FITS. Under the thing is the chosen shape,
 *  and under the thing is empty on three of the four steps. On In progress it is
 *  not: the room under a row belongs to the next row, and the sentence landed on
 *  top of a task title, measured in a shot 08-21. That is the same defect as the
 *  elbow landing on the right rail, so it gets the same answer, which is to
 *  measure rather than to hope.
 *
 *  Given the line the sentence wants and whatever is already written across that
 *  band, this returns the line it takes instead: below the lowest thing in the
 *  way, with air. If clearing it would push the sentence off the bottom of the
 *  window then nothing is clear and it stays where it was, because a sentence
 *  half off the screen is worse than a sentence over a row. */
export function clearOf(
  y: number,
  lineH: number,
  blockers: { top: number; bottom: number }[],
  view: { h: number },
): number {
  const hit = blockers.filter((b) => b.bottom > y && b.top < y + lineH);
  if (!hit.length) return y;
  const moved = Math.round(Math.max(...hit.map((b) => b.bottom)) + 10);
  return moved + lineH > view.h ? y : moved;
}

/**
 * The pane each step keeps its sentence inside, so a long line wraps at the
 *  edge of the thing it belongs to rather than at the edge of the window.
 *
 *  THE COMPOSE STEP HAS NO PANE ON PURPOSE, and it took a shot to learn. That
 *  card is a modal floating in the middle of the screen, so the sentence under
 *  its Start button is not inside the card, it is on the screen below it.
 *  Bounding it by the card left 101px of room under a 118px button, clamped up
 *  to the 180px minimum, and wrapped one short sentence onto two lines. Measured
 *  08-21. A step with no entry here is bounded by the window instead. */
export const BOUNDS: Partial<Record<Step, string>> = {
  task: 'body',
  working: '.list-pane',
  open: '.list-pane',
  clear: '.list-pane',
  snooze: '.list-pane',
  answer: '.focus-pane',
};

/**
 * THE FLOOR. The card sits TEXT_GAP under the ring, and the original problem
 *  was not about the ring at all: cards were sometimes touching the borders of
 *  their tasks. So it is also held this far off anything the app drew with a
 *  border of its own, a row, a card, a modal or the button bar. The top bar is
 *  not one of those. It is the edge of the window rather than the edge of a
 *  task, and holding the card off it only pushes the card back down the screen. */
export const FLOOR = 10;
/** Everything the floor is measured against. */
// `.th-bar` is the team layout's tab strip: a card that lands on it hides the
// tabs it may be talking about (2026-10-01).
export const FLOOR_OF = '.list-pane .row, .dock-card, .modal, .focus-actions, .th-bar';

// ---------------------------------------------------------------------------
// WHERE THE WALK IS KEPT. One key, so a half-finished first run survives a quit
// and a crash. The edge case from round four: quitting halfway, where the
// folder and name are saved as answered, so reopening resumes.

export const KEY = 'zero.firstRun';
export const DONE_KEY = 'zero.firstRun.done';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * A STEP THIS VERSION CAN ACTUALLY DRAW.
 *
 *  The shape of the walk is rewritten often — `agents` was a beat of its own
 *  and is on the finish card now, `zero` was the inbox-zero card and is
 *  deleted, `make`, `open` and `done` are all newer than the walk itself — and
 *  the step it got to is on disk so a quit halfway can resume. So somebody
 *  updating mid-walk is the ordinary case, not an edge one, and the step that
 *  comes back can easily be one nothing here draws any more.
 *
 *  `Onboarding.tsx` picks a screen by asking `run.step === …` down a list. A
 *  step that is none of them matched nothing and fell through to the setup
 *  shell, which drew the Agentbox mark on an empty screen with no words and no
 *  button: no way on, no way out, on the first thing a new person ever sees.
 *
 *  Where an unknown step lands depends on whether the walk had got anything
 *  done. Nothing made yet means nothing is lost by starting over. A project
 *  already in the store means the walk did its real work, and sending them back
 *  to the welcome would have them choose a folder and name a project they
 *  already have, leaving two behind — so that one ends. */
function liveStep(step: unknown, madeSomething: boolean): Step {
  if (typeof step === 'string' && STEPS.includes(step as Step)) return step as Step;
  // The retired rail beat. Its rows were already staged, so the walk goes on
  // from the beat that clears them.
  if (step === 'note') return 'clear';
  return madeSomething ? 'landed' : 'welcome';
}

export function readFirstRun(store: Store): FirstRun {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return START;
    const v = JSON.parse(raw) as Partial<FirstRun>;
    return { ...START, ...v, step: liveStep(v.step, Boolean(v.product)) };
  } catch {
    return START;
  }
}

export function saveFirstRun(store: Store, s: FirstRun): void {
  try { store.setItem(KEY, JSON.stringify(s)); } catch { /* a full disk is not a reason to stop the walk */ }
}

export function finishFirstRun(store: Store): void {
  try { store.setItem(DONE_KEY, '1'); store.removeItem(KEY); } catch { /* as above */ }
}

export function firstRunDone(store: Store): boolean {
  try { return store.getItem(DONE_KEY) === '1'; } catch { return false; }
}

/**
 * WALKING IT AGAIN, ON PURPOSE.
 *
 *  `?firstrun=1` has always done this and a downloaded app has no address bar,
 *  so the only way in was to throw the install away. This forgets that the walk
 *  was ever finished and forgets where it got to, which is what the two keys
 *  hold. IT DELETES NOTHING ELSE: the store, her projects and her settings are
 *  untouched, so walking it again makes one more project rather than replacing
 *  what she has. The ⌘K row says so, because a row that quietly wiped a store
 *  would be the worst thing in the app. */
export function restartFirstRun(store: Store): void {
  try { store.removeItem(DONE_KEY); store.removeItem(KEY); } catch { /* as above */ }
}

/**
 * `?firstrun=1` opens the walk at the beginning; `?firstrun=answer` opens it at
 *  one named step. Anything else is not a step and is refused, because a typo
 *  that silently means "the welcome" is how a shot of the wrong screen gets
 *  filed as the right one. This exists so the walk can be LOOKED AT on a Mac
 *  that is already set up, which is what shooting it needs and what the row
 *  drawing alternatives to the tether needs. */
export const STEPS: Step[] = [
  'welcome', 'folder', 'name',
  'inbox', 'away', 'goal',
  // PICKING THE LOOK SITS HERE, LAST BEFORE THE PRACTICE ROUND.It was beat
  // four, between the name and the introduction. This is the first of the two
  // candidate places, and it is the better of them: everything after this
  // screen is the real app, so the pick is spent on the whole practice round
  // rather than on one card.
  'look', 'hand',
  // WHO IT IS TO SITS BETWEEN OPENING THE CARD AND SENDING IT (2026-10-01),
  // because that is where it is on the card: To is its first line. The walk had
  // no beat for it at all, and the founder named the gap: "we're missing
  // important stuff like: selecting who it's to etc. and sending messages to
  // both people and agents".
  'make', 'who', 'task', 'working', 'open', 'answer',
  'clear', 'snooze', 'unblock', 'where', 'board', 'command', 'done', 'landed',
];

/**
 * THE NEXT SCREEN, READ OFF THE ONE LIST. Every Next in the walk asks this
 *  rather than carrying its own copy of the order. A second copy is what broke
 *  the introduction on 2026-08-24, twice in one build, and moving `look` on
 *  2026-08-25 would have broken it a third time: the introduction's last slab
 *  used to hand straight to the hand-off by name. */
export function nextStep(step: Step): Step | null {
  const i = STEPS.indexOf(step);
  if (i < 0 || i + 1 >= STEPS.length) return null;
  return STEPS[i + 1];
}

/**
 * THE SCREENS THAT WEAR THE WALK'S OWN PICTURE, which is every screen up to
 *  the picker and not the picker itself.
 *
 * IT IS READ OFF `STEPS` AND NOT WRITTEN OUT, because writing it out is what
 * broke it. App.tsx carried the literal list `welcome | folder | name`, which
 * was correct on 2026-08-24 when the picker was beat four and every screen
 * before it was one of those three. The three slabs of the introduction slid in
 * front of it and nothing extended the pin, so those three fell through to
 * whatever the store happened to hold. On a Mac that has never chosen anything
 * the seed makes that Gouache Valley and it looked fine; on a Mac that has
 * chosen, it is whatever was chosen, plain light for example. So on 2026-08-26
 * the theme changed in the middle of the walk: it started on the valley
 * picture and went to light mode on the first slab.
 *
 *  So the rule is stated once, as a position in the one list, and moving the
 *  picker again moves this with it.
 *
 *  THE PICKER ITSELF IS EXCLUDED AND THAT IS THE POINT OF IT. A screen that
 *  paints the default back while she presses tiles is a picker that does not
 *  work; the window repainting under her hand is the whole of what it is for.
 *  Everything AFTER the picker is the real app wearing what she just chose, and
 *  is nothing to do with this. */
export function wearsTheWalksLook(step: Step): boolean {
  const at = STEPS.indexOf(step);
  const picker = STEPS.indexOf('look');
  return at >= 0 && picker >= 0 && at < picker;
}

/**
 * THE FOUR SCREENS OF THE INTRODUCTION, in order, and which slab each of the
 *  first three draws. Kept here rather than in the component so the order is a
 *  value that can be tested. */
export const INTRO: Step[] = ['inbox', 'away', 'goal', 'hand'];
export const SLAB_OF: Partial<Record<Step, number>> = { inbox: 0, away: 1, goal: 2 };

/**
 * THE STEPS THAT HAPPEN INSIDE THE PRACTICE PROJECT. Everything from the
 *  plus to ⌘K: the whole app is scoped to the practice project for
 *  the length of this list and to nothing at all outside it. The finish card is
 *  NOT in here, because by then the practice project is gone and the inbox
 *  behind the card is their own. */
export const IN_PRACTICE: Step[] = [
  'make', 'who', 'task', 'working', 'open', 'answer', 'clear', 'snooze', 'unblock', 'where', 'board', 'command',
];

/** Whether the practice band is on the screen right now. */
export function practising(run: { step: Step; practice: string | null } | null): boolean {
  return !!run && !!run.practice && IN_PRACTICE.includes(run.step);
}

export function forcedStep(param: string | null): Step | null {
  if (!param) return null;
  if (param === '1') return 'welcome';
  return STEPS.includes(param as Step) ? (param as Step) : null;
}

// ---------------------------------------------------------------------------
// THE LAST SCREEN: THE USER'S CLAUDE CODE AGENTS.
//
// The files are read in the main process (main/agent-files.mjs); everything
// here is the part with no window in it, so the screen's shape is tested
// rather than eyeballed.
//
// THE TWO SCOPES ARE CLAUDE CODE'S TWO SCOPES, word for word. An agent file in
// the home folder is available in every project on the Mac, and one inside the
// project folder is available in that project only. So the choice is not a
// switch we invented; it is already the shape of what is on disk,
// and the screen only has to say which is which.

export interface AgentFile {
  name: string;
  /** The name a person would say, so `leon-okafor-qa` reads as Leon Okafor QA. */
  title: string;
  /** One sentence of the agent's own description, already clipped. */
  line: string;
  scope: 'all' | 'project';
  path: string;
}

/* * THE TWO-SIDED SWITCH IS DELETED, and with it
   `AgentGroup`, `agentGroups`, `scopeAtOpen`, `chosenAtOpen` and `toggleAgent`.

   The last screen of the walk draws the import card now (the one ⌘K opens, the
   one approved on 08-26), so nothing reads these any more. They are deleted
   rather than left, because every one of them encodes a rule the approved card
   reverses, and the next session to find them lying here would be
   finding a working switch with tests behind it:

     agentGroups   two sides, `Every project` and `Only this project`. The card
                   has a section per inbox the rows can land in, which on a real
                   Mac is often more than two.
     scopeAtOpen   which side to open on. There are no sides.
     chosenAtOpen  EVERYTHING TICKED at open, or whatever was taken last time.
                   The card opens with NOTHING ticked, which is what makes one
                   project one press.
     toggleAgent   ticking by NAME. The card ticks by PATH, because two folders
                   on one Mac can both hold a `code-reviewer` and ticking by
                   name turns one on by turning the other on.

   Their wording and their reasons are in decisions.md, 08-27, verbatim.
   `anyAgents` stays: the walk still asks it whether there is anything to offer
   before it draws a card at all.
*/

/**
 * Whether there is anything at all in the two folders the walk reads first:
 *  her home folder and this project's own. It is half of what decides whether
 *  the last card appears; the other half is whether any OTHER folder on the Mac
 *  has agents in it, which the card can reach and this cannot see. */
export function anyAgents(found: { user: AgentFile[]; project: AgentFile[] }): boolean {
  return found.user.length + found.project.length > 0;
}

/* * * The walk read `~/.claude/agents` once and kept whatever came back. a tester * reached
 the last card on a Mac with no Claude Code on it, which is exactly * the Mac with no
 `~/.claude/agents` on it either, so what came back was * nothing and nothing was final.
 Claude Code was then installed in front of * her and the offer stayed empty for the rest of
 the walk, because the read * had already happened and could never happen again. * * So: a
 read that FOUND something is an answer and is kept. A read that found * nothing is not an
 answer about her Mac, it is an answer about her Mac a * moment ago, and it is taken again
 when the last card opens and again every * time Check again turns Claude Code up. It is a
 directory listing; asking * twice costs nothing.
*/
export function readAgentsAgain(found: { user: AgentFile[]; project: AgentFile[] } | null): boolean {
  return !found || !anyAgents(found);
}

/**
 * AND WHAT THE CARD KNOWS WHILE THAT SECOND READ IS IN THE AIR.
 *
 * MEASURED 2026-08-25, driving the built renderer through a tester's own case:
 * the second read was taken and the agents still never appeared, because the
 * card had already ended the walk. `finishCard` sends a Mac with no agent files
 * STRAIGHT IN, and the instant Check again turned Claude Code up the card still
 * held the empty answer read a moment earlier on a Mac that had no Claude Code
 * on it. The straight-in effect runs on that commit; the fresh read comes back
 * on a later one, to a component that has already unmounted.
 *
 *  So a Check again that turns Claude Code up forgets the empty answer. `null`
 *  is the state the card already has a rule for (while the Mac is still being
 *  read, nothing is drawn and nothing ends) and it is exactly true here. An answer
 *  that FOUND something is never forgotten, because that one is real. */
export function forgetAgentsWhileLookingAgain(
  found: { user: AgentFile[]; project: AgentFile[] } | null,
  stillMissing: boolean,
): { user: AgentFile[]; project: AgentFile[] } | null {
  if (stillMissing) return found;
  if (found && anyAgents(found)) return found;
  return null;
}

/**
 * AND WHETHER A SECOND READ IS WORTH PUTTING ON THE SCREEN. Nothing the
 *  second time is the same nothing, so the card is left exactly as it is: this
 *  is what stops the rule above from redrawing the card in a loop on the very
 *  Mac it exists for, the one that has no agents and never will during a walk. */
export function keepSecondRead(
  before: { user: AgentFile[]; project: AgentFile[] } | null,
  after: { user: AgentFile[]; project: AgentFile[] },
): boolean {
  return !before || anyAgents(after);
}

/* * * AND THE SAME RULE FOR THE DISK SCAN, which is the other half of the answer * since
 2026-08-27: the card reaches every folder on the Mac with agents in * it, not just her home
 folder and this project's own. That scan looks for * folders holding agent FILES, so on a
 Mac without Claude Code it comes back * empty for exactly the reason the file read does,
 and an empty scan kept is * half of what walks her straight past the offer. A scan that
 found something * is never forgotten, because that one is real.
*/
export function forgetFoldersWhileLookingAgain<T extends { count: number }>(
  folders: T[] | null,
  stillMissing: boolean,
): T[] | null {
  if (stillMissing) return folders;
  if (folders && folders.some((f) => f.count > 0)) return folders;
  return null;
}
/* ------------------ WHEN THE PROJECT CANNOT BE MADE ----------------------- */
/* * THE ONE SCREEN IN THE WALK THAT CAN FAIL, AND UNTIL 2026-08-23 IT FAILED IN SILENCE.

    Nothing was stuck. Submit asked the store to make the project, the store
    refused because a project with that slug was already there, and App.tsx
    caught the refusal into `showToast`. `.toast` is z-index 60 and `.fr-screen`
    is 300 with an opaque background, so the sentence explaining the whole thing
    was painted UNDERNEATH the screen being looked at. Reproduced on 2026-08-23
    against a real store that already had a project of that name:
    `zero:create-product` came back saying it already exists and the screen did
    not move.

    Two things follow, and they are separate.

    THE WALK CAN RUN OVER A STORE THAT IS NOT EMPTY. `firstRunNeeded` is only
    consulted on the automatic path; ⌘K's "Walk through onboarding again"
    (`walkAgain` in App.tsx) sets the run directly, which is the whole point of
    it. So a name collision is not an exotic state, it is the NORMAL state for
    anybody walking it a second time, and every folder she is likely to point at
    is one she has already made a project for.

    AND A REASON THAT CANNOT BE READ IS NOT A REASON. This maps whatever the
    store said into a sentence the card can show, with a way out in it. The
    default keeps the store's own words rather than inventing better ones,
    because a message nobody predicted is still worth more than "something went
    wrong".
*/
export function whyNotMade(message: string, name: string): string {
  const said = String(message ?? '').trim();
  if (/already exists/i.test(said)) return COPY.takenName(name);
  if (/needs a name/i.test(said)) return COPY.emptyName;
  const bare = said.replace(/^Error invoking remote method '[^']*':\s*/i, '').replace(/^Error:\s*/i, '');
  return COPY.notMade(bare ? (/[.!?]$/.test(bare) ? bare : `${bare}.`) : 'It did not say why.');
}
