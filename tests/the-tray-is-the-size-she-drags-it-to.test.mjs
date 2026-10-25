// 2026-10-13: "it would be nice to be able to resize. i was thinking dragging
// the side corner of it, but probs other ways to go about doing it."
//
// The tray already sizes itself off the screen it rests on (31px on a laptop,
// up to 48px on her 32"). So what a drag sets is not a height but a MULTIPLE of
// that automatic size: a tag she grows by a fifth stays a fifth bigger when she
// plugs in the big screen, instead of snapping back to a laptop's number.
// The same multiple is what the tag's own menu nudges up and down.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TAG_LIMITS, TAG_ZOOM, tagHeight, tagHeightOn, tagScaleOn, tagZoom, zoomFor, zoomStep,
} from '../shared/corner-tag.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'main/corner-tag-preload.cjs'), 'utf8');
const LAPTOP = 1728;
const BIG = 3413;

describe('the size she drags to is a multiple of the automatic one', () => {
  it('leaves the automatic size alone until she has touched it', () => {
    expect(tagHeightOn(LAPTOP, undefined)).toBe(tagHeight(LAPTOP));
    expect(tagHeightOn(BIG, 1)).toBe(tagHeight(BIG));
    expect(tagZoom(undefined)).toBe(1);
  });

  it('carries what she set to every other screen', () => {
    // a fifth bigger on the laptop is a fifth bigger on the 32" too
    const zoom = zoomFor(tagHeight(LAPTOP) * 1.2, LAPTOP);
    expect(zoom).toBeCloseTo(1.2, 1);
    expect(tagHeightOn(BIG, zoom)).toBeGreaterThan(tagHeight(BIG));
    expect(tagHeightOn(BIG, zoom) / tagHeight(BIG)).toBeCloseTo(zoom, 1);
  });

  it('reads a dragged height back as that multiple', () => {
    expect(zoomFor(tagHeight(LAPTOP), LAPTOP)).toBe(1);
    expect(zoomFor(62, LAPTOP)).toBe(tagZoom(62 / 31));
    expect(zoomFor(0, LAPTOP)).toBe(tagZoom(TAG_LIMITS.min / 31));
  });

  it('stays a tag however far the drag goes', () => {
    for (const width of [1280, LAPTOP, 2560, BIG]) {
      expect(tagHeightOn(width, 99)).toBeLessThanOrEqual(TAG_LIMITS.max);
      expect(tagHeightOn(width, -99)).toBeGreaterThanOrEqual(TAG_LIMITS.min);
      expect(tagZoom(99)).toBe(TAG_ZOOM.max);
      expect(tagZoom(0.01)).toBe(TAG_ZOOM.min);
    }
  });

  it('goes a notch at a time from the menu, and stops at its ends', () => {
    expect(zoomStep(1, 1)).toBeCloseTo(1.1, 2);
    expect(zoomStep(1, -1)).toBeCloseTo(0.9, 2);
    expect(zoomStep(TAG_ZOOM.max, 1)).toBe(TAG_ZOOM.max);
    expect(zoomStep(TAG_ZOOM.min, -1)).toBe(TAG_ZOOM.min);
  });

  it('hands the page one number, as before', () => {
    expect(tagScaleOn(LAPTOP, 1)).toBe(tagHeight(LAPTOP) / 28);
    expect(tagScaleOn(LAPTOP, 1.2) * 28).toBe(tagHeightOn(LAPTOP, 1.2));
  });
});

describe('the corners she drags', () => {
  it('are all four, and draw nothing at all', () => {
    // An arrow that appeared as the pointer crossed a corner read as a glitch:
    // "you accidentally see something flash... it really kills the vibes". The
    // affordance is the pointer, which the system turns into a resize arrow.
    for (const corner of ['tl', 'tr', 'bl', 'br']) expect(css).toContain(`.ct-grip-${corner}`);
    expect(page).toContain('GRIPS.map');
    expect(css).toContain('cursor: nwse-resize');
    expect(css).toContain('cursor: nesw-resize');
    expect(css).not.toContain('.ct-grip svg');
    expect(css).not.toMatch(/\.ct-grip[^}]*opacity/);
    expect(page).not.toContain('const ARROW');
    // and a patch big enough to aim at, not a few pixels of ledge
    expect(css).toMatch(/\.ct-grip \{[^}]*width: calc\(20px/);
  });

  it('press through the same door as a drag, saying which corner it is', () => {
    expect(bridge).toContain('press: (x, y, grip, corner)');
    expect(page).toContain('bridge?.press(e.screenX, e.screenY, true, corner)');
  });

  it('tells the main process where the glass is, and what is under the pointer', () => {
    expect(page).toContain('glass: { x: g.x - r.x, y: g.y - r.y, width: g.width, height: g.height }');
    expect(page).toContain('bridge.size(which, m.width, m.height, m.glass, m.radius)');
    expect(page).toContain('bridge?.clickable(overUs(e))');
    expect(bridge).toContain('clickable: (on)');
    expect(bridge).toContain('size: (part, width, height, glass, radius)');
  });
});


describe('sizing it from the foot of its own list', () => {
  // Her pick, 2026-10-13: a handle on the tag flashed and read as a glitch, so
  // the control lives in the list, which only opens when she asks for it. Two
  // things she asked for by name: the tag must stay in sight while she decides
  // ("you still need to see the component"), and the pair of signs must be one
  // small thing rather than two loose characters ("the ± UI is pretty ugly").
  it('puts Size in the foot, beside Hide for and Turn off', () => {
    expect(page).toContain('ct-size-name');
    expect(page).toMatch(/aria-label="Smaller"[\s\S]*aria-label="Bigger"/);
    expect(page).toContain("bridge?.resize(-1)");
    expect(page).toContain('bridge?.resize(1)');
    expect(bridge).toContain("resize: (by)");
  });

  it('draws the two signs instead of typing them, in one joined pill', () => {
    // a minus and a plus as characters never sit on the same baseline
    expect(page).not.toContain('−');
    expect(page).not.toMatch(/>\s*\+\s*</);
    expect(css).toMatch(/\.ct-foot \.ct-steps \{[^}]*border-radius: 999px/);
    expect(css).toMatch(/\.ct-foot \.ct-steps button \+ button \{ border-left/);
    expect(css).toMatch(/\.ct-foot \.ct-steps svg \{[^}]*stroke: currentColor/);
  });
});
