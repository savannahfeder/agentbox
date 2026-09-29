// Types for shared/agent-import.mjs, which is plain ESM so that main (Node) and
// the renderer (Vite) can share one copy of the words.
//
// Only the two the card itself calls are declared. The rest of that file writes
// work items, which is main's half and never the renderer's, and declaring them
// here would put a store write one import away from a component.

/** "today", "yesterday", "on Monday", or nothing when the moment cannot be
 *  placed inside the week the card covers. */
export function whenWords(when: number | null | undefined, now?: number): string;

/** "in a terminal" or "in the Claude Code desktop app". */
export function startedIn(source: string | null | undefined): string;
