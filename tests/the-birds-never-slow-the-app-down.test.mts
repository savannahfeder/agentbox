// THE BIRDS NEVER SLOW THE APP DOWN, AND NEVER LOOK STUCK (w-9687db6270, 2026-11-22).
//
// The founder, on the light orange mountains: "We don't want the movement of
// those birds to ever slow things down. If, let's say, the app has almost no
// RAM left, we don't want them to behave weirdly either." and "only a handful
// at once ... 4 at once max". Then, of the version that stood still to save
// work: "the little birds sometimes will stop ... for a weirdly long time",
// "they're moving so slowly that it kind of looks buggy now, like they're
// lagging. You need something more in between", "when I land on this page, they
// basically don't move for about 5 seconds". Measured on that version: still for
// the whole time another app was in front, 2.3 s after a small scroll, 1.3 s
// after Enter, and never faster than 11 px a second, in steps eight times a
// second.
//
// Each bird is a small picture moved by transform. It goes round its own spot at
// an even speed, about thirty times a second, whatever is pressed or scrolled.
// It settles, easing, only when nobody has been at the window for minutes or the
// computer is falling behind, and is updated less often before it settles.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { AWAY_MS, MAX_BIRDS, RADIUS, beat, drift, here, newClock, seedBirds, spots, type Bird } from '../renderer/src/home/birds.ts';

const src = fs.readFileSync(new URL('../renderer/src/home/birds.ts', import.meta.url), 'utf8');
const seeded = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const run = (b: Bird, seconds: number, dt = 1 / 30) => { const path: { x: number; y: number }[] = []; for (let t = 0; t < seconds; t += dt) { drift(b, dt); path.push({ x: b.x, y: b.y }); } return path; };
const speeds = (path: { x: number; y: number }[], dt = 1 / 30) => path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y) / dt);
const home = { W: 1602, H: 1025, top: 61, bottom: 430, avoid: { x: 397, y: 164, w: 808, h: 290 } };
const setup = { W: 1010, H: 1126, top: 68, bottom: 473, avoid: { x: 101, y: 330, w: 808, h: 290 } };
const first = { W: 1706, H: 1069, top: 85, bottom: 534, avoid: { x: 369, y: 168, w: 968, h: 470 } };
const small = { W: 900, H: 640, top: 38, bottom: 269, avoid: { x: 46, y: 60, w: 808, h: 290 } };
const places = { home, setup, first, small };

/** The flock's clock run for `ms`, with a sign of somebody at the window at each of `signs`, and each update `slow` ms late. */
function keepTime(ms: number, { signs = [], slow = () => 0, c = newClock(1), from = 1 }: { signs?: number[]; slow?: (now: number) => number; c?: ReturnType<typeof newClock>; from?: number } = {}) {
  const beats: { now: number; dt: number; wait: number | null }[] = [];
  let now = from;
  const due = [...signs];
  while (now < from + ms) {
    while (due.length && due[0] <= now) here(c, due.shift()!);
    const b = beat(c, now);
    beats.push({ now, ...b });
    if (b.wait === null) {
      if (!due.length) break;
      now = due[0];
      c.last = 0;
      continue;
    }
    now += b.wait + 9 + slow(now);
  }
  return { beats, c };
}

describe('how many fly', () => {
  it('is never more than a handful', () => {
    expect(MAX_BIRDS).toBeLessThanOrEqual(4);
    expect(src).toMatch(/Math\.min\(n, MAX_BIRDS\)/);
  });
});

describe('how they move', () => {
  it.each(Object.entries(places))('keeps to its own area and out of the words (%s)', (_name, sky) => {
    for (const b of seedBirds(4, sky, seeded(21))) {
      for (const p of run(b, 120)) {
        expect(Math.abs(p.x - b.hx)).toBeLessThanOrEqual(RADIUS.x + 0.1);
        expect(Math.abs(p.y - b.hy)).toBeLessThanOrEqual(RADIUS.y + 0.1);
        const w = sky.avoid;
        expect(p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h).toBe(false);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(sky.W);
        expect(p.y).toBeGreaterThan(0);
      }
    }
  });
  // The first flock flew at 45 to 60 px a second and was too active; the last drifted at 11 at most and looked stuck.
  it('goes at an even, easy speed, and is never all but still', () => {
    for (const b of seedBirds(4, home, seeded(5))) {
      const v = speeds(run(b, 90));
      expect(Math.max(...v)).toBeLessThan(38);
      expect(Math.min(...v)).toBeGreaterThan(12);
      const mean = v.reduce((a, c) => a + c, 0) / v.length;
      expect(mean).toBeGreaterThan(18);
      expect(mean).toBeLessThan(30);
    }
  });
  it('is the same speed however often it is updated', () => {
    const [a] = seedBirds(1, home, seeded(7)), [b] = seedBirds(1, home, seeded(7));
    const fast = run(a, 10, 1 / 30), slow = run(b, 10, 1 / 15);
    expect(Math.hypot(fast.at(-1)!.x - slow.at(-1)!.x, fast.at(-1)!.y - slow.at(-1)!.y)).toBeLessThan(6);
  });
  it('is spread evenly across the sky', () => {
    for (const sky of [home, setup, first]) {
      const xs = spots(4, sky).map((s) => s.x).sort((p, q) => p - q);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThan(sky.W / 5);
    }
  });
});

