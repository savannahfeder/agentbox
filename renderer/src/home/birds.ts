// The website's flock: gull shapes in the mountains' 3px dots that wander the
// sky together, keep out of the words, and scatter from the pointer.

import type { Rgb } from './mountains';

export type Bird = { x: number; y: number; vx: number; vy: number; h: number; ph: number; fear: number; s: number };
type Box = { x: number; y: number; w: number; h: number };
/** The card in px; the birds keep between `top` and `bottom`, and out of `avoid`. */
export type BirdSky = { W: number; H: number; top: number; bottom: number; avoid: Box | null; pointer: { x: number; y: number } | null };

const CRUISE = 45, FLEE_R = 150, MARGIN = 30, APART = 420, EDGE = 60;

const outside = (x: number, y: number, box: Box | null, pad = 0) => !box || x < box.x - pad || x > box.x + box.w + pad || y < box.y - pad || y > box.y + box.h + pad;

export function seedBirds(n: number, sky: BirdSky, rnd: () => number = Math.random): Bird[] {
  const birds: Bird[] = [];
  for (let i = 0; i < n; i++) {
    // Set off from an even spread, a little off it.
    const spot = perches(n, sky)[i];
    let x = spot.x, y = spot.y;
    for (let tries = 0; tries < 50; tries++) {
      x = spot.x + (rnd() - 0.5) * 120; y = Math.min(sky.bottom, Math.max(sky.top, spot.y + (rnd() - 0.5) * 80));
      if (outside(x, y, sky.avoid, MARGIN)) break;
    }
    const a = rnd() * Math.PI * 2;
    birds.push({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 10, h: a, ph: rnd() * Math.PI * 2, fear: 0, s: 12 + rnd() * 5 });
  }
  return birds;
}

/** Where `n` birds sit still: evenly across the sky, at different heights, clear of the words. */
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

export function stepBirds(birds: Bird[], dt: number, sky: BirdSky, rnd: () => number = Math.random) {
  for (const b of birds) {
    b.h += (rnd() - 0.5) * 2.4 * dt;
    let ax = (Math.cos(b.h) * CRUISE - b.vx) * 0.8, ay = (Math.sin(b.h) * CRUISE * 0.35 - b.vy) * 0.8;
    // They keep a sky's width apart rather than flocking: near each other they read as clutter.
    for (const o of birds) {
      if (o === b) continue;
      const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < APART) { const f = 1 - d / APART; ax += (dx / d) * 110 * f; ay += (dy / d) * 40 * f; }
    }
    // They turn at the card's edges: one half off the edge reads as a mistake.
    if (b.x < EDGE) { ax += (EDGE - b.x) * 6; b.h = 0; } else if (b.x > sky.W - EDGE) { ax -= (b.x - (sky.W - EDGE)) * 6; b.h = Math.PI; }
    if (b.y < sky.top) ay += (sky.top - b.y) * 3;
    if (b.y > sky.bottom) ay -= (b.y - sky.bottom) * 3;
    const box = sky.avoid;
    if (box) {
      const nx = Math.min(Math.max(b.x, box.x), box.x + box.w), ny = Math.min(Math.max(b.y, box.y), box.y + box.h);
      const dx = b.x - nx, dy = b.y - ny, d = Math.hypot(dx, dy);
      if (d === 0) {
        const l = b.x - box.x, r = box.x + box.w - b.x, t = b.y - box.y;
        if (t <= l && t <= r) { ay -= 900; b.h = -Math.PI / 2; } else if (l < r) { ax -= 900; b.h = Math.PI; } else { ax += 900; b.h = 0; }
      } else if (d < MARGIN) {
        const f = 1 - d / MARGIN;
        ax += (dx / d) * 600 * f; ay += (dy / d) * 600 * f;
        b.h = Math.atan2(dy, dx);
      }
    }
    const p = sky.pointer;
    if (p) {
      const mx = b.x - p.x, my = b.y - p.y, md = Math.hypot(mx, my);
      if (md > 0 && md < FLEE_R) {
        const f = 1 - md / FLEE_R;
        ax += (mx / md) * 2200 * f; ay += (my / md) * 2200 * f;
        b.fear = 1; b.h = Math.atan2(my, mx);
      }
    }
    b.vx += ax * dt; b.vy += ay * dt;
    const sp = Math.hypot(b.vx, b.vy), max = 60 + 220 * b.fear;
    if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    b.fear = Math.max(0, b.fear - dt * 0.8);
    b.ph += (6 + 14 * b.fear) * dt;
  }
}

/** The dots a bird lights, as grid cells: two bent wings mirrored about its middle, up or down with its flap. */
export function birdCells(b: Bird, pitch: number): [number, number][] {
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
/** How often the flock moves. Each update is a step of a dot or two, so nothing is animated in between:
 *  a picture sliding 60 times a second would redraw the window that often. */
const TICK_MS = 80;
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
    const b: Bird = { x: CELL_W / 2, y: CELL_H / 2, vx: 0, vy: 0, h: 0, ph, fear: 0, s: CELL_S };
    for (const [cx, cy] of birdCells(b, pitch)) {
      const y = cy * pitch;
      if (y >= 0 && y < CELL_H) g.fillRect(cx * pitch, frame * CELL_H + y, pitch - 0.2, pitch - 0.2);
    }
  });
  const url = c.toDataURL();
  sprites.set(key, url);
  return url;
}

/** Somebody is being shown round: the setup, or the walkthrough beside the app. Birds there sit still. */
const beingShownRound = () => document.documentElement.dataset.setup !== undefined || document.documentElement.dataset.tourFrame !== undefined;
/** Wings, for birds sitting still: level, up, down, level. */
const SITTING = [0, Math.PI / 2, -Math.PI / 2, 0];

