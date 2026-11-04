// A PHONE TESTER'S TAP ON A WRAPPED LINK LANDS ON THAT LINK (w-e4d49a1539).
//
// 2026-11-02 workday, issue 20: "the notes link opens the design comparison
// instead". Rechecked 2026-11-03: `inbox-versions.md` wraps onto two lines, and
// the phone tool tapped the middle of its bounding box, (154, 575), which is
// the gap above the `compare.html` link on the next line, so compare.html
// opened. Tapping the card on screen opened the notes. A person taps the word;
// the tool now taps the middle of the element's first line box.
import { describe, it, expect } from 'vitest';
import { targetScript } from '../.claude/skills/product-loop/scripts/phone.mjs';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
function aimAt(el) {
  const doc = { querySelector: () => el, querySelectorAll: () => [el] };
  return new Function('document', `return ${targetScript('3')}`)(doc);
}

describe('where the phone tool taps', () => {
  it('a link wrapped onto two lines: the middle of its first line, not the gap between them', () => {
    const el = { scrollIntoView() {}, getClientRects: () => [rect(240, 552, 120, 21), rect(20, 577, 60, 21)], getBoundingClientRect: () => rect(20, 552, 340, 46) };
    expect(aimAt(el)).toEqual({ x: 300, y: 562.5 });
  });

  it('a button on one line: its middle, as before', () => {
    const el = { scrollIntoView() {}, getClientRects: () => [rect(10, 100, 200, 40)], getBoundingClientRect: () => rect(10, 100, 200, 40) };
    expect(aimAt(el)).toEqual({ x: 110, y: 120 });
  });

  it('an element with no line boxes: the middle of its box', () => {
    const el = { scrollIntoView() {}, getClientRects: () => [], getBoundingClientRect: () => rect(0, 0, 50, 50) };
    expect(aimAt(el)).toEqual({ x: 25, y: 25 });
  });
});
