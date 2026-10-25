// A THREAD ON A PHONE HOLDS STILL WHILE SOMETHING ABOVE IT CHANGES (2026-10-13).
//
// "The screen keeps jumping around even when the agents weren't processing ...
// the text would jump up and down and up and down like my focal point kept
// changing ... kind of unusable so that's an urgent fix."
//
// Read in the code, two halves of one fault:
// - Away from the end of a thread, the stick (renderer/src/thread-bottom.ts)
//   noted the paragraph she was reading on every resize and put it back only
//   when the column changed width. It left the rest to the browser's own
//   scroll anchoring, which the desktop's Chromium has and Safari on an iPhone
//   does not. So on a phone every change in height above her moved the words
//   she was reading.
// - A picture loading on a phone is drawn as a 4:3 box (phone.css) until it
//   arrives, then at its own shape. A phone screenshot is about 9:19.5, so the
//   box is a third of its height. Pictures are never served from memory
//   (main/serve.mjs, no-store), so each time one is drawn again the box comes
//   back, and everything under it jumps by the difference, then back.
//
// Now on a phone the stick puts her paragraph back after every change in
// height, and a picture drawn again holds the shape it had the last time.
import { describe, expect, it } from 'vitest';
import { gapToBottom, holdAtBottom } from '../renderer/src/thread-bottom.ts';
import { watchPicture, shapeOf } from '../renderer/src/phone-files.ts';

/** A thread whose first block is a picture that can change height. */
function thread({ blocks, clientHeight = 800 }) {
  const listeners = new Map();
  const observers = new Set();
  const topOf = (i) => blocks.slice(0, i).reduce((a, b) => a + b, 0);
  const nodes = blocks.map((_, i) => ({
    isConnected: true,
    getBoundingClientRect() { const top = topOf(i) - el.scrollTop; return { top, bottom: top + blocks[i] }; },
  }));
  const el = {
    clientWidth: 390,
    clientHeight,
    scrollTop: 0,
    get scrollHeight() { return blocks.reduce((a, b) => a + b, 0); },
    firstElementChild: null,
    getBoundingClientRect() { return { top: 0, bottom: clientHeight }; },
    querySelectorAll() { return nodes; },
    contains() { return true; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    sheScrollsTo(top) { listeners.get('touchstart')?.(); el.scrollTop = top; listeners.get('scroll')?.(); },
    // Something above changes height. Safari keeps the number; then the
    // observer hears of it.
    resize(i, h) { blocks[i] = h; for (const fn of observers) fn(); },
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

// A picture, then thirty paragraphs.
const PAGE = () => [800, ...Array(30).fill(120)];

describe('reading in the middle of a thread on a phone', () => {
  it('a picture above growing leaves the paragraph she reads where it was', () => {
    const el = thread({ blocks: PAGE() });
    let t = 0;
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t, keepPlace: true });
      el.sheScrollsTo(el.topOf(10) + 30);
      t = 5000;
      const before = el.topOf(10) - el.scrollTop;
      el.resize(0, 280);
      expect(el.topOf(10) - el.scrollTop).toBe(before);
      el.resize(0, 800);
      expect(el.topOf(10) - el.scrollTop).toBe(before);
    });
  });

  it('without it (the desktop, whose browser keeps the place itself) the number is left alone', () => {
    const el = thread({ blocks: PAGE() });
    let t = 0;
    withObserver(el, () => {
      holdAtBottom(el, { now: () => t });
      el.sheScrollsTo(el.topOf(10) + 30);
      t = 5000;
      const at = el.scrollTop;
      el.resize(0, 280);
      expect(el.scrollTop).toBe(at);
    });
  });

  it('at the end of the thread she still stays at the end', () => {
    const el = thread({ blocks: PAGE() });
    withObserver(el, () => {
      holdAtBottom(el, { now: () => 0, keepPlace: true });
      expect(gapToBottom(el)).toBe(0);
      el.resize(0, 280);
      expect(gapToBottom(el)).toBe(0);
      el.resize(0, 1200);
      expect(gapToBottom(el)).toBe(0);
    });
  });
});

/** An <img> as watchPicture sees it. */
function picture(src) {
  const attrs = new Map([['src', src]]);
  const on = new Map();
  return {
    complete: false,
    naturalWidth: 0,
    naturalHeight: 0,
    style: {},
    getAttribute: (k) => attrs.get(k) ?? null,
    setAttribute: (k, v) => attrs.set(k, v),
    addEventListener: (k, fn) => on.set(k, fn),
    loads(w, h) { this.complete = true; this.naturalWidth = w; this.naturalHeight = h; on.get('load')?.(); },
    attrs,
  };
}

describe('a picture drawn again', () => {
  it('holds the shape it had last time while it loads, rather than the 4:3 box', () => {
    const first = picture('/f/k/img/shot.png');
    watchPicture(first);
    first.loads(1206, 2622);
    expect(shapeOf('/f/k/img/shot.png')).toBe('1206 / 2622');
    const again = picture('/f/k/img/shot.png');
    watchPicture(again);
    expect(again.attrs.get('data-phone-img')).toBe('loading');
    expect(again.style.aspectRatio).toBe('1206 / 2622');
  });

  it('a picture never seen keeps the box, and gives it up once it has arrived', () => {
    const img = picture('/f/k/img/new.png');
    watchPicture(img);
    expect(img.style.aspectRatio ?? '').toBe('');
    img.loads(800, 600);
    expect(img.style.aspectRatio).toBe('');
  });

  it('a picture that failed teaches nothing', () => {
    const img = picture('/f/k/img/broken.png');
    watchPicture(img);
    img.loads(0, 0);
    expect(shapeOf('/f/k/img/broken.png')).toBe(null);
  });
});
