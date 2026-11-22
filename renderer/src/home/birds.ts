// The website's birds in the mountains' 3px dots, each going round a spot of its
// own at an even speed, clear of the words. The website's whole flock was too
// much to have in view all day, and birds that stop and start look stuck.

import type { Rgb } from './mountains';

type Box = { x: number; y: number; w: number; h: number };
/** The card in px; the birds keep between `top` and `bottom`, and out of `avoid`. */
export type BirdSky = { W: number; H: number; top: number; bottom: number; avoid: Box | null };
/** Where a bird keeps to, and how far round it it goes. */
export type Spot = { x: number; y: number; rx: number; ry: number };
/** Its spot, where it is, how far round its spot it has got, and its wings. */
export type Bird = { hx: number; hy: number; rx: number; ry: number; x: number; y: number; a: number; dir: 1 | -1; v: number; t: number; p: [number, number, number]; ph: number };

/** The most that fly at once. */
export const MAX_BIRDS = 4;
/** The furthest a bird goes from its spot. */
export const RADIUS = { x: 84, y: 26 };
/** In px a second. The flock's 50 was too active, and 10 looked stuck. */
const SPEED = 24;
/** Half a bird, kept clear of the words and the card's top. */
const HALF = { w: 22, h: 14 };
const SIZE = 14;

const between = (lo: number, hi: number, k: number) => lo + (Math.max(lo, hi) - lo) * k;

/** `n` spots, evenly across the sky at different heights, each round clear of the words. */
export function spots(n: number, sky: BirdSky): Spot[] {
  const heights = [0.5, 0.12, 0.3, 0.62], above = [0.7, 0.1, 0.4, 0.8];
  const rx = Math.min(RADIUS.x, (sky.W / n) * 0.34), box = sky.avoid;
  return Array.from({ length: n }, (_, i) => {
    const x = (sky.W * (i + 0.5)) / n;
    let ry = RADIUS.y, y = between(sky.top + ry, sky.bottom - ry, heights[i % heights.length]);
    const overWords = box && x + rx + HALF.w > box.x && x - rx - HALF.w < box.x + box.w && y + ry + HALF.h > box.y && y - ry - HALF.h < box.y + box.h;
    if (overWords) {
      ry = Math.min(RADIUS.y, Math.max(3, (box.y - sky.top) / 2 - HALF.h));
      const lowest = box.y - HALF.h - ry;
      y = Math.max(HALF.h + ry, Math.min(lowest, between(sky.top + ry, lowest, above[i % above.length])));
    }
    return { x, y, rx, ry };
  });
}

export function seedBirds(n: number, sky: BirdSky, rnd: () => number = Math.random): Bird[] {
  return spots(n, sky).map(({ x, y, rx, ry }, i): Bird => {
    const b: Bird = { hx: x, hy: y, rx, ry, x, y, a: rnd() * 6.28, dir: i % 2 ? 1 : -1, v: SPEED * (0.92 + 0.16 * rnd()), t: 0, p: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], ph: rnd() * 6.28 };
    drift(b, 0);
    return b;
  });
}

/** Move a bird `dt` seconds on round its spot: the same speed all the way round, so it is never all but still at an end. */
export function drift(b: Bird, dt: number) {
  b.t += dt;
  const wide = b.rx * (0.9 + 0.1 * Math.sin(0.13 * b.t + b.p[0])), tall = b.ry * (0.9 + 0.1 * Math.sin(0.17 * b.t + b.p[1]));
  const reach = Math.max(1, Math.hypot(wide * Math.sin(b.a), tall * Math.cos(b.a)));
  // A round too small for the speed is gone round more slowly, not in a spin.
  b.a += (b.dir * b.v * dt) / Math.max(reach, b.v / 1.2);
  b.x = b.hx + wide * Math.cos(b.a);
  b.y = b.hy + tall * Math.sin(b.a);
  b.ph += 4.4 * dt;
}

/** How far up its wings are, -1 to 1: a few beats, then a glide. `energy` 0 is wings held level. */
export function wings(b: Bird, energy = 1): number {
  const beating = Math.min(1, Math.max(0, 1.6 * Math.sin(0.55 * b.t + b.p[2]) + 0.9));
  return Math.sin(b.ph) * beating * energy;
}

/** The dots a bird lights, as grid cells: two bent wings mirrored about its middle, `up` -1 to 1. */
export function birdCells(b: { x: number; y: number; s: number; up: number }, pitch: number): [number, number][] {
  const { s, up } = b;
  const seg = (qx: number, qy: number, ax: number, ay: number, bx: number, by: number) => {
    const pax = qx - ax, pay = qy - ay, bax = bx - ax, bay = by - ay;
    const k = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
    return Math.hypot(pax - bax * k, pay - bay * k);
  };
  const m = [0.45 * s, 0.3 * s + 0.22 * s * up], tip = [s, 0.5 * s + 0.3 * s * up];
  const out: [number, number][] = [];
  for (let cx = Math.floor((b.x - s * 1.3) / pitch); cx < (b.x + s * 1.3) / pitch; cx++) {
    for (let cy = Math.floor((b.y - s) / pitch); cy < (b.y + s) / pitch; cy++) {
      const qx = Math.abs((cx + 0.5) * pitch - b.x), qy = b.y - (cy + 0.5) * pitch;
      if (Math.min(seg(qx, qy, 0, 0, m[0], m[1]), seg(qx, qy, m[0], m[1], tip[0], tip[1])) < pitch * 0.7) out.push([cx, cy]);
    }
  }
  return out;
}

