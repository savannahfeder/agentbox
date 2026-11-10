// THE FIRST PAGE'S SKY DRAWS ONLY ITS BAND, A FEW TIMES A SECOND (w-fbe5e95dea, 2026-11-10).
//
// Two synthetic testers on fresh installs never saw the first page: every look
// at it timed out after 90 seconds, and the page would not even take a debugger.
// Its sky walked all ~16,000 dots of a full-window grid and redrew the canvas
// every frame, on a GPU-backed canvas, in a headless browser with no GPU on a
// busy Mac. It now works out the band's dots once per size, draws only those,
// on a canvas kept off the GPU, about fifteen times a second, and stops while
// the window is hidden.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { skyBand } from '../renderer/src/components/WelcomeSky.tsx';

const src = fs.readFileSync(new URL('../renderer/src/components/WelcomeSky.tsx', import.meta.url), 'utf8');

describe("the first page's sky", () => {
  it('keeps only the dots in the band, a fraction of the grid', () => {
    const grid = Math.ceil(1440 / 9) * Math.ceil(900 / 9);
    const band = skyBand(1440, 900);
    expect(band.length).toBeGreaterThan(200);
    expect(band.length).toBeLessThan(grid / 2);
  });
  it('leaves the left of the window, where the words are, empty', () => {
    expect(skyBand(1440, 900).every((d) => d.x > 1440 * 0.38)).toBe(true);
  });
  it('draws on a canvas kept off the GPU, a few times a second, and not while hidden', () => {
    expect(src).toMatch(/willReadFrequently: true/);
    expect(src).toMatch(/FRAME_MS = \d{2,3}/);
    expect(src).toMatch(/document\.hidden/);
  });
});
