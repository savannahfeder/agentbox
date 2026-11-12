// WHAT A THREAD ON THE PHONE APP OFFERS, by the phone site's own rules: the
// presses components/Focus.tsx and Thread.tsx draw, the live line Live.tsx
// draws, the level a thread shows and its summary's steps and age.

import { dayLabel } from '../../../renderer/src/format';
import { hiddenUntil, parkedByAgent } from '../../../renderer/src/list-rules';
import { liveLine, livePlace, shortSpan, shortWord, type LiveFacts } from '../../../renderer/src/live-line';
import { priorityIdOf, type PriorityId } from '../../../renderer/src/priority';
import { offersRunNow } from '../../../renderer/src/run-now';
import { splitSlug, type PhoneItem } from '../../../renderer/src/phone-rows';
import { updatedWord } from '../../../renderer/src/threads/summary-rules';
import { offersTryAgain } from '../../../renderer/src/try-again';
import { whyItCannotMove } from '../../../shared/move-thread.mts';
import { shownPriority } from '../../../shared/rank.mts';
import { ruleIdOf } from '../../../shared/repeats.mts';
import { doneSteps, summaryOf } from '../../../shared/thread-cards.mts';
import type { RunningSession, WorkItem } from '../../../renderer/src/types';

export interface Session { startedAt: number; activity?: { id: string; label: string; detail: string; startedAt?: number }[]; helpers?: number; engine?: string; where?: string; movable?: boolean }
// What the computer said of the thread when nothing runs on it (phone-rows.ts `waitFacts`), so waiting reads Queued.
type Waits = Pick<LiveFacts, 'queued' | 'runNow' | 'signInNeeded' | 'atLimit' | 'paused' | 'stalled' | 'shipping' | 'asking'>;
interface Facts extends Waits {
  session: Session | null; inProgress: boolean; now: number;
  /** Its computer leaves this project's threads ready for the cloud (phone-rows.ts `projects[].cloud`). */
  cloud?: boolean;
}

// The desktop's word for a thread a dead worker left (status-word.ts), and its bar's words over the conversation (Focus.tsx `stalled-bar`).
const STOPPED = { word: 'Stopped', line: 'The agent stopped without finishing this.', waiting: 'The agent stopped without finishing this. Your answer is still waiting.' };

/**
 * Where the thread runs, as the desktop's threadPlace (cloud-menu.ts) reads it
 * from what the phone has: 'here' free to go to the cloud, 'kept' on the
 * computer, 'cloud' there now. A run the cloud could take now is Move to cloud.
 */
export type Place = 'here' | 'kept' | 'cloud';
function placeOf(item: Pick<WorkItem, 'onMac'>, session: Session | null, cloud: boolean): Place | null {
  if (!cloud || (session?.movable && session.where !== 'cloud')) return null;
  if (item.onMac) return 'kept';
  return session?.where === 'cloud' ? 'cloud' : 'here';
}
/** The desktop's PLACE_ROW (threads/ThreadMenu.tsx), with the phone's word for the Mac. */
export const PLACE_ROW: Record<Place, { label: string; detail: string; keep: boolean }> = {
  cloud: { label: 'Run on your computer', detail: 'In the cloud now', keep: true },
  here: { label: 'Keep on your computer', detail: 'Cloud allowed', keep: true },
  kept: { label: 'Run on the cloud', detail: 'Your computer only', keep: false },
};

