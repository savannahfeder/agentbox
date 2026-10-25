// THE AGENT TRAY, 2026-10-13. Two things she met on her own screen.
//
// Her Mac is set to dark, so the tag drew itself dark, and the pages she works
// in are white: in a screenshot she sent, the tray was a black blob on a white
// webinar page. "we want one more neutral, liquid glass feel... just a single
// one." So the tag and its list now wear ONE glass, whatever the Mac is set to:
// no prefers-color-scheme branch anywhere in the page, no pearl, no
// half-circle.
//
// And it was too small: "esp on my 32 inch screen but also maybe on smaller
// screens too", then, on a 1728-point picture, "one notch smaller than this
// size for this screen size and then make it bigger for bigger screens". So one
// number scales the whole tag, off the width of the screen it rests on.
//
// The mark itself is the launch film's nine-dot lattice (w-3133d503b1 v15): it
// turns twice when something changes and settles, it pops when a count arrives,
// and its centre dot is always filled.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LATTICE, TAG_BASE, TAG_HEIGHTS, latticeGrid, tagHeight, tagScale } from '../shared/corner-tag.mjs';
import { Lattice, markMoves } from '../renderer/src/corner-tag/lattice.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');

describe('the tag grows with the screen it rests on', () => {
  it('draws one notch smaller than 34px on the laptop-sized screen she was shown', () => {
    expect(tagHeight(1728)).toBe(31);
    expect(tagHeight(1440)).toBe(31);
  });

  it('climbs hard on a wide screen, because 34px on her 32 inch was far too small', () => {
    expect(tagHeight(1900)).toBe(36);
    expect(tagHeight(2400)).toBe(42);
    expect(tagHeight(3000)).toBe(48);
    // her own screen, from the screenshot she sent
    expect(tagHeight(3413)).toBe(48);
  });

  it('holds the boundary either side and never answers with nothing', () => {
    expect(tagHeight(1899)).toBe(31);
    expect(tagHeight(2399)).toBe(36);
    expect(tagHeight(2999)).toBe(42);
    expect(tagHeight(undefined)).toBe(31);
    expect(tagHeight(NaN)).toBe(31);
    // every step is bigger than the one below it, in order
    const steps = TAG_HEIGHTS.map((s) => s.px);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    expect(steps.every((px) => px > TAG_BASE)).toBe(true);
  });

  it('lands on whole pixels at every step, so the bottom border is a real line', () => {
    // 28 x 1.1 is 30.8, and a border on half a device pixel is what broke the
    // bottom corners (2026-10-13). The scale is worked back from whole heights.
    for (const w of [900, 1440, 1728, 1900, 2400, 3000, 3413, 5120]) {
      expect(Number.isInteger(TAG_BASE * tagScale(w))).toBe(true);
    }
  });
});

describe('what the mark does, and when', () => {
  it('pops when a thread becomes ready and when another one joins it', () => {
    expect(markMoves({ kind: 'working', count: 20 }, { kind: 'ready', count: 1 })).toBe('pop');
    expect(markMoves({ kind: 'ready', count: 3 }, { kind: 'ready', count: 4 })).toBe('pop');
  });

  it('does not pop when a count falls, because that is news you have dealt with', () => {
    expect(markMoves({ kind: 'ready', count: 4 }, { kind: 'ready', count: 3 })).toBe('none');
    expect(markMoves({ kind: 'ready', count: 3 }, { kind: 'ready', count: 3 })).toBe('none');
  });

  it('turns, and so settles, when anything changes while agents are working', () => {
    expect(markMoves({ kind: 'working', count: 20 }, { kind: 'working', count: 21 })).toBe('stir');
    expect(markMoves({ kind: 'working', count: 20 }, { kind: 'working', count: 19 })).toBe('stir');
    expect(markMoves({ kind: 'ready', count: 2 }, { kind: 'working', count: 20 })).toBe('stir');
  });

  it('is still when nothing has changed, and greets you when the tray returns', () => {
    expect(markMoves({ kind: 'working', count: 20 }, { kind: 'working', count: 20 })).toBe('none');
    expect(markMoves(null, { kind: 'working', count: 20 })).toBe('stir');
    expect(markMoves(null, { kind: 'ready', count: 3 })).toBe('pop');
  });
});

describe('the nine dots are one drawing', () => {
  // The mark came out crooked twice, and whole pixels for the dot and the gap
  // only fixed it on a screen whose point is a whole device pixel. Hers draws
  // 1.5 of one, so every box snapped on its own and the gaps rounded apart:
  // "it's the same issue we've had six times before". One svg cannot.
  it('puts the nine centres on a single pitch, on any screen', () => {
    for (const dpr of [1, 1.5, 2]) {
      const { dots, pitch } = latticeGrid(LATTICE.box, dpr);
      expect(dots).toHaveLength(9);
      const xs = [...new Set(dots.map((d) => d.cx))].sort((a, b) => a - b);
      expect([dpr, xs[1] - xs[0], xs[2] - xs[1]]).toEqual([dpr, pitch, pitch]);
    }
  });

  it('keeps the mark about a third of the tag at every step', () => {
    for (const { px } of TAG_HEIGHTS) {
      for (const dpr of [1, 1.5, 2]) {
        const { size } = latticeGrid(LATTICE.box * (px / TAG_BASE), dpr);
        expect([px, dpr, size / px > 0.3 && size / px < 0.45]).toEqual([px, dpr, true]);
      }
    }
  });

  it('is drawn as one shape, sized by the drawing and not by the stylesheet', () => {
    expect(css).not.toContain('--ct-dot');
    expect(css).not.toContain('--ct-gap');
    expect(css).not.toContain('grid-template-columns: repeat(3');
    expect(css).toContain('.ct-lat circle');
  });
});

