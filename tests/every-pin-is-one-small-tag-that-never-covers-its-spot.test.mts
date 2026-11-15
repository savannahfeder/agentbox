// EVERY PIN IS ONE SMALL TAG, AND THE TAG NEVER COVERS ITS SPOT.
//
// Sofia: "old pins from v1 are small dots with dark tags
// 'v1·1' (good, readable). My new pin is a big orange numbered badge with the dot
// under it, and the badge sits across the label of the button, so 'Book seats'
// reads 'Book eats'"; on the phone picture "Tue" read "Tu". Measured in
// artifact-view.css: a pin being written or picked filled its tag with the accent,
// a second look, and the tag hung 10px off the spot, inside one line of 13px text
// either side of the dot. Now every tag is the same bordered tag, the picked one
// marked only by its border and dot, and it hangs clear of a line of text.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pinLean, PIN_REACH } from '../renderer/src/artifact-pins.ts';

const css = fs.readFileSync(new URL('../renderer/src/components/artifact-view.css', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
const px = (body, prop) => Number(new RegExp(`${prop}:\\s*(-?[\\d.]+)px`).exec(body)?.[1]);

// Half a line of 20px text, the tallest a button label or a heading line runs here, and the dot's own radius.
const CLEAR = 10 + 3.5;

describe('one marker style', () => {
  it('no tag is ever filled with the accent, picked, new or carried', () => {
    const filled = rules.filter((r) => /av-pin-tag/.test(r.sel) && /background:\s*var\(--accent\)/.test(r.body));
    expect(filled.map((r) => r.sel)).toEqual([]);
  });
  it('the picked and the new pin are told apart by the border, not by a block of colour', () => {
    const on = rules.find((r) => r.sel.includes('.av-pin.is-on .av-pin-tag'));
    expect(on?.body).toMatch(/border-color:\s*var\(--accent\)/);
  });
});

describe('the tag hangs clear of its spot', () => {
  for (const lean of ['ne', 'nw', 'se', 'sw']) {
    it(`leaning ${lean}, its nearest edge is past a line of text from the dot`, () => {
      const r = rules.find((x) => x.sel === `.av-pin.lean-${lean} .av-pin-tag`);
      expect(r, lean).toBeTruthy();
      const across = px(r.body, lean.endsWith('e') ? 'left' : 'right');
      const down = px(r.body, lean.startsWith('n') ? 'bottom' : 'top');
      expect(across).toBeGreaterThanOrEqual(CLEAR);
      expect(down).toBeGreaterThanOrEqual(CLEAR);
    });
  }
  it('its stem runs from the dot to the tag', () => {
    const stem = rules.find((x) => x.sel === '.av-pin::after');
    const reach = px(rules.find((x) => x.sel === '.av-pin.lean-ne .av-pin-tag').body, 'left');
    expect(px(stem.body, 'width')).toBeGreaterThanOrEqual(Math.round(reach * Math.SQRT2) - 1);
  });
  it('a pin near an edge leans the way that has room for the longer reach', () => {
    expect(pinLean({ x: 0.5, y: 0.5 }, { w: 400, h: 400 })).toBe('ne');
    expect(pinLean({ x: 0.95, y: 0.5 }, { w: 400, h: 400 })).toBe('nw');
    expect(pinLean({ x: 0.5, y: 0.05 }, { w: 400, h: 400 })).toBe('se');
    expect(PIN_REACH).toBeGreaterThanOrEqual(CLEAR + 24);
  });
});
