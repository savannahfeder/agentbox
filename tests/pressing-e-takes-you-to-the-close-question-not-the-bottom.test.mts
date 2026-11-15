// PRESSING E TAKES YOU TO THE CLOSE QUESTION, NOT TO THE BOTTOM (w-9d6f733f55).
//
// "whenever i hit e this does a weird animation and scrolls right down ... it
// is unable to scroll up to it". E on a thread whose filed task still waits
// raises "Before this thread closes" on the turn that filed it, unfolds the
// thread above it and smooth-scrolled there. The thread was still stuck to its
// bottom (thread-bottom.ts), so each time the unfolded part grew the stick
// pinned the page back to the end and cancelled the scroll.
//
// Measured in Chromium with the real holdAtBottom (scripts/scratch, a 800px
// pane, the question 1,500px down, the page growing 2,000px and 1,500px above
// it as the earlier turns and every run load): before, the page came to rest
// at the very bottom with the question 860px above the screen. After, it rests
// with the question centred, 340px from the top, and stays there.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { RESUME_WINDOW_MS, bottomOf, bringIntoView, holdAtBottom } from '../renderer/src/thread-bottom.ts';

const PANE = 800;
const ASK = 120;

// A scrolling box with one thing on its page, at `at` px down the content.
function page({ scrollHeight, at }) {
  const listeners = new Map();
  const observers = new Set();
  const ask = {
    isConnected: true,
    at,
    getBoundingClientRect: () => ({ top: ask.at - el.scrollTop, bottom: ask.at - el.scrollTop + ASK, height: ASK }),
  };
  const el = {
    scrollTop: 0, scrollHeight, clientHeight: PANE, firstElementChild: null,
    getBoundingClientRect: () => ({ top: 0, bottom: PANE, height: PANE }),
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)); },
    hers(type) { for (const fn of listeners.get(type) ?? []) fn(); },
    // Something above the question grows by `by`, so the question moves down with it.
    growsAbove(by) { el.scrollHeight += by; ask.at += by; for (const fn of observers) fn(); },
    growsBelow(by) { el.scrollHeight += by; for (const fn of observers) fn(); },
    __observers: observers,
  };
  return { el, ask };
}

let was;
beforeEach(() => {
  vi.useFakeTimers();
  was = globalThis.ResizeObserver;
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.ResizeObserver = was;
});
function observe(el) {
  globalThis.ResizeObserver = class {
    constructor(fn) { this.fn = fn; }
    observe() { el.__observers.add(this.fn); }
    disconnect() { el.__observers.delete(this.fn); }
  };
}
const centred = (el, ask) => Math.round(ask.at - (PANE - ASK) / 2);

describe('a close question up the thread', () => {
  it('is brought to the middle of the screen, out of a thread stuck to its bottom', () => {
    const { el, ask } = page({ scrollHeight: 3120, at: 1500 });
    observe(el);
    holdAtBottom(el);
    expect(el.scrollTop).toBe(bottomOf(el));
    bringIntoView(el, () => ask);
    expect(el.scrollTop).toBe(centred(el, ask));
  });

  it('stays with the question while the earlier turns load above it', () => {
    const { el, ask } = page({ scrollHeight: 3120, at: 1500 });
    observe(el);
    holdAtBottom(el);
    bringIntoView(el, () => ask);
    el.growsAbove(2000);
    expect(el.scrollTop).toBe(centred(el, ask));
    el.growsAbove(1500);
    expect(el.scrollTop).toBe(centred(el, ask));
    expect(el.scrollTop).toBeLessThan(bottomOf(el));
  });

  it('is not pinned back to the bottom once it has let go', () => {
    const { el, ask } = page({ scrollHeight: 3120, at: 1500 });
    observe(el);
    holdAtBottom(el);
    bringIntoView(el, () => ask);
    el.growsAbove(2000);
    vi.advanceTimersByTime(RESUME_WINDOW_MS + 200);
    const left = el.scrollTop;
    el.growsBelow(40);
    expect(el.scrollTop).toBe(left);
  });

  it('gives way to her own scrolling', () => {
    const { el, ask } = page({ scrollHeight: 3120, at: 1500 });
    observe(el);
    holdAtBottom(el);
    bringIntoView(el, () => ask);
    el.hers('wheel');
    el.scrollTop = 200;
    el.growsAbove(500);
    expect(el.scrollTop).toBe(200);
  });

  it('waits for the question to be drawn', () => {
    const { el, ask } = page({ scrollHeight: 3120, at: 1500 });
    observe(el);
    holdAtBottom(el);
    let drawn = false;
    bringIntoView(el, () => (drawn ? ask : null));
    expect(el.scrollTop).toBe(bottomOf(el));
    drawn = true;
    el.growsAbove(1000);
    expect(el.scrollTop).toBe(centred(el, ask));
  });
});

describe('a close question at the foot', () => {
  it('leaves a thread at its bottom stuck there', () => {
    const { el, ask } = page({ scrollHeight: 3120, at: 3120 - ASK });
    observe(el);
    holdAtBottom(el);
    bringIntoView(el, () => ask, { block: 'nearest' });
    expect(el.scrollTop).toBe(bottomOf(el));
    vi.advanceTimersByTime(RESUME_WINDOW_MS + 200);
    el.growsBelow(300);
    expect(el.scrollTop).toBe(bottomOf(el));
  });

  it('does not move a page where it is already on screen', () => {
    const { el, ask } = page({ scrollHeight: 3120, at: 1000 });
    el.scrollTop = 700;
    bringIntoView(el, () => ask, { block: 'nearest' });
    expect(el.scrollTop).toBe(700);
  });
});

describe('where it is wired', () => {
  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  it('neither the conversation nor the pane smooth-scrolls to it any more', () => {
    for (const f of ['renderer/src/components/ItemThread.tsx', 'renderer/src/components/Focus.tsx']) {
      expect(read(f)).toContain('bringIntoView(');
      expect(read(f)).not.toMatch(/ask\w*Ref\.current\?\.scrollIntoView/i);
    }
  });
});
