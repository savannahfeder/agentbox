// On a 34-inch screen the app drew at 100%, the size it draws on a laptop, and
// had to be zoomed to 150% to be read. Measured from the screenshot of that
// screen: 3440x1440 pixels at scale 1, zoom 100%, the home column about a fifth
// of the width. And because Chromium keeps one zoom for the page whatever screen
// the window is on, the 150% then followed the window back to the laptop.
//
// The rule now lives in main/app-size.mts and is run here for real, against
// made-up screens and a stand-in window. The wiring in main.mts is read as
// text, as the other zoom tests do: this suite cannot boot the main process.

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  autoFactorFor, autoLevelFor, keepTheAppSizedForItsScreen, levelOn, openingSize, screenKey, stepFrom,
} from '../main/app-size.mts';
import { zoomPercentFor } from '../main/zoom-readout.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const main = fs.readFileSync(path.join(here, '..', 'main', 'main.mts'), 'utf8');

type Rect = { x: number; y: number; width: number; height: number };
const screenOf = (width: number, height: number, x = 0, extra: Record<string, unknown> = {}) => ({
  bounds: { x, y: 0, width, height }, size: { width, height }, workArea: { x, y: 25, width, height: height - 25 }, ...extra,
});
const LAPTOP = screenOf(1710, 1107, 0, { scaleFactor: 2, internal: true });
const BIG = screenOf(3440, 1440, 1710, { scaleFactor: 1 });
const percentOn = (display: object, chosen?: unknown) => zoomPercentFor(levelOn(display, chosen));

describe('the size each screen gets before anyone picks one', () => {
  it('draws a 34-inch screen at 150% and leaves a laptop at 100%', () => {
    expect(percentOn(BIG)).toBe(150);
    expect(percentOn(LAPTOP)).toBe(100);
  });

  // The text size on a laptop was settled and stays (2026-10-01): every
  // laptop, and every screen the size of one, is untouched.
  it('changes nothing on a laptop or an ordinary monitor', () => {
    for (const [w, h] of [[1280, 800], [1470, 956], [1512, 982], [1728, 1117], [2056, 1329], [1920, 1080], [1920, 1200], [2399, 1350]]) {
      expect(autoFactorFor(screenOf(w, h))).toBe(1);
    }
  });

  it('draws a 27-inch screen a quarter bigger, from 2400 points across', () => {
    expect(autoFactorFor(screenOf(2400, 1350))).toBe(1.25);
    expect(autoFactorFor(screenOf(2560, 1440))).toBe(1.25);
    expect(autoFactorFor(screenOf(2999, 1440))).toBe(1.25);
  });

  it('draws anything from 3000 points across at 150%', () => {
    expect(autoFactorFor(screenOf(3000, 1440))).toBe(1.5);
    expect(autoFactorFor(screenOf(3008, 1692))).toBe(1.5);
    expect(autoFactorFor(screenOf(3840, 1600))).toBe(1.5);
    expect(autoFactorFor(screenOf(5120, 1440))).toBe(1.5);
  });

  it('reads a screen turned on its side by its long edge', () => {
    expect(autoFactorFor(screenOf(1440, 2560))).toBe(1.25);
    expect(autoFactorFor(screenOf(1440, 3440))).toBe(1.5);
  });

  it('takes a screen it cannot read as an ordinary one', () => {
    expect(autoFactorFor(null)).toBe(1);
    expect(autoFactorFor({})).toBe(1);
    expect(autoFactorFor({ size: { width: Number.NaN, height: 1440 } })).toBe(1);
    expect(autoLevelFor(undefined)).toBe(0);
    expect(screenKey({})).toBeNull();
  });
});

