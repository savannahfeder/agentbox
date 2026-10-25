// PICTURES AND DESIGN PAGES ON A PHONE.
//
// The desktop draws them from two addresses only its own window can open
// (main/img-scheme.mjs, main/doc-scheme.mjs). A phone cannot open either, so
// they came up blank on a real iPhone (2026-10-11). The phone's server hands
// the same files out under /f/<file key>/ (main/serve.mjs), and this points
// every such address the screen draws at it, in one place rather than in each
// of the components that draw a picture, a page, a sound or a film.
import { DOC_SCHEMES, IMG_SCHEMES } from '../../shared/schemes.mjs';

const KINDS: [readonly string[], 'doc' | 'img'][] = [[DOC_SCHEMES, 'doc'], [IMG_SCHEMES, 'img']];

/** The phone's address for one of the desktop's, or the address unchanged. */
export function phoneFileUrl(url: string, key: string): string {
  if (!url) return url;
  for (const [schemes, kind] of KINDS) {
    for (const scheme of schemes) {
      const prefix = `${scheme}://file/`;
      if (url.startsWith(prefix)) return `/f/${key}/${kind}/${url.slice(prefix.length)}`;
    }
  }
  return url;
}

const ATTRS = ['src', 'poster'];

/* -------------------------------------------- a picture while it loads */

// THROUGH THE RELAY A PICTURE ARRIVES A PIECE AT A TIME, so it drew from the
// top down and grew from nothing, pushing the words under it ("as images load
// in mobile they look rather weird. Best to have nice skeleton loaders",
// 2026-10-12). Each picture is marked loading, ready or failed, and phone.css
// draws a loading one as a shimmering box of a picture's shape.
const STATE = 'data-phone-img';
type PictureLike = Pick<HTMLImageElement, 'complete' | 'naturalWidth' | 'setAttribute' | 'getAttribute' | 'addEventListener'> & { naturalHeight?: number; style?: { aspectRatio?: string } };
const watched = new WeakSet<object>();

// THE SHAPE EACH PICTURE HAD, by address, for as long as the page is open. A
// picture is never served from memory (main/serve.mjs), so one drawn again
// loads again, and its 4:3 box was a third the height of a phone screenshot:
// everything under it jumped down and back each time (2026-10-13,
// tests/a-thread-on-a-phone-holds-still-while-something-above-it-changes).
//
// AND ACROSS A RELOAD (2026-10-14). A thread opened again tomorrow, or after
// the home-screen app was swiped away, met every picture as new and jumped by
// the difference between 4:3 and its shape. They are kept in this browser's
// storage by the file's own part of the address, so a reset phone key does not
// forget them, and only the newest few hundred
// (tests/a-picture-on-its-way-holds-the-columns-width-not-a-dot).
const KEPT = 'agentbox-picture-shapes';
const KEEP_AT_MOST = 400;
const fileOf = (src: string) => src.replace(/^\/f\/[^/]+\//, '');
function readKept(): [string, string][] {
  try {
    const was = JSON.parse(globalThis.localStorage?.getItem(KEPT) ?? 'null');
    return was && typeof was === 'object' ? Object.entries(was).filter((e): e is [string, string] => typeof e[1] === 'string') : [];
  } catch { return []; }
}
const shapes = new Map<string, string>(readKept());
function learn(src: string, shape: string) {
  const file = fileOf(src);
  shapes.delete(file);
  shapes.set(file, shape);
  while (shapes.size > KEEP_AT_MOST) shapes.delete(shapes.keys().next().value!);
  try { globalThis.localStorage?.setItem(KEPT, JSON.stringify(Object.fromEntries(shapes))); } catch { /* private mode: this page keeps them */ }
}
export const shapeOf = (src: string) => shapes.get(fileOf(src)) ?? null;

// A PICTURE NEVER SEEN ASKS THE COMPUTER FOR ITS SHAPE (2026-10-14). WebKit
// gives a picture no size until its last byte, so a phone screenshot stayed a
// 4:3 box and then grew 514px under the words. Its width and height come off
// the file's first bytes (main/picture-shape.mjs) in a few bytes of answer,
// long before the picture's megabyte (tests/a-picture-the-phone-has-never-
// seen-gets-its-shape-before-it-arrives).
type ShapeAsked = Pick<HTMLImageElement, 'complete' | 'getAttribute'> & { style?: { aspectRatio?: string } };
type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
const asking = new Set<string>();
export function askShape(img: ShapeAsked, fetcher: Fetcher = (url) => fetch(url)) {
  const src = img.getAttribute('src') ?? '';
  const at = /^(\/f\/[^/]+\/)img\/(.+)$/.exec(src);
  if (!at || img.complete || shapeOf(src) || asking.has(fileOf(src))) return;
  const file = fileOf(src);
  asking.add(file);
  fetcher(`${at[1]}shape/${at[2]}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((said) => {
      const { w, h } = (said ?? {}) as { w?: number; h?: number };
      if (!(typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0)) return;
      if (!shapeOf(src)) learn(src, `${w} / ${h}`);
      if (!img.complete && img.getAttribute('src') === src && img.style) img.style.aspectRatio = shapeOf(src) ?? '';
    })
    .catch(() => { /* the box stays 4:3 */ })
    .finally(() => asking.delete(file));
}

export function watchPicture(img: PictureLike) {
  const src = img.getAttribute('src') ?? '';
  const loading = !img.complete;
  img.setAttribute(STATE, img.complete ? (img.naturalWidth > 0 ? 'ready' : 'failed') : 'loading');
  // While it loads, the box is the shape it had last time, if it has been seen.
  const shape = (value: string) => { if (img.style) img.style.aspectRatio = value; };
  shape(loading ? shapeOf(src) ?? '' : '');
  if (watched.has(img)) return;
  watched.add(img);
  img.addEventListener('load', () => {
    if (img.naturalWidth > 0 && (img.naturalHeight ?? 0) > 0) learn(img.getAttribute('src') ?? '', `${img.naturalWidth} / ${img.naturalHeight}`);
    shape('');
    img.setAttribute(STATE, 'ready');
  });
  img.addEventListener('error', () => { shape(''); img.setAttribute(STATE, 'failed'); });
}

/** Every picture drawn from now on, and again whenever its address changes. */
export function installPictureWatch(root: Node = document) {
  const each = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLImageElement) watchPicture(node);
    for (const img of node.querySelectorAll('img')) watchPicture(img);
  };
  each(root instanceof Document ? root.documentElement : root);
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'attributes') { if (change.target instanceof HTMLImageElement) watchPicture(change.target); }
      else for (const node of change.addedNodes) each(node);
    }
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
}

/** Rewrite every address already drawn and every one drawn from now on. */
export function installPhoneFiles(key: string, root: Node = document) {
  const fix = (el: Element) => {
    for (const attr of ATTRS) {
      const was = el.getAttribute(attr);
      if (!was) continue;
      const now = phoneFileUrl(was, key);
      if (now === was) continue;
      el.setAttribute(attr, now);
      if (attr === 'src' && el instanceof HTMLImageElement) askShape(el);
    }
  };
  const sweep = (node: Node) => {
    if (!(node instanceof Element)) return;
    fix(node);
    for (const el of node.querySelectorAll(ATTRS.map((a) => `[${a}*="://file/"]`).join(','))) fix(el);
  };
  sweep(root instanceof Document ? root.documentElement : root);
  const watch = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'attributes') fix(change.target as Element);
      else for (const node of change.addedNodes) sweep(node);
    }
  });
  watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });
  return () => watch.disconnect();
}
