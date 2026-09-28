// EVERY NUMBER BELOW WAS READ OFF THE RUNNING APP, not chosen to make a test
// pass: `node scripts/measure-thread-open.mjs`, over her seven live sessions in
// the built renderer at 1440x980. The pane is 793px tall. The old landing came
// to rest 120px short on every session, because it aligned the thread's own
// foot with the bottom edge while the row's files and buttons sat below it in
// the same scrolling box. On session-44, which carries two embedded document
// previews under its thread, the page grew 1,593px AFTER the landing and it
// came to rest 1,713px short.
//
// The second round's numbers are off her own window, 2026-08-23 01:37: a
// recorder installed in the app she was working in caught her clicking into a
// task and coming to rest at scrollTop 1901 against a scrollHeight of 3099 in a
// 897px viewport — 301px under the fold, unmoved from 53ms to 7850ms. 2798-897
// is 1901, so the pin ran against a page 301px shorter than the one she was
// left reading. The measurement found the
// edge: growth at 2600ms after the click was followed, growth at 3500ms was
// not. The hold expired on a timer and the conversation did not.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AT_BOTTOM_SLACK, LEAVE_SLACK, RESUME_WINDOW_MS,
  bottomOf, gapToBottom, holdAtBottom, isAtBottom, resumeTo,
} from '../renderer/src/thread-bottom.ts';

const PANE = 793;

// A scrolling box with no DOM under it: the stick only ever reads three numbers
// and writes one, so this is the whole of what it touches. The ResizeObserver is
// real machinery here rather than a stub of convenience — it is how a page that
// grows is noticed at all, now that nothing polls.
function box({ scrollHeight, clientHeight = PANE, scrollTop = 0 }) {
  const listeners = new Map();
  const observers = new Set();
  const el = {
    scrollTop, scrollHeight, clientHeight,
    firstElementChild: null,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    /** Her hand: the events the restore gives way to. */
    hers(type) { listeners.get(type)?.(); },
    /**
     * Her scrolling, which is the only thing that unsticks the stick. A real
     * browser never delivers a scroll SHE caused without one of her gestures
     * in front of it, and telling the two apart is the whole of, so the fake
     * does not deliver one either. */
    sheScrollsTo(top) {
      listeners.get('wheel')?.();
      el.scrollTop = top;
      listeners.get('scroll')?.();
    },
    /** The page changing height under it, which is what an observer is for. */
    growsTo(h) { el.scrollHeight = h; for (const fn of observers) fn(); },
    /** The box itself losing room, which is the composer taking another line. */
    shrinksTo(h) { el.clientHeight = h; for (const fn of observers) fn(); },
    /**
     * THE COLUMN GETTING NARROWER —. The document pane opens itself beside the
     * thread, the words re-wrap into half the width, and the page gets taller.
     * The browser moves scrollTop ITSELF while it does that, and then delivers
     * a scroll event for the move, with nothing of hers in front of it. Both
     * halves are here because it is the pair that fools a stick reading
     * position alone. */
    reflowsTo(h, top) {
      el.scrollHeight = h;
      el.scrollTop = top;
      for (const fn of observers) fn();
      listeners.get('scroll')?.();
    },
    listening() { return [...listeners.keys()].sort(); },
    watchers() { return observers.size; },
    __observers: observers,
  };
  return el;
}

// One ResizeObserver for the box under test. Every observe of the same box
// registers the same callback, which is what the real one does to the extent
// this cares: something changed, look again.
function withObserver(el, run) {
  const was = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(fn) { this.fn = fn; }
    observe() { el.__observers.add(this.fn); }
    disconnect() { el.__observers.delete(this.fn); }
  };
  try { return run(); } finally { globalThis.ResizeObserver = was; }
}

describe('the bottom is the box\'s bottom, not the thread\'s foot', () => {
  it('counts the content that sits under the thread', () => {
    // session-6f as measured: 10,264px of page in a 793px pane.
    const el = box({ scrollHeight: 10264 });
    expect(bottomOf(el)).toBe(9471);
  });

  it('names the 120px her footer was hiding in', () => {
    // Where the old landing left session-6f: 9,351 of a possible 9,471.
    const asItWas = box({ scrollHeight: 10264, scrollTop: 9351 });
    expect(gapToBottom(asItWas)).toBe(120);
    expect(isAtBottom(asItWas)).toBe(false);
  });

  it('is at the bottom when a fraction of a pixel is left', () => {
    const el = box({ scrollHeight: 10264, scrollTop: 9471 - AT_BOTTOM_SLACK });
    expect(isAtBottom(el)).toBe(true);
  });

  it('never asks for a negative scroll on a page shorter than the pane', () => {
    expect(bottomOf(box({ scrollHeight: 400 }))).toBe(0);
  });

  it('names the 301px she was left short of on her own window', () => {
    // 2026-08-23 01:37, her window: 3099px of page in an 897px pane, resting at
    // 1901 because the pin had run when the page was 2798.
    const hers = box({ scrollHeight: 3099, clientHeight: 897, scrollTop: 1901 });
    expect(bottomOf(hers)).toBe(2202);
    expect(gapToBottom(hers)).toBe(301);
    expect(bottomOf(box({ scrollHeight: 2798, clientHeight: 897 }))).toBe(1901);
  });
});

