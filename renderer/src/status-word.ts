// WHAT ONE THREAD IS DOING, IN ONE WORD AND ONE MARK (w-ec2b04d449).
//
// The words are not new: `live-line.ts` has owned them since August and the
// foot of every conversation says them. What was missing is that the list, the
// board and the summary panel did not, so eight threads under IN PROGRESS 8
// read as eight threads with agents on them while two had one.
//
// So this answers for ANY row, in or out of In progress, by asking live-line
// first and falling back to the thread's own state word. One function, because
// three surfaces were going to answer it three ways.
import { liveLine, shortWord, type LiveFacts } from './live-line';
import { STATE_WORD, stateWordOf } from './threads/summary-rules';
import { threadState } from '../../shared/thread-cards.mjs';
import { closedUnshipped, notShippedLine, shippedAs } from '../../shared/not-shipped.mjs';
import { asksWho, isAuto } from '../../shared/auto-route.mjs';
import type { ThreadStateWord, WorkItem } from './types';
import type { Fleet } from './fleet';
import { whyWords, type WhyCard } from './where-why';

/** The mark's shape. The accent ring is the one worth a look: nothing is going
 *  to start that thread until something changes. */
export type StatusMark = 'working' | 'queued' | 'held' | 'need' | 'sched' | 'done';

export interface StatusCell {
  word: string;
  mark: StatusMark;
  /**
   * THIS IS ABOUT AN AGENT, NOW: working, waiting its turn, or held. The other
   * words are the thread's own state, which the tab over the list and the
   * column over the board have already said, so the row draws no mark beside
   * them: three accent dots down a Needs you column say "needs you" three more
   * times and nothing else. */
  agent: boolean;
  /** An agent is on it this second, so the mark turns. */
  live: boolean;
  /** And the run is in the cloud, which the mark says instead. */
  cloud: boolean;
  /** The whole sentence, for the hover, where there is more to say. */
  title?: string;
  /** Why it is not in the cloud, for the card under the word (./where-why.ts). */
  why?: WhyCard;
}

export interface StatusFacts extends LiveFacts {
  /** The thread's state, where the surface drawing it already knows (the
   *  board's column). Worked out from the thread itself otherwise. */
  state?: ThreadStateWord;
  /**
   * WHETHER THIS ROW IS IN THE TUTORIAL'S PRACTICE PROJECT. The supervisor
   *  refuses to spawn there at all, so the fleet's silence about one of its
   *  rows says nothing about that row: the same rule as `fleetUnread` below.
   *  Three In progress cards read NOTHING RUNNING under a tutorial card
   *  saying In progress is what agents are doing. */
  practice?: boolean;
}

// Waiting its turn resolves itself; held does not. That is the whole of why
// they wear different marks.
const WAITING_ITS_TURN = new Set(['queued', 'next', 'shipping']);