describe('what never stops them', () => {
  it('moving from the first moment, at about thirty updates a second', () => {
    const { beats } = keepTime(2000);
    expect(beats[1].dt).toBeGreaterThan(0.02);
    expect(beats.length).toBeGreaterThan(45);
    expect(beats.length).toBeLessThan(75);
    expect(Math.max(...beats.slice(1).map((b, i) => b.now - beats[i].now))).toBeLessThan(60);
  });
  it('typing, scrolling and pressing Enter only say somebody is here', () => {
    expect(src).not.toMatch(/busy/i);
    const signs = Array.from({ length: 40 }, (_, i) => 500 + i * 60);
    const { beats } = keepTime(4000, { signs });
    expect(Math.min(...beats.slice(1).map((b) => b.dt))).toBeGreaterThan(0.02);
  });
  it('another app in front does not: the window may still be in view', () => {
    expect(src).not.toMatch(/hasFocus/);
    expect(src).not.toMatch(/'blur'/);
  });
  it('a hidden window does, and it starts at once when it is shown, with no leap', () => {
    expect(src).toMatch(/document\.hidden/);
    const c = newClock(0);
    keepTime(1000, { c });
    c.last = 0;
    here(c, 60_000);
    const { beats } = keepTime(500, { c, from: 60_000 });
    expect(beats[0].dt).toBe(0);
    expect(beats[1].dt).toBeLessThan(0.06);
    expect(beats[1].dt).toBeGreaterThan(0.02);
  });
});

describe('when nobody is at the window', () => {
  it('settles after minutes, easing to a stop rather than freezing', () => {
    expect(AWAY_MS).toBeGreaterThanOrEqual(120_000);
    const { beats, c } = keepTime(AWAY_MS + 10_000);
    const after = beats.filter((b) => b.now > AWAY_MS);
    expect(beats.at(-1)!.wait).toBe(null);
    expect(c.energy).toBe(0);
    expect(after.length).toBeGreaterThan(25);
    for (let i = 1; i < after.length; i++) expect(after[i].dt).toBeLessThanOrEqual(after[i - 1].dt + 0.001);
  });
  it('eases back into it at the first sign of somebody', () => {
    const { c } = keepTime(AWAY_MS + 10_000);
    here(c, AWAY_MS + 60_000);
    const { beats } = keepTime(3000, { c, from: AWAY_MS + 60_000 });
    expect(beats[3].dt).toBeGreaterThan(0);
    expect(beats[3].dt).toBeLessThan(0.02);
    expect(beats.at(-1)!.dt).toBeGreaterThan(0.03);
  });
});

describe('when the computer is falling behind', () => {
  const busy = (from: number, to: number, by: number) => (now: number) => (now >= from && now < to ? by : 0);
  it('does not mind one slow moment', () => {
    const { c } = keepTime(6000, { slow: (now) => (now > 1000 && now < 1050 ? 900 : 0) });
    expect(c.step).toBe(0);
    expect(c.energy).toBeCloseTo(1, 1);
  });
  it('is updated less often, then settles, and never leaps to make up for it', () => {
    const { beats, c } = keepTime(25_000, { slow: () => 500 });
    expect(c.step).toBeGreaterThan(0);
    expect(Math.max(...beats.map((b) => b.dt))).toBeLessThanOrEqual(0.1);
    expect(beats.some((b) => b.wait !== null && b.wait > 5000)).toBe(true);
  });
  it('comes back by itself once the computer is well again', () => {
    const c = newClock(0);
    const signs = Array.from({ length: 60 }, (_, i) => i * 1000);
    keepTime(60_000, { c, signs, slow: busy(0, 20_000, 500) });
    expect(c.step).toBe(0);
    expect(c.energy).toBeGreaterThan(0.95);
  });
});

describe('what a bird costs', () => {
  it('is a small picture moved by transform, never a canvas painted each time', () => {
    expect(src).not.toMatch(/clearRect/);
    expect(src).toMatch(/translate3d\(/);
    expect(src).toMatch(/willChange/);
    // A sliding transition redraws the window at the screen's refresh rate.
    expect(src).not.toMatch(/transition|\.animate\(/);
  });
  it('asks the page for nothing on a move of the pointer', () => {
    const sign = src.match(/const onSign = [^\n]*/)?.[0] ?? '';
    expect(sign).toContain('here(');
    expect(sign).not.toMatch(/getBoundingClientRect|clientWidth|offsetWidth|querySelector/);
  });
  it('holds still for someone who asked for less motion', () => {
    expect(src).toMatch(/prefers-reduced-motion/);
  });
});