describe('the stick', () => {
  it('lands on the last pixel the moment it is asked', () => {
    const el = box({ scrollHeight: 10264 });
    withObserver(el, () => holdAtBottom(el));
    expect(el.scrollTop).toBe(9471);
    expect(gapToBottom(el)).toBe(0);
  });

  it('follows a preview that arrives late', () => {
    // session-44, measured: the page was 9,154px when the thread landed and
    // 10,747px once the two previews under it had loaded. The old landing
    // stayed where it first stopped, 1,713px short of the end.
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el);
      const landed = el.scrollTop;
      el.growsTo(10747);
      expect(el.scrollTop).toBe(9954);
      expect(el.scrollTop - landed).toBe(1593);
      expect(gapToBottom(el)).toBe(0);
    });
  });

  // THE REGRESSION SHE REPORTED, PINNED. The hold used to run on a 2.5s timer
  // and a task with a worker on it grows for as long as the worker works.
  // Measured on her real row: growth at 2600ms was followed, growth at 3500ms
  // left 323px under the fold. There is no timer any more, so the number here
  // is deliberately absurd.
  it('follows growth minutes later, because a worker is still writing', () => {
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el);
      vi.useFakeTimers();
      vi.advanceTimersByTime(10 * 60_000);
      vi.useRealTimers();
      el.growsTo(20000);
      expect(gapToBottom(el)).toBe(0);
      expect(el.scrollTop).toBe(19207);
    });
  });

  // The other way to fall short of the end, and the one nothing inside the
  // thread can see: the box loses room because the options strip or the reply
  // composer under it took another line.
  it('follows the pane itself losing room to the composer', () => {
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el);
      expect(el.scrollTop).toBe(8361);
      el.shrinksTo(793 - 145);
      expect(gapToBottom(el)).toBe(0);
      expect(el.scrollTop).toBe(8506);
    });
  });

  it('lets go the moment she scrolls up, and does not yank her back', () => {
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el);
      el.sheScrollsTo(200);
      el.growsTo(10747);
      expect(el.scrollTop).toBe(200);
    });
  });

  it('sticks again when she scrolls back down to the end', () => {
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el);
      el.sheScrollsTo(200);
      el.growsTo(10747);
      expect(el.scrollTop).toBe(200);
      el.sheScrollsTo(bottomOf(el));
      el.growsTo(12000);
      expect(gapToBottom(el)).toBe(0);
    });
  });

  // A page settling can leave the box a few pixels off the end for a frame, and
  // treating that as her hand would unstick a conversation nobody touched.
  it('is not unstuck by a few pixels of the page settling', () => {
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      holdAtBottom(el);
      el.sheScrollsTo(bottomOf(el) - (LEAVE_SLACK - 1));
      el.growsTo(10747);
      expect(gapToBottom(el)).toBe(0);
    });
  });

  it('can be let go by the caller, which is how leaving the row ends it', () => {
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      const release = holdAtBottom(el);
      release();
      expect(el.listening()).toEqual([]);
      expect(el.watchers()).toBe(0);
      el.growsTo(20000);
      expect(el.scrollTop).toBe(8361);
    });
  });

  it('does nothing at all without a box', () => {
    expect(() => holdAtBottom(null)()).not.toThrow();
  });

  // Her third report of this, and the first two fixes were both measured on a
  // CLICK into a task with nothing open beside it. What her screenshot has that
  // those runs did not is a DOCUMENT open on the right. A card that names a page
  // opens it on its own (App.tsx), and that arrives a few IPC round trips after
  // the pane, which is long after the thread has already landed.
  //
  // MEASURED on the built renderer over her real store, walking her inbox with E
  // and letting the auto-open happen (the harness,
  // 2026-08-25): with the document pane stubbed out, 0 of 12 landings came to
  // rest short. With it doing what it really does, 6 of 8 did — median 422px,
  // worst 476px — and not one of them recovered inside 2.5 seconds.
  //
  // The numbers below are one of those landings, frame by frame. The thread
  // lands at the bottom of a 10,115px page in a 915px pane, at 9,200. Twelve
  // milliseconds later the document opens, the column goes from 1,375px wide to
  // 589px, the words re-wrap to 12,437px of page — and the browser leaves
  // scrollTop at 11,230 of a possible 11,522.
  it('follows the page re-wrapping when the document pane opens beside it', () => {
    const el = box({ scrollHeight: 10115, clientHeight: 915 });
    withObserver(el, () => {
      holdAtBottom(el);
      expect(el.scrollTop).toBe(9200);
      el.reflowsTo(12437, 11230);
      expect(gapToBottom(el)).toBe(0);
      expect(el.scrollTop).toBe(11522);
    });
  });

  // WHY IT GAVE UP, NAMED. The stick's only test for "she has taken over" was a
  // scrollTop it had not written itself, on the reasoning that a page growing
  // does not move scrollTop. That is true of a page growing and false of a page
  // RE-WRAPPING: the browser keeps the reading position steady across a reflow
  // by moving scrollTop, so every one of those looked like her hand. One of them
  // is enough, because it turns the stick off for good.
  it('is not fooled into letting go by the browser moving it during a reflow', () => {
    const el = box({ scrollHeight: 10115, clientHeight: 915 });
    withObserver(el, () => {
      holdAtBottom(el);
      el.reflowsTo(12437, 11230);
      // Still holding: a line arriving after the re-wrap is followed too.
      el.growsTo(13000);
      expect(gapToBottom(el)).toBe(0);
    });
  });

  // AND THE OPPOSITE BUG STAYS FIXED. She scrolled up to read something, and
  // THEN the document pane opened. Her place is hers; nothing may take her back
  // to the end.
  it('leaves her where she is when the pane opens after she has scrolled up', () => {
    const el = box({ scrollHeight: 10115, clientHeight: 915 });
    withObserver(el, () => {
      holdAtBottom(el);
      el.sheScrollsTo(2000);
      el.reflowsTo(12437, 2460);
      expect(el.scrollTop).toBe(2460);
    });
  });
});

