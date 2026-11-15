// 2026-10-31: letters typed when no box had the caret fired
// shortcuts. Dev's search for "last seat" closed Maya's task with its E; a
// reply Maya typed landed after J, K and E had moved her between threads and
// closed one; "On it" in a reply box that was still opening lost "On" and the
// N opened a New thread box to Auto; "connected" lost "con" the same way.
// Measured by pressing keys through the window's capture listener on a fake
// window: which keys reach the app's shortcuts, and which box gets the caret.
// The builder checking this typed "Fix double" with no box open, and the L in
// it opened the Later picker: loose typing keeps only its first letter.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { StrayLetters, strayLetters, installStrayLetters, STILL_TYPING_MS, OPENING_MS, BURST_MS } from '../renderer/src/stray-letters.ts';

const read = (f) => fs.readFileSync(path.join(import.meta.dirname, '..', f), 'utf8');

describe('the call on one letter', () => {
  const s = new StrayLetters();
  const call = (o) => s.decide({ key: 'e', inInput: false, chord: false, boxThere: true, openingThere: false, ...o });
  beforeEach(() => s.reset());

  it('a letter straight after typing in a box goes back to the box', () => {
    s.typed(1000);
    expect(call({ now: 1300 })).toBe('back-to-box');
  });
  it('and is dropped, not run, when that box has gone', () => {
    s.typed(1000);
    expect(call({ now: 1300, boxThere: false })).toBe('drop');
  });
  it('a letter long after typing is a shortcut', () => {
    s.typed(1000);
    expect(call({ now: 1000 + STILL_TYPING_MS + 1 })).toBe('shortcut');
  });
  it('a letter while a box is opening goes into it', () => {
    s.opening('reply', 1000);
    expect(call({ now: 1200, openingThere: true })).toBe('into-opening-box');
    expect(call({ now: 1000 + OPENING_MS + 1, openingThere: true })).toBe('shortcut');
  });
  it('loose typing with no box keeps only its first letter as a shortcut', () => {
    expect(call({ now: 5000, key: 'F' })).toBe('shortcut');
    expect(call({ now: 5040, key: 'i' })).toBe('drop');
    expect(call({ now: 5080, key: 'x' })).toBe('drop');
    expect(call({ now: 5120, key: 'l' })).toBe('drop');
    expect(call({ now: 5160, key: 'l' })).toBe('drop');
  });
  it('the same key pressed fast, J J J down a list, is still shortcuts', () => {
    expect(call({ now: 5000, key: 'j' })).toBe('shortcut');
    expect(call({ now: 5100, key: 'j' })).toBe('shortcut');
    expect(call({ now: 5200, key: 'j' })).toBe('shortcut');
  });
  it('two different shortcuts a beat apart both act', () => {
    expect(call({ now: 5000, key: 'j' })).toBe('shortcut');
    expect(call({ now: 5000 + BURST_MS + 50, key: 'e' })).toBe('shortcut');
  });
  it('a chord, a key that is not a letter and typing in a box are left alone', () => {
    s.typed(1000);
    expect(call({ now: 1100, chord: true })).toBe('shortcut');
    expect(call({ now: 1100, key: 'Enter' })).toBe('shortcut');
    expect(call({ now: 1100, inInput: true })).toBe('shortcut');
  });
});

function fakePage() {
  const listeners = { keydown: [], pointerdown: [] };
  const el = (cls, tag = 'TEXTAREA') => ({
    tagName: tag, isContentEditable: false, isConnected: true, cls, focused: 0,
    getClientRects: () => [1], matches: (sel) => sel === `.${cls}`, focus() { this.focused += 1; page.active = this; },
  });
  const page = {
    active: null, boxes: [],
    document: { querySelector: (sel) => page.boxes.find((b) => sel === `.${b.cls}` && b.isConnected) ?? null },
    addEventListener: (t, fn) => listeners[t].push(fn),
    removeEventListener: (t, fn) => { listeners[t] = listeners[t].filter((f) => f !== fn); },
    el,
    /** True when the key got past the guard to the app's own shortcuts. */
    press(key, target = page.active ?? { tagName: 'BODY' }) {
      let stopped = false;
      const e = { key, target, metaKey: false, ctrlKey: false, altKey: false, preventDefault() {}, stopImmediatePropagation() { stopped = true; } };
      for (const fn of listeners.keydown) fn(e);
      return !stopped;
    },
    click() { page.active = null; for (const fn of listeners.pointerdown) fn({}); },
  };
  return page;
}

describe('on the page', () => {
  let page; let off; let now;
  beforeEach(() => {
    off?.();
    strayLetters.reset();
    now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    page = fakePage();
    off = installStrayLetters(page);
  });

  it('typing that loses the caret goes back into the box instead of closing the thread', () => {
    const reply = page.el('dock-input');
    page.boxes.push(reply);
    page.active = reply;
    expect(page.press('a')).toBe(true);
    page.active = null; // a re-render took the caret
    now += 200;
    expect(page.press('e')).toBe(false);
    expect(page.active).toBe(reply);
  });

  it('a box swapped for a new one by a re-render still gets the letter', () => {
    const old = page.el('dock-input');
    page.active = old;
    page.press('a');
    old.isConnected = false;
    const fresh = page.el('dock-input');
    page.boxes.push(fresh);
    page.active = null;
    now += 200;
    expect(page.press('j')).toBe(false);
    expect(page.active).toBe(fresh);
  });

  it('letters typed as the reply box opens land in it', () => {
    strayLetters.opening('reply', now);
    const reply = page.el('dock-input');
    page.boxes.push(reply);
    now += 100;
    expect(page.press('O')).toBe(false);
    expect(page.active).toBe(reply);
  });

  it('a letter after a sent reply whose box closed does nothing', () => {
    const box = page.el('tc-text');
    page.active = box;
    page.press('x');
    box.isConnected = false;
    page.active = null;
    now += 300;
    expect(page.press('n')).toBe(false);
    expect(page.active).toBe(null);
  });

  it('after Escape or a click, letters are shortcuts again', () => {
    const reply = page.el('dock-input');
    page.boxes.push(reply);
    page.active = reply;
    page.press('a');
    page.press('Escape');
    page.active = null;
    now += 100;
    expect(page.press('j')).toBe(true);
    page.active = reply;
    page.press('a');
    page.click();
    now += 100;
    expect(page.press('e')).toBe(true);
  });

  it('a shortcut pressed after a pause still works', () => {
    const reply = page.el('dock-input');
    page.boxes.push(reply);
    page.active = reply;
    page.press('a');
    page.active = null;
    now += STILL_TYPING_MS + 10;
    expect(page.press('e')).toBe(true);
  });
});

describe('the wiring', () => {
  it('is installed before the app draws, so it is ahead of every key listener', () => {
    const main = read('renderer/src/main.tsx');
    expect(main).toMatch(/installStrayLetters\(\)/);
    expect(main.indexOf('installStrayLetters()')).toBeLessThan(main.indexOf('.render('));
  });
  // Checking this, "Fix double" typed straight after ⌘K lost every letter.
  it('the app says which box is opening when the reply box, a new thread, ⌘K or search opens', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/if \(modal === 'reply' \|\| modal === 'compose' \|\| modal === 'palette'\) strayLetters\.opening\(modal,/);
    expect(app).toMatch(/strayLetters\.opening\('search'/);
  });
});
