// ONE TREATMENT ON AN OPENED TASK, and the invariant that keeps it one.
//
// The failure this suite exists for has no symptom you can review your way to.
// A skinned surface INSIDE another skinned surface does not look broken in a
// diff and does not error: it just paints the same wash twice, or blurs the
// same backdrop twice, and one half of the window comes out a few values off
// the other. That is exactly what was on screen until this fix, and it was
// found by measuring a screenshot, not by reading the file. Measured at
// 1440x944, blur 3, by putting each rule back on its own in one frame
//:
//
//   .list-pane's own backdrop-filter, over .app.flat's: the reading half came
//   out at 41.5 against the panel's 41.0 where it should read 34.3. Seven
//   values, and almost no extra softness (p90 detail 1.00 against 1.14).
//   .focus-dock's own --skin-pane, over .app.flat's: 0.22 on 0.22 is 0.39,
//   another 2 values across the bottom band, ramped over 34px by its ::before.
//
// So the rule the suite pins is structural rather than numeric: on an opened
// task the glass is declared ONCE, on .app.flat, and every skin rule scoped
// inside .app.flat may only take paint away. A number would go stale the next
// time a slider moves; this cannot.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const css = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

// Every rule in the file, as { selector, body }. Enough of a parser for a
// stylesheet with no @media and no nesting in it, which this one is; a rule it
// failed to see would make the suite pass wrongly, so the count is asserted.
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  sel: m[1].split('*/').pop().trim(),
  body: m[2],
}));

const skinRules = rules.filter((r) => r.sel.includes('[data-skin]') || r.sel.includes('[data-skin='));
// Rules that apply INSIDE an opened task: scoped under .app.flat, but not
// .app.flat itself, which is the one surface allowed to paint.
//
// EXCEPT THE OPTION SET THAT IS OPEN ON ROUND THREE.One of the six shapes in
// `renderer/src/task-shape.ts` answers that by giving the wash back to the
// pane, which is the arrangement the inbox has. It does not break the
// invariant below, it moves where the invariant is satisfied, and the test
// under `describe('the card shape…')` at the foot of this file is what holds
// it to that: under `card` the ground gives the glass UP.
//
// WHEN ONE IS PICKED, THIS EXCLUSION GOES WITH THE OPTION SET. If it is any of
// the other five, delete `[data-task-shape]` from the stylesheet and this
// filter goes back to `skinRules.filter(...)` alone. If it is the card, the
// earlier pick C is reversed and this whole file is rewritten around the new
// arrangement.
const shapeOption = (sel) => sel.includes('[data-task-shape=');
const insideFlat = skinRules.filter((r) => /\.app\.flat\s+\S/.test(r.sel) && !shapeOption(r.sel));