/* ---------------- where she was, and only across a reload ---------------- */

describe('the restore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // The conversation is read off her disk AFTER the pane is drawn, so at the
  // moment a reload finishes the box is a few hundred pixels tall and the place
  // she was in clamps to whatever fits.
  it('keeps reaching for her place while the page grows into it', () => {
    const el = box({ scrollHeight: 900 });
    withObserver(el, () => {
      resumeTo(el, 4000);
      expect(el.scrollTop).toBe(107);
      el.growsTo(3000);
      expect(el.scrollTop).toBe(2207);
      el.growsTo(9154);
      expect(el.scrollTop).toBe(4000);
    });
  });

  it('stops the moment it gets there, and lets the page grow past her', () => {
    const el = box({ scrollHeight: 9154 });
    withObserver(el, () => {
      resumeTo(el, 4000);
      expect(el.scrollTop).toBe(4000);
      expect(el.watchers()).toBe(0);
      el.growsTo(20000);
      expect(el.scrollTop).toBe(4000);
    });
  });

  // Every scroll event in this window is one the restore itself caused, so the
  // position cannot tell her apart from us: here it really does have to be her
  // gestures.
  it('lets go for her hand and never reaches again', () => {
    for (const hers of ['wheel', 'keydown', 'mousedown', 'touchstart']) {
      const el = box({ scrollHeight: 900 });
      withObserver(el, () => {
        resumeTo(el, 4000);
        el.hers(hers);
        el.growsTo(9154);
        expect(el.scrollTop, hers).toBe(107);
        expect(el.listening(), hers).toEqual([]);
      });
    }
  });

  // A place the page can never be tall enough to reach — a run trimmed out of
  // the middle, a preview that no longer loads — must not hold her there for
  // ever. This is the one window in the file, and it is why it exists.
  it('gives up on a place the page never grows into', () => {
    const el = box({ scrollHeight: 900 });
    withObserver(el, () => {
      resumeTo(el, 4000);
      vi.advanceTimersByTime(RESUME_WINDOW_MS + 200);
      expect(el.listening()).toEqual([]);
      el.growsTo(9154);
      expect(el.scrollTop).toBe(107);
    });
  });

  // THE ONE THAT COST THE MOST TO FIND, timed in the real app on a reload:
  //
  //     79ms   the restore arms for 2998, the page is 1072 tall, reaches 11
  //    113ms   the page reaches 5459, the restore reaches 2998 and lets go
  //    115ms   the thread mounts and the stick arms — and pinned her to 4398
  //
  // The stick cannot stand down for a restore that has already finished, so a
  // finished restore leaves the position it put her in and the stick reads it.
  it('does not take her to the end when a restore has just put her elsewhere', () => {
    const el = box({ scrollHeight: 1072, clientHeight: 1061 });
    withObserver(el, () => {
      resumeTo(el, 2998);
      expect(el.scrollTop).toBe(11);
      el.growsTo(5459);
      expect(el.scrollTop).toBe(2998);
      // Two milliseconds later, and the restore is already over.
      holdAtBottom(el);
      expect(el.scrollTop).toBe(2998);
      // And it stays hers while the worker keeps writing.
      el.growsTo(7000);
      expect(el.scrollTop).toBe(2998);
    });
  });

  // The other side of the same mark: a restore that put her AT the end leaves a
  // thread that sticks, because that is where she was.
  it('keeps sticking when the place she was is the end', () => {
    const el = box({ scrollHeight: 1072, clientHeight: 1061 });
    withObserver(el, () => {
      resumeTo(el, 4398);
      el.growsTo(5459);
      expect(el.scrollTop).toBe(4398);
      holdAtBottom(el);
      el.growsTo(7000);
      expect(gapToBottom(el)).toBe(0);
    });
  });

  it('does nothing for a box that is not there, or a place at the top', () => {
    expect(() => resumeTo(null, 400)()).not.toThrow();
    const el = box({ scrollHeight: 9154 });
    resumeTo(el, 0);
    expect(el.scrollTop).toBe(0);
    expect(el.listening()).toEqual([]);
  });
});
