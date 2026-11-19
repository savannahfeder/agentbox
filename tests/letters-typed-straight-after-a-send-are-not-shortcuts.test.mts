// w-f41301d507: a tester typed "2 — ignore punctuation-only tokens like --."
// into a reply on a slow box, and a ⌘↵ landed between "ig" and "nore". The
// reply went out as "2 — ig", the send moved the app to another thread, and
// because ⌘↵ handed the keyboard back to shortcuts at once, the N opened a New
// thread and the rest of the sentence was typed into it. Reproduced in the
// built window headless by pressing ⌘↵ inside the typing; measured here on a
// fake window: what the letters right after a send reach.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { strayLetters, installStrayLetters, BURST_MS } from '../renderer/src/stray-letters.ts';

function fakePage() {
  const listeners: Record<string, ((e: unknown) => void)[]> = { keydown: [], pointerdown: [] };
  type El = { tagName: string; isContentEditable: boolean; isConnected: boolean; cls: string; value: string; getClientRects: () => number[]; matches: (s: string) => boolean; focus: () => void; setSelectionRange: () => void };
  const page = {
    active: null as El | null,
    boxes: [] as El[],
    document: { querySelector: (sel: string) => page.boxes.find((b) => sel === `.${b.cls}` && b.isConnected) ?? null, body: { dispatchEvent() {} } },
    addEventListener: (t: string, fn: (e: unknown) => void) => listeners[t].push(fn),
    removeEventListener: (t: string, fn: (e: unknown) => void) => { listeners[t] = listeners[t].filter((f) => f !== fn); },
    el(cls: string): El {
      return { tagName: 'TEXTAREA', isContentEditable: false, isConnected: true, cls, value: '', getClientRects: () => [1], matches: (s) => s === `.${cls}`, focus() { page.active = this; }, setSelectionRange() {} };
    },
    /** True when the key got past the guard to the app's own shortcuts. */
    press(key: string, { ctrl = false } = {}) {
      let stopped = false;
      const e = { key, target: page.active ?? { tagName: 'BODY' }, metaKey: false, ctrlKey: ctrl, altKey: false, preventDefault() {}, stopImmediatePropagation() { stopped = true; } };
      for (const fn of listeners.keydown) fn(e);
      return !stopped;
    },
    click() { page.active = null; for (const fn of listeners.pointerdown) fn({}); },
  };
  return page;
}

describe('letters typed straight after a send', () => {
  let page: ReturnType<typeof fakePage>; let off: (() => void) | undefined; let now: number;
  beforeEach(() => {
    off?.();
    strayLetters.reset();
    now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    page = fakePage();
    off = installStrayLetters(page as unknown as Window);
  });
  const typeAndSend = (box: ReturnType<ReturnType<typeof fakePage>['el']>) => {
    page.active = box;
    for (const k of '2 — ig') { page.press(k); now += 40; }
    page.press('Enter', { ctrl: true });
  };

  it('the rest of the sentence opens nothing when the send took the box away', () => {
    const reply = page.el('dock-input');
    page.boxes.push(reply);
    typeAndSend(reply);
    // The send moved the app on: this box went, another thread's took its place.
    reply.isConnected = false;
    page.boxes.push(page.el('dock-input'));
    page.active = null;
    for (const k of 'nore punctuation') { now += 40; expect(page.press(k)).toBe(false); }
    expect(page.active).toBe(null);
  });

  it('goes back into the box it was typed in when that box is still there', () => {
    const reply = page.el('dock-input');
    page.boxes.push(reply);
    typeAndSend(reply);
    page.active = null;
    now += 30;
    expect(page.press('n')).toBe(false);
    expect(page.active).toBe(reply);
  });

  it('a shortcut pressed a beat after the send still works', () => {
    const reply = page.el('dock-input');
    page.boxes.push(reply);
    typeAndSend(reply);
    reply.isConnected = false;
    page.active = null;
    now += BURST_MS + 50;
    expect(page.press('e')).toBe(true);
  });

  it('a click after the send hands the keys back at once', () => {
    const reply = page.el('dock-input');
    page.boxes.push(reply);
    typeAndSend(reply);
    reply.isConnected = false;
    page.click();
    now += 20;
    expect(page.press('j')).toBe(true);
  });
});
