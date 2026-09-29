// Stable, collision-free React keys for a list that filters as she types.
//
// The palette's rows are keyed by command id, and the ids come from two places
// that do not know about each other: the palette's own commands and the
// itemCommands App builds for whatever she is pointing at. Both used 'done'.
// React kept a stale row alive through the filter under the shared key, so
// typing "high" listed "Close This Task" above "Priority: High": a command that
// was not a match, sitting under her return key (2026-08-11).
//
// Renaming the collision fixes today's. This makes the whole class impossible,
// because the next two lists to meet here will not know about each other
// either.

/** One key per command, in order, unique even when ids repeat. */
export function commandKeys(commands: { id: string }[]): string[] {
  const seen = new Map<string, number>();
  return commands.map((c) => {
    const n = seen.get(c.id) ?? 0;
    seen.set(c.id, n + 1);
    return n ? `${c.id}#${n}` : c.id;
  });
}
