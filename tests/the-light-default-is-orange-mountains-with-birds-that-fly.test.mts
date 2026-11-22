// THE LIGHT DEFAULT IS ORANGE MOUNTAINS, WITH BIRDS THAT FLY (w-9687db6270, 2026-11-22).
//
// The founder picked the website's dithered mountains for setup's first screen
// and asked for a light theme in that look, as the default. Shown it drawn over
// Home: "I love this so much", with the window's frame "a little too tinted",
// and "I want to see if even the birds move". No light theme had the look: the
// light default was the green sky, and the first screen still said "An inbox for
// hundreds of agents." Measured on the drawing: the frame was #f0ede8, eight
// steps between its red and blue.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { shownSkyId, skyTheme } from '../renderer/src/home/sky.ts';
import { mountainDots, type Mountains } from '../renderer/src/home/mountains.ts';
import { seedBirds, drift, birdCells, pose, wings } from '../renderer/src/home/birds.ts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const seeded = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

describe('the light orange mountains', () => {
  const sky = skyTheme('mountains');
  it('is the sky a light window wears when none was picked', () => {
    expect(shownSkyId(null, false)).toBe('mountains');
    expect(shownSkyId(null, true)).toBe('ember');
    expect(sky?.name).toBe('Light orange mountains');
    expect(sky?.dark).toBe(false);
  });
  it('keeps the frame round the window close to grey', () => {
    const hex = sky!.frame!;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(4);
    expect(Math.min(r, g, b)).toBeGreaterThan(232);
  });
  it('gives the app warm greys while it is worn', () => {
    expect(read('renderer/src/home/home.css')).toMatch(/:root\[data-theme="light"\]\[data-sky-frame="mountains"\] \{[^}]*--text:/);
  });
});

describe('the mountains', () => {
  const m: Mountains = { inks: [[238, 96, 24], [240, 112, 46], [242, 128, 70], [244, 146, 96]], alpha: 0.44, lift: 0.62 };
  it('rise from the foot and leave the top of the card empty', () => {
    const dots = mountainDots(600, 400, m);
    expect(dots.length).toBeGreaterThan(500);
    expect(dots.every((d) => d.y > 400 * 0.45)).toBe(true);
    expect(dots.filter((d) => d.y > 300).length).toBeGreaterThan(dots.filter((d) => d.y < 300).length);
  });
  it('stand higher when lifted, and thin out behind words', () => {
    const low = mountainDots(600, 400, m), high = mountainDots(600, 400, { ...m, lift: 1 });
    expect(Math.min(...high.map((d) => d.y))).toBeLessThan(Math.min(...low.map((d) => d.y)));
    const quiet = { x: 0.5, y: 0.3, rx: 0.2, ry: 0.15 };
    const inside = (d: { x: number; y: number }) => ((d.x / 600 - 0.5) / 0.2) ** 2 + ((1 - d.y / 400 - 0.3) / 0.15) ** 2 < 1;
    expect(mountainDots(600, 400, { ...m, lift: 1, quiet }).filter(inside).length).toBeLessThan(high.filter(inside).length / 3);
  });
  it('are drawn from the same dots every time', () => {
    expect(mountainDots(300, 200, m)).toEqual(mountainDots(300, 200, m));
  });
});

describe('the birds', () => {
  const world = { W: 1200, H: 800, top: 60, bottom: 380, avoid: { x: 400, y: 100, w: 400, h: 600 } };
  it('move, and flap their wings', () => {
    const [b] = seedBirds(1, world, seeded(9));
    const at = { x: b.x, y: b.y };
    for (let i = 0; i < 40; i++) drift(b, 0.125);
    expect(Math.hypot(b.x - at.x, b.y - at.y)).toBeGreaterThan(1);
    const cells = (up: number) => JSON.stringify(birdCells({ x: 24, y: 18, s: 14, up }, 3));
    expect(new Set([-1, -0.5, 0, 0.5, 1].map(cells)).size).toBeGreaterThanOrEqual(4);
    const beats = new Set<number>();
    for (let i = 0; i < 300; i++) { drift(b, 1 / 30); beats.add(pose(wings(b))); }
    expect(beats.size).toBe(5);
    expect(pose(wings(b, 0))).toBe(2);
  });
  it('hold still for someone who asked for less motion, and rest while the window is hidden', () => {
    const src = read('renderer/src/home/birds.ts');
    expect(src).toMatch(/prefers-reduced-motion/);
    expect(src).toMatch(/document\.hidden/);
  });
});

describe('where they are drawn', () => {
  it('fly on Home over the mountains', () => {
    expect(read('renderer/src/home/SkyBackdrop.tsx')).toMatch(/art\.birds/);
  });
  it('and on the first screen, under the website\'s words', () => {
    const first = read('renderer/src/components/FirstRun.tsx');
    expect(first).toContain('Your team and its agents, in one place.');
    expect(first).toContain('Messages, work and files that people and agents share.');
    expect(first).not.toContain('An inbox for hundreds of agents.');
    const sky = read('renderer/src/components/WelcomeSky.tsx');
    expect(sky).toMatch(/drawMountains\(/);
    expect(sky).toMatch(/flyBirds\(/);
  });
});