describe('the size picked with ⌘+ and ⌘-', () => {
  // From 150% the steps land on the ladder the chords always climbed, so the
  // readout says the same numbers it always has.
  it('steps from the automatic size onto the usual ladder', () => {
    const auto = autoLevelFor(BIG);
    expect(zoomPercentFor(stepFrom(auto, 0.5))).toBe(158);
    expect(zoomPercentFor(stepFrom(auto, -0.5))).toBe(144);
    expect(zoomPercentFor(stepFrom(stepFrom(auto, -0.5), -0.5))).toBe(131);
    expect([0, 0.5, 1, 1.5, 2].map((l) => zoomPercentFor(stepFrom(l, 0.5)))).toEqual([110, 120, 131, 144, 158]);
    expect([0, -0.5].map((l) => zoomPercentFor(stepFrom(l, -0.5)))).toEqual([91, 83]);
  });

  it('stops at the ends of the ladder', () => {
    expect(stepFrom(6, 0.5)).toBe(6);
    expect(stepFrom(-6, -0.5)).toBe(-6);
  });

  it('is kept for the screen it was picked on, and only that one', () => {
    const chosen = { [screenKey(BIG)!]: 2.5 };
    expect(percentOn(BIG, chosen)).toBe(158);
    expect(percentOn(LAPTOP, chosen)).toBe(100);
  });

  it('ignores a saved size that is not a size', () => {
    expect(percentOn(BIG, { '3440x1440': 'big' })).toBe(150);
    expect(percentOn(BIG, { '3440x1440': 40 })).toBe(150);
    expect(percentOn(BIG, 'nonsense')).toBe(150);
    expect(percentOn(BIG, null)).toBe(150);
  });
});

describe('the window opens at the size of the screen it opens on', () => {
  it('opens exactly as before on a laptop', () => {
    expect(openingSize(LAPTOP)).toEqual({ width: 1440, height: 900 });
    expect(openingSize(screenOf(1280, 800))).toEqual({ width: 1440, height: 900 });
  });

  // So the first window on the big screen holds what it holds on a laptop,
  // only bigger, instead of the same 1440x900 drawn at 150%.
  it('opens bigger on the 34-inch screen, inside its working area', () => {
    expect(openingSize(BIG)).toEqual({ width: 2160, height: 1350 });
    expect(openingSize(screenOf(3440, 1300))).toEqual({ width: 2160, height: 1275 });
  });

  it('follows the size picked for that screen', () => {
    expect(openingSize(BIG, { '3440x1440': 0 })).toEqual({ width: 1440, height: 900 });
  });
});

// A window and a screen that behave like Electron's, enough for the rule.
function stand() {
  const screenHears = new Map<string, Set<() => void>>();
  const displays = [LAPTOP, BIG];
  const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const screen = {
    getDisplayMatching: (r: Rect) => displays.reduce((best, d) => (overlap(r, d.bounds) > overlap(r, best.bounds) ? d : best), displays[0]),
    on(ev: string, fn: () => void) { if (!screenHears.has(ev)) screenHears.set(ev, new Set()); screenHears.get(ev)!.add(fn); return screen; },
    removeListener(ev: string, fn: () => void) { screenHears.get(ev)?.delete(fn); return screen; },
    emit(ev: string) { for (const fn of screenHears.get(ev) ?? []) fn(); },
    listening: () => [...screenHears.values()].reduce((n, s) => n + s.size, 0),
  };
  const windowHears = new Map<string, Set<() => void>>();
  const pageHears = new Map<string, Set<() => void>>();
  const hear = (m: Map<string, Set<() => void>>) => (ev: string, fn: () => void) => { if (!m.has(ev)) m.set(ev, new Set()); m.get(ev)!.add(fn); };
  const emit = (m: Map<string, Set<() => void>>) => (ev: string) => { for (const fn of m.get(ev) ?? []) fn(); };
  const contents = {
    level: 0,
    sets: [] as number[],
    isDestroyed: () => false,
    getZoomLevel() { return this.level; },
    setZoomLevel(l: number) { this.level = l; this.sets.push(l); },
    on: hear(pageHears),
    emit: emit(pageHears),
  };
  const window = {
    bounds: { x: 135, y: 100, width: 1440, height: 900 } as Rect,
    isDestroyed: () => false,
    getBounds() { return this.bounds; },
    on: hear(windowHears),
    emit: emit(windowHears),
    webContents: contents,
  };
  const onBig = { x: 2000, y: 100, width: 1440, height: 900 };
  const onLaptop = { x: 135, y: 100, width: 1440, height: 900 };
  return { screen, window, contents, onBig, onLaptop };
}

