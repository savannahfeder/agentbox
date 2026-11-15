// THE CHEAP-LOOKING THINGS IN FILES AND THREADS ARE GONE.
//
// What Sofia called cheap: gsp2.png, a 22 px pin badge 8 px off its spot
// hid the plus button it pointed at; co1.png, "7 check pictures agents took…" in
// grey monospace under the folders read as a leftover; mvD.png, the Move menu on
// a second-row tile ran off the window after "Films". And a thread at 1180 px set
// its sentences 1116 px wide, about 150 characters to a line.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const rule = (css, sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};
const px = (block, prop) => Number(new RegExp(`(?:^|[\\s;{])${prop}:\\s*(-?[\\d.]+)px`).exec(block)?.[1]);

describe('a pin', () => {
  const css = read('renderer/src/components/artifact-view.css');
  it('is a small dot on the spot, filled, not a ring beside a badge', () => {
    const spot = rule(css, '.av-pin-spot');
    expect(px(spot, 'width')).toBeLessThanOrEqual(8);
    expect(spot).toMatch(/background: var\(--accent\)/);
  });
  it('hangs its number off it, small and clear of the spot', () => {
    expect(px(rule(css, '.av-pin-tag'), 'height')).toBeLessThanOrEqual(16);
    for (const [lean, a, b] of [['ne', 'left', 'bottom'], ['nw', 'right', 'bottom'], ['se', 'left', 'top'], ['sw', 'right', 'top']]) {
      const hang = rule(css, `.av-pin.lean-${lean} .av-pin-tag`);
      expect(px(hang, a)).toBeGreaterThanOrEqual(10);
      expect(px(hang, b)).toBeGreaterThanOrEqual(10);
    }
  });
  it('joins them on a stem', () => {
    expect(css).toMatch(/\.av-pin::after \{/);
  });
});

describe('the line of check pictures', () => {
  const css = read('renderer/src/files/files-place.css');
  it('is a fold in the app\'s own type, with a mark that it opens', () => {
    expect(rule(css, '.fp-scratch')).not.toContain('var(--mono)');
    const page = read('renderer/src/files/FilesPlace.tsx');
    expect(page).not.toMatch(/scratchOpen \? '' : '…'/);
    expect(page).toMatch(/className="fp-scratch"[^]*?<svg/);
  });
});

describe('the Move menu', () => {
  it('is measured when it opens, like every other menu that could leave the window', () => {
    expect(read('renderer/src/files/FilesPlace.tsx')).toMatch(/fitMenu\(menu, /);
  });
});

describe('a wide thread', () => {
  const css = read('renderer/src/workspace-navigation.css');
  it('keeps a reading measure on its sentences', () => {
    // Not only a direct child: a message's words sit a level or two inside .markdown.
    expect(css).toMatch(/\.focus \.msg-body\.typed:not\(/);
    const m = /\.workspace-layout \.focus \.markdown :is\([^)]*\bp\b[^)]*\)[^{]*\{\s*max-width:\s*(\d+)px/.exec(css);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeLessThanOrEqual(780);
    expect(Number(m[1])).toBeGreaterThanOrEqual(640);
  });
  it('lets pictures, films and documents use the width', () => {
    expect(css).toMatch(/:not\(:has\(/);
    const block = /\.workspace-layout \.focus \.markdown :is\(([^)]*)\)/.exec(css)[1];
    for (const wide of ['pre', 'table', 'div', 'figure']) expect(block.split(/,\s*/)).not.toContain(wide);
  });
});
