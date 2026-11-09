// What the bar under ticked threads offers, by the desktop's batch commands
// (App.tsx `itemCommands` with a selection), and what each one's toast says.
import { clipToSentence, hiddenUntil, rowTitle } from '../../../renderer/src/list-rules';
import { priorityIdOf, priorityLabelOf, priorityValueOf } from '../../../renderer/src/priority';
import type { PhoneItem } from '../../../renderer/src/phone-rows';
import type { WorkItem } from '../../../renderer/src/types';
import type { Plan } from './actions';

// What the bar reads off a ticked thread: the board's rows and the presses' items both carry it.
type Pickable = { id: string; product: string; agent?: unknown; waitsForMac?: boolean; priority?: number | null };
import type { TabId } from './tabs';
import { shownLevel } from './thread-offers';

export type PickedAct = 'close' | 'later' | 'read' | 'unread';

/** With nothing ticked yet, what the bar will offer, drawn but not pressable. */
export function pickedActs<T>(items: readonly T[], { tab, unread }: { tab: TabId; unread: (item: T) => boolean }): PickedAct[] {
  return [
    ...(tab !== 'snoozed' ? ['close' as const] : []),
    'later' as const,
    ...(items.some(unread) ? ['read' as const] : []),
    ...(items.some((i) => !unread(i)) ? ['unread' as const] : []),
  ];
}

/** Any of them put off or set to run later, so "Now (back to inbox)" leads the Later sheet. */
export const inLater = (items: readonly PhoneItem[], now: number) => items.some((i) => hiddenUntil(i) > now || (Number(i.runAt) || 0) > now);

const threads = (n: number) => `${n} ${n === 1 ? 'thread' : 'threads'}`;
const TOAST_TITLE = 48;

export interface BatchWords { did: (n: number) => string; undid: (n: number) => string; partial: (done: number, of: number) => string }

export function batchWords(press: { kind: 'close' } | { kind: 'later'; until: number; label?: string }, items: readonly Parameters<typeof rowTitle>[0][]): BatchWords {
  if (press.kind === 'close') {
    return { did: (n) => `Closed ${threads(n)}`, undid: (n) => `Reopened ${threads(n)}`, partial: (done, of) => `Closed ${done} of ${of}.` };
  }
  if (press.until > 0) {
    const back = press.label ? `. Back ${press.label.toLowerCase()}` : '';
    return {
      did: (n) => `Later: ${n > 1 ? `${n} threads` : clipToSentence(rowTitle(items[0]), TOAST_TITLE)}${back}`,
      undid: () => 'Back in your inbox',
      partial: (done, of) => `Moved ${done} of ${of} to Later.`,
    };
  }
  return { did: (n) => (n > 1 ? `${n} back in the inbox` : 'Back in the inbox'), undid: () => 'Returned to Later', partial: (done, of) => `${done} of ${of} back in the inbox.` };
}

// Threads the computer has made, and not an agent's own session (thread-offers.ts `made`).
const made = <T extends Pickable>(items: readonly T[]): T[] => items.filter((i) => !i.agent && !i.waitsForMac);

/** Resume agents: the ticked threads no agent is on, against how many are ticked. */
export function pickedResume<T extends Pickable>(items: readonly T[], working: (item: T) => boolean): { ids: string[]; of: number } | null {
  const ids = made(items).filter((i) => !working(i)).map((i) => i.id);
  return ids.length ? { ids, of: items.length } : null;
}

/** Priority, at the level every ticked thread shows, or none when they disagree. */
export function pickedPriority(items: readonly Pickable[]): { value: number | null } | null {
  const levels = new Set(made(items).map((i) => shownLevel(i as Pick<WorkItem, 'priority'>)));
  if (!levels.size) return null;
  return { value: levels.size === 1 ? priorityValueOf([...levels][0]) : null };
}

export type PickedPress = { kind: 'resume' } | { kind: 'priority'; value: number };

/** App.tsx `putAgentBackOn` and `retag` on ticked rows, with their toasts and, as there, no Undo. */
export function pickedPlan<T extends Pickable>(press: PickedPress, items: readonly T[], { working, waits = false }: { working: (item: T) => boolean; waits?: boolean }): Plan | null {
  if (press.kind === 'resume') {
    const resume = pickedResume(items, working);
    if (!resume) return null;
    return { steps: [{ door: 'resumeItems', payload: { ids: resume.ids } }], toast: waits ? 'Up next once your computer is back.' : `${resume.ids.length} resumed`, goes: null };
  }
  const on = made(items);
  if (!on.length) return null;
  const word = priorityLabelOf(priorityIdOf(press.value)).toLowerCase();
  return {
    steps: on.map((i) => ({ door: 'threadEdit' as const, payload: { product: i.product, id: i.id, patch: { priority: press.value } } })),
    toast: on.length > 1 ? `${on.length} set to ${word}` : `Priority: ${word}`,
    goes: null,
  };
}
