// What each block of a thread is called, and what an open fold is remembered by.
//
// Not its position: the list a thread draws is a window that drops its oldest
// lines as the agent adds new ones (`threadWindow`, `capRuns`), so a position
// names a different block after every step. A name that moved remounted the
// whole page and shut every fold and film the reader had open.

type Line = { kind?: string; at?: number; uid?: string; verb?: string; subject?: string };

/** One name per event, from what it is and when it happened, numbered only among exact twins. */
export function lineIds(events: Line[]): string[] {
  const seen = new Map<string, number>();
  return events.map((e) => {
    const base = e.kind === 'work' ? `w${e.at ?? 0}:${e.verb ?? ''}:${e.subject ?? ''}` : `m${e.uid ?? e.at ?? 0}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}#${n}` : base;
  });
}

/**
 * One name per drawn block. A folded run is named after the block above it,
 * because its own first step can be dropped by the window and its last one
 * changes while the agent is still adding to it.
 */
export function blockKeys(nodes: Array<{ kind?: string; i?: number }>, ids: string[]): string[] {
  let above = 'start';
  return nodes.map((x) => {
    if (x.kind === 'run') return `run>${above}`;
    above = ids[x.i ?? -1] ?? `at${x.i}`;
    return above;
  });
}
