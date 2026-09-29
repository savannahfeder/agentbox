// ⌘R must put the built renderer on screen from any focus state.
//
// She said the same thing on 2026-08-06, and that round changed WHAT the menu
// item does (reloadIgnoringCache instead of role: 'reload', so a content-hashed
// bundle could not be served from cache) without moving it off the menu
// accelerator.
//
// This file already knew why that is not enough. The note beside the ⌘Y/⌘N
// handler says menu accelerators "turned out not to fire" while a child web
// contents owns the keyboard, and it is why those two chords were moved into
// before-input-event in the main process. Reload was left behind.
//
// Asserted against the source: the main process is not something this suite can
// boot, and the invariant is structural. Same reasoning as
// tests/shortcuts-swallow-their-key.test.mjs.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const main = read('main', 'main.mjs');
const menu = read('main', 'menu.mjs');

// The before-input-event handler on the app's own window, which runs ahead of
// any page dispatch.
function inputHandler() {
  const start = main.indexOf("window.webContents.on('before-input-event'");
  expect(start).toBeGreaterThan(-1);
  const end = main.indexOf('// ---- END OF THE CHORD WIRING ----', start);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('the reload chord', () => {
  it('is handled in the main process, not only by a menu accelerator', () => {
    const handler = inputHandler();
    expect(handler).toMatch(/key === 'r'/);
    expect(handler).toMatch(/reloadRenderer\(\)/);
  });

  it('is swallowed, so the page never also acts on it', () => {
    const handler = inputHandler();
    const at = handler.indexOf("key === 'r'");
    expect(handler.slice(at, at + 200)).toMatch(/event\.preventDefault\(\)/);
  });

  it('still ignores the cache, so a content-hashed bundle cannot be stale', () => {
    expect(main).toMatch(/reloadIgnoringCache\(\)/);
    expect(main).not.toMatch(/role:\s*'reload'/);
  });

  // The menu item stays: it is how the chord is discoverable and how it is
  // labelled. It is no longer the only route.
  it('is still in the View menu', () => {
    expect(menu).toMatch(/accelerator: 'CommandOrControl\+R'/);
    expect(menu).toMatch(/onReload\?\.\(\)/);
  });

  // Two routes to one action, so the second arrival inside half a second is
  // dropped rather than reloading twice.
  it('cannot reload twice off one keypress', () => {
    expect(main).toMatch(/lastReloadAt/);
    expect(main).toMatch(/now - lastReloadAt < 500/);
  });
});
