// A group label belongs to the rows UNDER it, and the spacing has to say so.
//
// Her words, 2026-09-24 (w-ad426c52ae), on the Urgent heading she had just
// asked for: "the spacing between the urgent text and its first row, and the
// spacing between everything else and its first row, are both still too much."
// Shown five gaps at 16, 14, 12, 10 and 8 points, her pick was twelve.
//
// WHY THIS IS A TEST AND NOT A NUMBER IN A FILE. The gap she picked is not one
// declaration, it is the sum of two that live sixteen lines apart: the label's
// own bottom margin, and the top padding the first row gives up. Either one
// changed on its own moves her gap silently, and the first round of options
// failed for exactly that reason, having moved only one of the two. The whole
// point of pinning the SUM is that neither half can drift alone.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

function px(re, what) {
  const m = css.match(re);
  expect(m, `no match for ${what}`).toBeTruthy();
  return parseFloat(m[1]);
}

const labelBottom = () => px(/\.day-label \{[^}]*margin-bottom: (\d+)px/s, "the label's bottom margin");
const firstRowTop = () => px(/\.day-label \+ \.row \{ padding-top: (\d+)px/, "the first row's top padding");
const labelTop = () => px(/\.list > div:not\(:first-child\) > \.day-label \{ margin-top: (\d+)px/, "the label's top margin");
const rowTop = () => px(/^\.row \{[^}]*padding: (\d+)px/ms, "an ordinary row's top padding");

describe('the gap below a group label', () => {
  it('is the twelve points she picked', () => {
    expect(labelBottom() + firstRowTop()).toBe(12);
  });

  // The failure this catches is a later session "simplifying" the pair back
  // into one declaration by deleting the row rule, which silently returns her
  // gap to 9 + 19 = 28, the thing she opened the row about.
  it('takes most of it out of the row, not the label', () => {
    expect(firstRowTop()).toBeLessThan(rowTop());
    expect(rowTop() - firstRowTop()).toBeGreaterThanOrEqual(9);
  });
});

describe('the gap above a group label', () => {
  // The whole reason twelve reads as a label rather than a squeeze: it is
  // clearly nearer the rows it names than the ones it follows. Equal air on
  // both sides would belong to neither group, which is what she was looking at.
  it('is wider than the gap below it, by a lot', () => {
    expect(labelTop()).toBeGreaterThanOrEqual(2 * (labelBottom() + firstRowTop()));
  });

  // And what the row gives up is given back here, so the distance from one
  // group's last row to the next group's first TITLE is what it always was and
  // only the label moved inside it.
  it('gives back exactly what the first row gave up', () => {
    const plainLabelTop = px(/\.list > div:first-child > \.day-label \{ margin-top: (\d+)px/, "the first label's top margin");
    expect(labelTop() - plainLabelTop).toBe(rowTop() - firstRowTop() - (9 - labelBottom()));
  });
});
