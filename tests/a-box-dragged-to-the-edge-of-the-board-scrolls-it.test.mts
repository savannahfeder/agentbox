// A BOX DRAGGED TO THE EDGE OF THE BOARD SCROLLS IT, AND KEEPS PICKING.
//
// Asked 2026-11-04 (w-53045985ba): dragging a box down the In progress column
// "just stops there without any automatic scrolling once I've hit the bottom",
// so the 25 cards could not all be picked in one drag; the photo showed 14.
// Measured before the change: Pages.tsx's box drag only listened for
// pointermove and never scrolled, and its pointerdown preventDefault stops the
// browser's own drag-scroll, so holding the pointer at the bottom edge did
// nothing, and a wheel scroll mid-drag did not grow the box either.
//
// Driven here against a fake board 600px tall that scrolls under a fixed
// window, with a card every 80px down one column.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bandDrag } from '../renderer/src/threads/board-select.ts';

function board({ cards = 25, viewTop = 100, viewBottom = 700 } = {}) {
  let scrollTop = 0;
  const contentHeight = 40 + cards * 80;
  const max = contentHeight - (viewBottom - viewTop);
  let queued = null;
  let bands = [];
  let hits = [];
  const drag = (from) => bandDrag({
    from,
    wrapRect: () => ({ left: 0, top: viewTop - scrollTop, right: 1000, bottom: viewTop - scrollTop + contentHeight }),
    cards: () => Array.from({ length: cards }, (_, i) => {
      const top = viewTop - scrollTop + 20 + i * 80;
      return { id: `t${i}`, box: { left: 100, top, right: 400, bottom: top + 68 } };
    }),
    scroller: {
      rect: () => ({ left: 0, top: viewTop, right: 1000, bottom: viewBottom }),
      scrollBy: (dy) => { scrollTop = Math.max(0, Math.min(max, scrollTop + dy)); },
    },
    frame: (fn) => { queued = fn; return 1; },
    cancelFrame: () => { queued = null; },
    onBand: (b) => bands.push(b),
    onHits: (ids) => { hits = ids; },
  });
  return {
    drag,
    frames: (n) => { for (let i = 0; i < n && queued; i++) { const fn = queued; queued = null; fn(); } },
    get scrollTop() { return scrollTop; },
    set scrollTop(v) { scrollTop = v; },
    get hits() { return hits; },
    get bands() { return bands; },
    get waiting() { return !!queued; },
    max,
  };
}

describe('a box held at the bottom edge of the board', () => {
  it('scrolls the board down and picks every card down to the last', () => {
    const b = board();
    const d = b.drag({ x: 90, y: 110 });
    d.move(300, 695);
    expect(b.hits.length).toBeLessThan(25);
    b.frames(1000);
    expect(b.scrollTop).toBe(b.max);
    expect(b.hits).toHaveLength(25);
    expect(b.hits[0]).toBe('t0');
  });

  it('keeps scrolling with the pointer past the bottom of the window', () => {
    const b = board();
    const d = b.drag({ x: 90, y: 110 });
    d.move(300, 900);
    b.frames(1000);
    expect(b.hits).toHaveLength(25);
  });

  it('scrolls back up at the top edge, and the box still starts where the drag did', () => {
    const b = board();
    b.scrollTop = b.max;
    const d = b.drag({ x: 90, y: 690 });
    d.move(300, 105);
    b.frames(1000);
    expect(b.scrollTop).toBe(0);
    expect(b.hits).toHaveLength(25);
  });
});

describe('a box away from both edges', () => {
  it('does not scroll the board', () => {
    const b = board();
    const d = b.drag({ x: 90, y: 110 });
    d.move(300, 400);
    b.frames(50);
    expect(b.scrollTop).toBe(0);
    expect(b.hits).toEqual(['t0', 't1', 't2', 't3']);
  });
});

describe('a board scrolled by the wheel mid-drag', () => {
  it('grows the box with it, though the pointer did not move', () => {
    const b = board();
    const d = b.drag({ x: 90, y: 110 });
    d.move(300, 400);
    b.scrollTop = 800;
    d.scrolled();
    expect(b.hits).toContain('t13');
    expect(b.hits[0]).toBe('t0');
  });
});

describe('letting go', () => {
  it('stops scrolling and takes the box away', () => {
    const b = board();
    const d = b.drag({ x: 90, y: 110 });
    d.move(300, 695);
    b.frames(3);
    const at = b.scrollTop;
    expect(d.end()).toBe(true);
    expect(b.waiting).toBe(false);
    expect(b.bands.at(-1)).toBe(null);
    b.frames(10);
    expect(b.scrollTop).toBe(at);
  });

  it('after a press that barely moved is a click, which neither scrolls nor picks', () => {
    const b = board();
    const d = b.drag({ x: 90, y: 690 });
    d.move(91, 691);
    b.frames(10);
    expect(b.scrollTop).toBe(0);
    expect(d.end()).toBe(false);
  });
});

describe('the board', () => {
  const pages = readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  it('draws its box through bandDrag, with the list that scrolls it', () => {
    expect(pages).toMatch(/bandDrag\(\{/);
    expect(pages).toMatch(/scrollerOf\(wrap\)/);
  });
});
