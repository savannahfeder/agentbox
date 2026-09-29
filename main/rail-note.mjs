// THE NOTE SHE KEEPS IN THE SIDEBAR, and the file it lives in.
//
// THE NOTE IS A REAL MARKDOWN FILE IN THE PRODUCT'S OWN FOLDER, `pinned.md`,
// and that is the whole design decision here. It could have been a row in some
// settings blob, which would have been fewer lines. It is a file because every
// agent on this product can already read the product's folder, so a priority
// she types into the sidebar is a priority a worker can be pointed at, and
// because a file survives this app being reinstalled, rebuilt, or replaced.
//
// It is NOT `notes.md`. That name is taken on at least one product by a map an
// agent wrote in round one, and loading somebody else's stale page into her
// sidebar the first time she opens it is the one failure this file could have
// that she would never think to report.
//
// ONE NOTE PER PRODUCT, because the panel it draws in is per product: the rail
// re-orients her on the thing she just opened, and a single note shared across
// twenty products would be answering a question about some other product, which
// is the exact fault the agents list had before it was narrowed (Rail.tsx).
//
// Pure of Electron on purpose, like doc-file.mjs beside it: the IPC layer hands
// in the product record, and these two functions are the whole of the disk
// access. The path is DERIVED from the product, never passed in, so there is no
// path to traverse and nothing to validate.
import fsDefault from 'node:fs';
import path from 'node:path';

export const NOTE_NAME = 'pinned.md';

// Far past anything a sidebar column can hold, and still small enough that a
// runaway paste cannot fill the disk. A note that hits this is refused rather
// than truncated: half a note written back is worse than none.
export const MAX_NOTE_BYTES = 200_000;

/** The file this product's sidebar note lives in, or null if it has no folder. */
export function notePath(prod) {
  return prod?.dir ? path.join(prod.dir, NOTE_NAME) : null;
}

/**
 * What she has written on this product. A note that has never been started is
 *  empty text, not an error: the sidebar draws its placeholder from that. */
export function readNote({ product, fs = fsDefault }) {
  const file = notePath(product);
  if (!file) return { ok: false, error: 'That project has no folder to keep a note in.' };
  try {
    const stat = fs.statSync(file);
    if (stat.size > MAX_NOTE_BYTES) {
      return { ok: false, error: 'That note is too long for the sidebar to open.' };
    }
    return { ok: true, text: fs.readFileSync(file, 'utf8'), mtime: stat.mtimeMs };
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: true, text: '', mtime: 0 };
    return { ok: false, error: 'That note could not be read.' };
  }
}

/**
 * Her note, written back. The file is CREATED on the first keystroke rather
 *  than at install time, so a product she never writes on never grows a file. */
export function writeNote({ product, text, fs = fsDefault }) {
  const file = notePath(product);
  if (!file) return { ok: false, error: 'That project has no folder to keep a note in.' };
  const out = typeof text === 'string' ? text : '';
  if (Buffer.byteLength(out, 'utf8') > MAX_NOTE_BYTES) {
    return { ok: false, error: 'That note is too long to save.' };
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, out, 'utf8');
    return { ok: true, mtime: fs.statSync(file).mtimeMs };
  } catch {
    return { ok: false, error: 'That note could not be saved.' };
  }
}