describe('the nine dots', () => {
  const html = (props) => renderToStaticMarkup(h(Lattice, props));

  it('draws nine dots with the centre one always filled, lit or not', () => {
    for (const lit of [true, false]) {
      const out = html({ lit, move: 'none', beat: 0 });
      expect((out.match(/<circle/g) ?? []).length).toBe(9);
      expect(out).toContain('ct-heart');
      expect(out).not.toContain('data-hole');
    }
  });

  it('lights every dot when a thread is waiting and leaves them resting when none is', () => {
    expect(html({ lit: true, move: 'none', beat: 0 })).toContain('is-waiting');
    expect(html({ lit: false, move: 'none', beat: 0 })).not.toContain('is-waiting');
  });

  it('turns only while working and pops only when a count arrives', () => {
    expect(html({ lit: false, move: 'stir', beat: 1 })).toContain('is-turning');
    expect(html({ lit: true, move: 'pop', beat: 1 })).toContain('is-popping');
    expect(html({ lit: true, move: 'pop', beat: 1 })).not.toContain('is-turning');
  });
});

describe('one glass, whatever the Mac is set to', () => {
  it('has no light-or-dark branch left in the tray page at all', () => {
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).not.toContain("data-theme='dark'");
    expect(page).not.toContain('theme');
  });

  it('has dropped the pearl and the half-circle for the apricot lattice', () => {
    expect(css).not.toContain('radial-gradient');
    expect(page).not.toContain('ct-half');
    // the film's apricot, half a step deeper so it carries on a big screen
    expect(css).toMatch(/--ct-lat: #[0-9a-f]{6}/);
    const [, r, g, b] = css.match(/--ct-lat: #(..)(..)(..)/).map((h, i) => (i ? parseInt(h, 16) : h));
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r - b).toBeGreaterThan(100);
    expect(css).toContain('.ct-lat');
  });

  it('lets the screen through, so a dark one is not a white slab in the corner', () => {
    // "a little more transparent so that, in dark mode, it doesn't look so
    // visible/high contrast". The tag's glass is thin; the list, which is read
    // a line at a time, is the firm one.
    const fill = (name) => css.match(new RegExp(`--ct-tint${name}: [^;]+`))[0]
      .match(/rgba\([^)]+\)/g).map((c) => Number(c.split(',').pop().trim().replace(')', '')));
    // Thin, but not so thin it disappears into a white page, which is what
    // happened when it went further (2026-10-13).
    expect(Math.max(...fill(''))).toBeLessThan(0.8);
    expect(Math.min(...fill(''))).toBeGreaterThan(0.65);
    expect(Math.min(...fill('-hover'))).toBeGreaterThan(0.85);
  });

  it('draws a whole border on all four sides, the bottom one strongest', () => {
    // A half-pixel inset ring left the bottom edge and its corners broken on
    // her screen; a real border follows the radius and lands on real pixels.
    expect(css).toContain('border: 1px solid var(--ct-line)');
    expect(css).toContain('border-bottom-color: var(--ct-line-bottom)');
    expect(css).not.toContain('inset 0 0 0 0.5px');
    const alpha = (name) => Number(css.match(new RegExp(`--ct-line${name}: rgba\\([^)]+\\)`))[0].split(',').pop().trim().replace(')', ''));
    expect(alpha('-bottom')).toBeGreaterThan(alpha(''));
    // and it stays faint: an edge, not a frame ("a bit too prominent/visible")
    expect(alpha('-bottom')).toBeLessThan(0.25);
    expect(alpha('')).toBeLessThan(0.18);
  });

  it('keeps its promise to anyone who asked for less motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });

  it('draws no outer shadow, because the window is exactly the tag', () => {
    // main/corner-tag.mjs: padding the window for a drawn shadow let a real
    // first click fall through to the app beneath. So the glass is defined by
    // its edge, and every shadow in this page is an inset one.
    for (const line of css.split('\n')) {
      if (!line.includes('box-shadow') && !line.includes('inset')) continue;
      const shadows = line.slice(line.indexOf(':') + 1).split(',');
      for (const part of shadows) {
        if (part.trim() && !part.includes('inset') && /\dpx/.test(part)) {
          expect(`${line.trim()} :: ${part.trim()}`).toBe('every shadow inset');
        }
      }
    }
  });
});
