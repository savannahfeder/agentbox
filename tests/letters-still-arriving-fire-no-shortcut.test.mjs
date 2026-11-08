// QA batch 011. A reply sent as "Use" while the sentence was still being typed
// left " name QA Tester…" with no box: the N opened a New thread box and the
// rest landed there (F-160, F-168). "zzqqxx" typed as Ctrl+K arrived ran Z, which
// took back a thread sent a moment before (F-184). Measured by pressing keys
// through the window's capture listener on a fake window, with fake timers.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrayLetters, strayLetters, installStrayLetters, BURST_MS } from '../renderer/src/stray-letters.ts';

describe('letters straight after a send', () => {
  const s = new StrayLetters();
  const call = (o) => s.decide({ key: 'n', inInput: false, chord: false, boxThere: false, openingThere: false, ...o });
  beforeEach(() => s.reset());

  // The first key after a send may be O, which goes back to the thread replied to.
  it('only the first key acts; the N of " name" and the rest fire nothing', () => {
    expect(call({ now: 1010, key: ' ' })).toBe('shortcut');
    expect(call({ now: 1030, key: 'n' })).toBe('drop');
    expect(call({ now: 1050, key: 'a' })).toBe('drop');
  });
  it('a shortcut a beat after the send still works', () => {
    expect(call({ now: 1000, key: ' ' })).toBe('shortcut');
    expect(call({ now: 1000 + BURST_MS + 1, key: 'j' })).toBe('shortcut');
  });
  it('a box opening after the send still takes the letters', () => {
    s.opening('reply', 1005);
    expect(call({ now: 1020, openingThere: true })).toBe('into-opening-box');
  });
});

function fakePage() {
  const listeners = { keydown: [], pointerdown: [] };
  const reached = [];
  const body = { tagName: 'BODY', isConnected: true, dispatchEvent: (e) => { for (const fn of listeners.keydown) fn(e); if (!e.stopped) reached.push(e.key); } };
  const page = {
    reached,
    document: { querySelector: () => null, body },
    addEventListener: (t, fn) => listeners[t].push(fn),
    removeEventListener: (t, fn) => { listeners[t] = listeners[t].filter((f) => f !== fn); },
    press(key, { ctrl = false } = {}) {
      const e = { key, target: body, metaKey: false, ctrlKey: ctrl, altKey: false, shiftKey: false, stopped: false, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } };
      for (const fn of listeners.keydown) { fn(e); if (e.stopped) break; }
      if (!e.stopped) reached.push(ctrl ? `ctrl+${key}` : key);
    },
  };
  return page;
}

describe('Z waits to see whether it is typing', () => {
  let page; let off; let now;
  beforeEach(() => {
    vi.useFakeTimers();
    off?.();
    strayLetters.reset();
    now = 50_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    page = fakePage();
    off = installStrayLetters(page, (e) => ({ ...e, stopped: false, preventDefault() {}, stopImmediatePropagation() { this.stopped = true; } }));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('a Z on its own still undoes, a moment later', () => {
    page.press('z');
    expect(page.reached).toEqual([]);
    now += BURST_MS; vi.advanceTimersByTime(BURST_MS);
    expect(page.reached).toEqual(['z']);
  });
  it('zzqqxx typed fast runs no undo', () => {
    for (const k of 'zzqqxx') { page.press(k); now += 20; vi.advanceTimersByTime(20); }
    now += 1000; vi.advanceTimersByTime(1000);
    expect(page.reached).toEqual([]);
  });
  it('Z followed at once by Ctrl+K opens the palette and runs no undo', () => {
    page.press('z');
    now += 30; vi.advanceTimersByTime(30);
    page.press('k', { ctrl: true });
    now += 1000; vi.advanceTimersByTime(1000);
    expect(page.reached).toEqual(['ctrl+k']);
  });
  it('two Zs a beat apart, the ask and the answer, both arrive', () => {
    page.press('z');
    now += 600; vi.advanceTimersByTime(600);
    page.press('z');
    now += 600; vi.advanceTimersByTime(600);
    expect(page.reached).toEqual(['z', 'z']);
  });
  it('other shortcuts are not held', () => {
    page.press('j');
    expect(page.reached).toEqual(['j']);
  });
});
