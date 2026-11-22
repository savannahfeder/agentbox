// The website's flock: gull shapes in the mountains' 3px dots that wander the
// sky together, keep out of the words, and scatter from the pointer.

import type { Rgb } from './mountains';

export type Bird = { x: number; y: number; vx: number; vy: number; h: number; ph: number; fear: number; s: number };
type Box = { x: number; y: number; w: number; h: number };
/** The card in px; the birds keep between `top` and `bottom`, and out of `avoid`. */
export type BirdSky = { W: number; H: number; top: number; bottom: number; avoid: Box | null; pointer: { x: number; y: number } | null };

const CRUISE = 45, FLEE_R = 150, MARGIN = 30;

const outside = (x: number, y: number, box: Box | null, pad = 0) => !box || x < box.x - pad || x > box.x + box.w + pad || y < box.y - pad || y > box.y + box.h + pad;

export function seedBirds(n: number, sky: BirdSky, rnd: () => number = Math.random): Bird[] {
  const birds: Bird[] = [];
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0;
    for (let tries = 0; tries < 50; tries++) {
      x = rnd() * sky.W; y = sky.top + rnd() * Math.max(1, sky.bottom - sky.top);
      if (outside(x, y, sky.avoid, MARGIN)) break;
    }
    const a = rnd() * Math.PI * 2;
    birds.push({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 10, h: a, ph: rnd() * Math.PI * 2, fear: 0, s: 12 + rnd() * 5 });
  }
  return birds;
}

export function stepBirds(birds: Bird[], dt: number, sky: BirdSky, rnd: () => number = Math.random) {
  let cx = 0, cy = 0;
  for (const b of birds) { cx += b.x; cy += b.y; }
  cx /= birds.length || 1; cy /= birds.length || 1;
  for (const b of birds) {
    b.h += (rnd() - 0.5) * 2.4 * dt;
    let ax = (Math.cos(b.h) * CRUISE - b.vx) * 0.8, ay = (Math.sin(b.h) * CRUISE * 0.35 - b.vy) * 0.8;
    ax += (cx - b.x) * 0.02; ay += (cy - b.y) * 0.02;
    for (const o of birds) {
      if (o === b) continue;
      const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < 40) { ax += (dx / d) * 120; ay += (dy / d) * 120; }
    }
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
    if (b.x < -b.s * 2) b.x = sky.W + b.s; else if (b.x > sky.W + b.s * 2) b.x = -b.s;
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

const FRAME_MS = 33;

/**
 * Flies `n` birds on `canvas`, which lies over the card, until the returned
 * function is called. `sky` is asked each frame where the birds may go, so a
 * box that moves is kept clear. Only the birds are cleared and drawn again.
 */
export function flyBirds(canvas: HTMLCanvasElement, { ink, n = 7, pitch = 3, sky }: { ink: Rgb; n?: number; pitch?: number; sky: (W: number, H: number) => Omit<BirdSky, 'W' | 'H' | 'pointer'> }): () => void {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return () => {};
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, birds: Bird[] = [], pointer: { x: number; y: number } | null = null, timer = 0, last = 0;
  let drawn: Box[] = [];
  const size = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    if (w !== W || h !== H) {
      if (W && H) for (const b of birds) { b.x *= w / W; b.y *= h / H; }
      W = w; H = h;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawn = [];
    }
    return true;
  };
  const world = (): BirdSky => ({ W, H, pointer, ...sky(W, H) });
  // Clearing only where the birds were keeps a full-window canvas cheap at 30 frames a second.
  const draw = (all = false) => {
    if (all) g.clearRect(0, 0, W, H);
    else for (const r of drawn) g.clearRect(r.x, r.y, r.w, r.h);
    g.fillStyle = `rgb(${ink.join(',')})`;
    drawn = birds.map((b) => {
      for (const [cx, cy] of birdCells(b, pitch)) g.fillRect(cx * pitch, cy * pitch, pitch - 0.2, pitch - 0.2);
      return { x: b.x - b.s * 1.3 - pitch * 2, y: b.y - b.s - pitch * 2, w: b.s * 2.6 + pitch * 4, h: b.s * 2 + pitch * 4 };
    });
  };
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const k = r.width ? canvas.offsetWidth / r.width : 1;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    pointer = x >= 0 && y >= 0 && x <= W && y <= H ? { x, y } : null;
  };
  const tick = () => {
    const now = performance.now();
    if (!document.hidden && size()) {
      stepBirds(birds, Math.min(0.1, (now - last) / 1000), world());
      draw();
    }
    last = now;
    timer = window.setTimeout(tick, FRAME_MS);
  };
  if (!size()) return () => {};
  birds = seedBirds(n, world());
  draw(true);
  if (still) return () => {};
  window.addEventListener('pointermove', onMove);
  last = performance.now();
  timer = window.setTimeout(tick, FRAME_MS);
  return () => { clearTimeout(timer); window.removeEventListener('pointermove', onMove); };
}
