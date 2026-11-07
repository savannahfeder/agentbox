// WHERE A PICTURE ON A CARD IS ASKED FOR FROM.
//
// A window served from the dev server is an http page, and an http page may not
// load a file:// picture: Chromium refuses it outright, "Not allowed to load
// local resource". Measured in a real Electron window, same picture, same
// settings, the two origins side by side: naturalWidth 788 from file://, 0 from
// http://. Her Agentbox runs from the dev server, so every pasted thumbnail and
// every screenshot a worker put in a message drew as a broken image for her,
// while a packaged build drew them fine. See main/img-scheme.mts for the whole
// measurement and for what the app agrees to serve.
//
// So nothing in the window builds a file:// url for a picture any more. It asks
// the app for it, on the app's own scheme, which works from either origin. The
// scheme is READ rather than typed, out of the one module that names this app,
// so a rename reaches the window and the main process in one move.
import { IMG_SCHEME } from '../../shared/schemes.mts';

const SCHEME = `${IMG_SCHEME}://file`;

// THE PHONE WITH THE MAC SHUT has no app to answer the scheme, and Safari
// refuses an address on it before anything can point it elsewhere, so there
// every file it has a link for is drawn from that link (cloud-files.ts).
let linkFor: ((file: string) => string | null) | null = null;
export function setPictureLinks(fn: ((file: string) => string | null) | null) { linkFor = fn; }

const SENT = /(?:^|\/)phone-files\/[0-9a-f]{64}\.[a-z0-9]{1,8}$/;
/**
 * A picture sent from the web app (phone-files/<hash>.<ext>): its link, null
 * while it is on its way, undefined for any other picture or a page without links.
 */
export function sentPictureLink(file: string): string | null | undefined {
  if (!linkFor || !SENT.test(String(file ?? ''))) return undefined;
  return linkFor(file);
}

// Links arrive after the words that name them; a picture drawn before then listens for them.
let version = 0;
const listeners = new Set<() => void>();
export const pictureLinksVersion = () => version;
export function onPictureLinks(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function pictureLinksChanged() { version += 1; for (const fn of listeners) fn(); }

/** The url for a picture at an absolute path on this Mac. */
export function pictureUrl(file: string): string {
  if (!file || !file.startsWith('/')) return file;
  const link = linkFor?.(file);
  if (link) return link;
  // Segment by segment: encodeURIComponent would eat the separators, and
  // encodeURI would leave '#' and '?' in a filename to be read as url syntax.
  const parts = file.split('/').filter(Boolean).map(encodeURIComponent);
  return `${SCHEME}/${parts.join('/')}`;
}
