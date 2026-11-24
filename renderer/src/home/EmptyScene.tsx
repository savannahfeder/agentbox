import { useLayoutEffect } from 'react';
import { releaseCanvas, type SkyArt } from './sky';
import { drawMountains, type Mountains } from './mountains';
import { followTheCard } from './sky-follows-the-card';
import { useSidebarShrinks } from '../sidebar-shrinks';
import { boxIn, flyBirds } from './birds';

/** PROTOTYPE (w-ef3bfd38f2): ways to put the mountains and birds behind the empty Inbox. The switch goes once one is chosen. */
export const SCENE_KEY = 'zero.preview.emptyScene';

type Scene = {
  /** Mountains laid over the art's own; `quiet` is placed on the words when `clear` is set. */
  hills: Partial<Mountains>;
  clear?: { rx: number; ry: number } | null;
  birds: number;
  /** The band the birds keep to, in shares of the card. */
  band: [number, number];
  sun?: { r: number; y: number };
};

const SCENES: Record<string, Scene> = {
  1: { hills: { lift: 1.0 }, clear: { rx: 0.3, ry: 0.16 }, birds: 4, band: [0.17, 0.42] },
  2: { hills: { lift: 1.55, alpha: 0.5 }, clear: { rx: 0.37, ry: 0.23 }, birds: 4, band: [0.15, 0.36] },
  3: { hills: { lift: 1.5, alpha: 0.48, at: 20 }, clear: { rx: 0.42, ry: 0.42 }, birds: 4, band: [0.16, 0.5] },
  4: { hills: { lift: 0.62 }, clear: null, birds: 3, band: [0.16, 0.4], sun: { r: 0.15, y: 0.96 } },
  5: { hills: { lift: 0.8, alpha: 0.4 }, clear: { rx: 0.3, ry: 0.14 }, birds: 7, band: [0.15, 0.62] },
  6: { hills: { lift: 0.9, alpha: 0.78, at: 90 }, clear: null, birds: 4, band: [0.17, 0.42] },
};

export const sceneChoice = (): string => {
  try { return localStorage.getItem(SCENE_KEY) ?? '1'; } catch { return '1'; }
};

const BAYER8 = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];

/** A dithered sun behind the ranges: full at its middle, thinning to its rim. */
function sun(g: CanvasRenderingContext2D, W: number, H: number, s: { r: number; y: number; x: number; under: number }, ink: [number, number, number]) {
  const cy = H * s.y, pitch = 3, R = Math.min(s.r * Math.min(W, H * 1.6), cy - s.under - 40), cx = W * s.x;
  if (R <= 0) return;
  g.fillStyle = `rgba(${ink.join(',')},0.34)`;
  for (let y = Math.max(0, cy - R); y < Math.min(H, cy + R); y += pitch) {
    for (let x = cx - R; x < cx + R; x += pitch) {
      const d = Math.hypot(x - cx, y - cy) / R;
      if (d > 1) continue;
      const i = Math.round(x / pitch), j = Math.round(y / pitch);
      const v = 0.92 - 0.5 * d * d;
      if (v > (BAYER8[(j & 7) * 8 + (i & 7)] + 0.5) / 64) g.fillRect(x, y, pitch - 0.9, pitch - 0.9);
    }
  }
}

/** The empty Inbox's mountains and birds, over the whole card, clear of the heading and the writing box. */
export function EmptyScene({ art }: { art: SkyArt }) {
  const folds = useSidebarShrinks();
  useLayoutEffect(() => {
    const host = document.querySelector<HTMLElement>('.app.workspace-layout');
    const base = art.mountains;
    if (!host || !base) return;
    const scene = SCENES[sceneChoice()] ?? SCENES[1];
    const wrap = document.createElement('div');
    wrap.className = 'home-sky inbox-sky inbox-sky-zero inbox-scene';
    wrap.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    host.insertBefore(wrap, host.firstChild);
    const words = () => {
      const page = document.querySelector('.th-start');
      const a = boxIn(page?.querySelector('h2') ?? null, wrap, 24), b = boxIn(page?.querySelector('.th-clear-compose') ?? null, wrap, 24);
      if (!a || !b) return null;
      const x = Math.min(a.x, b.x), y = a.y;
      return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: b.y + b.h - y };
    };
    const stop = followTheCard(host, wrap, canvas, {
      card: () => {
        const bf = getComputedStyle(host, '::before');
        const L = parseFloat(bf.left) || 0, T = parseFloat(bf.top) || 0, R = parseFloat(bf.right) || 0, B = parseFloat(bf.bottom) || 0;
        const w = host.offsetWidth - L - R, h = host.offsetHeight - T - B;
        return w > 0 && h > 0 ? { left: L, top: T, width: w, height: h } : null;
      },
      paint: (_card, reach) => {
        const box = words();
        return {
          key: JSON.stringify(box && [Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h)]),
          draw: () => {
            const W = canvas.clientWidth, H = canvas.clientHeight;
            if (!W || !H) return;
            const quiet = scene.clear && box
              ? { x: (box.x + reach + box.w / 2) / W, y: 1 - (box.y + box.h / 2) / H, ...scene.clear }
              : null;
            const m: Mountains = { ...base, ...scene.hills, quiet };
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            drawMountains(canvas, m, { dpr, ground: null });
            const g = canvas.getContext('2d');
            if (!g) return;
            g.save();
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            g.globalCompositeOperation = 'destination-over';
            if (scene.sun) sun(g, W, H, { ...scene.sun, x: box ? (box.x + reach + box.w / 2) / W : 0.5, under: box ? box.y + box.h : 0 }, base.inks[0]);
            const fill = g.createLinearGradient(0, 0, 0, H);
            fill.addColorStop(0.4, art.bg); fill.addColorStop(1, art.foot ?? art.bg);
            g.fillStyle = fill; g.fillRect(0, 0, W, H);
            g.restore();
          },
        };
      },
    }, { folds, watch: [document.querySelector('.th-clear-compose')].filter((e): e is Element => !!e) });
    let land = () => {};
    const ink = art.birds;
    if (ink) {
      // A flock past four is a second flight over the same sky, nudged down so the two never share a spot.
      const flights: [number, number][] = scene.birds > 4 ? [[4, 0], [scene.birds - 4, 0.09]] : [[scene.birds, 0]];
      const lands = flights.map(([n, down]) => {
        const layer = document.createElement('div');
        layer.className = 'home-birds';
        wrap.appendChild(layer);
        return flyBirds(layer, { ink, n, sky: (_W, H) => ({ top: H * (scene.band[0] + down), bottom: H * (scene.band[1] + down), avoid: words() }) });
      });
      land = () => lands.forEach((l) => l());
    }
    return () => { land(); stop(); wrap.remove(); releaseCanvas(canvas); };
  }, [art, folds]);
  return null;
}