const FRAMES = [-Math.PI / 2, 0, Math.PI / 2];
/** Which of the sprite's wing positions a bird shows now. */
export const wingFrame = (b: Bird): number => (Math.sin(b.ph) > 0.35 ? 2 : Math.sin(b.ph) < -0.35 ? 0 : 1);

/**
 * Flies up to MAX_BIRDS birds over `layer`, which lies over the card, until the
 * returned function is called. Each bird is a small picture moved by transform,
 * so nothing is repainted and the whole flock costs almost nothing. `sky` says
 * where they may go, and is asked twice a second.
 */
export function flyBirds(layer: HTMLElement, { ink, n = MAX_BIRDS, pitch = 3, sky }: { ink: Rgb; n?: number; pitch?: number; sky: (W: number, H: number) => Omit<BirdSky, 'W' | 'H' | 'pointer'> }): () => void {
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  Object.assign(layer.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none' });
  let W = 0, H = 0, k = 1, left = 0, top = 0, birds: Bird[] = [], els: { wrap: HTMLElement; wing: HTMLElement }[] = [];
  let area: Omit<BirdSky, 'W' | 'H' | 'pointer'> = { top: 0, bottom: 0, avoid: null };
  let pointer: { x: number; y: number } | null = null, raw: { x: number; y: number } | null = null;
  let timer = 0, last = 0, looked = 0, late = 0, resting = false, gone = false;
  let busyUntil = 0, lastInput = performance.now();

  const look = () => {
    W = layer.clientWidth; H = layer.clientHeight;
    if (!W || !H) return false;
    const r = layer.getBoundingClientRect();
    k = r.width ? W / r.width : 1; left = r.left; top = r.top;
    area = sky(W, H);
    return true;
  };
  const world = (): BirdSky => ({ W, H, pointer, ...area });

  const hatch = () => {
    if (!look()) return false;
    const url = sprite(ink, pitch);
    birds = seedBirds(Math.min(n, MAX_BIRDS), world());
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
  // On the mountains' dot grid, so the birds look drawn in the same dots.
  const put = () => {
    birds.forEach((b, i) => {
      const x = Math.round((b.x - CELL_W / 2) / pitch) * pitch, y = Math.round((b.y - CELL_H / 2) / pitch) * pitch;
      els[i].wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      els[i].wing.style.transform = `translateY(${-wingFrame(b) * CELL_H}px)`;
    });
  };
  const move = () => {
    for (let s = 0; s < 3; s++) stepBirds(birds, TICK_MS / 1000 / 3, world());
    put();
  };
  const rest = () => {
    resting = true;
    layer.replaceChildren();
    els = []; birds = [];
    timer = window.setTimeout(() => { resting = false; late = 0; start(); }, REST_MS);
  };
  const tick = () => {
    timer = 0;
    if (gone || document.hidden || !document.hasFocus() || beingShownRound()) { last = 0; return; }
    const now = performance.now();
    if (last) late = lateness(late, now - last);
    last = now;
    const waits = flockWaits(now, { busyUntil, lastInput, late });
    if (waits === 'slow') { rest(); return; }
    if (waits === 'idle') { last = 0; return; }
    if (waits === 'busy') { last = 0; timer = window.setTimeout(tick, busyUntil - now + 20); return; }
    if (now - looked > LOOK_MS) { looked = now; look(); pointer = raw ? { x: (raw.x - left) * k, y: (raw.y - top) * k } : null; }
    move();
    timer = window.setTimeout(tick, TICK_MS);
  };
  const go = () => { if (!timer && !resting && !gone) { last = 0; timer = window.setTimeout(tick, TICK_MS); } };
  const perch = () => {
    if (!birds.length && !hatch()) return;
    if (!look()) return;
    perches(birds.length, world()).forEach((spot, i) => { birds[i].x = spot.x; birds[i].y = spot.y; birds[i].ph = SITTING[i % SITTING.length]; });
    put();
  };
  const start = () => {
    if (gone || resting || document.hidden) return;
    if (beingShownRound()) { halt(); perch(); return; }
    if (!birds.length && !hatch()) return;
    put();
    if (!still) go();
  };
  const halt = () => { if (timer && !resting) { clearTimeout(timer); timer = 0; } last = 0; };
  const onVisible = () => { if (document.hidden) halt(); else start(); };
  const onBlur = () => { halt(); raw = null; pointer = null; };
  const onFocus = () => start();
  const onMove = (e: PointerEvent) => {
    raw = { x: e.clientX, y: e.clientY };
    lastInput = performance.now();
    if (!timer && !resting && !gone && birds.length) go();
  };
  const onBusy = () => { lastInput = performance.now(); busyUntil = lastInput + BUSY_MS; if (!timer) start(); };
  const onResize = () => { looked = 0; if (beingShownRound()) perch(); };
  const shown = new MutationObserver(() => start());
  const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;

  const ready = window.setTimeout(() => {
    start();
    if (still) return;
    shown.observe(document.documentElement, { attributes: true, attributeFilter: ['data-setup', 'data-tour-frame'] });
    window.addEventListener('blur', onBlur); window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('keydown', onBusy, { passive: true, capture: true });
    window.addEventListener('wheel', onBusy, { passive: true, capture: true });
    window.addEventListener('resize', onResize);
    resized?.observe(layer);
  }, 600);
  return () => {
    gone = true;
    shown.disconnect(); resized?.disconnect();
    clearTimeout(ready); clearTimeout(timer);
    window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('keydown', onBusy, true);
    window.removeEventListener('wheel', onBusy, true);
    window.removeEventListener('resize', onResize);
    layer.replaceChildren();
  };
}