/**
 * `el`'s box in `frame`'s own px, padded. The setup draws the whole app scaled
 * down, so a box read off the screen is turned back into laid-out px.
 */
export function boxIn(el: Element | null, frame: HTMLElement, pad = 0): Box | null {
  if (!el) return null;
  const f = frame.getBoundingClientRect(), r = el.getBoundingClientRect();
  const k = f.width ? frame.offsetWidth / f.width : 1;
  return { x: (r.left - f.left) * k - pad, y: (r.top - f.top) * k - pad, w: r.width * k + pad * 2, h: r.height * k + pad * 2 };
}

/* -------------------------------- keeping time ------------------------------- */

/** Nobody at the window for this long, and they settle until somebody is. */
export const AWAY_MS = 180_000;
/** How long to wait between updates, then the wait each one is drawn after: thirty a second, fifteen, then eight. */
const WAITS = [24, 57, 112];
/** An update this many times later than it should be is the computer falling behind. */
const LATE = 2.5;
/** This many, not made up since, and they are updated less often. */
const LATE_MANY = 12;
/** This many on time, and they are updated more often again. */
const WELL_MANY = 90;
/** Falling behind even at the slowest: they settle for this long. */
const SETTLE_MS = 10_000;
/** How long easing to a stop, or out of one, takes to get most of the way. */
const EASE_S = 0.7;

/** `step` is the place in WAITS; `energy` is 1 flying and 0 settled, and eases between. `last` 0 is an update with none before it to count from. */
export type Clock = { step: number; late: number; well: number; seen: number; last: number; energy: number; settledUntil: number };
export const newClock = (now: number): Clock => ({ step: 0, late: 0, well: 0, seen: now, last: 0, energy: 1, settledUntil: 0 });

/** Somebody is at the window: the pointer, a key, a scroll, or it was brought into view. */
export function here(c: Clock, now: number) { c.seen = now; }

/** An update at `now`: how far their own time moves, in seconds, and how long to wait for the next; null until somebody is here. */
export function beat(c: Clock, now: number): { dt: number; wait: number | null } {
  const gap = c.last ? now - c.last : 0;
  c.last = now;
  const settled = now < c.settledUntil;
  if (gap && !settled) {
    if (gap > (WAITS[c.step] + 10) * LATE) { c.late += 1; c.well = 0; } else { c.late = Math.max(0, c.late - 0.5); c.well += 1; }
    if (c.late >= LATE_MANY) {
      c.late = 0; c.well = 0;
      if (c.step < WAITS.length - 1) c.step += 1; else c.settledUntil = now + SETTLE_MS;
    } else if (c.well >= WELL_MANY && c.step > 0) { c.step -= 1; c.well = 0; }
  }
  const flying = now >= c.settledUntil && now - c.seen <= AWAY_MS;
  const seconds = Math.min(gap, 100) / 1000;
  c.energy += ((flying ? 1 : 0) - c.energy) * (1 - Math.exp(-Math.min(gap, 1000) / 1000 / EASE_S));
  if (flying && c.energy > 0.995) c.energy = 1;
  if (!flying && c.energy < 0.02) {
    c.energy = 0;
    const back = c.settledUntil - now;
    c.last = 0;
    return { dt: 0, wait: now - c.seen > AWAY_MS ? null : Math.max(back, 0) };
  }
  return { dt: seconds * c.energy, wait: WAITS[c.step] };
}

/* ---------------------------------- drawing ---------------------------------- */

/** Re-read where the words are, and the card's size, this often. */
const LOOK_MS = 1000;
/** Look this often for the card coming into view. */
const OUT_OF_VIEW_MS = 120;
const CELL_W = 48, CELL_H = 36;
/** The wing positions drawn, down to up. */
const POSES = [-1, -0.5, 0, 0.5, 1];

const sprites = new Map<string, string>();
/** The bird's wing positions, one under the other, drawn once per ink. */
function sprite(ink: Rgb, pitch: number): string {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const key = `${ink.join(',')}@${dpr}@${pitch}`;
  const had = sprites.get(key);
  if (had !== undefined) return had;
  const c = document.createElement('canvas');
  c.width = CELL_W * dpr; c.height = CELL_H * POSES.length * dpr;
  const g = c.getContext('2d');
  if (!g) { sprites.set(key, ''); return ''; }
  g.scale(dpr, dpr);
  g.fillStyle = `rgb(${ink.join(',')})`;
  POSES.forEach((up, frame) => {
    for (const [cx, cy] of birdCells({ x: CELL_W / 2, y: CELL_H / 2, s: SIZE, up }, pitch)) {
      const y = cy * pitch;
      if (y >= 0 && y < CELL_H) g.fillRect(cx * pitch, frame * CELL_H + y, pitch - 0.2, pitch - 0.2);
    }
  });
  const url = c.toDataURL();
  sprites.set(key, url);
  return url;
}

