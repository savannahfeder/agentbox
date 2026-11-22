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
import { MAX_BIRDS, flockWaits, lateness, perches, seedBirds, stepBirds } from '../renderer/src/home/birds.ts';

const src = fs.readFileSync(new URL('../renderer/src/home/birds.ts', import.meta.url), 'utf8');
const seeded = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const world = { W: 1200, H: 800, top: 60, bottom: 380, avoid: { x: 400, y: 100, w: 400, h: 600 }, pointer: null };

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
    const move = src.match(/const onMove = [\s\S]*?\n {2}\};/)?.[0] ?? '';
    expect(move).toContain('clientX');
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
  it('does not stop for the pointer, which they scatter from', () => {
    expect(src.match(/const onMove = [\s\S]*?\n {2}\};/)?.[0]).not.toMatch(/busy/i);
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

describe('at ten updates a second', () => {
  // Steps this far apart are where a flock would fly off or through the words.
  it('the flock still keeps to the sky and out of the words', () => {
    const birds = seedBirds(4, world, seeded(11));
    let inWords = 0, seen = 0;
    for (let i = 0; i < 1800; i++) {
      for (let k = 0; k < 3; k++) stepBirds(birds, 0.1 / 3, world, seeded(100 + i));
      for (const b of birds) {
        seen += 1;
        expect(b.y).toBeGreaterThan(world.top - 40);
        expect(b.y).toBeLessThan(world.bottom + 40);
        if (b.x > 400 && b.x < 800 && b.y > 100) inWords += 1;
      }
    }
    expect(inWords / seen).toBeLessThan(0.05);
  });
});

describe('how they are spread', () => {
  // The founder, 2026-11-22: "The birds are often scattered and cluttered in their own area, near each other."
  it('flies apart rather than in a knot', () => {
    const birds = seedBirds(4, world, seeded(21));
    const near: number[] = [];
    const rnd = seeded(31);
    for (let i = 0; i < 900; i++) {
      for (let k = 0; k < 3; k++) stepBirds(birds, 0.08 / 3, world, rnd);
      if (i > 150) for (const b of birds) near.push(Math.min(...birds.filter((o) => o !== b).map((o) => Math.hypot(b.x - o.x, b.y - o.y))));
    }
    expect(near.reduce((a, b) => a + b, 0) / near.length).toBeGreaterThan(200);
  });
  it('turns at the card\'s edges rather than half leaving it', () => {
    const birds = seedBirds(4, world, seeded(41));
    const rnd = seeded(51);
    for (let i = 0; i < 1500; i++) {
      for (let k = 0; k < 3; k++) stepBirds(birds, 0.08 / 3, world, rnd);
      for (const b of birds) { expect(b.x).toBeGreaterThan(0); expect(b.x).toBeLessThan(world.W); }
    }
  });
  it('perches evenly, clear of the words, while the setup or the walkthrough is on', () => {
    for (const w of [world, { ...world, W: 1010, H: 1126, top: 70, bottom: 430, avoid: { x: 120, y: 300, w: 700, h: 260 } }]) {
      const spots = perches(4, w);
      expect(spots).toHaveLength(4);
      const xs = spots.map((s) => s.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(w.W * 0.12);
      for (const s of spots) {
        expect(s.y).toBeGreaterThanOrEqual(w.top - 5);
        expect(s.y).toBeLessThanOrEqual(w.bottom + 5);
        const inside = s.x > w.avoid.x && s.x < w.avoid.x + w.avoid.w && s.y > w.avoid.y && s.y < w.avoid.y + w.avoid.h;
        expect(inside).toBe(false);
      }
    }
  });
  it('does not move while the setup or the walkthrough is on, and flies again after', () => {
    expect(src).toMatch(/dataset\.setup/);
    expect(src).toMatch(/dataset\.tourFrame/);
    expect(src).toMatch(/MutationObserver/);
  });
});
