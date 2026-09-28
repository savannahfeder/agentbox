// Reading and writing the markdown file the document pane has open.
//
// So the pane types straight onto the file on disk. Two rules make that safe
// enough to leave switched on:
//
//   1. ONLY MARKDOWN IS WRITABLE. An html page is a program; the pane shows it
//      in a sandboxed frame and never edits it. Everything else the pane will
//      not even open (renderer/src/doc-pane.ts).
//   2. A WRITE STAYS INSIDE THE PRODUCT'S OWN FOLDERS. Reading follows the
//      finder's own rule and will honour an absolute path a worker typed, which
//      is how a link into the app's repo works; writing will not. The file has
//      to sit under the docs dir or the repo of the product whose card is open,
//      or nothing is written.
//
// Pure of Electron on purpose: the IPC layer hands in the resolved path and the
// product, and these two functions are the whole of the disk access.
import fsDefault from 'node:fs';
import path from 'node:path';
import { artifactRoots } from './artifact-path.mjs';

export const EDITABLE_RE = /\.(md|markdown)$/i;
export const READABLE_RE = /\.(md|markdown|html?)$/i;

// A megabyte and a half of markdown is already far past anything in her store
// (the largest is decisions.md). Past that the editor is not the right tool and
// a silent truncation would eat her file on the next save, so it says so.
export const MAX_DOC_BYTES = 1_500_000;

/** Is `file` inside `dir`, without a prefix match like /a/bc counting as /a/b. */
export function isInside(dir, file) {
  if (!dir || !file) return false;
  const d = path.resolve(dir);
  const f = path.resolve(file);
  return f === d || f.startsWith(d + path.sep);
}

/** May the pane write to this file, on this product. */
export function canWrite({ file, product, fs = fsDefault }) {
  if (!file || !EDITABLE_RE.test(file)) {
    return { ok: false, error: 'Only markdown files can be edited here.' };
  }
  const roots = artifactRoots(product);
  if (!roots.some((root) => isInside(root, file))) {
    const name = product?.name || 'this project';
    return { ok: false, error: `That file is outside ${name}, so nothing was saved.` };
  }
  if (!fs.existsSync(file)) {
    return { ok: false, error: 'That file is no longer there, so nothing was saved.' };
  }
  return { ok: true };
}

/** The text of a document the pane has open, with what it is and when it changed. */
export function readDoc({ file, fs = fsDefault }) {
  if (!file || !READABLE_RE.test(file)) return { ok: false, error: 'That is not a document this pane can open.' };
  let stat;
  try { stat = fs.statSync(file); } catch { return { ok: false, error: 'That file is no longer there.' }; }
  if (stat.size > MAX_DOC_BYTES) {
    return { ok: false, error: 'That file is too big to open here. It opened outside instead.', tooBig: true };
  }
  try {
    return { ok: true, path: file, text: fs.readFileSync(file, 'utf8'), mtime: stat.mtimeMs };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 200) };
  }
}

/**
 * Her edit, onto the file.
 *
 * `mtime` is what the pane believed was on disk when it loaded. If the file has
 * moved on since — an agent rewrote it while she was typing — the write is
 * refused rather than silently winning, and the pane says so. The old editor
 * holds an incoming agent update off while she has unsaved edits, which is the
 * same rule from the other end; here the file is the shared thing, so the check
 * is on the file.
 */
export function writeDoc({ file, product, text, mtime, fs = fsDefault }) {
  const allowed = canWrite({ file, product, fs });
  if (!allowed.ok) return allowed;
  if (typeof text !== 'string') return { ok: false, error: 'Nothing to save.' };
  if (mtime) {
    let now = 0;
    try { now = fs.statSync(file).mtimeMs; } catch { /* handled by canWrite */ }
    // A second's slack: some filesystems round mtime, and our own write is what
    // moved it last in the ordinary case.
    if (now && now - mtime > 1000) {
      return { ok: false, stale: true, error: 'Something else changed this file while you were typing, so nothing was saved.' };
    }
  }
  try {
    fs.writeFileSync(file, text, 'utf8');
    let after = 0;
    try { after = fs.statSync(file).mtimeMs; } catch { /* the write succeeded */ }
    return { ok: true, mtime: after };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 200) };
  }
}
