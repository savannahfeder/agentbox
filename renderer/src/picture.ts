// WHERE A PICTURE ON A CARD IS ASKED FOR FROM.
//
// A window served from the dev server is an http page, and an http page may not
// load a file:// picture: Chromium refuses it outright, "Not allowed to load
// local resource". Measured in a real Electron window, same picture, same
// settings, the two origins side by side: naturalWidth 788 from file://, 0 from
// http://. Her Agentbox runs from the dev server, so every pasted thumbnail and
// every screenshot a worker put in a message drew as a broken image for her,
// while a packaged build drew them fine. See main/img-scheme.mjs for the whole
// measurement and for what the app agrees to serve.
//
// So nothing in the window builds a file:// url for a picture any more. It asks
// the app for it, on the app's own scheme, which works from either origin. The
// scheme is READ rather than typed, out of the one module that names this app,
// so a rename reaches the window and the main process in one move.
import { IMG_SCHEME } from '../../shared/schemes.mjs';

const SCHEME = `${IMG_SCHEME}://file`;

/** The url for a picture at an absolute path on this Mac. */
export function pictureUrl(file: string): string {
  if (!file || !file.startsWith('/')) return file;
  // Segment by segment: encodeURIComponent would eat the separators, and
  // encodeURI would leave '#' and '?' in a filename to be read as url syntax.
  const parts = file.split('/').filter(Boolean).map(encodeURIComponent);
  return `${SCHEME}/${parts.join('/')}`;
}
