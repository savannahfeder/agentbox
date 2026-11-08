// A long list draws its first screenful in the frame that opened it and the
// rest a few frames later, so `/` or a tab opens at the speed of 40 rows
// whatever the inbox holds.
import { useEffect, useState } from 'react';

export const FIRST_ROWS = 40;
export const MORE_ROWS = 80;

/** The groups cut to their first `limit` rows in drawing order. A group that starts past the cut is left out, heading and all. */
export function firstRows<G extends { items: readonly unknown[] }>(groups: readonly G[], limit: number): G[] {
  const out: G[] = [];
  let drawn = 0;
  for (const g of groups) {
    if (drawn >= limit && g.items.length) break;
    const room = limit - drawn;
    out.push(g.items.length > room ? { ...g, items: g.items.slice(0, room) } : g);
    drawn += Math.min(g.items.length, room);
  }
  return out;
}

/** Where the row with this index sits in drawing order, or -1. */
export function placeOf(groups: readonly { items: readonly { index?: number }[] }[], index: number): number {
  let at = 0;
  for (const g of groups) {
    for (const e of g.items) { if (e.index === index) return at; at++; }
  }
  return -1;
}

/** The cut, never above the row the keyboard is on (`keep`, a place in drawing order). */
export const cutAt = (rows: number, keep: number) => Math.max(rows, keep + 1 + FIRST_ROWS / 2);

/**
 * How many rows to draw now. Starts at FIRST_ROWS whenever `key` changes
 * (another tab, search opened, other words typed) and grows by MORE_ROWS a
 * frame until all `total` are drawn.
 */
export function useRowsDrawn(key: string, total: number): number {
  const [grown, setGrown] = useState({ key, rows: FIRST_ROWS });
  const rows = grown.key === key ? grown.rows : FIRST_ROWS;
  useEffect(() => {
    if (rows >= total) return;
    const frame = requestAnimationFrame(() => setGrown({ key, rows: rows + MORE_ROWS }));
    return () => cancelAnimationFrame(frame);
  }, [key, rows, total]);
  return rows;
}