describe('the window keeps the size of the screen it is on', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('grows when it is moved onto the big screen and shrinks back on the laptop', () => {
    const { screen, window, contents, onBig, onLaptop } = stand();
    keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {} });
    window.emit('moved');
    expect(zoomPercentFor(contents.level)).toBe(100);
    window.bounds = onBig;
    window.emit('moved');
    expect(zoomPercentFor(contents.level)).toBe(150);
    window.bounds = onLaptop;
    window.emit('moved');
    expect(zoomPercentFor(contents.level)).toBe(100);
  });

  // Linux has no `moved`, and Windows fires `move` all through a drag: the
  // size changes once the window has stopped, not at every pixel.
  it('waits for a drag to settle before it changes the size', () => {
    vi.useFakeTimers();
    const { screen, window, contents, onBig } = stand();
    keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {} });
    window.bounds = onBig;
    window.emit('move');
    window.emit('move');
    expect(contents.sets).toEqual([]);
    vi.advanceTimersByTime(400);
    expect(contents.sets.map(zoomPercentFor)).toEqual([150]);
  });

  // Chromium hands back the last level it stored for the page on every load,
  // which may be another screen's.
  it('puts the right size back after every page load', () => {
    const { screen, window, contents, onBig } = stand();
    window.bounds = onBig;
    keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {} });
    contents.level = 0;
    contents.emit('did-navigate');
    expect(zoomPercentFor(contents.level)).toBe(150);
  });

  it('follows a screen that changes under it, such as one unplugged', () => {
    const { screen, window, contents, onBig, onLaptop } = stand();
    window.bounds = onBig;
    keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {} });
    contents.emit('did-navigate');
    window.bounds = onLaptop;
    screen.emit('display-removed');
    expect(zoomPercentFor(contents.level)).toBe(100);
  });

  it('touches nothing while the window stays on one screen', () => {
    const { screen, window, contents } = stand();
    keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {} });
    for (let i = 0; i < 5; i++) window.emit('moved');
    screen.emit('display-metrics-changed');
    expect(contents.sets).toEqual([]);
  });

  // The corner readout says what happened when moving the window changed its
  // size, the same way it does for ⌘+. A page load is not a change anyone made.
  it('shows the new size when a move changes it, and not on a page load', () => {
    const { screen, window, contents, onBig } = stand();
    const said: number[] = [];
    keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {}, announce: (l) => said.push(zoomPercentFor(l)!) });
    window.bounds = onBig;
    contents.emit('did-navigate');
    expect(said).toEqual([]);
    contents.level = 0;
    window.emit('moved');
    expect(said).toEqual([150]);
  });

  it('stops listening to the screens once the window is closed', () => {
    const { screen, window } = stand();
    keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {} });
    expect(screen.listening()).toBe(3);
    window.emit('closed');
    expect(screen.listening()).toBe(0);
  });
});

describe('⌘+, ⌘- and ⌘0 on the app window', () => {
  it('step from the size it is drawn at and keep the pick for this screen alone', () => {
    const { screen, window, contents, onBig, onLaptop } = stand();
    const saved: unknown[] = [];
    window.bounds = onBig;
    const size = keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: (next) => saved.push(next) });
    contents.emit('did-navigate');
    expect(zoomPercentFor(size.step(0.5))).toBe(158);
    expect(saved.at(-1)).toEqual({ '3440x1440': 2.5 });
    window.bounds = onLaptop;
    window.emit('moved');
    expect(zoomPercentFor(contents.level)).toBe(100);
    window.bounds = onBig;
    window.emit('moved');
    expect(zoomPercentFor(contents.level)).toBe(158);
  });

  it('go back to the size for this screen on ⌘0, and forget the pick', () => {
    const { screen, window, contents, onBig } = stand();
    const saved: unknown[] = [];
    window.bounds = onBig;
    const size = keepTheAppSizedForItsScreen({ window, screen, chosen: { '3440x1440': 1 }, save: (next) => saved.push(next) });
    contents.emit('did-navigate');
    expect(zoomPercentFor(contents.level)).toBe(120);
    expect(zoomPercentFor(size.step(0))).toBe(150);
    expect(saved.at(-1)).toEqual({});
  });

  // On the laptop, ⌘+ then ⌘- is back where it started, which is the
  // automatic size, so nothing is left behind in the settings.
  it('keep nothing when a pick lands back on the automatic size', () => {
    const { screen, window, onLaptop } = stand();
    const saved: unknown[] = [];
    window.bounds = onLaptop;
    const size = keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: (next) => saved.push(next) });
    size.step(0.5);
    expect(saved.at(-1)).toEqual({ '1710x1107': 0.5 });
    size.step(-0.5);
    expect(saved.at(-1)).toEqual({});
  });

  // A pick is read back on the next launch; nothing resets it to 100%.
  it('survive a relaunch', () => {
    const first = stand();
    let kept: unknown;
    first.window.bounds = first.onBig;
    keepTheAppSizedForItsScreen({ window: first.window, screen: first.screen, chosen: undefined, save: (next) => { kept = next; } }).step(-0.5);
    const second = stand();
    second.window.bounds = second.onBig;
    keepTheAppSizedForItsScreen({ window: second.window, screen: second.screen, chosen: kept, save: () => {} });
    second.contents.emit('did-navigate');
    expect(zoomPercentFor(second.contents.level)).toBe(144);
  });

  it('still zoom when the settings cannot be written', () => {
    const { screen, window, contents, onBig } = stand();
    window.bounds = onBig;
    const size = keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => { throw new Error('disk full'); } });
    contents.emit('did-navigate');
    expect(zoomPercentFor(size.step(0.5))).toBe(158);
    expect(zoomPercentFor(contents.level)).toBe(158);
  });
});

