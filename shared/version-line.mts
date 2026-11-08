// PURE. ONE VERSION LINE PER FILE: every set of bytes a file has had, each
// numbered once by whoever holds the line (the team cloud, or this computer
// with no team). A copy of the app never counts versions itself; it asks the
// line, so every computer and every surface says the same number.
//
// An entry is { file, n, hash, name, by, at }. `file` and `name` are opaque ids
// (main/version-line.mts hashes them), so the cloud never reads a file's name.

const HASH = /^[0-9a-f]{64}$/;
const ID = /^[0-9a-f]{8,64}$/;

/** An entry as a holder may keep it, or null. */
export interface LineEntry {
  file: string;
  n: number;
  hash: string;
  name: string | null;
  by: string | null;
  at: number;
}

/** An entry as a holder may keep it, or null. */
export function cleanEntry(raw: unknown): LineEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as { file?: unknown; n?: unknown; hash?: unknown; name?: unknown; by?: unknown; at?: unknown };
  if (!ID.test(String(e.file)) || !HASH.test(String(e.hash)) || !Number.isInteger(e.n) || (e.n as number) < 1) return null;
  return { file: e.file as string, n: e.n as number, hash: e.hash as string, name: ID.test(String(e.name)) ? e.name as string : null, by: (e.by ?? null) as string | null, at: Number(e.at) || 0 };
}

/** Each file's versions, oldest first. The first number a set of bytes was given stands. */
export function foldLine<T extends object>(entries: readonly T[] | null | undefined): Map<string, Array<T & LineEntry>> {
  const files = new Map<string, Map<number, T & LineEntry>>();
  for (const raw of entries ?? []) {
    const e = cleanEntry(raw);
    if (!e) continue;
    let f = files.get(e.file);
    if (!f) { f = new Map(); files.set(e.file, f); }
    if (f.has(e.n) || [...f.values()].some((x) => x.hash === e.hash)) continue;
    f.set(e.n, { ...raw, ...e });
  }
  return new Map([...files].map(([k, f]) => [k, [...f.values()].sort((a, b) => a.n - b.n)]));
}

/** What a holder appends for these bytes: their own entry if the line has them, else the next number. */
export function appendTo<V extends { hash: string; n: number }>(
  versions: readonly V[] | null | undefined,
  { file, hash, name = null, by = null, at = 0 }: { file: string; hash: string; name?: string | null; by?: string | null; at?: number },
): { entry: V; added: false } | { entry: LineEntry & Partial<V>; added: true } {
  const had = (versions ?? []).find((v) => v.hash === hash);
  if (had) return { entry: had, added: false };
  const n = Math.max(0, ...(versions ?? []).map((v) => v.n)) + 1;
  // A new entry carries none of the fields a holder keeps beside the line's own.
  return { entry: { file, n, hash, name, by, at } as LineEntry & Partial<V>, added: true };
}
