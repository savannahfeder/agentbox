// A THREAD'S STATE, ITS SUMMARY, AND THE CARD A TEAMMATE SEES OF IT.
//
// Approved 2026-10-01 (w-e731ca9376). Three pure rules, shared by the Mac that
// publishes cards (main/team) and the window that draws them (renderer), so
// the owner and a teammate are always shown the same words.
//
//   threadState  one of four states and only four: waiting, running,
//                scheduled, done. A status is always one of those
//                predefined states, never "needs your pick".
//   summaryOf    problem, progress and solution. The agent keeps them
//                current (update_work_item); until it has written one, the
//                ask and the latest word on the thread stand in, so a new
//                thread is never a blank summary.
//   cardsFor     every thread worth showing the team, as a card: the summary
//                and nothing more; a card never adds information. A
//                private thread publishes no card at all (decided 2026-10-01
//                from user research): not a wordless one, not a count.

import { shownPriority } from './rank.mts';
import { isTaskRow, taskGiver } from './team-rules.mts';
import { deadlineOf, type TaskRow } from './team-tasks.mts';
import { isShippedNote } from './shipped-note.mts';
import { shownTitle, withoutFiles } from './thread-title.mts';

export const THREAD_STATES = ['waiting', 'running', 'scheduled', 'done'] as const;
export type ThreadState = typeof THREAD_STATES[number];

export interface CardItem extends TaskRow {
  start?: string;
  runAt?: number;
  claim?: unknown;
  claimExpired?: boolean;
  kind?: string;
  result?: string;
  note?: string;
  problem?: string;
  progress?: string;
  solution?: string;
  shippedAt?: number;
  visibleTo?: readonly string[];
  blocks?: readonly string[];
  priority?: number | null;
}

export type ProjectSeen = { personal?: boolean; seenBy?: string; seenByPeople?: readonly string[] } | null | undefined;
export type Visibility = 'team' | 'people' | 'private';
type Linked = { id: string; title: string | null };

// A type, not an interface, so it goes up among the cloud's cards (main/team/sync.mts SyncCard).
export type OwnCard = {
  threadId: string;
  visible: boolean;
  title: string | null;
  project: string | null;
  people: string[] | null;
  state: ThreadState;
  priority: number | null;
  problem: string | null;
  progress: string | null;
  solution: string | null;
  blockedBy: Linked[];
  blocks: Linked[];
  updatedAt: number;
  shippedAt?: number;
  task?: { from: string | null; dueAt?: number; clock?: boolean };
};

/** Which of the four states a thread is in. */
export function threadState(item: CardItem, now = Date.now()): ThreadState {
  if (item.status === 'done') return 'done';
  // A thread in Later is not running and nobody has to act on it, which is the
  // scheduled family. It has no moment, so what it SAYS is "Not started"
  // (threadStateWords in the window); the four card states are unchanged.
  if (item.start === 'later') return 'scheduled';
  if (Number.isFinite(item.runAt) && item.runAt! > now) return 'scheduled';
  if (item.status === 'claimed' && item.claim && !item.claimExpired) return 'running';
  // Sent to an agent and not yet picked up: it is about to run, nobody has to
  // act on it, so it is not waiting on anyone. A blocked one, like a hand-off
  // held for your yes, is waiting on you.
  const sentToAnAgent = item.status !== 'blocked' && (item.labels ?? []).includes('founder') && !item.result && !item.note
    && item.kind !== 'question' && item.kind !== 'review' && !personHolds(item);
  return sentToAnAgent ? 'running' : 'waiting';
}

const personHolds = (item: CardItem) => typeof item.assignee === 'string' && item.assignee !== 'agent';

