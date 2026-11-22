// THE FIRST PAGE'S SKY DRAWS ITS MOUNTAINS ONCE, AND ONLY THE BIRDS MOVE (w-fbe5e95dea, 2026-11-10).
//
// Two synthetic testers on fresh installs never saw the first page: every look
// at it timed out after 90 seconds, and the page would not even take a debugger.
// Its sky walked all ~16,000 dots of a full-window grid and redrew the canvas
// every frame, on a GPU-backed canvas, in a headless browser with no GPU on a
// busy Mac. Since w-9687db6270 (2026-11-22) the sky is the website's mountains:
// drawn once per size, with only the birds above them moving, on a canvas kept
// off the GPU, cleared only where they were, and not while the window is hidden.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mountainDots } from '../renderer/src/home/mountains.ts';

const sky = fs.readFileSync(new URL('../renderer/src/components/WelcomeSky.tsx', import.meta.url), 'utf8');
const birds = fs.readFileSync(new URL('../renderer/src/home/birds.ts', import.meta.url), 'utf8');

describe("the first page's sky", () => {
  it('lights a fraction of the grid', () => {
    const grid = Math.ceil(1440 / 3) * Math.ceil(900 / 3);
    const dots = mountainDots(1440, 900, { inks: [[238, 96, 24], [240, 112, 46], [242, 128, 70], [244, 146, 96]], alpha: 0.5, lift: 0.9 });
    expect(dots.length).toBeGreaterThan(1000);
    expect(dots.length).toBeLessThan(grid / 4);
  });
  it('draws the mountains once per size, not on every frame', () => {
    expect(sky).toMatch(/addEventListener\('resize', resized\)/);
    expect(sky).not.toMatch(/setTimeout\(tick/);
  });
  it('moves only the birds, on a canvas kept off the GPU, a few times a second, and not while hidden', () => {
    expect(birds).toMatch(/willReadFrequently: true/);
    expect(birds).toMatch(/FRAME_MS = \d{2,3}/);
    expect(birds).toMatch(/document\.hidden/);
    expect(birds).toMatch(/for \(const r of drawn\) g\.clearRect/);
  });
});
