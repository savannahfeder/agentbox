// What the keys do to ticked threads on each tab, in the words the row hints
// use (`rowKeys` in list-rules.ts), for the bar drawn while threads are ticked.
import { DONE } from './done-word';

export type TickedKey = { key: string; word: string; does: 'e' | 'l' | 'clear' };

export function tickedKeys(view: string): TickedKey[] {
  const clear: TickedKey = { key: 'esc', word: 'Clear', does: 'clear' };
  if (view === 'inbox' || view === 'progress') return [{ key: 'E', word: DONE.short, does: 'e' }, { key: 'L', word: 'Later', does: 'l' }, clear];
  if (view === 'snoozed') return [{ key: 'E', word: 'Back to inbox', does: 'e' }, { key: 'L', word: 'Later', does: 'l' }, clear];
  return [clear];
}
