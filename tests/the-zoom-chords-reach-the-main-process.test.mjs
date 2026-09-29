// ⌘=, ⌘- and ⌘0 must actually change the zoom.
//
// Her window has been drawing everything 1.2x since before it was launched, and
// the chord is the only way back, because Chromium stores the zoom level
// against the page URL and restores it on every load.
//
// The three items were menu accelerators and nothing else. This suite already
// carries the reason that is not enough, twice over: see
// tests/reload-chord-reaches-the-main-process.test.mjs and the ⌘Y/⌘N note in
// main.mjs. Menu accelerators in this app have not reliably arrived, and the
// fix that worked both times was before-input-event in the main process.
//
// The key mapping below is executed for real. The wiring is asserted against
// source, because the main process is not something this suite can boot; same
// reasoning as the reload test.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zoomDeltaFor, zoomTarget } from '../main/zoom-keys.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');
const main = read('main', 'main.mjs');
const menu = read('main', 'menu.mjs');

const down = (over) => ({ type: 'keyDown', meta: true, control: false, alt: false, shift: false, ...over });

function inputHandler() {
  const start = main.indexOf("window.webContents.on('before-input-event'");
  expect(start).toBeGreaterThan(-1);
  const end = main.indexOf('// ---- END OF THE CHORD WIRING ----', start);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('which keystrokes mean zoom', () => {
  it('reads ⌘0 as actual size, which is the one she needs', () => {
    expect(zoomDeltaFor(down({ key: '0', code: 'Digit0' }))).toBe(0);
    expect(zoomDeltaFor(down({ key: '0', code: 'Numpad0' }))).toBe(0);
  });

  // "Cmd +" is ⇧⌘= on a US keyboard: key '+', code 'Equal'. Both forms, and the
  // numpad, are one command.
  it('reads every way of typing Cmd + as zoom in', () => {
    expect(zoomDeltaFor(down({ key: '=', code: 'Equal' }))).toBe(0.5);
    expect(zoomDeltaFor(down({ key: '+', code: 'Equal', shift: true }))).toBe(0.5);
    expect(zoomDeltaFor(down({ key: '+', code: 'NumpadAdd' }))).toBe(0.5);
  });

  it('reads Cmd - as zoom out', () => {
    expect(zoomDeltaFor(down({ key: '-', code: 'Minus' }))).toBe(-0.5);
    expect(zoomDeltaFor(down({ key: '-', code: 'NumpadSubtract' }))).toBe(-0.5);
  });

  it('leaves everything else alone', () => {
    expect(zoomDeltaFor(down({ key: 'r', code: 'KeyR' }))).toBeNull();
    expect(zoomDeltaFor(down({ key: '1', code: 'Digit1' }))).toBeNull(); // ⌘1-4 are hers, in the renderer
    expect(zoomDeltaFor(down({ key: '0', code: 'Digit0', meta: false }))).toBeNull(); // plain 0 types a 0
    expect(zoomDeltaFor(down({ key: '-', code: 'Minus', alt: true }))).toBeNull();
    expect(zoomDeltaFor({ ...down({ key: '0', code: 'Digit0' }), type: 'keyUp' })).toBeNull();
  });

  // 0 is a real answer, so a caller testing for falsiness would silently drop
  // the one chord that gets her back to normal.
  it('says null for a non-chord, never 0', () => {
    expect(zoomDeltaFor(down({ key: 'k', code: 'KeyK' }))).toBeNull();
  });
});

describe('the zoom chords', () => {
  it('are handled in the main process, not only by a menu accelerator', () => {
    const handler = inputHandler();
    expect(handler).toMatch(/zoomDeltaFor\(input\)/);
    expect(handler).toMatch(/applyZoom\(zoomDelta, window\.webContents\)/);
  });

  it('are swallowed, so the page never also acts on them', () => {
    const handler = inputHandler();
    const at = handler.indexOf('applyZoom(zoomDelta');
    expect(handler.slice(at, at + 120)).toMatch(/event\.preventDefault\(\)/);
  });

  // getFocusedWebContents returning null was a silent no-op, and a silent
  // no-op is the entire complaint. The keystroke's own contents is the target.
  it('act on the contents the keystroke arrived on', () => {
    expect(menu).toMatch(/export function applyZoom\(delta, target = null\)/);
    expect(menu).toMatch(/named: target/);
  });

  // The junk browser is a separate web contents and owns the keyboard while
  // she is in it, so the window's handler never hears her.
  it('work inside the junk browser too, on the junk browser', () => {
    expect(main).toMatch(/applyZoom\(delta, contents\)/);
  });

  // The menu items stay: they are how the chords are discoverable and labelled.
  it('are still in the View menu', () => {
    expect(menu).toMatch(/accelerator: 'CommandOrControl\+='/);
    expect(menu).toMatch(/accelerator: 'CommandOrControl\+-'/);
    expect(menu).toMatch(/accelerator: 'CommandOrControl\+0'/);
  });

  // Two routes to one action, as with reload.
  it('cannot move two steps off one keypress', () => {
    expect(menu).toMatch(/lastZoomAt/);
    expect(menu).toMatch(/now - lastZoomAt < 40/);
  });
});

// The click had no contents of its own and asked for the focused one, which
// comes back null when nothing on screen claims focus, and null did nothing at
// all. Below, `named` is what a click now carries and `appWindow` is what is
// left when even focus is gone. Executed for real, no source reading.
describe('which contents a zoom lands on', () => {
  const contents = (name) => ({ name, isDestroyed: () => false });
  const dead = (name) => ({ name, isDestroyed: () => true });

  it('takes the window a menu click was chosen from, over whatever is focused', () => {
    const named = contents('the window from the click');
    expect(zoomTarget({ named, focused: contents('junk browser'), appWindow: contents('inbox') })).toBe(named);
  });

  // The failure she hit twice: nothing focused, so nothing zoomed.
  it('falls back to the app window when nothing is focused, never to nothing', () => {
    const appWindow = contents('inbox');
    expect(zoomTarget({ named: null, focused: null, appWindow })).toBe(appWindow);
    expect(zoomTarget({ named: undefined, focused: undefined, appWindow })).toBe(appWindow);
  });

  it('skips a closed window rather than zooming a corpse', () => {
    const appWindow = contents('inbox');
    expect(zoomTarget({ named: dead('closed'), focused: null, appWindow })).toBe(appWindow);
    expect(zoomTarget({ named: null, focused: dead('gone'), appWindow: dead('gone too') })).toBeNull();
  });

  it('still zooms the focused contents when the caller names none', () => {
    const focused = contents('junk browser');
    expect(zoomTarget({ focused, appWindow: contents('inbox') })).toBe(focused);
  });

  it('says null only when there is genuinely nothing on screen', () => {
    expect(zoomTarget()).toBeNull();
    expect(zoomTarget({})).toBeNull();
  });
});

// The real applyZoom, run against a stand-in Electron, in the exact state she
// reported: nothing focused. Before this change it moved nothing. This is as
// close to her failure as the suite can get without launching a second Electron,
// which is barred (reference/shooting-the-real-app.md).
describe('applyZoom itself, with nothing focused', () => {
  const fakeContents = (level) => ({
    level,
    isDestroyed: () => false,
    getZoomLevel() { return this.level; },
    setZoomLevel(next) { this.level = next; },
  });

  it('still zooms the app window, which is the whole of her second report', async () => {
    const inbox = fakeContents(1); // her window: level 1, everything at 1.2x
    vi.doMock('electron', () => ({
      app: { name: 'Zero' },
      Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
      webContents: { getFocusedWebContents: () => null },
      BrowserWindow: {
        getFocusedWindow: () => null,
        getAllWindows: () => [{ isDestroyed: () => false, webContents: inbox }],
      },
    }));
    const { applyZoom } = await import('../main/menu.mjs');

    applyZoom(0.5);
    expect(inbox.level).toBe(1.5);
    applyZoom(-0.5);
    expect(inbox.level).toBe(1);
    applyZoom(0); // Actual Size: back to 100%
    expect(inbox.level).toBe(0);

    vi.doUnmock('electron');
    vi.resetModules();
  });
});

// So Chromium keeps carrying her level between launches, and the chords above
// are the whole of the way back. Do not add a reset here.
describe('a fresh launch', () => {
  it('leaves the remembered zoom alone', () => {
    expect(main).not.toMatch(/setZoomLevel\(0\)/);
  });
});

describe('the View menu items', () => {
  // Electron hands a click (menuItem, window, event). Using that window is the
  // only route that cannot come back null, and it is what Reload already does.
  it('zoom the window the click came from', () => {
    expect(menu).toMatch(/label: 'Zoom In'.*click: \(_item, window\) => zoom\(0\.5, window\)/);
    expect(menu).toMatch(/label: 'Zoom Out'.*click: \(_item, window\) => zoom\(-0\.5, window\)/);
    expect(menu).toMatch(/label: 'Actual Size'.*click: \(_item, window\) => zoom\(0, window\)/);
  });

  it('hand that window through to the main process', () => {
    expect(menu).toMatch(/const zoom = \(delta, window\) =>/);
    expect(main).toMatch(/onZoom: \(delta, target\) => applyZoom\(delta, target \?\? window\?\.webContents \?\? null\)/);
  });
});
