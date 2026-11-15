// THE TRY AGAIN ARROW SITS AS FAR AFTER THE STATUS WORD AS THE RING SITS
// BEFORE IT.
//
// On w-d08dcbb6fc (2026-11-01) the arrow "looks good but not sure it's
// properly aligned". Measured on the person's own screenshot (2x): the arrow
// was level with the capitals to the pixel, but its ink began 25 device pixels
// after the word while the ring ended 18 before it, 12.5px against 9. They
// picked the arrow drawn right after its word at the ring's gap.
//
// The gaps are worked out from the stylesheet the way the browser draws them:
// the ring's ink is its box edge, and the arrow's ink starts past the button's
// padding and the arc's own inset in the 16-unit drawing, after the trailing
// letter-spacing every word carries.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');

const rule = (selector) => {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule for ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};
const px = (block, prop) => {
  const m = block.match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*(-?[\\d.]+)px`));
  if (!m) throw new Error(`no ${prop} in ${block}`);
  return Number(m[1]);
};

describe('the gaps either side of the status word', () => {
  const cell = rule('.th-cell-state');
  const fontSize = Number(cell.match(/font:\s*([\d.]+)px/)[1]);
  const trailing = Number(cell.match(/letter-spacing:\s*([\d.]+)em/)[1]) * fontSize;

  const ringGap = px(rule('.th-cell-state .th-st, .th-cell-state .th-st-cloud'), 'margin-right');

  const button = rule('.th-retry');
  const svg = rule('.th-retry svg');
  const drawn = px(svg, 'width');
  const padding = (px(button, 'width') - drawn) / 2;
  // The arc's leftmost point: centre 8, radius 6, in a 16-unit drawing.
  const arc = pages.match(/<path d="M14 8a6 6 0 1 1-6-6/);
  const inset = (8 - 6) * (drawn / 16);
  const gapAt = (margin) => trailing + margin + padding + inset;

  it('reads the arrow the stylesheet draws', () => {
    expect(arc).not.toBeNull();
    expect(pages).toMatch(/<svg viewBox="0 0 16 16"/);
  });

  it('puts the arrow within half a pixel of the ring\'s gap', () => {
    expect(Math.abs(gapAt(px(button, 'margin-left')) - ringGap)).toBeLessThanOrEqual(0.5);
  });

  it('would have caught the 6px margin that drew it 3.5px too far', () => {
    expect(gapAt(6) - ringGap).toBeGreaterThan(3);
  });
});
