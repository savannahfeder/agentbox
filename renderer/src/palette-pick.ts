// WHICH ROW ENTER OPENS IN THE PALETTE (components/Palette.tsx).

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Rows whose title is the words first, then starts with them, then has them; otherwise the order they came in.
 *  Only among rows of one `lead` (../search SearchHit), so a title never jumps a thread opened lately. */
export function titleFirst<T extends { label: string; lead?: number }>(rows: readonly T[], query: string): T[] {
  const q = norm(query);
  if (!q) return [...rows];
  const rank = (r: T) => {
    const t = norm(r.label);
    return t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : 3;
  };
  return rows.map((r, i) => ({ r, i, k: rank(r), lead: r.lead ?? 0 })).sort((a, b) => b.lead - a.lead || a.k - b.k || a.i - b.i).map((x) => x.r);
}

/** Every word typed starts a word of the name. */
export function namesIt(query: string, label: string): boolean {
  const words = norm(query).split(' ').filter(Boolean);
  const own = norm(label).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words.length > 0 && words.every((w) => own.some((o) => o.startsWith(w)));
}

const wordsOf = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** How well the words typed name a row, best first: 0 they are its name, 1 its name begins with them,
 *  2 each starts a word of it, 3 it has them inside a word, 4 it does not have them. */
export function nameRank(query: string, label: string): number {
  const typed = wordsOf(query);
  const own = wordsOf(label);
  if (!typed.length) return 4;
  const last = typed.length - 1;
  if (typed.length <= own.length && typed.every((w, i) => (i < last ? own[i] === w : own[i].startsWith(w)))) {
    return typed.length === own.length && own[last] === typed[last] ? 0 : 1;
  }
  if (typed.every((w) => own.some((o) => o.startsWith(w)))) return 2;
  return norm(label).includes(norm(query)) ? 3 : 4;
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
