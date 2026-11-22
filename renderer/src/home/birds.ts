// The website's birds in the mountains' 3px dots, each drifting slowly about a
// spot of its own. They keep out of the words, and stay put rather than fly
// across: the website's flock was too much to have in view all day.

import type { Rgb } from './mountains';

/** Its spot, how far it drifts from it, and where in its drift it is. */
export type Bird = { hx: number; hy: number; x: number; y: number; t: number; rx: number; ry: number; w: [number, number]; p: [number, number, number, number]; ph: number; s: number };
type Box = { x: number; y: number; w: number; h: number };
/** The card in px; the birds keep between `top` and `bottom`, and out of `avoid`. */
export type BirdSky = { W: number; H: number; top: number; bottom: number; avoid: Box | null };

const MARGIN = 60, SIZE = 14;
/** How far a bird drifts from its spot, at most, sideways and up or down. */
export const DRIFT = { x: 42, y: 18 };

const outside = (x: number, y: number, box: Box | null, pad = 0) => !box || x < box.x - pad || x > box.x + box.w + pad || y < box.y - pad || y > box.y + box.h + pad;

/** Where `n` birds keep to: evenly across the sky, at different heights, clear of the words. */
export function perches(n: number, sky: BirdSky): { x: number; y: number }[] {
  const spots: { x: number; y: number }[] = [];
  const heights = [0.5, 0.12, 0.22, 0.62];
  for (let i = 0; i < n; i++) {
    const x = sky.W * ((i + 0.5) / n);
    let y = sky.top + (sky.bottom - sky.top) * heights[i % heights.length];
    const box = sky.avoid;
    // Over the words it sits above them.
    if (box && !outside(x, y, box, MARGIN)) y = Math.max(sky.top, box.y - MARGIN);
    spots.push({ x, y });
  }
  return spots;
}

export function seedBirds(n: number, sky: BirdSky, rnd: () => number = Math.random): Bird[] {
  const birds = perches(n, sky).map(({ x, y }): Bird => ({
    hx: x, hy: y, x, y, t: 0,
    rx: DRIFT.x * (0.65 + 0.35 * rnd()), ry: DRIFT.y * (0.6 + 0.4 * rnd()),
    w: [0.2 + 0.12 * rnd(), 0.15 + 0.1 * rnd()],
    p: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28, rnd() * 6.28],
    ph: rnd() * 6.28, s: SIZE,
  }));
  for (const b of birds) drift(b, 0);
  return birds;
}

/** Move a bird along its drift by `dt` seconds. Its path is a sum of slow sines, so it never leaves its radius. */
export function drift(b: Bird, dt: number) {
  b.t += dt;
  b.x = b.hx + b.rx * (0.7 * Math.sin(b.w[0] * b.t + b.p[0]) + 0.3 * Math.sin(1.7 * b.w[0] * b.t + b.p[1]));
  b.y = b.hy + b.ry * (0.7 * Math.sin(b.w[1] * b.t + b.p[2]) + 0.3 * Math.sin(1.9 * b.w[1] * b.t + b.p[3]));
  b.ph += 2.2 * dt;
}

