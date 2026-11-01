// The Mac app died about three seconds after opening, on macOS 27.0.1 with
// Electron 43.8.4: SIGSEGV at 0x1beffed77baffede, in the menu callback AppKit
// makes while macOS's UIIntelligenceSupport walks the app's menus. Two such
// crashes on 2026-10-30, launches lasting 3.4 and 3.6 s.
//
// Electron puts up its default menu at `ready`, then our own replaces it. The
// default menu's JS object is then garbage collected, but AppKit still holds its
// Window menu as NSApp.windowsMenu, so a callback in the gap between the two
// reads a dead object. Measured on a clean Electron 43.8.4, calling that menu's
// delegate under ordinary memory pressure: default menu up, crashed 2 of 2 with
// the same address and top seven frames; default menu suppressed, survived 2 of 2.
//
// Electron only runs an ES module's imports before `ready`, so the suppression
// has to be the side effect of an import, not a line in the body of main.mjs.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const setApplicationMenu = vi.fn();
vi.mock('electron', () => ({ Menu: { setApplicationMenu } }));

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const realPlatform = process.platform;

async function loadOn(platform) {
  Object.defineProperty(process, 'platform', { value: platform });
  vi.resetModules();
  setApplicationMenu.mockClear();
  await import('../main/no-default-menu.mjs');
}

describe('the mac app does not crash on a leftover default menu', () => {
  beforeEach(() => setApplicationMenu.mockClear());
  afterEach(() => Object.defineProperty(process, 'platform', { value: realPlatform }));

  it('suppresses the default menu on a Mac', async () => {
    await loadOn('darwin');
    expect(setApplicationMenu).toHaveBeenCalledTimes(1);
    expect(setApplicationMenu).toHaveBeenCalledWith(null);
  });

  it.each(['linux', 'win32'])('leaves the menu alone on %s', async (platform) => {
    await loadOn(platform);
    expect(setApplicationMenu).not.toHaveBeenCalled();
  });

  it('runs before any other module of ours', () => {
    const imports = [...read('main', 'main.mjs').matchAll(/^import .*?from '([^']+)'|^import '([^']+)'/gm)]
      .map((m) => m[1] ?? m[2]);
    expect(imports[0]).toBe('electron');
    expect(imports[1]).toBe('./no-default-menu.mjs');
  });

  it('still installs the real menu, once', () => {
    const calls = read('main', 'main.mjs').match(/^\s*installMenu\(\{/gm) ?? [];
    expect(calls).toHaveLength(1);
    expect(read('main', 'menu.mjs')).toMatch(/Menu\.setApplicationMenu\(Menu\.buildFromTemplate/);
  });
});
