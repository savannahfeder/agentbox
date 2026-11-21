// A table saves each change into its own file, and every save is a version.
// Whoever is typing in the newest one has to stay in it.

/**
 * Whether a new version arriving moves the view to it. A document stays on the page in hand,
 * and so does a table when the newest is another copy, such as another thread's file of the same name.
 */
export function staysOnNewest({ kind, wasNewest, samePath }: { kind: string | null; wasNewest: boolean; samePath: boolean }): boolean {
  return kind === 'table' && wasNewest && samePath;
}

/** One pane per file a table writes, so a save does not draw it again and drop the cursor. */
export function paneKey(kind: string | null, v: { id: string; path: string }): string {
  return kind === 'table' ? `table:${v.path}` : v.id;
}
