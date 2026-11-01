// WHICH ROW ENTER OPENS IN THE PALETTE (components/Palette.tsx).

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Rows whose title is the words first, then starts with them, then has them; otherwise the order they came in. */
export function titleFirst<T extends { label: string }>(rows: readonly T[], query: string): T[] {
  const q = norm(query);
  if (!q) return [...rows];
  const rank = (r: T) => {
    const t = norm(r.label);
    return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3;
  };
  return rows.map((r, i) => ({ r, i, k: rank(r) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.r);
}

/** Every word typed starts a word of the name. */
export function namesIt(query: string, label: string): boolean {
  const words = norm(query).split(' ').filter(Boolean);
  const own = norm(label).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.length > 0 && words.every((w) => own.some((o) => o.startsWith(w)));
}

/** Where the picked row is now; the first row when it is gone. */
export function keptPick(key: string | null, keys: readonly string[]): number {
  if (!keys.length) return -1;
  const at = key ? keys.indexOf(key) : -1;
  return at >= 0 ? at : 0;
}

/** A pointer event at the place the last one was is a list moving under it, not a person. */
export function pointerMoved(last: { x: number; y: number } | null, now: { x: number; y: number }): boolean {
  return !last || last.x !== now.x || last.y !== now.y;
}
