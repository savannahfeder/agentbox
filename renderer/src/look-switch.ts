// CHANGING THE LOOK IN ONE FRAME, with the picture already decoded.
//
// Before this, pressing a tile set `data-skin` straight away. The window then
// painted with no picture while an 8 megapixel file was fetched and decoded,
// and every colour transition in the stylesheet (fourteen different lengths,
// 0.12s to 0.3s) fired at once, so the surfaces caught up in a ripple and the
// picture popped in after them. That is the lag and the "few seconds" she saw.
//
// So a switch now goes in this order:
//   1. `readySkin` loads and decodes the picture the new look paints with, and
//      waits for that before anything on screen moves. A picture already used
//      this session answers at once.
//   2. `swapLook` applies the change with every transition switched off, so
//      nothing catches up afterwards, inside a view transition, so the old
//      window fades into the new one over 180ms instead of cutting.
// Hovering or focusing a tile starts step 1 early, so by the click it is done.

import type { SkinChoice } from './skins';

// Every picture a skin paints the window with, by file name, as the URL Vite
// emits. The same files the stylesheet's --skin-image points at, so the decode
// here warms the exact image the window is about to draw.
const FILES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('./assets/*.webp', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.replace('./assets/', '').replace('.webp', ''), url as string]),
);

// The one skin whose picture is not named after it (styles.css, orbital-glass).
const FILE_OF: Record<string, string> = { 'orbital-glass': 'orbit-rings' };

export function skinImageUrl(skin: SkinChoice, soft: boolean): string | null {
  if (skin === 'none') return null;
  const base = FILE_OF[skin] ?? skin;
  return FILES[soft ? `${base}-sm` : base] ?? FILES[base] ?? null;
}

// Held rather than dropped, so the decoded picture stays in memory for the
// session and walking back to a look is instant.
const decoded = new Map<string, Promise<void>>();
const held: HTMLImageElement[] = [];

// A picture that is slow for any reason must not hold the switch hostage. After
// this long the look changes anyway and the picture arrives when it arrives,
// which is the old behaviour and no worse.
const MAX_WAIT_MS = 700;

export function readySkin(skin: SkinChoice): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  const soft = document.documentElement.getAttribute('data-skin-detail') === 'soft';
  const url = skinImageUrl(skin, soft);
  if (!url) return Promise.resolve();
  let ready = decoded.get(url);
  if (!ready) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    held.push(img);
    ready = img.decode().catch(() => {});
    decoded.set(url, ready);
  }
  return Promise.race([ready, new Promise<void>((r) => setTimeout(r, MAX_WAIT_MS))]);
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => unknown };

export function swapLook(apply: () => void): void {
  const root = document.documentElement;
  const run = () => {
    root.setAttribute('data-look-switching', '');
    apply();
    // Two frames: one for the new styles to land with transitions off, one so
    // turning them back on does not itself animate anything.
    requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute('data-look-switching')));
  };
  // Reduced motion is honoured in styles.css, which turns the fade off.
  const doc = document as ViewTransitionDoc;
  if (typeof doc.startViewTransition === 'function') doc.startViewTransition(run);
  else run();
}
