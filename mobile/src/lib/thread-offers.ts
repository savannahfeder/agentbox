// WHAT A THREAD ON THE PHONE APP OFFERS, by the phone site's own rules: the
// presses components/Focus.tsx and Thread.tsx draw, the live line Live.tsx
// draws, the level a thread shows and its summary's steps and age.

import { dayLabel } from '../../../renderer/src/format';
import { hiddenUntil, parkedByAgent } from '../../../renderer/src/list-rules';
import { liveLine, shortSpan, shortWord } from '../../../renderer/src/live-line';
import { priorityIdOf, type PriorityId } from '../../../renderer/src/priority';
import { offersRunNow } from '../../../renderer/src/run-now';
import { updatedWord } from '../../../renderer/src/threads/summary-rules';
import { shownPriority } from '../../../shared/rank.mjs';
import { doneSteps, summaryOf } from '../../../shared/thread-cards.mjs';

export interface Session { startedAt: number; activity?: { id: string; label: string; detail: string; startedAt?: number }[]; helpers?: number; engine?: string }
interface Facts { session: Session | null; inProgress: boolean; now: number }

// Focus.tsx `whenLabel`.
const whenLabel = (ts: number, now: number) => `${dayLabel(ts, now).toLowerCase()} ${new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

/** When the thread comes back on its own: App.tsx `returnAt`. */
export const returnAt = (item: any) => Math.max(Number(item.runAt) || 0, hiddenUntil(item));

export function offersOf(item: any, { session, inProgress, now }: Facts) {
  const back = returnAt(item);
  const byAgent = parkedByAgent(item, now);
  return {
    // In the open reply box's send slot while nothing is typed (Focus.tsx `stopButton`).
    stop: inProgress && !item.agent,
    runNow: offersRunNow(item, { session: session as any, queued: [], runNow: [], inProgress }),
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

/** The line under the conversation while an agent is on it, or what is true instead. */
export function liveOf(item: any, { session, inProgress, now }: Facts) {
  const live = liveLine(item, { session: session as any, inProgress, now });
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
    rows: activity.map((a) => ({ label: a.label, detail: a.detail })),
  };
}

export type Live = NonNullable<ReturnType<typeof liveOf>>;

// components/ThreadsMade.tsx's words. That file draws for a browser, with its
// stylesheet, so the app cannot load it; a test holds the two the same.
export const FILED_WORDS = { START_NEW: 'New thread', DO_HERE: 'Do here', DISMISS: 'Dismiss' };
export const waitingWords = (n: number): string => `${n} proposal${n === 1 ? '' : 's'} waiting on you`;

/** The level a thread shows is the level it runs at. */
export const shownLevel = (item: any): PriorityId => priorityIdOf(shownPriority(item));

export function summaryParts(item: any, now: number) {
  return { steps: doneSteps(summaryOf(item).progress) as string[], updated: updatedWord(item, { me: null, now }) };
}
