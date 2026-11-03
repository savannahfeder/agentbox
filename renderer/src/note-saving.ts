// PURE. A comment shows the moment it is sent; its saved copy takes over when it arrives.
export function notesWithSaving<T extends { id: string }>(notes: T[], saving: T[]): T[] {
  if (!saving.length) return notes;
  const here = new Set(notes.map((n) => n.id));
  return [...notes, ...saving.filter((n) => !here.has(n.id))];
}

/** How long a resolved comment stays in place with its Undo before it folds away. */
export const UNDO_MS = 5000;

/** Resolve and Reopen show at the press; the marks catch up when the app answers. */
export function settleLocally<T extends { id: string; resolved?: boolean }>(notes: T[], settling: Record<string, boolean>): T[] {
  if (!Object.keys(settling).length) return notes;
  return notes.map((n) => (n.id in settling && !!n.resolved !== settling[n.id] ? { ...n, resolved: settling[n.id] } : n));
}

/** The open comments, the one whose Undo is still offered among them, and the resolved ones for the fold. */
export function commentsInList<T extends { id: string; ts: number; resolved?: boolean }>(notes: T[], undo: string | null): { open: T[]; resolved: T[] } {
  const byTime = [...notes].sort((a, b) => a.ts - b.ts);
  return {
    open: byTime.filter((n) => !n.resolved || n.id === undo),
    resolved: byTime.filter((n) => n.resolved && n.id !== undo),
  };
}