export function statusCell(item: WorkItem, facts: StatusFacts = {}): StatusCell {
  const now = facts.now ?? Date.now();
  const state = facts.state ?? (threadState(item, now) as ThreadStateWord);
  // `agent` on the words about an agent, and off the four state words.
  const says = (word: string, mark: StatusMark, agent: boolean, title?: string): StatusCell => ({ word, mark, agent, live: false, cloud: false, title });
  const plain = (word: string, mark: StatusMark) => says(word, mark, false);
  // Said over "Waiting" and "Done", which do not tell a shipped thread from
  // one that never shipped (shared/not-shipped.mjs).
  const ship = shippedAs(item);
  const shipped = ship ? says('Shipped', 'done', false, ship.sha ? `Shipped to main as ${ship.sha}` : 'Shipped to main') : null;

  if (state === 'done') {
    if (shipped) return shipped;
    if (closedUnshipped(item)) return says('Not shipped', 'done', false, 'Closed without its work reaching main');
    return plain(stateWordOf(item, state), 'done');
  }
  // Sent to Auto and not given to anyone yet (shared/auto-route.mjs). Ahead of
  // Stopped: a thread that asks her is on the supervisor's stalled list, and no
  // agent died on it.
  if (isAuto(item)) {
    return asksWho(item)
      ? says('Asks you who', 'need', false, 'Auto could not tell which teammate should take this. Open it to pick.')
      : says('Assigning', 'queued', true, 'Auto is picking who takes this.');
  }
  // The bar over the conversation owns the whole story of a dead worker; the
  // row says the one word, because a row that says nothing reads as a row
  // nothing has happened on.
  if (facts.stalled) return says('Stopped', 'held', true, 'The agent that was on this died without finishing. Send it a message to start it again.');
  if (state === 'scheduled') return plain(stateWordOf(item, state), 'sched');

  const live = liveLine(item, { ...facts, stalled: false });
  // `asking` HAS NO BRANCH OF ITS OWN. It had one, giving it the solid `need`
  // dot, which this column draws for no other word; the fall-through at the
  // foot gives it the accent ring every other held agent wears, which is the
  // mark that already means nothing starts until something changes.
  const away = facts.whyNotCloud ?? null;
  const why = away ? whyWords(away) : undefined;
  const titled = (line: string) => (why ? `${why.head}. ${why.body}` : line);
  if (live?.state === 'working') {
    const cloud = facts.session?.where === 'cloud';
    const local = !cloud && away?.at === 'mac';
    return {
      word: local ? (away?.why === 'moving' ? 'Moving to cloud' : 'Working locally') : shortWord('working'), mark: 'working', agent: true, live: true, cloud,
      title: local ? titled(live.line) : live.line, ...(local ? { why } : {}),
    };
  }
  // Over "Waiting": the agent's last word, written before, says it ships.
  const unshipped = notShippedLine(item);
  if (unshipped) return says('Not shipped', 'need', false, unshipped);
  // "NOTHING RUNNING" IS A CLAIM ABOUT THE WHOLE FLEET, and so is an agent
  // being on it outside this window, which says none of ours is. Both are only
  // said where the fleet has really been read: a surface drawn without it (a
  // card in a test, a thread opened before the first snapshot) knows nothing,
  // and a row saying nothing is happening on the strength of knowing nothing is
  // the confident wrong sentence this vocabulary exists to prevent. Nothing
  // running over our own session, open between Remote Control turns, is wrong
  // the same way.
  const fleetUnread = !Array.isArray(facts.queued) || !!facts.practice;
  if ((live?.state === 'idle' && (fleetUnread || facts.remoteHeld)) || (live?.state === 'elsewhere' && fleetUnread)) {
    return plain(stateWordOf(item, state), 'queued');
  }
  // Drawn as one of ours is: the cloud when a cloud run holds it, the half-dot otherwise.
  if (live?.state === 'elsewhere') {
    return { word: shortWord('elsewhere'), mark: 'working', agent: true, live: true, cloud: !!item.claim?.holder?.startsWith('mcp-cloud-'), title: live.line };
  }
  if (live) {
    const waiting = WAITING_ITS_TURN.has(live.state) && live.state !== 'shipping' && (away?.at === 'wait-cloud' || away?.at === 'wait-mac');
    const cell = says(shortWord(live.state), WAITING_ITS_TURN.has(live.state) ? 'queued' : 'held', true, waiting ? titled(live.line) : live.line);
    return waiting ? { ...cell, why } : cell;
  }
  if (state === 'waiting' && shipped) return shipped;
  return plain(stateWordOf(item, state), state === 'waiting' ? 'need' : 'queued');
}

/**
 * A TEAMMATE'S THREAD, whose card is all this Mac knows of it. Their card
 * publishes one of the four states and nothing about agents, so that is what
 * the Status cell says: a hole in the column would read as a thread nothing
 * knows anything about.
 */
export function cardStatus(state: ThreadStateWord): StatusCell {
  return { word: STATE_WORD[state], mark: state === 'running' ? 'queued' : state === 'waiting' ? 'need' : state === 'scheduled' ? 'sched' : 'done', agent: false, live: false, cloud: false };
}

/** One thread's facts, read off the fleet by id and nothing else. */
export function factsFor(fleet: Fleet, id: string): LiveFacts {
  return {
    session: fleet.sessions?.get(id) ?? null,
    queued: fleet.queued,
    remoteHeld: !!fleet.remoteHeld?.includes(id),
    runNow: fleet.runNow,
    signInNeeded: fleet.signInNeeded,
    atLimit: fleet.atLimit,
    cannotStart: fleet.cannotStart,
    shipping: !!fleet.shipping?.includes(id),
    asking: !!fleet.asking?.includes(id),
    stalled: !!fleet.stalled?.includes(id),
    silent: fleet.silent?.[id] ?? null,
    paused: !!fleet.paused,
    whyNotCloud: fleet.whyNotCloud?.[id] ?? null,
  };
}

/**
 * WHETHER A CARD SAYS IT. A board is a board: its column already says Waiting
 * over every card in it, so a card repeating the column's own word is text
 * that costs a line and carries nothing. The word goes inside the card exactly
 * where it says something the column does not.
 */
export function saysOnCard(status: StatusCell, item: WorkItem, state: ThreadStateWord): boolean {
  return status.word !== stateWordOf(item, state);
}
