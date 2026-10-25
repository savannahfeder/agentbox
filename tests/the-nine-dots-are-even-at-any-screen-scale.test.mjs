// 2026-10-13, and she has said it before: "the dots don't appear properly
// aligned. If you zoom in, they're not nine evenly spaced dots. It's the same
// issue we've had six times before and if I expand it, they're uneven in a
// different way."
//
// WHY IT KEPT COMING BACK. The mark was nine boxes in a CSS grid, and the fix
// each time was to make the dot and the gap whole CSS pixels. That only works
// on a screen whose points are whole device pixels. Hers is not: a Mac in a
// scaled mode draws 1.5 device pixels to the point, so a 3pt dot is 4.5 and a
// 1pt gap is 1.5, and the browser snaps each box on its own — 5,5,5 with gaps
// of 2 and 1. Rasterised through the real page at that scale, 16 of 28 sizes
// came out uneven; at 1x and 2x, none did.
//
// So the mark is ONE drawing now, an svg with nine circles on a uniform pitch,
// rasterised in one go. Nothing is snapped box by box, so the spacing cannot
// round apart, whatever the screen's scale. These are the numbers that drawing
// is made of.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LATTICE, latticeGrid } from '../shared/corner-tag.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mark = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/lattice.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');

describe('the nine dots', () => {
  const SCREENS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const BOXES = [8, 8.93, 10, 11.07, 12, 14.29, 17.14, 20, 25.71, 28.57];

  it('puts a whole number of device pixels between one dot and the next', () => {
    for (const dpr of SCREENS) {
      for (const box of BOXES) {
        const g = latticeGrid(box, dpr);
        expect([dpr, box, Number.isInteger(g.dot)]).toEqual([dpr, box, true]);
        expect([dpr, box, Number.isInteger(g.gap)]).toEqual([dpr, box, true]);
        expect([dpr, box, Number.isInteger(g.pitch)]).toEqual([dpr, box, true]);
      }
    }
  });

  it('spaces the three columns and the three rows alike', () => {
    for (const dpr of SCREENS) {
      const { dots, pitch } = latticeGrid(10 * 1.107, dpr);
      expect(dots).toHaveLength(9);
      const xs = [...new Set(dots.map((d) => d.cx))].sort((a, b) => a - b);
      const ys = [...new Set(dots.map((d) => d.cy))].sort((a, b) => a - b);
      expect(xs).toEqual(ys);
      expect(xs[1] - xs[0]).toBe(pitch);
      expect(xs[2] - xs[1]).toBe(pitch);
    }
  });

  it('fills its box exactly, and the box is whole device pixels', () => {
    for (const dpr of SCREENS) {
      const g = latticeGrid(14.29, dpr);
      expect(g.side).toBe(3 * g.dot + 2 * g.gap);
      expect(Number.isInteger(g.side)).toBe(true);
      expect(g.dots[0].cx - g.dot / 2).toBe(0);
      expect(g.dots[8].cx + g.dot / 2).toBe(g.side);
    }
  });

  it('stays near the size it was asked for, and never smaller than a mark', () => {
    for (const dpr of SCREENS) {
      for (const box of BOXES) {
        const g = latticeGrid(box, dpr);
        expect([dpr, box, Math.abs(g.size - box) <= 1.25]).toEqual([dpr, box, true]);
        expect(g.dot).toBeGreaterThanOrEqual(2);
        expect(g.gap).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("keeps the film's proportions as closely as whole pixels allow", () => {
    expect(LATTICE).toEqual({ box: 10, dot: 2.7, gap: 0.95 });
    // never a mark whose dots all but touch, and never a loose one
    for (const dpr of SCREENS) {
      for (const box of BOXES) {
        const { dot, gap } = latticeGrid(box, dpr);
        expect([dpr, box, dot / gap >= 2 && dot / gap <= 4]).toEqual([dpr, box, true]);
      }
    }
  });

  it('answers for a screen that never said what it draws', () => {
    expect(latticeGrid(10)).toEqual(latticeGrid(10, 1));
    expect(latticeGrid(10, 0)).toEqual(latticeGrid(10, 1));
    expect(Number.isInteger(latticeGrid(undefined, 2).pitch)).toBe(true);
  });

  it('is drawn once, as an svg, and not as nine snapped boxes', () => {
    expect(mark).toContain('<svg');
    expect(mark).toContain('viewBox');
    expect(mark).toContain('<circle');
    // the whole-POINT cells were the fix that could not work on her screen
    expect(mark).not.toContain('latticeCell');
    expect(mark).toContain('devicePixelRatio');
    expect(css).not.toContain('--ct-dot');
    expect(css).not.toContain('--ct-gap');
    expect(css).not.toMatch(/\.ct-lat \{[^}]*grid-template-columns/);
  });

  it('still fills the middle dot, in both states', () => {
    expect(mark).toContain('ct-heart');
    expect(css).toMatch(/\.ct-lat \.ct-heart \{[^}]*opacity: 1/);
    expect(css).toMatch(/\.ct-lat\.is-waiting circle \{[^}]*opacity: 1/);
  });

  it('is built again when the tag moves to a screen that draws differently', () => {
    expect(mark).toContain('matchMedia');
    expect(mark).toContain('dppx');
  });
});