// Focus.tsx `whenLabel`.
const whenLabel = (ts: number, now: number) => `${dayLabel(ts, now).toLowerCase()} ${new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

/** When the thread comes back on its own: App.tsx `returnAt`. */
export const returnAt = (item: WorkItem) => Math.max(Number(item.runAt) || 0, hiddenUntil(item));

export function offersOf(item: PhoneItem, { session, inProgress, now, cloud = false, ...waits }: Facts) {
  const back = returnAt(item);
  const byAgent = parkedByAgent(item, now);
  // A thread its computer has made, and not an agent's own session.
  const made = !item.agent && !item.waitsForMac;
  const open = made && item.status !== 'done';
  const tryAgain = made && offersTryAgain(item, { ...waits, session: session as RunningSession | null, inProgress, now });
  return {
    rename: made,
    // The desktop's menu offers a level and a move only while the thread is open (Focus.tsx `canFinish`).
    priority: open,
    reopen: made && item.status === 'done',
    tryAgain,
    // ⌘K's "Restart the agent (it stopped)".
    restart: made && !!waits.stalled && !tryAgain,
    // ⌘K's "Resume this agent (reopen and carry on)". Only on a closed thread: an open one is waiting for
    // your answer, and putting an agent back on it without one is not what this menu is for.
    resume: (made && !tryAgain && !session && !inProgress && item.status === 'done' ? 'done' : null) as 'done' | null,
    place: open ? placeOf(item, session, cloud) : null,
    move: made && whyItCannotMove(item) === null,
    // In the open reply box's send slot while nothing is typed (Focus.tsx `stopButton`).
    stop: inProgress && !item.agent,
    runNow: offersRunNow(item, { session: session as RunningSession | null, queued: [], runNow: [], inProgress }),
    // A run on the computer the cloud could take now (Supervisor#liveFor).
    moveToCloud: !!session?.movable && session.where !== 'cloud' && !item.agent,
    // Only a running Claude Code step can be cut (ItemThread.tsx).
    sendNow: !!session && session.engine !== 'codex',
    sendBack: !item.agent && item.status === 'blocked' && !session,
    back: item.start !== 'later' && back > now
      ? {
        label: byAgent ? 'let it run now' : 'back to inbox',
        dim: `${(Number(item.snoozedUntil) || 0) > now ? 'in Later until' : byAgent ? 'the agent paused this until' : 'scheduled for'} ${whenLabel(back, now)}`,
      }
      : null,
    // Later's "Now (back to inbox)" (App.tsx, the Snooze's `onNow`).
    laterNow: back > now,
  };
}

export type Offers = ReturnType<typeof offersOf>;

/** The other projects on the thread's own computer, which a move can go to. */
export function moveChoices(item: { product: string }, products: readonly { slug: string; name: string }[]) {
  const device = splitSlug(item.product)?.device;
  return products.filter((p) => p.slug !== item.product && !!device && splitSlug(p.slug)?.device === device).map(({ slug, name }) => ({ slug, name }));
}

/** The repeating task this thread is a run of, while its computer still keeps it. */
export function ruleFor(item: { product: string; labels?: string[] }, rules: readonly { product: string; id: string; title: string }[]) {
  const id = ruleIdOf(item);
  const rule = id ? rules.find((r) => r.product === item.product && r.id === id) : null;
  return rule ? { product: rule.product, id: rule.id, title: rule.title } : null;
}

/** The line under the conversation while an agent is on it, or what is true instead. */
export function liveOf(item: WorkItem, { session, inProgress, now, cloud: _cloud, ...waits }: Facts) {
  if (waits.stalled && !session && item.status !== 'done' && !item.agent) {
    const line = item.answer && item.answer !== '(withdrawn)' ? STOPPED.waiting : STOPPED.line;
    return { state: 'stalled' as const, working: false, line, word: STOPPED.word, more: 0, span: null, rows: [] };
  }
  const live = liveLine(item, { session: session as RunningSession | null, inProgress, now, ...waits });
  if (!live) return null;
  const working = live.state === 'working';
  const activity = session?.activity ?? [];
  return {
    state: live.state,
    working,
    line: live.line,
    word: working ? (activity[activity.length - 1]?.label || 'Thinking') : live.state === 'signin' || live.state === 'limit' ? live.line : shortWord(live.state, session?.helpers ?? 0),
    more: Math.max(0, activity.length - 1),
    span: session ? shortSpan(Math.max(0, now - session.startedAt)) : null,
    // "in the cloud" on a cloud run, as the web app's working line ends (live-line.ts `livePlace`).
    place: livePlace({ session: session as RunningSession | null }, { tab: true })?.word ?? null,
    rows: activity.map((a) => ({ label: a.label, detail: a.detail })),
  };
}

export type Live = NonNullable<ReturnType<typeof liveOf>>;

// components/ThreadsMade.tsx's words. That file draws for a browser, with its
// stylesheet, so the app cannot load it; a test holds the two the same.
export const FILED_WORDS = { START_NEW: 'New thread', DO_HERE: 'Do here', DISMISS: 'Dismiss' };
export const waitingWords = (n: number): string => `${n} proposal${n === 1 ? '' : 's'} waiting on you`;

/** The level a thread shows is the level it runs at. */
export const shownLevel = (item: Pick<WorkItem, 'priority'>): PriorityId => priorityIdOf(shownPriority(item));

export function summaryParts(item: WorkItem, now: number) {
  return { steps: doneSteps(summaryOf(item).progress) as string[], updated: updatedWord(item, { me: null, now }) };
}
