// The full-screen picture view's controls: the corner buttons work, the keys
// bring the controls back, and the arrow at the end of the row stays visible.
//
// What broke, reported on the shipped view:
// - The close, open-beside and Preview buttons in the top-right corner did
//   nothing. Each step arrow's click area ran the full height of the window
//   edge (top: 0; bottom: 0; 104px wide) and sat later in the page at the same
//   layer, so the right-hand one covered the corner buttons. Measured in the
//   built app with elementFromPoint: a click at the centre of Close and of
//   Open in Preview landed on the Next picture button.
// - Moving with the left and right keys never brought the faded controls back;
//   only the pointer did.
// - On the first picture the back arrow disappeared (opacity 0), which read as
//   a bug; it should show, dimmed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../renderer/src/components/PictureView.tsx', import.meta.url), 'utf8');

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector) {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `${selector} is in the stylesheet`).toBeGreaterThan(-1);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}
const px = (decls, prop) => {
  const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?\\d+)px`).exec(decls);
  return m ? Number(m[1]) : null;
};

describe('the step arrows leave the corners to the buttons in them', () => {
  const step = rule('.pv-step');
  const top = rule('.pv-top');

  it('start below the bar that holds the close button', () => {
    const barBottom = px(top, 'top') + px(top, 'height');
    expect(barBottom).toBeGreaterThan(0);
    expect(px(step, 'top')).toBeGreaterThanOrEqual(barBottom);
  });

  it('stop above the strip of pictures along the foot', () => {
    const strip = rule('.pv-strip');
    const thumb = rule('.pv-thumb');
    const stripTop = px(strip, 'bottom') + px(thumb, 'height') + 2 * px(strip, 'padding');
    expect(px(step, 'bottom')).toBeGreaterThanOrEqual(stripTop);
  });

  it('are still tall, so the edge is easy to hit', () => {
    expect(step).not.toMatch(/(?:^|[;\s])height:/);
    expect(px(step, 'width')).toBeGreaterThanOrEqual(80);
  });
});

describe('the arrow at either end of the row', () => {
  const disabled = rule('.pv-step:disabled');

  it('stays on screen, dimmed', () => {
    const opacity = /opacity:\s*([\d.]+)/.exec(disabled);
    if (opacity) expect(Number(opacity[1])).toBeGreaterThan(0);
    expect(disabled).toMatch(/color:/);
  });

  it('does not let a click fall through to the picture behind it, which would close the view', () => {
    expect(disabled).not.toMatch(/pointer-events:\s*none/);
    expect(disabled).toMatch(/cursor:\s*default/);
  });
});

describe('the keyboard brings the controls back', () => {
  it('wakes the controls on every key the view takes', () => {
    const handler = view.slice(view.indexOf('const key = (e: KeyboardEvent)'));
    const body = handler.slice(0, handler.indexOf('};'));
    expect(body).toMatch(/\bwake\(\)/);
    // Before Escape is handled, so a step or a zoom shows where it landed.
    expect(body.indexOf('wake()')).toBeLessThan(body.indexOf("'ArrowRight'"));
  });
});
