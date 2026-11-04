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

// Round 1 of the 2026-11-03 testers, issue 2: with a thread's More menu open, a
// tester tapped "1 Go with the quiet one" behind it, the tap landed on the
// menu's Next week, and the thread was moved to Later. A person cannot tap what
// is covered; the tool now says it is covered instead of tapping through.
describe('a target with something on top of it', () => {
  const rect = (left, top, width, height) => ({ left, top, width, height });
  const aim = (el, hits) => new Function('document', `return ${targetScript('3')}`)({ querySelector: () => el, querySelectorAll: () => [el], elementFromPoint: hits });
  const el = { scrollIntoView() {}, getClientRects: () => [rect(0, 100, 200, 40)], getBoundingClientRect: () => rect(0, 100, 200, 40), contains: (x) => x === inner };
  const inner = {};
  it('says it is covered, rather than tapping what is on top', () => {
    expect(aim(el, () => ({ menu: true }))).toEqual({ covered: true });
  });
  it('taps where it shows, even when another part of it is covered', () => {
    let n = 0;
    expect(aim(el, () => (n++ === 0 ? { menu: true } : inner))).toEqual({ x: 50, y: 120 });
  });
  it('taps its middle when nothing covers it', () => {
    expect(aim(el, () => el)).toEqual({ x: 100, y: 120 });
  });
});

// Round 1 of the 2026-11-03 testers, issue 32, "Bulk close toast has no Undo":
// the toast's Undo is a button inside the toast's own button, and look left out
// every button inside another, so no tester could ever press Undo or Dismiss on
// a toast. A button or link inside another is its own control and is listed.
describe('what look lists', () => {
  it('a button inside another button, like the toast\'s Undo', async () => {
    const src = (await import('node:fs')).readFileSync('.claude/skills/product-loop/scripts/phone.mjs', 'utf8');
    expect(src).toMatch(/\.filter\(\(el, i, all\) => el\.matches\('\[role="button"\], button, a\[href\]'\) \|\| !all\.some/);
  });
});

// Round 3 of the 2026-11-03 testers, issue 2: on a thread with a permission card,
// its choices and the reply box, the page scrolls in a short band, and swipe
// always started at the middle of the screen, which was inside the choices
// card, so the proposal under it could never be reached. Swipe now starts in
// the middle of the biggest scrolling area on screen.
import { swipeFrom } from '../.claude/skills/product-loop/scripts/phone.mjs';
describe('where a swipe starts', () => {
  it('in the middle of the scrolling area, sized to it', () => {
    expect(swipeFrom({ left: 0, top: 140, width: 393, height: 300 }, 'up')).toEqual({ from: [196.5, 380], to: [196.5, 200] });
  });
  it('the middle of the screen when nothing scrolls', () => {
    expect(swipeFrom(null, 'up')).toEqual({ from: [196.5, 576], to: [196.5, 276] });
  });
  it('sideways in the middle of the screen, as before', () => {
    expect(swipeFrom(null, 'left')).toEqual({ from: [321.5, 426], to: [71.5, 426] });
  });
});
