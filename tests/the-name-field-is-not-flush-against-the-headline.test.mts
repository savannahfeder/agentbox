// THE SPACING AT THE TOP OF THE IMPORT CARD.
//
// The founder, on a picture of the card mid-search (w-6418318cd5, 2026-10-16):
// "spacing here is wack". Measured in the real built renderer, it was:
//
//   resting (the ten days, with its subtitle)   headline → field  36.9px
//   searching (the subtitle is not drawn)       headline → field   2px
//
// An eighteenfold swing between two states of the same card, because the field
// carried a 2px top margin and leaned on the subtitle above it for all its
// air. Take the subtitle away and the field sits against a 21px headline.
//
// AND THE CAPTION WAS THE ONE THING OFF THE SPINE. The headline, the field and
// the list all start 31px from the card's edge; the line under the field
// started at 33 and ended 2px short on the right, because it had been given a
// 2px horizontal inset for no reason anybody wrote down.
//
// These are rules rather than rendered pixels: the measurement needs a browser
// and this suite has to run without one. The harness that took the numbers
// above is scripts/scratch/measure-the-card-spacing.mjs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');
const card = fs.readFileSync(path.join(root, 'renderer/src/components/ImportAgents.tsx'), 'utf8');

/** The declarations of one rule, so an assertion reads the whole block. */
const rule = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  if (at < 0) return '';
  return css.slice(at, css.indexOf('}', at));
};
/** A margin shorthand's four sides, as numbers. */
const margin = (selector) => {
  const m = rule(selector).match(/margin:\s*([^;]+);/);
  if (!m) return null;
  const parts = m[1].trim().split(/\s+/).map((p) => parseFloat(p) || 0);
  const [a, b = a, c = a, d = b] = parts;
  return { top: a, right: b, bottom: c, left: d };
};

describe('the field has its own air, in both states of the card', () => {
  it('does not lean on the subtitle for the gap above it', () => {
    // A bare top margin here is what made the searching card 2px: the subtitle
    // is not drawn then, so whatever the field leans on is gone.
    expect(margin('.ia-find').top).toBe(0);
  });

  it('takes a real gap when the headline is the thing directly above it', () => {
    // `.ia-top + .ia-find` only matches when no subtitle sits between them,
    // which is exactly the searching card and the empty-Mac card.
    const direct = rule('.ia-top + .ia-find');
    expect(direct).toMatch(/margin-top:\s*\d+px/);
    const px = parseFloat(direct.match(/margin-top:\s*(\d+)/)[1]);
    // This margin IS the gap, and `.ia-top`'s own 2px bottom margin adds
    // nothing to it: adjacent siblings collapse to the larger of the two.
    // Measured in the built renderer it comes out at 14, not 16. Anything
    // under about ten reads as touching under a 21px headline.
    expect(px).toBeGreaterThanOrEqual(14);
    expect(px).toBeGreaterThan(margin('.ia-top').bottom);
  });

  it('still lets the subtitle carry the gap when there is one', () => {
    // Resting, `.ia-top + .ia-find` cannot match, so this is the spacing and
    // the card at rest is unchanged by any of it.
    expect(margin('.ia-one .ia-line').bottom).toBe(14);
  });
});

describe('everything on the card shares one left edge', () => {
  it('does not inset the line under the field', () => {
    const m = margin('.ia-find-under');
    expect(m.left).toBe(0);
    expect(m.right).toBe(0);
  });

  it('keeps the caption nearer the field than the list is to it', () => {
    // The caption belongs to the field above it, so it sits closer to that
    // than the list below does. Grouping by proximity, in two numbers.
    const toCaption = margin('.ia-find-under').top;
    const toList = margin('.ia-find').bottom;
    expect(toCaption).toBeGreaterThanOrEqual(10);
    expect(toList).toBeGreaterThan(toCaption);
  });
});

describe('the card still draws the same things', () => {
  it('has one field and one line under it, not two', () => {
    expect(card.split('ia-find-box').length - 1).toBe(1);
    expect(card.split('ia-find-under').length - 1).toBe(1);
  });
});
