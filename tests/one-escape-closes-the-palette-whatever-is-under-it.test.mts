// QA F-181: after a search with no results, the first Escape left Ctrl+K open
// and a second one closed it. The palette closed only from its input's own key
// handler, which a panel under it that stops the key in the capture phase (the
// usage card does) never lets run. Measured on a fake window with such a panel
// listening first.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { escapeClosesThePalette } from '../renderer/src/palette-rows.ts';

function fakeWindow() {
  const capture = [];
  return {
    addEventListener: (t, fn, c) => { if (t === 'keydown' && c) capture.push(fn); },
    removeEventListener: (t, fn) => { const i = capture.indexOf(fn); if (i >= 0) capture.splice(i, 1); },
    press(key) {
      let immediate = false;
      const e = { key, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() { immediate = true; } };
      for (const fn of [...capture]) { fn(e); if (immediate) break; }
    },
    count: () => capture.length,
  };
}

describe('one Escape closes the palette', () => {
  it('even when a panel under it stops the key first', () => {
    const win = fakeWindow();
    let panelOpen = true;
    win.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelOpen) { e.stopPropagation(); panelOpen = false; } }, true);
    let closed = 0;
    escapeClosesThePalette(win, () => { closed += 1; });
    win.press('Escape');
    expect(closed).toBe(1);
  });
  it('a letter does not close it', () => {
    const win = fakeWindow();
    let closed = 0;
    escapeClosesThePalette(win, () => { closed += 1; });
    win.press('z');
    expect(closed).toBe(0);
  });
  it('stops listening once it has closed', () => {
    const win = fakeWindow();
    const off = escapeClosesThePalette(win, () => {});
    off();
    expect(win.count()).toBe(0);
  });
  it('the palette uses it', () => {
    const src = fs.readFileSync(new URL('../renderer/src/components/Palette.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/escapeClosesThePalette\(window,/);
  });
});