const paints = (body, prop) => {
  const m = body.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]*)`));
  return m ? m[1].trim() : null;
};

describe('the stylesheet is readable enough for this to mean anything', () => {
  it('parses a stylesheet, not a handful of rules', () => {
    expect(rules.length).toBeGreaterThan(400);
  });
  it('finds the skin rules and the ones scoped inside an opened task', () => {
    expect(skinRules.length).toBeGreaterThan(5);
    expect(insideFlat.length).toBeGreaterThan(0);
  });
});

describe('an opened task wears the treatment exactly once', () => {
  it('declares the wash and the blur on .app.flat and nowhere under it', () => {
    const ground = skinRules.find((r) => /:root\[data-skin\]\s+\.app\.flat$/.test(r.sel));
    expect(ground, 'the one surface that carries the glass is missing').toBeTruthy();
    expect(paints(ground.body, 'background')).toBe('var(--skin-pane)');
    expect(paints(ground.body, 'backdrop-filter')).toBe('blur(var(--skin-blur))');
  });

  // THE INVARIANT. A rule inside .app.flat may say `transparent`, `none` or
  // nothing at all. The moment one of them names --skin-pane or a blur as a
  // resting state, the window is wearing the treatment twice somewhere.
  it('lets nothing inside it paint the wash or the blur again', () => {
    for (const r of insideFlat) {
      const bg = paints(r.body, 'background') ?? paints(r.body, 'background-color');
      const bd = paints(r.body, 'backdrop-filter') ?? paints(r.body, '-webkit-backdrop-filter');
      // :focus-within is not a resting state. The reply box lost its opaque
      // fill with everything else, so the ONE step it takes while she is typing
      // in it is what is left of "the card lifts to the page", and it is the
      // skin's own step rather than a colour invented for this screen.
      const typing = r.sel.includes(':focus-within');
      if (bg && !typing) expect(bg, `${r.sel} paints a second wash`).toMatch(/^(transparent|none)$/);
      if (bd) expect(bd, `${r.sel} blurs the same backdrop again`).toBe('none');
    }
  });

  it('covers the three surfaces that used to paint', () => {
    const covered = (needle) => insideFlat.some((r) => r.sel.includes(needle));
    expect(covered('.list-pane')).toBe(true);
    expect(covered('.focus-dock')).toBe(true);
    expect(covered('.dock-card')).toBe(true);
  });

  // The fade above the composer still has to exist, or a task scrolled halfway
  // is cut off mid-line. It is a mask on the words now instead of a painted
  // band, which is the only way to fade them without changing the ground.
  it('fades the words with a mask rather than a band of its own', () => {
    const dockBefore = insideFlat.find((r) => r.sel.includes('.focus-dock::before'));
    expect(paints(dockBefore.body, 'background')).toBe('none');
    const scroll = insideFlat.find((r) => r.sel.includes('.focus-scroll'));
    expect(paints(scroll.body, 'mask-image')).toMatch(/linear-gradient/);
  });
});

describe('the inbox keeps its variance, because she said so', () => {
  // The card standing off a sharp photograph IS the theme that was picked, so
  // the inbox card must still carry its own wash, its own hairline and its own
  // blur.
  it('still gives the inbox card its own wash, hairline and blur', () => {
    const card = skinRules.find((r) => /:root\[data-skin\]\s+\.list-pane$/.test(r.sel));
    expect(card, 'the inbox card rule is missing').toBeTruthy();
    expect(paints(card.body, 'background')).toBe('var(--skin-pane)');
    expect(paints(card.body, 'border')).toBe('1px solid var(--skin-pane-line)');
    expect(paints(card.body, 'backdrop-filter')).toBe('blur(var(--skin-blur))');
  });

  it('scopes every one of the new rules to a skin, so the plain themes are untouched', () => {
    for (const r of insideFlat) expect(r.sel.startsWith(':root[data-skin]')).toBe(true);
  });
});

describe('the five trial treatments are gone', () => {
  // They were read off a `data-treat` attribute only a shot script ever set,
  // and their own comment said to delete the section once one was picked. One
  // was, so a `data-treat` left in the file would be four rejected designs
  // sitting in the shipped stylesheet.
  it('leaves no data-treat block behind', () => {
    expect(css).not.toMatch(/data-treat/);
  });
});

describe('the card shape, while it is one of six she is choosing between', () => {
  // round three. This is the only thing in the stylesheet allowed to move the
  // glass off `.app.flat`, and it is allowed only because moving it is the
  // open question. The pair of rules has to arrive together: a ground that
  // keeps painting AND a pane that starts painting is the double wash the
  // invariant above exists to stop, and it would be seven values of luminance
  // across the reading half of her window.
  const shaped = (needle) => rules.find((r) => r.sel.includes('[data-task-shape="card"]') && r.sel.includes(needle));

  it('gives the wash and the blur up on the ground before the pane takes them', () => {
    const ground = shaped('.app.flat') && rules.find((r) => /\[data-task-shape="card"\]\[data-skin\] \.app\.flat$/.test(r.sel));
    expect(ground, 'the card shape never releases the ground').toBeTruthy();
    expect(paints(ground.body, 'background')).toBe('none');
    expect(paints(ground.body, 'backdrop-filter')).toBe('none');

    const pane = rules.find((r) => /\[data-task-shape="card"\]\[data-skin\] \.app\.flat \.list-pane\.pinned$/.test(r.sel));
    expect(pane, 'the card shape never gives the pane the wash').toBeTruthy();
    expect(paints(pane.body, 'background')).toBe('var(--skin-pane)');
    expect(paints(pane.body, 'backdrop-filter')).toBe('blur(var(--skin-blur))');
  });

  it('takes the inbox card’s own corner and padding rather than typing numbers again', () => {
    const pane = rules.find((r) => /\[data-task-shape="card"\] \.app\.flat \.list-pane\.pinned$/.test(r.sel));
    expect(pane).toBeTruthy();
    expect(paints(pane.body, 'border-radius')).toBe('var(--radius)');
    const body = rules.find((r) => /\[data-task-shape="card"\] \.app\.flat \.body$/.test(r.sel));
    expect(paints(body.body, 'padding')).toBe('0 22px 22px');
  });

  it('is one of exactly six, and none of them puts a way out back on a task', () => {
    const shapes = new Set([...css.matchAll(/\[data-task-shape="([a-z]+)"\]/g)].map((m) => m[1]));
    expect([...shapes].sort()).toEqual(['card', 'edge', 'header', 'line', 'plain', 'wide'].filter((s) => shapes.has(s)));
    expect(shapes.size).toBeLessThanOrEqual(6);
    for (const r of rules.filter((r) => r.sel.includes('[data-task-shape='))) {
      expect(r.sel).not.toMatch(/\.back-esc/);
    }
  });
});
