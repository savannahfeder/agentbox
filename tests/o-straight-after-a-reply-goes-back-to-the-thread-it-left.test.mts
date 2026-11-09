// O pressed straight after a reply did nothing. Three keyboard testers opened
// thread A, pressed R, typed, pressed Ctrl+Enter and were moved on to B under
// "Sent to A… O Back Z Undo"; O left them on B, and an R after it wrote the
// next reply to B. Measured in the built renderer driven by real key events:
// O 400 ms after the send stayed on B, O 1.7 s after it opened A. The guard
// against letters typed with no box under them (stray-letters.ts) still
// counted the reply's last letters as typing, the box had closed with the
// send, so the O was dropped. Pressed here through the same capture listener
// on a fake window.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { strayLetters, installStrayLetters, STILL_TYPING_MS } from '../renderer/src/stray-letters.ts';
import { opensTheToast } from '../renderer/src/toast-parts.ts';

function fakePage() {
  const listeners = { keydown: [], pointerdown: [] };
  const page = {
    active: null, boxes: [],
    document: { querySelector: (sel) => page.boxes.find((b) => sel === `.${b.cls}` && b.isConnected) ?? null },
    addEventListener: (t, fn) => listeners[t].push(fn),
    removeEventListener: (t, fn) => { listeners[t] = listeners[t].filter((f) => f !== fn); },
    box(cls) {
      const el = { tagName: 'TEXTAREA', isContentEditable: false, isConnected: true, cls, getClientRects: () => [1], matches: (s) => s === `.${cls}`, focus() { page.active = el; } };
      page.boxes.push(el);
      return el;
    },
    /** True when the key got past the guard to the app's own shortcuts. */
    press(key, mods = {}) {
      let stopped = false;
      const e = { key, target: page.active ?? { tagName: 'BODY' }, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods, preventDefault() {}, stopImmediatePropagation() { stopped = true; } };
      for (const fn of listeners.keydown) fn(e);
      return !stopped;
    },
  };
  return page;
}

describe('a key straight after a reply is sent', () => {
  let page; let off; let now;
  beforeEach(() => {
    off?.();
    strayLetters.reset();
    now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    page = fakePage();
    off = installStrayLetters(page);
  });
  const writeAndSend = (mods) => {
    const box = page.box('dock-input');
    page.active = box;
    for (const k of 'next part') { page.press(k); now += 40; }
    page.press('Enter', mods);
    box.isConnected = false; // the send folds the box and moves on to B
    page.active = null;
    now += 50;
  };

  it('O after Ctrl+Enter reaches the app, and the app opens the thread the reply went to', () => {
    writeAndSend({ ctrlKey: true });
    expect(page.press('o')).toBe(true);
    const toast = { text: 'Sent to A · press Z to undo', goes: { product: 'p', id: 'w-a', sent: true } };
    expect(opensTheToast('o', toast, { product: 'p', id: 'w-b' })).toEqual(toast.goes);
  });

  it('and after ⌘+Enter', () => {
    writeAndSend({ metaKey: true });
    expect(page.press('O')).toBe(true);
  });

  it('and still once the typing window is long past', () => {
    writeAndSend({ ctrlKey: true });
    now += STILL_TYPING_MS;
    expect(page.press('o')).toBe(true);
  });

  it('a box that closed without a send still drops the letter typed straight after', () => {
    const box = page.box('dock-input');
    page.active = box;
    page.press('x');
    box.isConnected = false;
    page.active = null;
    now += 50;
    expect(page.press('o')).toBe(false);
  });

  it('a plain Enter is a new line in a brief, so a letter after it that lost the caret goes back into the box', () => {
    const box = page.box('dock-input');
    page.active = box;
    page.press('x');
    page.press('Enter');
    page.press('Enter', { shiftKey: true });
    page.active = null;
    now += 50;
    expect(page.press('e')).toBe(false);
    expect(page.active).toBe(box);
  });
});