/** Which of POSES a bird's wings are nearest. */
export const pose = (up: number): number => Math.round(((Math.min(1, Math.max(-1, up)) + 1) / 2) * (POSES.length - 1));

/**
 * Puts up to MAX_BIRDS birds over `layer`, which lies over the card, and flies
 * them until the returned function is called. Each is a small picture moved by
 * transform, so nothing is repainted. `sky` says where they may be, or null
 * while the card is out of view.
 */
export function flyBirds(layer: HTMLElement, { ink, n = MAX_BIRDS, pitch = 3, sky }: { ink: Rgb; n?: number; pitch?: number; sky: (W: number, H: number) => Omit<BirdSky, 'W' | 'H'> | null }): () => void {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none' });
  let birds: Bird[] = [], aims: Spot[] = [], els: { wrap: HTMLElement; wing: HTMLElement; pose: number }[] = [];
  let timer = 0, raf = 0, looked = 0, gone = false;
  const clock = newClock(performance.now());

  /** Read the card's size and where the words are; the spots move there by degrees. False while out of view. */
  const look = () => {
    looked = performance.now();
    const W = layer.clientWidth, H = layer.clientHeight;
    const area = W && H ? sky(W, H) : null;
    if (!area) return false;
    const world = { W, H, ...area };
    if (!birds.length) hatch(world);
    aims = spots(birds.length, world);
    return true;
  };
  const hatch = (world: BirdSky) => {
    const url = sprite(ink, pitch);
    birds = seedBirds(Math.min(n, MAX_BIRDS), world);
    els = birds.map(() => {
      const wrap = document.createElement('div'), wing = document.createElement('i');
      Object.assign(wrap.style, { position: 'absolute', left: '0', top: '0', width: `${CELL_W}px`, height: `${CELL_H}px`, overflow: 'hidden', willChange: 'transform' });
      Object.assign(wing.style, { display: 'block', width: `${CELL_W}px`, height: `${CELL_H * POSES.length}px`, background: `url(${url}) 0 0 / ${CELL_W}px ${CELL_H * POSES.length}px no-repeat` });
      wrap.appendChild(wing);
      layer.appendChild(wrap);
      return { wrap, wing, pose: -1 };
    });
  };
  const put = () => {
    const dpr = window.devicePixelRatio || 1, snap = (v: number) => Math.round(v * dpr) / dpr;
    birds.forEach((b, i) => {
      els[i].wrap.style.transform = `translate3d(${snap(b.x - CELL_W / 2)}px, ${snap(b.y - CELL_H / 2)}px, 0)`;
      const now = pose(wings(b, still ? 0 : clock.energy));
      if (now !== els[i].pose) { els[i].pose = now; els[i].wing.style.transform = `translateY(${-now * CELL_H}px)`; }
    });
  };
  /** Toward the spots the last look found: a window made smaller brings them in rather than throwing them. */
  const steer = (dt: number) => {
    const k = 1 - Math.exp(-dt / 0.8);
    birds.forEach((b, i) => {
      const to = aims[i];
      if (!to) return;
      b.hx += (to.x - b.hx) * k; b.hy += (to.y - b.hy) * k; b.rx += (to.rx - b.rx) * k; b.ry += (to.ry - b.ry) * k;
    });
  };
  const after = (ms: number) => { timer = window.setTimeout(() => { timer = 0; raf = requestAnimationFrame(step); }, ms); };
  const step = (now: number) => {
    raf = 0;
    if (gone || document.hidden) { clock.last = 0; return; }
    if (now - looked > LOOK_MS || !birds.length) {
      if (!look()) { clock.last = 0; looked = 0; after(OUT_OF_VIEW_MS); return; }
    }
    const { dt, wait } = beat(clock, now);
    if (dt) { steer(dt); for (const b of birds) drift(b, dt); }
    put();
    if (wait !== null && !still) after(wait);
  };
  const go = () => { if (!timer && !raf && !gone && !document.hidden) raf = requestAnimationFrame(step); };
  const onSign = () => { here(clock, performance.now()); go(); };
  const onVisible = () => {
    clock.last = 0;
    if (document.hidden) { clearTimeout(timer); cancelAnimationFrame(raf); timer = 0; raf = 0; } else onSign();
  };
  const signs = ['pointermove', 'keydown', 'wheel', 'focus'] as const;

  go();
  if (!still) {
    for (const s of signs) window.addEventListener(s, onSign, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisible);
  }
  const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { looked = 0; go(); }) : null;
  resized?.observe(layer);
  return () => {
    gone = true;
    resized?.disconnect();
    clearTimeout(timer); cancelAnimationFrame(raf);
    for (const s of signs) window.removeEventListener(s, onSign, true);
    document.removeEventListener('visibilitychange', onVisible);
    layer.replaceChildren();
  };
}
