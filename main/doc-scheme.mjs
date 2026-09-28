// THE ORIGIN THE DOCUMENT PANE SERVES A PAGE FROM, so its pictures load.
//
// She was reading one of our own design pages and every <img> in it was a
// broken placeholder with the alt text beside it.
//
// WHY THEY WERE BROKEN, measured before this was written. The pane drew the
// page in `<iframe sandbox="allow-scripts" src="file://…">`. A sandbox without
// allow-same-origin gives the frame an OPAQUE origin, and Chromium refuses to
// let an opaque origin pull a file:// subresource. The probe: the same image,
// same folder, same frame.
//
//   sandbox="allow-scripts"                    naturalWidth 0
//     console: "Not allowed to load local resource: file:///…/shot.png"
//   sandbox="allow-scripts allow-same-origin"  naturalWidth 2880
//
// So the one-line fix is to add allow-same-origin, AND THAT IS THE HOLE, not
// the fix. The app's own window is loaded with loadFile (main.mjs), so the app
// itself is a file:// page. A file:// frame that is allowed to be same-origin
// sits in the same origin as the app, and a page an agent wrote could then
// reach straight into her inbox. Chromium says as much out loud: "An iframe
// which has both allow-scripts and allow-same-origin for its sandbox attribute
// can escape its sandboxing."
//
// So the page gets an origin of its OWN instead. This scheme is registered as
// standard and secure, the pane points the frame at astral-doc://file/…, and
// the frame may keep allow-same-origin because "same origin" now means "the
// same as other documents", not "the same as Agentbox". Measured in the same
// probe, on this scheme:
//
//   naturalWidth 2880, origin "astral-doc://file", parent.document -> BLOCKED
//
// WHAT MAY BE SERVED. A page can ask this scheme for any path it likes, so the
// answer cannot be "whatever is on disk". Grants below are the whole of it: the
// pane names a file when it opens one, and only that file's own folder and the
// product's own artifact roots become readable. Her real design pages do climb
// out of their own folder — 17 references across the 200 html files in this
// product point at ../attachments, ../landing and ../../landing/assets — which
// is why the roots are granted and not just the folder.
import path from 'node:path';
import { DOC_SCHEME, DOC_SCHEMES, isScheme } from '../shared/schemes.mjs';

// The name is read rather than typed, and every spelling this app has used is
// still answered, because a url on this scheme is STORED. shared/schemes.mjs
// carries that argument in full.
export { DOC_SCHEME, DOC_SCHEMES };

// A standard scheme needs a host, and this one has exactly one: every document
// is a full absolute path under it. Keeping a single host keeps a single
// origin, so a page and the picture beside it never look cross-origin to each
// other.
export const DOC_HOST = 'file';

/** The url the pane points its frame at, for a file already resolved on disk. */
export function docUrl(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  // Each segment on its own: encodeURIComponent would eat the separators, and
  // encodeURI would leave '#' and '?' in a filename to be read as url syntax.
  const parts = file.split('/').filter(Boolean).map(encodeURIComponent);
  return `${DOC_SCHEME}://${DOC_HOST}/${parts.join('/')}`;
}

/** The file a request under this scheme is asking for, or null if it is not one. */
export function docPath(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { return null; }
  if (!isScheme(DOC_SCHEMES, parsed.protocol)) return null;
  let file;
  try { file = decodeURIComponent(parsed.pathname); } catch { return null; }
  if (!file.startsWith('/')) return null;
  // The url is the only thing between a page and the disk, so a climb written
  // into it is normalised away here rather than trusted to the grant check.
  const normal = path.normalize(file);
  return path.isAbsolute(normal) ? normal : null;
}

/** Is `file` inside `dir`, without /a/bc counting as inside /a/b. */
function inside(dir, file) {
  if (!dir || !file) return false;
  const d = path.resolve(dir);
  const f = path.resolve(file);
  return f === d || f.startsWith(d + path.sep);
}

/**
 * What the scheme is allowed to hand out.
 *
 * The pane opens one document at a time, so this stays small on purpose: a
 * grant is made when a document is resolved for the pane and the oldest falls
 * off. It is a plain object with no Electron in it so the rule can be tested
 * for real rather than asserted against the source.
 */
export class DocGrants {
  constructor(limit = 8) {
    this.limit = limit;
    this.roots = [];
  }

  /** Open this file, and the folders that come with it, to the scheme. */
  grant(file, roots = []) {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return;
    const add = [path.dirname(file), ...roots.filter((r) => typeof r === 'string' && r)];
    for (const root of add) {
      const r = path.resolve(root);
      if (this.roots.includes(r)) continue;
      this.roots.push(r);
    }
    while (this.roots.length > this.limit) this.roots.shift();
  }

  /** May the scheme read this path. */
  allows(file) {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
    return this.roots.some((root) => inside(root, file));
  }
}

// A PAGE GOES OUT EXACTLY AS IT WAS WRITTEN, and that is deliberate.
//
// For a few hours on 2026-08-21 this file also injected a listener into every
// page it served, so a pinch with the cursor inside the document could reach
// the app and zoom the page on its own.
//
// So the document has no zoom of its own. The app zoom (main/menu.mjs,
// main/zoom-keys.mjs) scales the window, and the pane is an ordinary iframe in
// that window, so an open file follows it like everything else. Do not put a
// listener back into a served page: nothing is injected into a file she reads.