// The chords and the View menu reach applyZoom in main/menu.mts. The app
// window's steps go through its per-screen size; the junk browser's page still
// carries a zoom of its own.
describe('applyZoom', () => {
  afterEach(() => { vi.doUnmock('electron'); vi.resetModules(); });

  const withElectron = async (inbox: object) => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      app: { name: 'Zero' },
      Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
      webContents: { getFocusedWebContents: () => null },
      BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [{ isDestroyed: () => false, webContents: inbox }] },
    }));
    return import('../main/menu.mts');
  };

  it('sends the app window through the size for its screen, and says the new size', async () => {
    const { screen, window, contents, onBig } = stand();
    const sent: unknown[] = [];
    Object.assign(contents, { send: (channel: string, payload: unknown) => sent.push([channel, payload]) });
    const menu = await withElectron(contents);
    window.bounds = onBig;
    menu.sizeTheAppWindowWith(keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {} }));
    contents.emit('did-navigate');
    menu.applyZoom(0.5, contents as never);
    expect(zoomPercentFor(contents.level)).toBe(158);
    expect(sent.at(-1)).toEqual(['zero:zoom-percent', { percent: 158 }]);
    menu.sizeTheAppWindowWith(null);
  });

  it('zooms the junk browser page by itself, as before', async () => {
    const { screen, window, contents } = stand();
    const menu = await withElectron(contents);
    menu.sizeTheAppWindowWith(keepTheAppSizedForItsScreen({ window, screen, chosen: undefined, save: () => {} }));
    const guest = { level: 0, isDestroyed: () => false, getZoomLevel() { return this.level; }, setZoomLevel(l: number) { this.level = l; } };
    menu.applyZoom(0.5, guest as never);
    expect(guest.level).toBe(0.5);
    expect(contents.sets).toEqual([]);
    menu.sizeTheAppWindowWith(null);
  });
});

describe('the app window is wired to it', () => {
  it('keeps the size for its screen from the moment it is made', () => {
    expect(main).toMatch(/sizeTheAppWindowWith\(keepTheAppSizedForItsScreen\(\{\s*window,\s*screen: electronScreen,/);
    expect(main).toMatch(/chosen: config\.zoomByScreen/);
    expect(main).toMatch(/saveConfig\(config, \{ zoomByScreen:/);
  });

  it('opens at the size of the screen it opens on', () => {
    expect(main).toMatch(/const opening = openingSize\(electronScreen\.getPrimaryDisplay\(\), config\.zoomByScreen\)/);
    const options = main.slice(main.indexOf('window = new BrowserWindow({'), main.indexOf('webPreferences:', main.indexOf('window = new BrowserWindow({')));
    expect(options).toMatch(/width: opening\.width,/);
    expect(options).toMatch(/height: opening\.height,/);
  });
});
