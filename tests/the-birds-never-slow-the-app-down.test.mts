// THE BIRDS NEVER SLOW THE APP DOWN (w-9687db6270, 2026-11-22).
//
// The founder, on the light orange mountains: "We don't want the movement of
// those birds to ever slow things down. If, let's say, the app has almost no
// RAM left, we don't want them to behave weirdly either. They shouldn't take up
// more RAM either, or not much more." and "only a handful at once ... 4 at once
// max". The first version drew them on a full-window canvas, cleared and
// repainted 30 times a second. Measured on her Mac while it ran: the GPU process
// used 11.8% of a core and the renderer 7.9%, and that canvas alone held 28 MB.
// Each bird is now a small picture the compositor slides between ten updates a
// second. The flock rests while the window is hidden or behind another one, and
// while the computer is struggling.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { DRIFT, MAX_BIRDS, drift, flockWaits, lateness, seedBirds, type Bird } from '../renderer/src/home/birds.ts';

const src = fs.readFileSync(new URL('../renderer/src/home/birds.ts', import.meta.url), 'utf8');
const seeded = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
/** A bird's path over `seconds`, at its eight updates a second. */
const run = (b: Bird, seconds: number) => { const path: { x: number; y: number }[] = []; for (let i = 0; i < seconds * 8; i++) { drift(b, 0.125); path.push({ x: b.x, y: b.y }); } return path; };
const world = { W: 1200, H: 800, top: 60, bottom: 380, avoid: { x: 400, y: 100, w: 400, h: 600 } };

describe('how many fly', () => {
  it('is never more than a handful', () => {
    expect(MAX_BIRDS).toBeLessThanOrEqual(4);
    expect(src).toMatch(/Math\.min\(n, MAX_BIRDS\)/);
  });
});

describe('what a bird costs', () => {
  it('is a small picture slid by the compositor, not a canvas repainted every frame', () => {
    expect(src).not.toMatch(/requestAnimationFrame/);
    expect(src).not.toMatch(/clearRect/);
    expect(src).toMatch(/translate3d\(/);
    expect(src).toMatch(/willChange/);
    // A sliding transition redraws the window at the screen's refresh rate.
    expect(src).not.toMatch(/transition/);
  });
  it('updates ten times a second, whatever the screen can do', () => {
    const tick = Number(src.match(/const TICK_MS = (\d+)/)?.[1]);
    expect(tick).toBeGreaterThanOrEqual(80);
  });
  it('asks the page for nothing on every move of the pointer', () => {
    const move = src.match(/const onMove = [^\n]*/)?.[0] ?? '';
    expect(move).toContain('lastInput');
    expect(move).not.toMatch(/getBoundingClientRect|clientWidth|offsetWidth|querySelector/);
  });
});

describe('when the window is not in front', () => {
  it('rests, and starts again when it is', () => {
    expect(src).toMatch(/document\.hidden/);
    expect(src).toMatch(/document\.hasFocus\(\)/);
    expect(src).toMatch(/'blur'/);
    expect(src).toMatch(/'focus'/);
  });
});

describe('while you are typing or scrolling, or away', () => {
  const s = { busyUntil: 0, lastInput: 0, late: 0 };
  it('waits for typing and scrolling to stop', () => {
    expect(flockWaits(1000, { ...s, busyUntil: 2000, lastInput: 900 })).toBe('busy');
    expect(flockWaits(2500, { ...s, busyUntil: 2000, lastInput: 2400 })).toBe(null);
    expect(src).toMatch(/'keydown', onBusy/);
    expect(src).toMatch(/'wheel', onBusy/);
  });
  it('rests when nobody has touched the computer for a minute and a half', () => {
    expect(flockWaits(89_000, { ...s, lastInput: 0 })).toBe(null);
    expect(flockWaits(95_000, { ...s, lastInput: 0 })).toBe('idle');
    expect(flockWaits(95_000, { ...s, lastInput: 60_000 })).toBe(null);
  });
  it('does not stop for the pointer', () => {
    expect(src.match(/const onMove = [^\n]*/)?.[0]).not.toMatch(/busy/i);
  });
});

describe('when the computer is struggling', () => {
  it('does not rest for an even pace', () => {
    let late = 0;
    for (let i = 0; i < 300; i++) late = lateness(late, 100);
    expect(late).toBe(0);
  });
  it('does not rest for one slow frame', () => {
    let late = 0;
    for (let i = 0; i < 300; i++) late = lateness(late, i % 40 === 0 ? 900 : 100);
    expect(late).toBeLessThan(20);
  });
  it('rests when updates keep coming late', () => {
    let late = 0, rested = false;
    for (let i = 0; i < 60 && !rested; i++) { late = lateness(late, 600); if (late >= 20) rested = true; }
    expect(rested).toBe(true);
  });
  it('counts as waiting', () => { expect(flockWaits(1000, { busyUntil: 0, lastInput: 1000, late: 20 })).toBe('slow'); });
  it('is quiet about it: the birds go, and come back later', () => {
    expect(src).toMatch(/replaceChildren\(\)/);
  });
});

describe('how they move', () => {
  // The founder, 2026-11-22: "These actually do need to move, but way less. They should each have their own radius and
  // move more slowly toward them so it's not too annoying. Maybe we even consider doing something like that in all cases."
  it('drifts about its own spot and never leaves it', () => {
    for (const bird of seedBirds(4, world, seeded(21))) {
      const home = { x: bird.hx, y: bird.hy };
      for (const p of run(bird, 180)) {
        expect(Math.abs(p.x - home.x)).toBeLessThanOrEqual(DRIFT.x + 0.1);
        expect(Math.abs(p.y - home.y)).toBeLessThanOrEqual(DRIFT.y + 0.1);
      }
    }
  });
  it('is slow: never faster than a slow walk across the card, and moving', () => {
    for (const bird of seedBirds(4, world, seeded(5))) {
      const path = run(bird, 60);
      const steps = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y) / 0.125);
      expect(Math.max(...steps)).toBeLessThan(22);
      expect(steps.reduce((m, v) => m + v, 0) / steps.length).toBeGreaterThan(1);
    }
  });
  it('flaps slowly', () => {
    const [b] = seedBirds(1, world, seeded(9));
    const before = b.ph;
    drift(b, 1);
    expect(b.ph - before).toBeLessThan(3);
  });
});

describe('how they are spread', () => {
  // The founder, 2026-11-22: "The birds are often scattered and cluttered in their own area, near each other."
  it('keeps to spots spread evenly across the sky, at least a sixth of the card apart', () => {
    const birds = seedBirds(4, world, seeded(21));
    const xs = birds.map((b) => b.hx).sort((p, q) => p - q);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(world.W / 6);
  });
  it('keeps clear of the words, wherever it drifts', () => {
    for (const w of [world, { ...world, W: 1010, H: 1126, top: 70, bottom: 430, avoid: { x: 120, y: 300, w: 700, h: 260 } }]) {
      for (const bird of seedBirds(4, w, seeded(41))) {
        const box = w.avoid;
        for (const p of run(bird, 120)) {
          const inside = p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h;
          expect(inside).toBe(false);
        }
        expect(bird.hy).toBeGreaterThanOrEqual(w.top - 1);
      }
    }
  });
  it('is the same in setup, the walkthrough and Home', () => {
    expect(src).not.toMatch(/dataset\.setup|dataset\.tourFrame/);
  });
});
