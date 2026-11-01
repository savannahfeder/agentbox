// PURE. ONE VERSION LINE PER FILE: every set of bytes a file has had, each
// numbered once by whoever holds the line (the team cloud, or this computer
// with no team). A copy of the app never counts versions itself; it asks the
// line, so every computer and every surface says the same number.
//
// An entry is { file, n, hash, name, by, at }. `file` and `name` are opaque ids
// (main/version-line.mjs hashes them), so the cloud never reads a file's name.

const HASH = /^[0-9a-f]{64}$/;
const ID = /^[0-9a-f]{8,64}$/;

/** An entry as a holder may keep it, or null. */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  if (!ID.test(String(e.file)) || !HASH.test(String(e.hash)) || !Number.isInteger(e.n) || e.n < 1) return null;
  return { file: e.file, n: e.n, hash: e.hash, name: ID.test(String(e.name)) ? e.name : null, by: e.by ?? null, at: Number(e.at) || 0 };
}

/** Each file's versions, oldest first. The first number a set of bytes was given stands. */
export function foldLine(entries) {
  const files = new Map();
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
export function appendTo(versions, { file, hash, name = null, by = null, at = 0 }) {
  const had = (versions ?? []).find((v) => v.hash === hash);
  if (had) return { entry: had, added: false };
  const n = Math.max(0, ...(versions ?? []).map((v) => v.n)) + 1;
  return { entry: { file, n, hash, name, by, at }, added: true };
}