/** The dots a bird lights, as grid cells: two bent wings mirrored about its middle, up or down with its flap. */
export function birdCells(b: Pick<Bird, 'x' | 'y' | 'ph' | 's'>, pitch: number): [number, number][] {
  const flap = Math.sin(b.ph), s = b.s;
  const seg = (qx: number, qy: number, ax: number, ay: number, bx: number, by: number) => {
    const pax = qx - ax, pay = qy - ay, bax = bx - ax, bay = by - ay;
    const k = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
    return Math.hypot(pax - bax * k, pay - bay * k);
  };
  const m = [0.45 * s, 0.3 * s + 0.22 * s * flap], tip = [s, 0.5 * s + 0.3 * s * flap];
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

/** The most that fly at once. */
export const MAX_BIRDS = 4;
/** How often they move. Each update is a pixel or two, so nothing is animated in between:
 *  a picture sliding 60 times a second would redraw the window that often. */
const TICK_MS = 125;
/** A tick this much later than planned is the computer struggling, not a bird. */
const SLOW_GAP = 2.5;
/** This many late ticks, not made up since, and the flock rests. */
const SLOW_TICKS = 20;
const REST_MS = 30_000;
/** Re-read where the words are, and the card's size, this often. */
const LOOK_MS = 500;
/** Typing or scrolling, and the flock waits this long after the last of it. */
const BUSY_MS = 1500;
/** Nobody at the computer for this long, and it rests until they are back. */
const IDLE_MS = 90_000;
const CELL_W = 48, CELL_H = 36, CELL_S = 14;

/** One more tick that came `gap` ms after the last; a late one counts up, a good one counts back down. */
export function lateness(late: number, gap: number): number {
  return gap > TICK_MS * SLOW_GAP ? late + 1 : Math.max(0, late - 0.5);
}

/** Why the flock is not moving at `now`, if it is not. */
export function flockWaits(now: number, { busyUntil, lastInput, late }: { busyUntil: number; lastInput: number; late: number }): 'busy' | 'idle' | 'slow' | null {
  if (late >= SLOW_TICKS) return 'slow';
  if (now < busyUntil) return 'busy';
  return now - lastInput > IDLE_MS ? 'idle' : null;
}

const sprites = new Map<string, string>();
/** The bird's three wing positions, one under the other, drawn once per ink. */
function sprite(ink: Rgb, pitch: number): string {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const key = `${ink.join(',')}@${dpr}@${pitch}`;
  const had = sprites.get(key);
  if (had !== undefined) return had;
  const c = document.createElement('canvas');
  c.width = CELL_W * dpr; c.height = CELL_H * 3 * dpr;
  const g = c.getContext('2d');
  if (!g) { sprites.set(key, ''); return ''; }
  g.scale(dpr, dpr);
  g.fillStyle = `rgb(${ink.join(',')})`;
  // Wings down, level, up: where sin(ph) sits at each end and in the middle.
  [-Math.PI / 2, 0, Math.PI / 2].forEach((ph, frame) => {
    const b = { x: CELL_W / 2, y: CELL_H / 2, ph, s: CELL_S };
    for (const [cx, cy] of birdCells(b, pitch)) {
      const y = cy * pitch;
      if (y >= 0 && y < CELL_H) g.fillRect(cx * pitch, frame * CELL_H + y, pitch - 0.2, pitch - 0.2);
    }
  });
  const url = c.toDataURL();
  sprites.set(key, url);
  return url;
}

const FRAMES = [-Math.PI / 2, 0, Math.PI / 2];
/** Which of the sprite's wing positions a bird shows now. */
export const wingFrame = (b: Bird): number => (Math.sin(b.ph) > 0.35 ? 2 : Math.sin(b.ph) < -0.35 ? 0 : 1);

/**
 * Puts up to MAX_BIRDS birds over `layer`, which lies over the card, and drifts
 * each about its own spot until the returned function is called. Each is a
 * small picture moved by transform, so nothing is repainted. `sky` says where
 * they may be, and is asked twice a second.
 */
export function flyBirds(layer: HTMLElement, { ink, n = MAX_BIRDS, pitch = 3, sky }: { ink: Rgb; n?: number; pitch?: number; sky: (W: number, H: number) => Omit<BirdSky, 'W' | 'H'> }): () => void {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none' });
  let W = 0, H = 0, birds: Bird[] = [], els: { wrap: HTMLElement; wing: HTMLElement }[] = [];
  let world: BirdSky = { W, H, top: 0, bottom: 0, avoid: null };
  let timer = 0, last = 0, looked = 0, late = 0, resting = false, gone = false;
  let busyUntil = 0, lastInput = performance.now();

  /** Read the card's size and where the words are, and move the spots with them. */
  const look = () => {
    W = layer.clientWidth; H = layer.clientHeight;
    if (!W || !H) return false;
    const before = world;
    world = { W, H, ...sky(W, H) };
    const spots = birds.length ? perches(birds.length, world) : [];
    if (spots.length && (before.W !== W || before.H !== H || before.top !== world.top || before.avoid?.y !== world.avoid?.y || before.avoid?.x !== world.avoid?.x)) birds.forEach((b, i) => { b.hx = spots[i].x; b.hy = spots[i].y; });
    return true;
  };
  const hatch = () => {
    if (!look()) return false;
    const url = sprite(ink, pitch);
    birds = seedBirds(Math.min(n, MAX_BIRDS), world);
    els = birds.map(() => {
      const wrap = document.createElement('div'), wing = document.createElement('i');
      Object.assign(wrap.style, { position: 'absolute', left: '0', top: '0', width: `${CELL_W}px`, height: `${CELL_H}px`, overflow: 'hidden', willChange: 'transform' });
      Object.assign(wing.style, { display: 'block', width: `${CELL_W}px`, height: `${CELL_H * FRAMES.length}px`, background: `url(${url}) 0 0 / ${CELL_W}px ${CELL_H * FRAMES.length}px no-repeat` });
      wrap.appendChild(wing);
      layer.appendChild(wrap);
      return { wrap, wing };
    });
    return true;
  };
  const put = () => {
    birds.forEach((b, i) => {
      els[i].wrap.style.transform = `translate3d(${(b.x - CELL_W / 2).toFixed(1)}px, ${(b.y - CELL_H / 2).toFixed(1)}px, 0)`;
      els[i].wing.style.transform = `translateY(${-wingFrame(b) * CELL_H}px)`;
    });
  };
  const rest = () => {
    resting = true;
    layer.replaceChildren();
    els = []; birds = [];
    timer = window.setTimeout(() => { resting = false; late = 0; start(); }, REST_MS);
  };
  const tick = () => {
    timer = 0;
    if (gone || document.hidden || !document.hasFocus()) { last = 0; return; }
    const now = performance.now();
    if (last) late = lateness(late, now - last);
    last = now;
    const waits = flockWaits(now, { busyUntil, lastInput, late });
    if (waits === 'slow') { rest(); return; }
    if (waits === 'idle') { last = 0; return; }
    if (waits === 'busy') { last = 0; timer = window.setTimeout(tick, busyUntil - now + 20); return; }
    if (now - looked > LOOK_MS) { looked = now; look(); }
    for (const b of birds) drift(b, TICK_MS / 1000);
    put();
    timer = window.setTimeout(tick, TICK_MS);
  };
  const go = () => { if (!timer && !resting && !gone) { last = 0; timer = window.setTimeout(tick, TICK_MS); } };
  const start = () => {
    if (gone || resting || document.hidden) return;
    if (!birds.length && !hatch()) return;
    put();
    if (!still) go();
  };
  const halt = () => { if (timer && !resting) { clearTimeout(timer); timer = 0; } last = 0; };
  const onVisible = () => { if (document.hidden) halt(); else start(); };
  const onBlur = () => halt();
  const onFocus = () => start();
  const onMove = () => { lastInput = performance.now(); if (!timer && !resting && !gone && birds.length) go(); };
  const onBusy = () => { lastInput = performance.now(); busyUntil = lastInput + BUSY_MS; if (!timer) start(); };
  const onResize = () => { looked = 0; if (look()) put(); };
  const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;

  const ready = window.setTimeout(() => {
    start();
    if (still) return;
    window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onBusy, { passive: true, capture: true });
    window.addEventListener('wheel', onBusy, { passive: true, capture: true });
    resized?.observe(layer);
  }, 600);
  return () => {
    gone = true;
    resized?.disconnect();
    clearTimeout(ready); clearTimeout(timer);
    window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('keydown', onBusy, true);
    window.removeEventListener('wheel', onBusy, true);
    layer.replaceChildren();
  };
}
