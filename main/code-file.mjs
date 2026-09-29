// READING AND WRITING ONE FILE INSIDE A CHANGE.
//
// The pane already types onto a markdown file in the product's own folders
// (main/doc-file.mjs). This is the same job for the other kind of artifact, and
// it is a harder one for two reasons.
//
//   1. THE FILE IS NOT IN THE PRODUCT'S FOLDERS. It is source in a checkout the
//      run worked in, and the change records it as a short path like
//      `renderer/src/api.ts`, which on its own does not say which checkout.
//      So a change now carries `roots` and each file carries `abs`
//      (main/code-change.mjs). This finds the file from those and refuses if it
//      cannot, rather than guessing at a path and writing over a stranger's.
//   2. WHAT IS ON THE SCREEN IS NOT THE WHOLE FILE. The splice back into the
//      real bytes is pure and lives in renderer/src/code-edit.ts; by the time
//      anything here runs, the caller has the file's WHOLE new text.
//
// THE RULE ON WHERE A WRITE MAY LAND: inside one of the change's own roots, or
// inside the product's folders. Nowhere else. That is the same shape as
// doc-file.mjs, keyed to the change instead of to a fixed list, because the
// checkout is the run's and not the app's.
import fsDefault from 'node:fs';
import path from 'node:path';
import { artifactRoots } from './artifact-path.mjs';
import { isInside } from './doc-file.mjs';

// Half a megabyte of one source file. Past that the change artifact is not what
// she should be editing in, and a truncation would eat the file on save.
export const MAX_CODE_BYTES = 800_000;

/** The roots a change's files may sit under: the run's own, plus the product's. */
export function rootsFor(change, product) {
  const out = [];
  for (const r of change?.roots ?? []) if (typeof r === 'string' && r) out.push(r);
  for (const r of artifactRoots(product)) if (r) out.push(r);
  return out;
}

/**
 * Where one file of a change really is.
 *
 * `abs` is taken when the change carries it, because that is what the run
 * actually wrote and needs no guessing. Otherwise the short path is tried
 * against each root and the first one that EXISTS wins — existence rather than
 * order, because a product's docs dir and its checkout can both plausibly hold
 * `designs/x.html` and only one of them does.
 *
 * A change written before 2026-08-24 has neither, and then there is nothing
 * honest to do but say so.
 */
export function findFile({ change, product, filePath, fs = fsDefault }) {
  if (!filePath) return { ok: false, error: 'No file was named.' };
  const entry = (change?.files ?? []).find((f) => f?.path === filePath) ?? null;
  if (!entry) return { ok: false, error: 'That file is not part of this change.' };

  const tries = [];
  if (typeof entry.abs === 'string' && entry.abs) tries.push(entry.abs);
  if (path.isAbsolute(filePath)) tries.push(filePath);
  for (const root of rootsFor(change, product)) tries.push(path.join(root, filePath));

  for (const candidate of tries) {
    try { if (fs.statSync(candidate).isFile()) return { ok: true, path: candidate }; } catch { /* next */ }
  }
  return {
    ok: false,
    error: 'That file could not be found on this machine, so it cannot be edited here.',
  };
}

/** May the pane write onto this file, for this product? */
export function canWriteCode({ file, change, product, fs = fsDefault }) {
  const roots = rootsFor(change, product);
  if (!roots.length) return { ok: false, error: 'This change does not say which folder it came from, so nothing was saved.' };
  if (!roots.some((root) => isInside(root, file))) {
    return { ok: false, error: 'That file is outside the folders this run worked in, so nothing was saved.' };
  }
  if (!fs.existsSync(file)) return { ok: false, error: 'That file is no longer there, so nothing was saved.' };
  return { ok: true };
}

/** The bytes of one file of a change, with when it last moved. */
export function readCodeFile({ file, fs = fsDefault }) {
  let stat;
  try { stat = fs.statSync(file); } catch { return { ok: false, error: 'That file is no longer there.' }; }
  if (stat.size > MAX_CODE_BYTES) {
    return { ok: false, error: 'That file is too big to edit here.' };
  }
  try {
    return { ok: true, path: file, text: fs.readFileSync(file, 'utf8'), mtime: stat.mtimeMs };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 200) };
  }
}

/**
 * Her edit, onto the source file.
 */
export function writeCodeFile({ file, change, product, text, mtime, fs = fsDefault }) {
  const allowed = canWriteCode({ file, change, product, fs });
  if (!allowed.ok) return allowed;
  if (typeof text !== 'string') return { ok: false, error: 'Nothing to save.' };
  if (mtime) {
    let now = 0;
    try { now = fs.statSync(file).mtimeMs; } catch { /* handled above */ }
    if (now && now - mtime > 1000) {
      return { ok: false, stale: true, error: 'Something else changed this file while you were typing, so nothing was saved.' };
    }
  }
  try {
    fs.writeFileSync(file, text, 'utf8');
    let after = 0;
    try { after = fs.statSync(file).mtimeMs; } catch { /* the write succeeded */ }
    return { ok: true, mtime: after, path: file };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 200) };
  }
}
