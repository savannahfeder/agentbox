// A thread the app made for you (a move) and should open, once a snapshot lists it.

export type OpensWhenListed = { product: string; id: string; at: number } | null;

/** Long enough for the next snapshot; short enough not to pull you away from what you did next. */
export const OPENS_WITHIN_MS = 10_000;

export function listedNow<T extends { id: string; product?: string | null }>(
  want: OpensWhenListed, rows: readonly T[], now: number,
): { open: T | null; keep: OpensWhenListed } {
  if (!want || now - want.at > OPENS_WITHIN_MS) return { open: null, keep: null };
  const row = rows.find((r) => r.id === want.id && r.product === want.product) ?? null;
  return row ? { open: row, keep: null } : { open: null, keep: want };
}
