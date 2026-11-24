// The glass over the mountains, drawn once. A backdrop-filter blurs what is
// behind it again for every frame, and with birds moving that was most of their
// cost. What is behind this glass never moves, so a small soft copy of the
// mountains lies over the crisp ones, seen through a hole the shape of each pane.

import { boxIn } from './birds';
import { releaseCanvas } from './sky';

export type Pane = { x: number; y: number; w: number; h: number; r: number };

/** What is glass on Home. */
const PANES = '.hm-glass, .hm-start .tc-card.tc-inline';
/** The copy is this much smaller than the mountains, and stretching it back is the blur. */
const SMALLER = 6;

const round = (n: number) => Math.round(n * 100) / 100;

/** The panes as one clip-path path, each with its own corners. */
export function panesPath(panes: readonly Pane[]): string {
  return panes.filter((p) => p.w > 0 && p.h > 0).map((p) => {
    const r = round(Math.min(p.r, p.w / 2, p.h / 2)), w = round(p.w - 2 * r), h = round(p.h - 2 * r);
    const turn = (x: number, y: number) => (r ? `a${r} ${r} 0 0 1 ${x} ${y}` : '');
    return `M${round(p.x + r)} ${round(p.y)}h${w}${turn(r, r)}v${h}${turn(-r, r)}h${-w}${turn(-r, -r)}v${-h}${turn(r, -r)}z`;
  }).join('');
}

/** `canvas` halved until it is no wider than `width`. Shrunk in one go, a regular grid of dots comes out
 *  as whichever dots the samples land on, up to five times too strong; each half averages four. */
function halved(canvas: HTMLCanvasElement, width: number): HTMLCanvasElement {
  let from = canvas;
  while (from.width > width) {
    const to = document.createElement('canvas');
    to.width = Math.max(1, from.width >> 1); to.height = Math.max(1, from.height >> 1);
    const g = to.getContext('2d');
    if (!g) return from;
    g.drawImage(from, 0, 0, to.width, to.height);
    if (from !== canvas) releaseCanvas(from);
    from = to;
  }
  return from;
}

/** Lays the soft copy of `canvas` in `wrap`, over it. `paint` draws it again; call it when the mountains are drawn.
 *  `fit` puts the holes where the panes are now, for a pane moved by something none of its watchers see. */
export function frost(wrap: HTMLElement, canvas: HTMLCanvasElement): { paint: () => void; fit: () => void; stop: () => void } {
  const soft = document.createElement('canvas');
  soft.className = 'home-frost';
  soft.style.clipPath = 'inset(50%)';
  wrap.appendChild(soft);
  let path = '', frame = 0, watched: Element[] = [];

  const fit = () => {
    frame = 0;
    if (soft.style.width !== canvas.style.width) soft.style.width = canvas.style.width;
    const panes: Pane[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(PANES)) {
      const box = boxIn(el, soft);
      if (box) panes.push({ ...box, r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 });
    }
    watch();
    const next = panesPath(panes);
    if (next === path) return;
    path = next;
    soft.style.clipPath = path ? `path("${path}")` : 'inset(50%)';
  };
  const later = () => { if (!frame) frame = requestAnimationFrame(fit); };

  const sizes = new ResizeObserver(fit);
  // A pane that moves without growing is moved by one that did.
  const watch = () => {
    const now = [wrap, ...document.querySelectorAll(`${PANES}, .hm-page, .hm-col, .hm-hello`)];
    if (now.length === watched.length && now.every((el, i) => el === watched[i])) return;
    watched = now;
    sizes.disconnect();
    for (const el of now) sizes.observe(el);
  };
  // Cards arrive as Home's lists are read.
  const arrivals = new MutationObserver(later);
  const host = wrap.parentElement ?? document.body;
  arrivals.observe(host, { childList: true, subtree: true });
  host.addEventListener('scroll', fit, { capture: true, passive: true });
  watch();

  return {
    fit,
    paint: () => {
      if (!canvas.width || !canvas.height) return;
      const dpr = canvas.clientWidth ? canvas.width / canvas.clientWidth : 1;
      soft.width = Math.max(1, Math.round(canvas.width / dpr / SMALLER));
      soft.height = Math.max(1, Math.round(canvas.height / dpr / SMALLER));
      const g = soft.getContext('2d');
      if (!g) return;
      // Safari's canvas has no filter; the stretch alone is soft enough there.
      if ('filter' in g) g.filter = 'blur(2px) saturate(1.25)';
      const small = halved(canvas, soft.width * 2);
      g.drawImage(small, 0, 0, soft.width, soft.height);
      if (small !== canvas) releaseCanvas(small);
      fit();
    },
    stop: () => {
      sizes.disconnect(); arrivals.disconnect();
      host.removeEventListener('scroll', fit, true);
      if (frame) cancelAnimationFrame(frame);
      soft.remove();
      releaseCanvas(soft);
    },
  };
}