// ONLY EMPHASIS IS STRIPPED, AND ONLY WHERE IT IS A PAIR (w-a33b339772).
//
// This used to be `.replace(/[*_`>]/g, '')`: every star, underscore, backtick
// and angle bracket in the text, gone. A pasted search command
// (`--include=*.md --include=*.json`) lost all three of its stars on the
// summary line, and `user_id_v2` came back as `useridv2`.
//
// A pair is a mark, then a WORD character, then the closing mark: that is what
// `*bold*` looks like and what a glob never does, because a glob's star is
// followed by a dot or a slash. Underscores have to clear the word on either
// side too, or `user_id_v2` reads as emphasis around `id`. A mark with no
// partner is left exactly where the person put it.
const EMPHASIS: [RegExp, string][] = [
  [/\*\*(\w[^*\n]*?)\*\*/g, '$1'],
  [/(?<!\w)__(\w[^_\n]*?)__(?!\w)/g, '$1'],
  [/\*(\w[^*\n]*?)\*/g, '$1'],
  [/(?<!\w)_(\w[^_\n]*?)_(?!\w)/g, '$1'],
  [/`([^`\n]+)`/g, '$1'],
];

// WHERE A SENTENCE REALLY ENDS. The old cut was "any of .!? then a space", so
// the lone ` . ` that means "this directory" ended the sentence and the
// summary showed `grep -r foo .` and nothing else. A full stop ends a sentence
// when it closes a word AND what follows is a new sentence: whitespace then a
// capital (through an opening quote or bracket), or the end of the text.
const SENTENCE = /^(.+?\w[.!?]["'”’)\]]?)(?=\s+["“'(\[]?[A-Z]|\s*$)/;

// The first sentence of some prose, without markdown, short enough for a line.
export function firstSentence(text: string | null | undefined, max = 240): string {
  if (typeof text !== 'string') return '';
  let plain = withoutFiles(text)
    .replace(/^#+\s.*$/gm, '')
    .replace(/^##\s*Options[\s\S]*$/m, '')
    // A blockquote's mark is the one at the start of its line. Elsewhere `>`
    // is a redirect or an arrow and belongs to whoever typed it.
    .replace(/^\s*>\s?/gm, '');
  for (const [re, to] of EMPHASIS) plain = plain.replace(re, to);
  plain = plain.replace(/\s+/g, ' ').trim();
  const m = plain.match(SENTENCE);
  const one = (m ? m[1] : plain).trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max - 1);
  return `${(cut.replace(/\s+\S*$/, '') || cut).trimEnd()}…`;
}

// HOW LONG A SUMMARY LINE AN AGENT WRITES MAY BE (w-b51b2e1c86): about four
// lines of the panel, so the name, the three lines and the properties fit one
// window without scrolling. Asked for on 2026-10-04 off a summary of 50, 63 and
// 95 words that ran the properties off the bottom; agents' lines then ran a
// median of 30 to 36 words. The store tool refuses a longer one
// (mcp/core/work.mts); a person's own edits are not limited.
export const SUMMARY_WORDS = 25;

// THE SUMMARY IS CONTEXT, THEN DONE (w-54e9c7243f, 2026-10-05). `problem` is
// drawn as Context, a few sentences that bring the thread back to mind, and
// `progress` as Done, the steps taken so far, one per line, newest last.
// `solution` is no longer asked for or drawn. Measured on the approved
// pictures: about 35 words of context filled five lines and was enough to
// answer from; steps ran 4 to 15 words, and six left the properties on screen.
// The old field names stay so the team cloud needs no migration.
export const CONTEXT_WORDS = 45;
export const DONE_STEPS = 6;
export const DONE_STEP_WORDS = 15;

export function wordsIn(text: string | null | undefined): number {
  return typeof text === 'string' ? text.split(/\s+/).filter(Boolean).length : 0;
}

/** The Done steps in `progress`: one per line, the marks a writer puts in front of a step taken off. */
export function doneSteps(progress: string | null | undefined): string[] {
  if (typeof progress !== 'string') return [];
  return progress.split('\n').map((l) => l.trim().replace(/^(?:[-*•✓✔]\s*)+/, '').trim()).filter(Boolean);
}

/** The thread's summary: what the agent or the person wrote, else stand-ins. */
export function summaryOf(item: CardItem): { problem: string; progress: string; solution: string; written: boolean } {
  const has = (f: 'problem' | 'progress' | 'solution') => typeof item[f] === 'string';
  // A finished turn's result is what was done, so it stands in for the
  // Solution, and a checkpoint for the Progress. Read the other way round, a
  // persona saw "Progress: Done: ..." over "Solution: Not written yet" and
  // could not tell whether the thread was finished or stuck.
  // A result that asks something is still progress: the thread waits on its
  // owner's answer, and nothing is solved yet.
  const said = firstSentence(item.result || '');
  const asks = said.endsWith('?');
  return {
    problem: has('problem') ? item.problem! : firstSentence(item.body || item.title),
    progress: has('progress') ? item.progress! : (asks ? said : firstSentence(item.result ? '' : item.note || '')),
    solution: has('solution') ? item.solution! : (asks ? '' : said),
    written: has('problem') || has('progress') || has('solution'),
  };
}

const startOfDay = (now: number) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

// How long a finished thread stays in the cloud: long enough to list a week's
// shipped work and to tell someone who was away. Boards still draw only today's.
const FINISHED_CARDS_KEPT_MS = 7 * 86_400_000;

/** When this thread shipped: a person's word, else the app's own note once its merge lands. An agent saying so does not count. */
export function shippedAtOf(item: Pick<CardItem, 'shippedAt' | 'note' | 'wrote'> | null | undefined): number | null {
  if (Number.isFinite(item?.shippedAt)) return item!.shippedAt! > 0 ? item!.shippedAt! : null;
  if (isShippedNote(item?.note) && item?.wrote?.note?.source === 'system') return item.wrote.note.ts ?? null;
  return null;
}

/**
 * One card per thread worth showing the team: every open thread, and the ones
 * finished today. Message threads between two people are never carded; they
 * are nobody else's business and they are not work. Nor is a private thread.
 */
/**
 * NOTHING FROM BEFORE YOU JOINED IS SHARED UNLESS YOU SHARE IT (2026-10-01).
 * Her own store holds hundreds of threads written for nobody but her, and the
 * first sign-in would have put a summary of every one of them on the team's
 * board. So a thread is shown when it was marked Team, or when it is not
 * private and was started after `since`, the moment this person began sharing
 * on this Mac. No `since` is the old rule: everything not private.
 */
/**
 * AND A THREAD MAY BE SHARED WITH CHOSEN PEOPLE RATHER THAN THE TEAM
 * (w-41ff964775: a thread may be seen by a few people, not only by everyone
 * or nobody). That is still sharing, so this stays the one rule for
 * whether a card is published at all, and `shownToPeople` says who it reaches.
 *
 * Chosen people naming NOBODY reaches nobody, so nothing is published: a card
 * carrying an empty list would otherwise read as the whole team's, and that is
 * the one mistake nobody can take back.
 */
// A THREAD WITH NO WORD OF ITS OWN FOLLOWS ITS PROJECT (w-b989839656). A
// thread from before you joined still stays yours whatever the project says.
export function shownToTeam(
  item: Pick<CardItem, 'visibility' | 'visibleTo' | 'createdAt'> | null | undefined,
  since: number | null = null,
  product: ProjectSeen = null,
): boolean {
  const own = ownVisibility(item);
  if (own === 'team') return true;
  if (own === 'people') return shownToPeople(item, product).length > 0;
  if (own === 'private') return false;
  if (since && (item?.createdAt ?? 0) < since) return false;
  return projectSeenBy(product).who !== 'private';
}

const ownVisibility = (item: { visibility?: string } | null | undefined): Visibility | undefined => {
  const v = item?.visibility;
  return v === 'team' || v === 'people' || v === 'private' ? v : undefined;
};
const cleanIds = (ids: unknown): string[] => [...new Set((Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && !!id))];

/**
 * WHO SEES A PROJECT'S THREADS (w-b989839656, approved 2026-10-05). Projects
 * stay on each Mac; what a project decides is only whose Team page its
 * threads' summaries reach. 'private' (Just you), 'team', or 'people' with
 * the people named. A project from before this setting existed keeps the team,
 * which is what it already did; a new one is made Just you (main/store.mts);
 * My Workspace is Just you whatever its file says. Chosen people naming nobody
 * reaches nobody, so it reads as Just you and never as the team.
 */
export function projectSeenBy(product: ProjectSeen): { who: Visibility; people: string[] } {
  if (product?.personal === true || product?.seenBy === 'private') return { who: 'private', people: [] };
  if (product?.seenBy === 'people') {
    const people = cleanIds(product.seenByPeople);
    return people.length ? { who: 'people', people } : { who: 'private', people: [] };
  }
  return { who: 'team', people: [] };
}

/**
 * THE WORD A THREAD'S VISIBILITY READS AS, once its project has had its say:
 * its own word if it has one, else its project's. Undefined where the project
 * leaves it to the team, so the "before you joined" rule still applies.
 * Failing closed on the project, rather than writing a word on each new
 * thread, is what covers every path a thread arrives by at once: the
 * composer, an agent filing a proposal, a repeat.
 */
export function visibilityOf(item: { visibility?: string } | null | undefined, product: ProjectSeen = null): Visibility | undefined {
  const own = ownVisibility(item);
  if (own) return own;
  const { who } = projectSeenBy(product);
  return who === 'team' ? undefined : who;
}

/** Whom a shared thread reaches, by id, or [] for the whole team. */
export function shownToPeople(item: Pick<CardItem, 'visibility' | 'visibleTo'> | null | undefined, product: ProjectSeen = null): string[] {
  const own = ownVisibility(item);
  if (own === 'people') return cleanIds(item!.visibleTo);
  if (own) return [];
  const seen = projectSeenBy(product);
  return seen.who === 'people' ? seen.people : [];
}

// A TASK YOU HOLD COUNTS ON YOUR CARD. With no words unless its giver let the
// team read it: then its name, level, deadline and block, so anyone can list
// every task on the team.
function heldTaskCard(item: CardItem & { id: string }, now: number, me: string | null): OwnCard {
  const seen = item.visibility === 'team' ? null : item.visibility === 'people' ? cleanIds(item.visibleTo) : undefined;
  if (seen === undefined || (seen && !seen.length)) {
    return {
      threadId: item.id, visible: true, title: null, project: null, people: null, state: 'waiting', priority: null,
      problem: null, progress: null, solution: null, blockedBy: [], blocks: [], updatedAt: item.updatedAt ?? now,
    };
  }
  const due = deadlineOf(item, me);
  return {
    threadId: item.id, visible: true, title: shownTitle(item), project: 'Task', people: seen,
    state: item.status === 'done' ? 'done' : 'waiting', priority: shownPriority(item),
    problem: null, progress: null, solution: null,
    blockedBy: (item.blockedBy ?? []).map((id) => ({ id, title: null })), blocks: [], updatedAt: item.updatedAt ?? now,
    task: { from: taskGiver(item), ...(due ? { dueAt: due.at, clock: due.clock } : {}) },
  };
}

export interface CardProduct {
  name: string;
  personal?: boolean;
  seenBy?: string;
  seenByPeople?: readonly string[];
  team?: { direct?: unknown } | null;
}

export function cardsFor<P extends CardProduct>({ products, readItems, now = Date.now(), since = null, me = null, running = [] }: {
  products: readonly P[];
  readItems: (product: P) => readonly (CardItem & { id: string })[];
  now?: number;
  since?: number | null;
  me?: string | null;
  running?: Iterable<string>;
}): OwnCard[] {
  const live = new Set(running);
  const cards: OwnCard[] = [];
  const titleOf = new Map<string, string | null>();
  const all: { item: CardItem & { id: string }; product: P }[] = [];
  for (const product of products) {
    if (product.team?.direct) {
      for (const item of me ? readItems(product) : []) {
        if (item.agent || !isTaskRow(item) || item.assignee !== me) continue;
        if (item.status !== 'done') { cards.push(heldTaskCard(item, now, me)); continue; }
        // A finished one the team can read stays a week, so a task blocked on it sees it finish.
        if (item.visibility && item.updatedAt! >= startOfDay(now - FINISHED_CARDS_KEPT_MS)) {
          const card = heldTaskCard(item, now, me);
          if (card.title != null) cards.push(card);
        }
      }
      continue;
    }
    for (const item of readItems(product)) {
      if (item.agent) continue;
      // A LINK NAMES A THREAD ONLY IF THAT THREAD IS ITSELF VISIBLE. A public
      // card that is blocked by a private thread said the private thread's
      // title out loud (review, 2026-10-01); now it says only that one exists.
      //
      // A thread shared with chosen people is named by nothing either
      // (w-41ff964775): every card is read by its own set of people, and a
      // blocker shared with two of them would have told a third its title.
      // Only a thread the whole team may read is safe in anybody's links.
      const open = shownToTeam(item, since, product) && !shownToPeople(item, product).length;
      titleOf.set(item.id, open ? shownTitle(item) : null);
      all.push({ item, product });
    }
  }
  const linked = (ids: unknown): Linked[] => (Array.isArray(ids) ? ids : []).map((id) => ({ id, title: titleOf.get(id) ?? null }));
  const kept = startOfDay(now - FINISHED_CARDS_KEPT_MS);
  for (const { item, product } of all) {
    if (!shownToTeam(item, since, product)) continue;
    // A session the folded row cannot show: a personal worker holds no claim,
    // and its second turn has a result on the row, which reads as waiting.
    const state = live.has(item.id) ? 'running' : threadState(item, now);
    if (state === 'done' && !(item.updatedAt! >= kept)) continue;
    const s = summaryOf(item);
    const shippedAt = shippedAtOf(item);
    cards.push({
      threadId: item.id, visible: true, title: shownTitle(item), project: product.name,
      // WHO IT REACHES: the chosen people, or NO LIST AT ALL for the whole
      // team. Never an empty list, which would have to mean both. Both clouds
      // carry it and refuse to show the card to anybody else.
      people: shownToPeople(item, product).length ? shownToPeople(item, product) : null,
      // The level it runs at, so a teammate reads what the owner reads.
      state, priority: shownPriority(item),
      problem: s.problem || null, progress: s.progress || null, solution: s.solution || null,
      blockedBy: linked(item.blockedBy), blocks: linked(item.blocks), updatedAt: item.updatedAt ?? now,
      ...(shippedAt ? { shippedAt } : {}),
    });
  }
  return cards;
}
