// A LONG THREAD SHOWS A SCROLLBAR YOU CAN DRAG.
//
// Reported 2026-11-02 with a screenshot of a long thread: no scrollbar while
// scrolling, so no way to grab it and move. Two causes, both measured.
//
// 1. `* { scrollbar-color: transparent transparent }`. Since Chromium 121 a
//    set `scrollbar-color` wins over every `::-webkit-scrollbar` rule, so the
//    hover thumb those rules draw never showed. Read in Chromium 156 through
//    Playwright with real scrollbars: with the pointer on the pane after a
//    wheel scroll, its computed `scrollbar-color` stayed transparent and the
//    gutter held 0 drawn pixels; with this rule, 152.
// 2. Holding the bar still for more than HER_HAND_MS (700ms) before dragging:
//    the drag's scroll events arrived after her hand had "expired", the stick
//    still thought she was at the end, and the next line the agent wrote
//    pulled her back down mid-drag.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HER_HAND_MS, holdAtBottom } from '../renderer/src/thread-bottom.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const styles = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'styles.css'), 'utf8');

describe('the thread pane draws its scrollbar', () => {
  const rule = styles.match(/\.focus-scroll:hover\s*\{([^}]*)\}/);

  it('has a rule for the pane under the pointer', () => {
    expect(rule).toBeTruthy();
  });

  it('gives the thumb a colour, since scrollbar-color overrides the webkit thumb', () => {
    const color = rule[1].match(/scrollbar-color:\s*([^;]+);/);
    expect(color).toBeTruthy();
    const [thumb] = color[1].trim().split(/\s+/);
    expect(thumb).not.toBe('transparent');
  });

  it('leaves every other scroller as it was, invisible at rest', () => {
    expect(styles).toMatch(/\*\s*\{\s*scrollbar-width: thin;\s*scrollbar-color: transparent transparent;\s*\}/);
  });
});

// The same fake box as tests/the-thread-opens-at-the-bottom, plus a window
// for the mouseup that ends a drag.
function box({ scrollHeight, clientHeight = 793, scrollTop = 0 }) {
  const listeners = new Map();
  const winListeners = new Map();
  const observers = new Set();
  const el = {
    scrollTop, scrollHeight, clientHeight,
    firstElementChild: null,
    ownerDocument: {
      defaultView: {
        addEventListener(type, fn) { winListeners.set(type, fn); },
        removeEventListener(type) { winListeners.delete(type); },
      },
    },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    press() { listeners.get('mousedown')?.({ type: 'mousedown' }); },
    letGo() { winListeners.get('mouseup')?.(); },
    leaveWindow() { winListeners.get('blur')?.(); },
    /** A scroll with no gesture in front of it: the bar being dragged. */
    dragsTo(top) { el.scrollTop = top; listeners.get('scroll')?.(); },
    growsTo(h) { el.scrollHeight = h; for (const fn of observers) fn(); },
    windowListening() { return [...winListeners.keys()]; },
    __observers: observers,
  };
  return el;
}

function withObserver(el, run) {
  const was = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(fn) { this.fn = fn; }
    observe() { el.__observers.add(this.fn); }
    disconnect() { el.__observers.delete(this.fn); }
  };
  try { return run(); } finally { globalThis.ResizeObserver = was; }
}

describe('dragging the bar while the agent writes', () => {
  it('keeps her where she dragged to, however long she held the bar first', () => {
    let t = 0;
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t });
      el.press();
      t += HER_HAND_MS * 3;
      el.dragsTo(2000);
      el.growsTo(10747);
      expect(el.scrollTop).toBe(2000);
    });
  });

  it('still lets go inside the window, as before', () => {
    let t = 0;
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t });
      el.press();
      t += HER_HAND_MS - 1;
      el.dragsTo(2000);
      el.growsTo(10747);
      expect(el.scrollTop).toBe(2000);
    });
  });

  it('sticks again when she drags back to the end and lets go', () => {
    let t = 0;
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t });
      el.press();
      t += 2000;
      el.dragsTo(2000);
      t += 2000;
      el.dragsTo(10747 - 793 - 793);
      el.growsTo(10747);
      el.dragsTo(10747 - 793);
      el.letGo();
      el.growsTo(12000);
      expect(el.scrollTop).toBe(12000 - 793);
    });
  });

  it('after she lets go, a scroll nobody made does not unstick it', () => {
    let t = 0;
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t });
      el.press();
      el.letGo();
      t += HER_HAND_MS * 3;
      el.dragsTo(2000);
      el.growsTo(10747);
      expect(el.scrollTop).toBe(10747 - 793);
    });
  });

  it('a press that the window lost (focus moved away) does not hold for ever', () => {
    let t = 0;
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t });
      el.press();
      el.leaveWindow();
      t += HER_HAND_MS * 3;
      el.dragsTo(2000);
      el.growsTo(10747);
      expect(el.scrollTop).toBe(10747 - 793);
    });
  });

  it('stops listening on the window when released', () => {
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      const release = holdAtBottom(el);
      expect(el.windowListening().sort()).toEqual(['blur', 'mouseup']);
      release();
      expect(el.windowListening()).toEqual([]);
    });
  });
});
