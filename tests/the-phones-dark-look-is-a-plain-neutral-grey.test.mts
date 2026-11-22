// THE PHONE'S DARK LOOK IS A PLAIN NEUTRAL GREY (2026-11-22). Dark was the
// desktop's Ember Grid: a brown ground (#1a1817), brown cards, a dot grid and
// an orange glow across the page. "Not a fan of dark mode ui; don't like that
// brown/orange. Needs to be clean/beautiful. Like notion dark mode or other
// elegant apps." Measured from theme.ts: every Dark surface had more red than
// blue, and the wall drew `dots: 0.055` under `glow: 0.075` of the orange.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { LIGHT, DARK } from '../mobile/src/ui/theme';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const SOLID = ['bg', 'text', 'dim', 'faint', 'line', 'lineStrong', 'round', 'pop', 'card', 'raised', 'sunk', 'graphite', 'ink'] as const;

describe('Dark', () => {
  it.each(SOLID)('has no tint in %s: as much red as green as blue', (key) => {
    expect(DARK[key]).toMatch(/^#[0-9a-f]{6}$/);
    const [r, g, b] = rgb(DARK[key]);
    expect([r, g, b]).toEqual([r, r, r]);
  });
  it('has no tint in what is laid over a surface either', () => {
    for (const key of ['rowLine', 'fill', 'picked', 'film', 'field', 'scrim'] as const) expect(DARK[key], key).toMatch(/^rgba\((255, 255, 255|0, 0, 0), [\d.]+\)$/);
  });
  it('is a dark ground with cards a step lighter, not black', () => {
    const [bg] = rgb(DARK.bg);
    const [card] = rgb(DARK.card);
    expect(bg).toBeGreaterThanOrEqual(0x14);
    expect(bg).toBeLessThanOrEqual(0x20);
    expect(card).toBeGreaterThan(bg);
    expect(rgb(DARK.pop)[0]).toBeGreaterThan(card);
  });
  it('keeps its words readable on the ground and on a card', () => {
    for (const on of [DARK.bg, DARK.card]) {
      expect(contrast(DARK.text, on)).toBeGreaterThanOrEqual(12);
      expect(contrast(DARK.dim, on)).toBeGreaterThanOrEqual(7);
      expect(contrast(DARK.faint, on)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('keeps the orange for what waits on you', () => {
    expect(DARK.accent).toBe('#ee6018');
  });
});

describe('the page behind every screen', () => {
  const parts = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
  const wall = parts.slice(parts.indexOf('export function Wall('), parts.indexOf('\n}\n', parts.indexOf('export function Wall(')));
  it('draws no dot grid and no glow, in either look', () => {
    expect(wall).not.toMatch(/color\.glow|color\.dots/);
    expect(Object.keys(DARK)).not.toContain('glow');
    expect(Object.keys(DARK)).not.toContain('dots');
    expect(fs.readFileSync('mobile/src/ui/theme.ts', 'utf8')).not.toMatch(/Ember/);
  });
  it('leaves Light as it was: its cool page and its halftone', () => {
    expect(LIGHT.bg).toBe('#f8f8fa');
    expect(LIGHT.text).toBe('#12182a');
    expect(LIGHT.halftone).toBeGreaterThan(0);
    expect(DARK.halftone).toBe(0);
    expect(wall).toMatch(/color\.halftone > 0 && \(/);
  });
});
