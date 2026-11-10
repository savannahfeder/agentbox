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
import { urlPathOf } from '../../shared/file-url-path.mts';
import { WINDOWS } from './this-keyboard';

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

// ./this-keyboard.ts is the one place the window's platform is read.
export { WINDOWS };

// A file url's path puts a slash before the drive, `/C:/Users/...`.
const DRIVE_PATH = /^\/?[A-Za-z]:[\\/]/;

/** The url for a picture at an absolute path on the computer the app runs on. */
export function pictureUrl(file: string, windows = WINDOWS): string {
  const drive = windows && !!file && DRIVE_PATH.test(file);
  const own = drive ? file.replace(/^\//, '') : file;
  const at = file ? urlPathOf(own, drive ? 'win32' : 'posix') : null;
  if (at === null) return file;
  const link = linkFor?.(own);
  if (link) return link;
  return `${SCHEME}${at}`;
}

// A '%' in a name that starts no escape stays as it was written.
function decoded(text: string): string {
  try { return decodeURIComponent(text); } catch { return text; }
}

/** The whole path a picture's source names, bare or as a file url, or null when it is only a name. */
export function wholePicturePath(src: string, windows = WINDOWS): string | null {
  if (!windows) return src.startsWith('/') ? src : /^file:\/\//.test(src) ? decodeURIComponent(src.slice(7)) : null;
  if (/^file:\/\//.test(src)) return decoded(src.slice(7)).replace(/^\/(?=[A-Za-z]:[\\/])/, '');
  if (src.startsWith('/') || DRIVE_PATH.test(src)) return src;
  return null;
}

/** The whole path a film or a voice note names, or null when it is only a name. */
export function wholeMediaPath(src: string, windows = WINDOWS): string | null {
  if (!windows) return src.startsWith('/') ? src : null;
  // Anything else a file url decodes to is looked for under the roots.
  const whole = wholePicturePath(src, windows);
  return whole !== null && (whole.startsWith('/') || DRIVE_PATH.test(whole)) ? whole : null;
}

/** The file a picture names beside a folder, as a path rather than a url. */
export function fileBeside(from: string, folder: string, windows = WINDOWS): string {
  if (!windows) return new URL(from, `file://${folder}/`).pathname;
  // The folder is encoded first, or a '#' or '?' in its name would end the url there.
  const drive = DRIVE_PATH.test(folder);
  const base = urlPathOf(drive ? folder.replace(/^\//, '') : folder, drive ? 'win32' : 'posix');
  const at = new URL(from, base === null ? `file://${folder}/` : `file://${base.replace(/\/$/, '')}/`).pathname;
  // A name is decoded only where it stays one name, so ..%2f can never climb.
  const names = at.split('/').map((name) => {
    const plain = decoded(name);
    return plain === '.' || plain === '..' || /[\\/]/.test(plain) ? name : plain;
  });
  return names.join('/').replace(/^\/(?=[A-Za-z]:\/)/, '');
}

// Chromium keeps one picture per address for the life of the window, whatever
// the reply's cache headers say, so a picture redrawn under the same name
// opened as its old self. Each opening of a viewer asks under its own address.
let openings = 0;
/** A new mark for one opening of a viewer. */
export const opening = () => ++openings;

/** `url` as one opening reads it: the app's own pictures get the opening's mark, any other address is left as it is. */
export function seenAt(url: string, at: number): string {
  if (!url?.startsWith(`${SCHEME}/`)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}seen=${at}`;
}
