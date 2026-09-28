// HER REPORT, w-3795af61f5, 2026-09-23: "If I open something in the sidebar,
// the chat moves, whereas I would expect it to still show the same position.
// It jumps really far up."
//
// Her two screenshots are the same task a moment apart. In the first she is at
// the foot of the thread, looking at the files the last message named. She
// presses one file's open button, the document opens on the right, the thread
// column goes from about 1,375px to under 600px, and she is left in the middle
// of a long script several messages up.
//
// Two holes let that happen, and each test below is one of them.
//
//   1. The open button is INSIDE the scrolling box, so pressing it is a
//      mousedown there, and the stick read the re-wrap that followed as her own
//      scrolling and let go of the end.
//   2. Away from the end nothing kept her place at all. The browser's own
//      scroll anchoring stands down when an ancestor's width changes, so the
//      box kept its NUMBER while every paragraph above it doubled in height.

import { describe, expect, it } from 'vitest';
import { gapToBottom, holdAtBottom } from '../renderer/src/thread-bottom.ts';

const LINE = 24;
const CHAR = 8;

// A thread laid out for real, in miniature: paragraphs of known length that
// wrap to the width of the box, so narrowing it makes the page taller exactly
// the way her column does.
function thread({ paragraphs, width, clientHeight = 900 }) {
  const listeners = new Map();
  const observers = new Set();
  const heights = () => paragraphs.map((chars) => Math.ceil((chars * CHAR) / el.clientWidth) * LINE);
  const topOf = (i) => heights().slice(0, i).reduce((a, b) => a + b, 0);
  const nodes = paragraphs.map((_, i) => ({
    isConnected: true,
    getBoundingClientRect() {
      const top = topOf(i) - el.scrollTop;
      return { top, bottom: top + heights()[i] };
    },
  }));
  const el = {
    clientWidth: width,
    clientHeight,
    scrollTop: 0,
    get scrollHeight() { return heights().reduce((a, b) => a + b, 0); },
    firstElementChild: null,
    getBoundingClientRect() { return { top: 0, bottom: clientHeight }; },
    querySelectorAll() { return nodes; },
    contains() { return true; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    press() { listeners.get('mousedown')?.(); },
    sheScrollsTo(top) {
      listeners.get('wheel')?.();
      el.scrollTop = top;
      listeners.get('scroll')?.();
    },
    // The document opens beside the thread. The browser keeps the number, or
    // moves it somewhere of its own choosing when `browserPut` is given, then
    // tells the observer, then fires the scroll event.
    narrowsTo(w, browserPut) {
      el.clientWidth = w;
      if (browserPut !== undefined) el.scrollTop = browserPut;
      el.scrollTop = Math.min(el.scrollTop, el.scrollHeight - clientHeight);
      for (const fn of observers) fn();
      listeners.get('scroll')?.();
    },
    topOf,
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

// Forty paragraphs of a long script, then the last message.
const SCRIPT = [...Array(40).fill(400), 180, 180];

describe('opening a file beside the chat', () => {
  it('stays at the end when she pressed the open button while at the end', () => {
    const el = thread({ paragraphs: SCRIPT, width: 1375 });
    withObserver(el, () => {
      holdAtBottom(el, { now: () => 1000 });
      expect(gapToBottom(el)).toBe(0);
      el.press();
      // The browser nudges the number during the re-wrap, as measured on
      // 2026-08-25 (11,230 of a possible 11,522), and her press is 0ms behind it.
      el.narrowsTo(589, el.scrollTop + 2000);
      expect(gapToBottom(el)).toBe(0);
    });
  });

  it('keeps the paragraph she was reading at the same height when she had scrolled up', () => {
    const el = thread({ paragraphs: SCRIPT, width: 1375 });
    let t = 0;
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t });
      // She scrolls up to read paragraph 20, a little way into it.
      el.sheScrollsTo(el.topOf(20) + 10);
      t = 5000;
      el.press();
      el.narrowsTo(589);
      // Paragraph 20 still starts ten pixels above the top edge, where it was.
      expect(el.topOf(20) - el.scrollTop).toBe(-10);
    });
  });

  it('still lets her scroll away afterwards', () => {
    const el = thread({ paragraphs: SCRIPT, width: 1375 });
    let t = 0;
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t });
      el.press();
      el.narrowsTo(589);
      t = 5000;
      el.sheScrollsTo(1200);
      expect(el.scrollTop).toBe(1200);
    });
  });
});
