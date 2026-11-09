// A PIN SITS BESIDE THE SPOT IT MARKS, NOT ON IT.
//
// Sofia pinned the "Add slot" button and the pin, a 22 px square
// centred on the click, covered the label: the picture read "A [1] ot". The
// one thing the pin was about was the thing it hid. Measured in the stylesheet:
// the pin took `margin: -11px 0 0 -11px`, its middle on the spot.
//
// Now a small ring sits on the spot and the numbered tag stands off it, up and
// to the right, turning to the other side where the picture's edge leaves no room.
import { it, expect, describe } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pinLean, PIN_REACH } from '../renderer/src/artifact-pins.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');
const box = { w: 1000, h: 600 };

describe('which way the tag leans', () => {
  it('stands up and to the right of the spot', () => {
    expect(pinLean({ x: 0.5, y: 0.5 }, box)).toBe('ne');
  });
  it('turns left at the right edge, and only once it has no room', () => {
    expect(pinLean({ x: 1 - (PIN_REACH + 1) / box.w, y: 0.5 }, box)).toBe('ne');
    expect(pinLean({ x: 1 - (PIN_REACH - 1) / box.w, y: 0.5 }, box)).toBe('nw');
  });
  it('drops below at the top edge, and only once it has no room', () => {
    expect(pinLean({ x: 0.5, y: (PIN_REACH + 1) / box.h }, box)).toBe('ne');
    expect(pinLean({ x: 0.5, y: (PIN_REACH - 1) / box.h }, box)).toBe('se');
  });
  it('goes down and left in the top right corner', () => {
    expect(pinLean({ x: 1, y: 0 }, box)).toBe('sw');
  });
  it('leans the usual way before the picture is measured', () => {
    expect(pinLean({ x: 0.99, y: 0.01 }, { w: 0, h: 0 })).toBe('ne');
  });
});

describe('how it is drawn', () => {
  const css = read('renderer/src/components/artifact-view.css');
  const stage = read('renderer/src/components/PinMarks.tsx');
  it('puts a ring on the spot and the number on a tag beside it', () => {
    expect(stage).toContain('av-pin-spot');
    expect(stage).toContain('av-pin-tag');
    expect(stage).toMatch(/pinLean\(/);
  });
  it('no longer centres the numbered square on the spot', () => {
    expect(css).not.toMatch(/margin: -11px 0 0 -11px/);
    expect(css).toMatch(/\.av-pin\.lean-ne \.av-pin-tag/);
  });
});
