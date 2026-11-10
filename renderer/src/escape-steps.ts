// What a person opened inside a thread that Escape puts away before it leaves
// the thread: the terminal, a folded line of the agent's work, the running
// command's steps. Each registers while open with the moment it was opened, and
// one Escape puts away the newest. Menus and dialogs take Escape themselves in
// the capture phase and never get this far.
import { useEffect, useRef } from 'react';

type Step = { at: number; close: () => void };
const steps = new Set<Step>();

/** Count `close` as open from `at`. Returns the way to take it back off. */
export function openedHere(close: () => void, at = Date.now()): () => void {
  const step = { at, close };
  steps.add(step);
  return () => { steps.delete(step); };
}

/**
 * Put away the newest thing opened after `before` (the moment the file in the
 * pane was opened, or -Infinity when Escape would not close the file). Returns
 * whether anything was put away.
 */
export function putAwayTheNewest(before = -Infinity): boolean {
  let newest: Step | null = null;
  for (const s of steps) if (s.at > before && (!newest || s.at >= newest.at)) newest = s;
  if (!newest) return false;
  steps.delete(newest);
  newest.close();
  return true;
}

/** While `openedAt` is a time, Escape puts this away with `close`. */
export function useEscapePutsAway(openedAt: number | null, close: () => void): void {
  const now = useRef(close);
  now.current = close;
  useEffect(() => (openedAt === null ? undefined : openedHere(() => now.current(), openedAt)), [openedAt]);
}
