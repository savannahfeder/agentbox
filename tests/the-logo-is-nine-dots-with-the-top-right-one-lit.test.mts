// THE LOGO IS NINE DOTS WITH THE TOP RIGHT ONE LIT (2026-10-25).
//
// The logo was three bars with the middle one pulled out in orange. It was
// replaced after six rounds of options (w-1587f83559) by "3A, one lit": the
// app's own nine-dot lattice, eight dots dim and the top right one orange.
// Measured before the change: renderer/src/assets/agentbox-icon.svg held no
// <circle> at all, only the bars.
//
// Two drawings carry it. The Mac app icon puts the dots on a dark tile. Inside
// the app the logo is the dots alone: drawn as the icon, tile and all, the
// sidebar's 20px corner held an 11px grid on a dark square that vanished into a
// dark sidebar ("I can't even see the logo itself in the top-left corner").
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppMark } from '../renderer/src/components/AppMark';

const icon = fs.readFileSync(new URL('../renderer/src/assets/agentbox-icon.svg', import.meta.url), 'utf8');
const mark = renderToStaticMarkup(createElement(AppMark, { size: 20 }));

const dotsIn = (svg) => [...svg.matchAll(/<circle\b[^>]*>/g)].map(([tag]) => ({
  cx: Number(tag.match(/cx="([\d.]+)"/)[1]),
  cy: Number(tag.match(/cy="([\d.]+)"/)[1]),
  r: Number(tag.match(/\br="([\d.]+)"/)[1]),
  orange: /fill="#ee6018"/i.test(tag),
  tag,
}));

describe.each([['the app icon', icon], ['the logo in the app', mark]])('%s', (_, svg) => {
  const dots = dotsIn(svg);
  const xs = dots.map((d) => d.cx);
  const ys = dots.map((d) => d.cy);

  it('is nine dots in a three by three grid', () => {
    expect(dots).toHaveLength(9);
    expect(new Set(xs).size).toBe(3);
    expect(new Set(ys).size).toBe(3);
  });

  it('lights exactly one dot, the top right one', () => {
    const lit = dots.filter((d) => d.orange);
    expect(lit).toHaveLength(1);
    expect(lit[0].cx).toBe(Math.max(...xs));
    expect(lit[0].cy).toBe(Math.min(...ys));
  });

  it('does not light the middle dot or the top left one', () => {
    const mid = (v, all) => v !== Math.min(...all) && v !== Math.max(...all);
    expect(dots.find((d) => mid(d.cx, xs) && mid(d.cy, ys)).orange).toBe(false);
    expect(dots.find((d) => d.cx === Math.min(...xs) && d.cy === Math.min(...ys)).orange).toBe(false);
  });

  it('no longer draws the three bars', () => {
    expect(svg).not.toMatch(/row-film|sheen-row|sheen-or/);
  });
});

describe('the logo in the app', () => {
  const dots = dotsIn(mark);
  const [, , w] = mark.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/).slice(1).map(Number);

  it('is the dots alone, with no tile behind them', () => {
    expect(mark).not.toContain('agentbox-icon');
    expect(mark).not.toMatch(/<(img|rect|path|use)\b/);
  });

  it('fills its square, so 20px of corner shows 20px of logo', () => {
    const span = Math.max(...dots.map((d) => d.cx + d.r)) - Math.min(...dots.map((d) => d.cx - d.r));
    expect(span / w).toBeGreaterThan(0.9);
  });

  it('draws the unlit dots in the text colour, so they read on light and dark', () => {
    for (const d of dots.filter((e) => !e.orange)) expect(d.tag).toContain('fill="currentColor"');
  });
});
