// THE ORIGIN A PICTURE IN THE APP'S OWN WINDOW IS LOADED FROM.
//
// WHY, MEASURED RATHER THAN GUESSED. A pasted screenshot goes to disk the
// moment it is pasted, so the thumbnail beside the reply box stopped carrying
// bytes and started carrying a path, drawn as `<img
// src="file:///…/.staging/…png">`. Her Agentbox runs from the dev server —
// `ZERO_DEV_URL=http://localhost:5199` on the process that was up when this was
// written — and an http page may not touch file://. The same probe, same
// picture, same window settings, two origins:
//
//   page at file:///…            naturalWidth 788
//   page at http://127.0.0.1/…   naturalWidth 0
//     console: "Not allowed to load local resource: file:///…"
//
// So every pasted thumbnail is a broken image in a dev-served window, and so is
// every screenshot a worker put in a message, because `ArtifactImg` in
// `Focus.tsx` builds file:// urls too. A packaged app is loaded with loadFile
// and does not hit it, which is why it survived so long: the app she uses all
// day is the one build that cannot draw its own pictures.
//
// THE FIX IS AN ORIGIN, NOT A FLAG. Turning webSecurity off would fix it and
// would also let any page in this window read the disk, which is not a trade
// worth making for a thumbnail. Instead the renderer asks for pictures on a
// scheme of the app's own, registered standard and secure, and this decides
// what may come back. Same shape as main/doc-scheme.mjs, and deliberately NOT
// the same scheme: that one serves whole documents an agent wrote, under grants
// the pane opens one at a time, and this one serves her pictures wherever they
// sit. Two answers to two different questions.
//
// WHAT MAY BE SERVED, and it is two rules that both have to pass:
//
//   1. It is a picture. An extension off the list below, nothing else. A url is
//      the only thing between a page and the disk, so a scheme that can hand
//      out any file is a scheme that can hand out `zero.config.json`.
//   2. It is inside a root the app owns: the account root (which holds every
//      product's docs, its attachments, its designs and the `.staging` folder a
//      paste lands in) or a product's own code repo, which is where a worker
//      writes `shots/…` and then names it on a card.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { IMG_SCHEME, IMG_SCHEMES, isScheme } from '../shared/schemes.mjs';

// The name is read rather than typed, and every spelling this app has used is
// still answered: a product's logo is kept in the store as a url on this
// scheme. shared/schemes.mjs carries that argument in full.
export { IMG_SCHEME, IMG_SCHEMES };

// One host, so every picture in the window shares one origin. Same reason
// doc-scheme keeps one: a page and the picture beside it must never look
// cross-origin to each other.
export const IMG_HOST = 'file';

const PICTURES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.ico']);

// AND A SOUND OR A FILM, SINCE 2026-09-29, so a voice sample or a render a
// worker names plays in the message (ArtifactMedia in Focus.tsx) instead of
// sitting there as a grey path. Same two rules, same roots: this only widens
// what counts as something to look at, to include something to listen to.
const MEDIA = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.mp4', '.mov', '.m4v', '.webm']);

/** The url the renderer draws, for a picture already resolved on disk. */
export function imgUrl(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  // Segment by segment: encodeURIComponent would eat the separators, and
  // encodeURI would leave '#' and '?' in a filename to be read as url syntax.
  const parts = file.split('/').filter(Boolean).map(encodeURIComponent);
  return `${IMG_SCHEME}://${IMG_HOST}/${parts.join('/')}`;
}

/** The file a request under this scheme is asking for, or null if it is not one. */
export function imgPath(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { return null; }
  if (!isScheme(IMG_SCHEMES, parsed.protocol)) return null;
  let file;
  try { file = decodeURIComponent(parsed.pathname); } catch { return null; }
  if (!file.startsWith('/')) return null;
  // A climb written into the url is normalised away here rather than trusted to
  // the root check below.
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

const MEDIA_TYPES = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm',
};

/** The content type of a sound or a film, or null when `file` is neither. */
export function mediaType(file) {
  return MEDIA_TYPES[path.extname(String(file ?? '')).toLowerCase()] ?? null;
}

// A PLAYER ASKS FOR A SOUND IN PIECES, AND net.fetch IGNORES THE ASK.
// Measured in a hidden Electron window on 2026-09-29 against one of her voice
// samples, served on this scheme through net.fetch: it loaded and reported its
// 39.36 seconds, and could not be moved. `seekable` was [0, 0] and a jump to
// the middle stayed at 0, with or without the Range header passed through,
// because a file:// fetch answers every range with the whole file and a 200.
// So a sound or a film is answered here, in the byte range the player asked
// for, with a 206.
/**
 * The bytes a Range header asks for, as { start, end } inclusive, or null for
 * the whole file, or false when the range cannot be served. Only one range.
 */
export function byteRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    // The last N bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return false;
  return { start, end };
}

/**
 * A sound or a film off disk, answered in the range the player asked for.
 * The caller has already decided the file may be served (`servable`).
 */
export async function mediaResponse(file, rangeHeader) {
  const { size } = await fs.promises.stat(file);
  const range = byteRange(rangeHeader, size);
  const headers = new Headers({ 'content-type': mediaType(file) ?? 'application/octet-stream', 'accept-ranges': 'bytes' });
  if (range === false) {
    headers.set('content-range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (size === 0) return new Response(null, { status: 200, headers });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers.set('content-length', String(end - start + 1));
  if (range) headers.set('content-range', `bytes ${start}-${end}/${size}`);
  const body = Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status: range ? 206 : 200, headers });
}

/** Is this a picture the window is allowed to draw? Pure, so it is testable. */
export function servable(file, roots) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
  const ext = path.extname(file).toLowerCase();
  if (!PICTURES.has(ext) && !MEDIA.has(ext)) return false;
  return (roots ?? []).some((root) => inside(root, file));
}
