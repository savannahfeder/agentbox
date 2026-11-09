// The model drawer dropped past the bottom of a zoomed window and cut its
// Effort row in half (w-12730c6506, 2026-09-25). A composer menu that does not
// fit where CSS put it opens on the roomier side of its word, and scrolls when
// neither side is tall enough. One that fits is left exactly as it was.
//
// Then with a file open beside the card, the same drawer hung off the LEFT of
// the conversation pane and was cut off there (w-a29fae865a, 2026-09-25). A
// menu that leaves the visible strip sideways slides back inside it.
import { it, expect } from 'vitest';
import { fitMenu } from '../renderer/src/keep-in-window';

const WIDE = { left: 0, right: 1600 };

// A menu whose drawn box follows the inline styles fitMenu writes, the way a
// browser's would: dropping from its word, or rising above it; hung off the
// word's right edge the way the model drawer is, unless a left is written.
function menu({ word, tall, drops, x = 800, wordWidth = 80, wide = 300 }) {
  const style = { top: '', bottom: '', maxHeight: '', overflowY: '', left: '', right: '' };
  return {
    style,
    parentElement: {
      getBoundingClientRect: () => ({ top: word, bottom: word + 20, left: x, right: x + wordWidth }),
    },
    getBoundingClientRect() {
      const h = style.maxHeight ? Math.min(tall, parseFloat(style.maxHeight)) : tall;
      const down = style.bottom === 'auto' || (style.top === '' && drops);
      const top = down ? word + 28 : word - 8 - h;
      const left = style.left ? x + parseFloat(style.left) : x + wordWidth - wide;
      return { top, bottom: top + h, height: h, left, right: left + wide, width: wide };
    },
  };
}

it('leaves a menu that fits alone', () => {
  const m = menu({ word: 100, tall: 400, drops: true });
  fitMenu(m, 900, WIDE);
  expect(m.style).toEqual({ top: '', bottom: '', maxHeight: '', overflowY: '', left: '', right: '' });
});

it('turns a dropping menu upward when it would leave the bottom of the window', () => {
  // Her screenshot: the word near the middle of a zoomed window, a tall drawer.
  const m = menu({ word: 500, tall: 470, drops: true });
  fitMenu(m, 740, WIDE);
  expect(m.style.bottom).toBe('calc(100% + 8px)');
  expect(m.style.top).toBe('auto');
  const box = m.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(44);
  expect(box.bottom).toBeLessThanOrEqual(740 - 8);
});

it('scrolls inside itself when neither side has the room', () => {
  const m = menu({ word: 300, tall: 700, drops: true });
  fitMenu(m, 640, WIDE);
  expect(m.style.overflowY).toBe('auto');
  const box = m.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(8);
  expect(box.bottom).toBeLessThanOrEqual(640 - 8);
});

it('drops a rising menu that would leave the top of the window', () => {
  const m = menu({ word: 60, tall: 200, drops: false });
  fitMenu(m, 900, WIDE);
  expect(m.style.top).toBe('calc(100% + 8px)');
  expect(m.getBoundingClientRect().top).toBeGreaterThanOrEqual(8);
});

// The project menu rose from the reply box, ran out of room, and was pinned
// 8px from the window top. Its first rows sat in the title bar band, where no
// press or hover reaches the page, so Agentbox Team could not be picked
// (w-b4e97f344e, 2026-10-02). A menu stops below that band, not at the edge.
it('keeps a rising menu below the title bar band, where clicks never land', () => {
  const m = menu({ word: 600, tall: 800, drops: false });
  fitMenu(m, 900, WIDE);
  expect(m.style.overflowY).toBe('auto');
  expect(m.getBoundingClientRect().top).toBeGreaterThanOrEqual(44);
});

it('moves a menu that fits but starts inside the title bar band', () => {
  const m = menu({ word: 230, tall: 200, drops: false });
  expect(m.getBoundingClientRect().top).toBeLessThan(44);
  fitMenu(m, 900, WIDE);
  expect(m.getBoundingClientRect().top).toBeGreaterThanOrEqual(44);
});

it('slides a drawer back inside a narrowed pane when its word starts the line', () => {
  // Her screenshot: a file open on the right, the pane starting at 172px, the
  // model word wrapped to the start of the footer's second line at 294px.
  const pane = { left: 172, right: 1160 };
  const m = menu({ word: 1140, tall: 300, drops: false, x: 294, wordWidth: 140, wide: 320 });
  expect(m.getBoundingClientRect().left).toBeLessThan(pane.left);
  fitMenu(m, 1300, pane);
  const box = m.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(pane.left + 8);
  expect(box.right).toBeLessThanOrEqual(pane.right - 8);
  expect(m.style.right).toBe('auto');
  expect(m.style.top).toBe('');
});

it('clears a slide it wrote earlier once the drawer fits again', () => {
  const m = menu({ word: 400, tall: 200, drops: false, x: 1500, wordWidth: 40, wide: 300 });
  m.style.left = '0px';
  m.style.right = 'auto';
  fitMenu(m, 900, WIDE);
  expect(m.style.left).toBe('');
  expect(m.style.right).toBe('');
});

it('pins a drawer inside a strip narrower than where it hangs', () => {
  const n = menu({ word: 400, tall: 200, drops: false, x: 100, wordWidth: 40, wide: 300 });
  fitMenu(n, 900, { left: 0, right: 400 });
  const box = n.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(8);
  expect(box.right).toBeLessThanOrEqual(400 - 8);
});
