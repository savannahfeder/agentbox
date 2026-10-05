// PURE. The threads a thread made, and the words for where each one stands
// (w-2e8aa16f0f). Drawn by components/ThreadsMade.tsx under an opened task,
// and meant for the agent that answers in a chat with the tasks it opened.
import type { ThreadStateWord, WorkItem } from './types';

type Row = Pick<WorkItem, 'id' | 'product' | 'createdAt'> & { parent?: string };

/** Every thread filed straight under this one, in its own project, oldest
 *  first. Finished ones stay: "done" is part of the answer to what it made. */
export function threadsMade<T extends Row>(items: readonly T[], thread: Pick<WorkItem, 'id' | 'product'>): T[] {
  return items
    .filter((i) => i.parent === thread.id && i.product === thread.product)
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

// The list's own tab names, so a row says what the tab it sits in says.
const WORDS: Record<ThreadStateWord, string> = { waiting: 'Needs you', running: 'In progress', scheduled: 'Later', done: 'Done' };

export const stateWord = (state: ThreadStateWord | null | undefined): string => (state ? WORDS[state] : '');
