// ESCAPE OUT OF A FILM'S FULL SCREEN ONLY LEAVES FULL SCREEN (w-375c72d32e, 2026-11-08).
//
// What broke: since every file opens beside the chat, a film beside it has its
// player's own Full screen button. Pressing it and then Escape also reached the
// app: the film beside the chat closed, or the thread closed back to the list.
// Two power testers hit it in the browser copy, one of them twice in a row.
// Now an Escape while something is in full screen ends full screen and goes no
// further.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { escapeLeavesFullScreen } from '../renderer/src/full-screen-escape.ts';

const key = (k) => {
  const e = { key: k, stopImmediatePropagation: vi.fn(), preventDefault: vi.fn() };
  return e;
};

describe('an Escape', () => {
  it('while a film is full screen ends full screen and stops there', () => {
    const doc = { fullscreenElement: {}, exitFullscreen: vi.fn(() => Promise.resolve()) };
    const e = key('Escape');
    expect(escapeLeavesFullScreen(e, doc)).toBe(true);
    expect(doc.exitFullscreen).toHaveBeenCalledOnce();
    expect(e.stopImmediatePropagation).toHaveBeenCalled();
  });
  it('with nothing full screen goes on to the app as before', () => {
    const doc = { fullscreenElement: null, exitFullscreen: vi.fn() };
    const e = key('Escape');
    expect(escapeLeavesFullScreen(e, doc)).toBe(false);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
    expect(e.stopImmediatePropagation).not.toHaveBeenCalled();
  });
  it('leaves every other key alone, full screen or not', () => {
    const doc = { fullscreenElement: {}, exitFullscreen: vi.fn() };
    const e = key(' ');
    expect(escapeLeavesFullScreen(e, doc)).toBe(false);
    expect(e.stopImmediatePropagation).not.toHaveBeenCalled();
  });
  it('is heard first, before any of the app\'s own Escapes', () => {
    const main = fs.readFileSync(new URL('../renderer/src/main.tsx', import.meta.url), 'utf8');
    expect(main).toMatch(/installFullScreenEscape\(\)/);
    const src = fs.readFileSync(new URL('../renderer/src/full-screen-escape.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/window\.addEventListener\('keydown', [^\n]*, true\);/);
  });
});
