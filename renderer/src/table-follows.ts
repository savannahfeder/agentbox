// A table saves each change into its own file, and every save is a version.
// Whoever is typing in the newest one has to stay in it.

/** Whether a new version arriving moves the view to it. A document stays on the page in hand. */
export function staysOnNewest({ kind, wasNewest }: { kind: string | null; wasNewest: boolean }): boolean {
  return kind === 'table' && wasNewest;
}

/** One pane per file a table writes, so a save does not draw it again and drop the cursor. */
export function paneKey(kind: string | null, v: { id: string; path: string }): string {
  return kind === 'table' ? `table:${v.path}` : v.id;
}
