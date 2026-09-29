// WHAT A PROJECT IS CALLED, AND THE MARK BESIDE THE NAME. Both of them hers to
// change, and both written into the project's OWN project.json rather than into
// her workspace config.
//
// WHY project.json AND NOT settings.json. Every other switch on the project
// screen is a preference about how Agentbox treats a folder, so it belongs to this
// Mac and lives in her config. A name and a mark are what the project IS. They
// travel with the folder: a project copied to another machine, or opened by the
// MCP server, or read by a worker session, is still called the same thing. The
// slug never moves, so nothing that points at a project by id breaks when the
// name changes.
//
// THE ICON IS COPIED IN, NOT POINTED AT, and that is the one place this departs
// from what she suggested.
//
// She is right that we cannot host it, and nothing here does: the file never
// leaves the Mac. But a pointer at wherever she found the picture is a pointer
// into her Downloads folder, and the mark in her rail then disappears the day she
// empties it. Copying the file into the project's own folder keeps every property
// she asked for (local, no server, no upload) and drops the one failure she did
// not ask for. It costs about 20KB per project.
//
// It also has to be copied for a second reason that only shows up later: the
// renderer cannot read an arbitrary path off her disk. Images already render
// through the product's own roots (`img-scheme.mjs`); a file inside the project
// folder is reachable by that machinery on the day it is written, and a file in
// ~/Downloads would need a new grant into a folder Agentbox has no business in.

import fs from 'node:fs';
import path from 'node:path';
import { patchProjectAt, loadProjectAt } from './store/project.mjs';
import { NAME } from '../shared/product-name.mjs';

/**
 * What a project may be called. Long enough for a real product name, short
 *  enough that the rail and the settings nav still read as a list of names. */
export const NAME_MAX = 60;

// The picture kinds a mark can be. Deliberately short: these are the four that
// every Mac can produce, that Chromium draws without a plugin, and that survive
// being shrunk to a 24px burst-sized square. No svg, because an svg is a
// document with script in it and this one gets drawn inside her app.
export const ICON_KINDS = ['.png', '.jpg', '.jpeg', '.webp'];

// The one name a mark is ever stored under, plus its extension. One file per
// project, so choosing a new mark REPLACES the old rather than leaving her
// folder collecting every picture she ever tried.
const ICON_STEM = 'icon';

/**
 * PURE. The name a project would end up with, or null when the rename should be
 * refused.
 *
 * Refused rather than coerced when it is empty, because a nameless project is a
 * blank row in her sidebar with no way back: the only handle left to rename it
 * by is the one that just disappeared. Trimmed and collapsed otherwise, so a
 * name pasted out of a document does not arrive with a newline in it and push
 * every row below it down.
 */
export function cleanName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name || null;
}

/** PURE. Whether this file is a picture a mark can be made of. */
export function isIconKind(file) {
  return ICON_KINDS.includes(path.extname(String(file ?? '')).toLowerCase());
}

/**
 * Rename the project in the folder a caller has already resolved.
 *
 * `patchProjectAt` rather than `renameProject`, on the note that function itself
 * carries: a write that re-derives its folder from an id lands wherever that id
 * happens to name, and two products can hold the same id.
 */
export function setProjectName(dir, value) {
  const name = cleanName(value);
  if (!name) throw new Error('a project needs a name');
  if (!loadProjectAt(dir)) throw new Error('not a project folder');
  patchProjectAt(dir, { name });
  return name;
}

/**
 * Copy a picture into the project folder and make it the mark.
 *
 * Returns the path the renderer should draw, or throws with a sentence she can
 * read. `source` is whatever the open panel handed back, which is a real file on
 * her disk and never anything typed.
 *
 * THE STORED VALUE IS RELATIVE. `icon.png`, not `/Users/.../agentbox/icon.png`,
 * for the same reason the name lives here at all: a project.json that names an
 * absolute path stops being true the moment the folder moves or is opened on
 * another Mac. The caller joins it to the project's own dir, which it already
 * has.
 */
export function setProjectIcon(dir, source) {
  if (!loadProjectAt(dir)) throw new Error('not a project folder');
  if (!isIconKind(source)) throw new Error(`that file is not a picture ${NAME} can draw`);
  let stat = null;
  try { stat = fs.statSync(source); } catch { throw new Error('that file could not be read'); }
  if (!stat.isFile()) throw new Error('that is not a file');

  const ext = path.extname(source).toLowerCase();
  const name = `${ICON_STEM}${ext}`;
  // The old mark goes first, and every kind of it, or a project that had a .png
  // and now has a .webp keeps both on disk and the stale one is what a future
  // reader trips over.
  clearIconFiles(dir);
  fs.copyFileSync(source, path.join(dir, name));
  patchProjectAt(dir, { logo: name });
  return name;
}

/**
 * Back to the drawn burst. The picture is deleted with the setting: leaving it
 *  behind means "no icon" and a file called icon.png sitting in her folder, which
 *  is the kind of thing that gets asked about a month later. */
export function clearProjectIcon(dir) {
  if (!loadProjectAt(dir)) throw new Error('not a project folder');
  clearIconFiles(dir);
  patchProjectAt(dir, { logo: null });
  return null;
}

function clearIconFiles(dir) {
  for (const ext of ICON_KINDS) {
    try { fs.rmSync(path.join(dir, `${ICON_STEM}${ext}`), { force: true }); } catch { /* nothing to remove */ }
  }
}

/**
 * The mark's full path for a product the store has already listed, or null.
 *
 * CHECKED AGAINST DISK, not merely read off project.json. A `logo` that names a
 * file which is no longer there would draw a broken image where the burst used
 * to be, and the burst is a correct answer to "this project has no mark" while a
 * broken image is not. This is the same rule the attachment chips follow: resolve
 * before you promise.
 */
export function iconPathFor(product) {
  const rel = typeof product?.logo === 'string' ? product.logo.trim() : '';
  // Only ever the one file this module writes. A project.json edited by hand to
  // say `../../../somewhere` must not turn into a read outside the folder.
  if (!rel || rel !== path.basename(rel) || !isIconKind(rel)) return null;
  const full = path.join(product.dir, rel);
  try { return fs.statSync(full).isFile() ? full : null; } catch { return null; }
}
