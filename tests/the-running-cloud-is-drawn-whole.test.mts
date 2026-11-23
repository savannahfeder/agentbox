// THE RUNNING CLOUD IS DRAWN WHOLE.
//
// What they saw (w-cb228e7000, 2026-11-23): on In progress, the orange cloud
// beside WORKING had its left side and its top shaved flat. Measured from the
// path: the cloud's big arc is a circle at (9, 12) of radius 7, so its outline
// runs from x 2 to 22 and y 5 to 19, and a 1.6 stroke reaches 0.8 past that.
// The viewBox began at exactly x 2, y 5, so half the stroke on those two sides
// fell outside the picture and was clipped.
//
// Now every copy of the mark (the Mac list and the phone) frames the outline
// plus half its stroke on all four sides.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CLOUD = 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z';
const OUTLINE = { left: 2, top: 5, right: 22, bottom: 19 };

const copies = {
  'the Mac list (Pages.tsx RunningMark)': 'renderer/src/threads/Pages.tsx',
  'the phone (icons.tsx Cloud)': 'mobile/src/ui/icons.tsx',
};

/** The opening tag of the small cloud mark in a file, read as text. */
function markIn(file: string) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const tags = [...src.matchAll(/<Svg\b[^>]*>|<svg\b[^>]*>/g)].map((m) => ({ tag: m[0], at: m.index! }))
    .filter(({ tag, at }) => /width=\{?"?14/.test(tag) && src.slice(at, at + 400).includes(CLOUD));
  expect(tags.length).toBe(1);
  const tag = tags[0].tag;
  const box = tag.match(/viewBox="([^"]+)"/)![1].split(/\s+/).map(Number);
  const stroke = Number(tag.match(/strokeWidth=\{?"?([\d.]+)/)![1]);
  return { x: box[0], y: box[1], w: box[2], h: box[3], stroke };
}

/** Whether the cloud and its stroke fit inside the frame. */
const fits = ({ x, y, w, h, stroke }: ReturnType<typeof markIn>) => {
  const half = stroke / 2 - 1e-9;
  return x <= OUTLINE.left - half && y <= OUTLINE.top - half
    && x + w >= OUTLINE.right + half && y + h >= OUTLINE.bottom + half;
};

describe('the running cloud', () => {
  for (const [where, file] of Object.entries(copies)) {
    it(`keeps its whole stroke inside its frame on ${where}`, () => {
      expect(fits(markIn(file))).toBe(true);
    });

    it(`is still drawn the size it was on ${where}, not shrunk to fit`, () => {
      const { w } = markIn(file);
      // 14px across: the old frame was 21 units wide, the outline plus stroke is 21.6.
      expect(14 / w).toBeGreaterThan(0.63);
    });
  }

  it('would be caught clipped by the frame it had before', () => {
    expect(fits({ x: 2, y: 5, w: 21, h: 15, stroke: 1.6 })).toBe(false);
  });

  it('would be caught clipped by a frame that fits the outline but not the stroke', () => {
    expect(fits({ x: 2, y: 5, w: 20, h: 14, stroke: 1.6 })).toBe(false);
    expect(fits({ x: 1.2, y: 4.2, w: 21.6, h: 15.6, stroke: 1.6 })).toBe(true);
  });
});
