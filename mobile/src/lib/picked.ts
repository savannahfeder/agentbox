// What the bar under ticked threads offers, by the desktop's batch commands
// (App.tsx `itemCommands` with a selection), and what each one's toast says.
import { clipToSentence, hiddenUntil, rowTitle } from '../../../renderer/src/list-rules';
import type { TabId } from './tabs';

export type PickedAct = 'close' | 'later' | 'read' | 'unread';

/** With nothing ticked yet, what the bar will offer, drawn but not pressable. */
export function pickedActs(items: readonly any[], { tab, unread }: { tab: TabId; unread: (item: any) => boolean }): PickedAct[] {
  return [
    ...(tab !== 'snoozed' ? ['close' as const] : []),
    'later' as const,
    ...(items.some(unread) ? ['read' as const] : []),
    ...(items.some((i) => !unread(i)) ? ['unread' as const] : []),
  ];
}

/** Any of them put off or set to run later, so "Now (back to inbox)" leads the Later sheet. */
export const inLater = (items: readonly any[], now: number) => items.some((i) => hiddenUntil(i) > now || (Number(i.runAt) || 0) > now);

const threads = (n: number) => `${n} ${n === 1 ? 'thread' : 'threads'}`;
const TOAST_TITLE = 48;

export interface BatchWords { did: (n: number) => string; undid: (n: number) => string; partial: (done: number, of: number) => string }

export function batchWords(press: { kind: 'close' } | { kind: 'later'; until: number; label?: string }, items: readonly any[]): BatchWords {
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
