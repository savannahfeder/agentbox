// THE TRAY CHANGES SIZE ONLY FROM ITS SIZE BUTTONS (2026-10-29, w-7da9244ef7).
//
// "I keep accidentally changing the size of my agent tray. Can you make it so
// you can't accidentally drag it? The only way to change the size is through
// the little size ± buttons." Each of the tray's four corners was a resize
// grip, 20 points square, so a press meant to move the tray that landed near
// a corner resized it instead. Measured by driving the real controller with a
// pretend screen, windows and cursor: a press on a corner, with or without the
// grip flag the old page sent, and a 60 px drag, changed the window's height
// and saved a new cornerTagZoom. Now it moves the tray and leaves its size
// alone, the page draws no corners to grab, and the Size steps still work.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createCornerTag } from '../main/corner-tag.mjs';
import { GRIPS, cardScale } from '../shared/corner-tag.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const page = read('renderer/src/corner-tag/main.tsx');
const css = read('renderer/src/corner-tag/corner-tag.css');
const bridge = read('main/corner-tag-preload.cjs');
const settings = read('renderer/src/components/Settings.tsx');

const AREA = { x: 0, y: 0, width: 1728, height: 1080 };

function rig({ config = {} } = {}) {
  const handlers = {};
  const timers = [];
  let timerId = 0;
  let clock = 1_000_000;
  const windows = [];
  class FakeWindow {
    constructor() {
      this.bounds = null; this.visible = false; this.sent = [];
      this.webContents = { send: (ch, p) => this.sent.push([ch, p]), on: () => {} };
      windows.push(this);
    }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} on() {}
    isDestroyed() { return false; } isVisible() { return this.visible; }
    hide() { this.visible = false; } showInactive() { this.visible = true; }
    setBounds(b) { this.bounds = b; } getBounds() { return this.bounds; }
    setPosition(x, y) { this.bounds = { ...this.bounds, x, y }; }
  }
  const cursor = { x: 0, y: 0 };
  const screen = {
    getAllDisplays: () => [{ workArea: AREA }], getDisplayMatching: () => ({ workArea: AREA }),
    getCursorScreenPoint: () => ({ x: cursor.x, y: cursor.y }), on: () => {}, removeListener: () => {},
  };
  const saved = [];
  const api = createCornerTag({
    BrowserWindow: FakeWindow, screen, ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, removeHandler: () => {} },
    powerMonitor: { on: () => {}, removeListener: () => {} },
    Menu: { buildFromTemplate: (t) => ({ popup: () => { api.menu = t; } }) },
    config, saveConfig: (c, patch) => { Object.assign(c, patch); saved.push(patch); },
    mainWindow: { isDestroyed: () => false, isFocused: () => false, isMinimized: () => false, on: () => {}, show: () => {}, focus: () => {}, restore: () => {}, webContents: { send: () => {} } },
    load: (w, part) => { w.part = part; }, preload: '/p.cjs', now: () => clock,
    setTimer: (fn, ms) => { const id = ++timerId; timers.push({ id, fn, at: clock + ms }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    mac: true,
  });
  const call = (ch, p) => handlers[ch](null, p);
  const advance = (ms) => {
    const target = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift(); clock = next.at; next.fn();
    }
    clock = target;
  };
  const win = (part = 'tag') => windows.filter((w) => w.part === part).at(-1);
  // The page draws everything from the scale it is handed, so what it reports
  // back is that scale: a 28pt tag, four times as wide as it is tall.
  const scaleSent = () => win().sent.filter((s) => s[0] === 'corner-tag:state').at(-1)[1].scale;
  const redraw = () => {
    const height = Math.round(28 * scaleSent());
    call('corner-tag:size', { part: 'tag', width: Math.round(height * 3.9), height });
    return { width: Math.round(height * 3.9), height };
  };
  const show = () => {
    call('zero:corner-tag', { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: clock - 60_000 }], working: 3 });
    call('corner-tag:ready', { part: 'tag' });
    redraw();
  };
  return { api, call, win, cursor, advance, saved, config, show, redraw, scaleSent, clock: () => clock };
}

// Press near a corner of the glass and drag it, redrawing the page as a
// browser would. `sent` is what reaches the main process: what the page sends
// now, or what the page sent before this change, in case one is still loaded.
function dragFromCorner(r, corner, [dx, dy], sent = {}) {
  const b = r.win().bounds;
  const grab = {
    x: corner.endsWith('r') ? b.x + b.width - 2 : b.x + 2,
    y: corner.startsWith('b') ? b.y + b.height - 2 : b.y + 2,
  };
  r.cursor.x = grab.x; r.cursor.y = grab.y;
  r.call('corner-tag:press', { x: grab.x, y: grab.y, ...sent });
  for (const f of [0.25, 0.5, 1]) {
    r.cursor.x = grab.x + dx * f; r.cursor.y = grab.y + dy * f;
    r.advance(16);
    r.redraw();
  }
  r.call('corner-tag:release', { cancelled: false });
}

describe('a drag that starts on a corner of the tray', () => {
  const outward = (corner, n) => [corner.endsWith('r') ? n : -n, corner.startsWith('b') ? n : -n];
  const sends = [{}, { grip: true }];

  it('moves it, from any of the four, and leaves its size alone', () => {
    for (const corner of GRIPS) {
      for (const sent of sends) {
        const r = rig();
        r.show();
        const was = { ...r.win().bounds };
        const scale = r.scaleSent();
        // up and left, away from the bottom-right corner it rests in
        const [dx, dy] = [-60, -60];
        dragFromCorner(r, corner, [dx, dy], { ...sent, corner });
        const now = r.win().bounds;
        expect([now.width, now.height]).toEqual([was.width, was.height]);
        expect(r.scaleSent()).toBe(scale);
        expect(now.x).toBe(was.x + dx);
        expect(now.y).toBe(was.y + dy);
      }
    }
  });

  it('never saves a new size, however far it goes', () => {
    for (const corner of GRIPS) {
      for (const sent of sends) {
        const r = rig();
        r.show();
        dragFromCorner(r, corner, outward(corner, 400), { ...sent, corner });
        dragFromCorner(r, corner, outward(corner, -400), { ...sent, corner });
        expect(r.saved.filter((p) => 'cornerTagZoom' in p)).toHaveLength(0);
      }
    }
  });

  it('keeps the size she set with the steps', () => {
    const r = rig({ config: { cornerTagZoom: 1.6 } });
    r.show();
    const scale = r.scaleSent();
    dragFromCorner(r, 'br', [-60, -60], { grip: true, corner: 'br' });
    expect(r.scaleSent()).toBe(scale);
    expect(r.config.cornerTagZoom).toBe(1.6);
  });

  it('is still a click when it never moves', () => {
    const r = rig();
    r.show();
    const b = r.win().bounds;
    r.cursor.x = b.x + b.width - 2; r.cursor.y = b.y + b.height - 2;
    r.call('corner-tag:press', { x: r.cursor.x, y: r.cursor.y, grip: true, corner: 'br' });
    r.advance(16);
    r.call('corner-tag:release', { cancelled: false });
    expect(r.saved.filter((p) => 'cornerTagZoom' in p)).toHaveLength(0);
    expect(r.saved.filter((p) => 'cornerTagSpot' in p)).toHaveLength(0);
  });
});

describe('the tray draws nothing to resize it by', () => {
  it('has no corner grips and no resize arrow', () => {
    expect(css).not.toContain('.ct-grip');
    expect(css).not.toMatch(/cursor:\s*n(w|e)s(e|w)-resize/);
    expect(page).not.toContain('ct-grip');
    expect(page).not.toContain('Drag to resize');
  });

  it('sends a press with nothing but where it went down', () => {
    expect(bridge).toContain('press: (x, y) =>');
    expect(bridge).not.toContain('grip');
    expect(page).toContain('bridge?.press(e.screenX, e.screenY)');
  });

  it('says in Settings that size is set from the list, not by dragging', () => {
    const row = settings.match(/label="Show the Agent Tray"\s+desc="([^"]*)"/)?.[1] ?? '';
    expect(row).toMatch(/Drag it anywhere/);
    expect(row).toMatch(/Size/);
    expect(row).not.toMatch(/corner to make it/);
  });
});

describe('the list does not grow as hard as the tag', () => {
  it('stays near the size of everything else on the screen', () => {
    // her 32": the tag is 48px, 1.71 times the base, and 13px rows at that
    // scale came out at 22px, "way bigger than anything else" on her screen
    expect(cardScale(48 / 28)).toBeLessThan(1.25);
    expect(13 * cardScale(48 / 28)).toBeLessThan(17);
    // and on a laptop it is all but the app's own size
    expect(cardScale(31 / 28)).toBeLessThan(1.05);
    expect(cardScale(1)).toBe(1);
  });

  it('never shrinks below the words it sits beside, and never runs away with the tag', () => {
    for (const s of [0.5, 1, 1.2, 1.7, 2.4, 9]) {
      expect(cardScale(s)).toBeGreaterThanOrEqual(1);
      expect(cardScale(s)).toBeLessThanOrEqual(1.25);
    }
  });
});

describe('the clear band around the glass', () => {
  // The window is the glass plus a band. A transparent window floating over somebody's work must not eat
  // their clicks: that is what took the first drawn shadow out, when "a real
  // first click fell straight through to the app beneath".
  const framed = () => {
    const r = rig();
    const ignores = [];
    r.call('zero:corner-tag', { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: r.clock() - 60_000 }], working: 3 });
    r.call('corner-tag:ready', { part: 'tag' });
    const w = r.win();
    w.setIgnoreMouseEvents = (ignore, opts) => ignores.push({ ignore, opts });
    r.call('corner-tag:size', { part: 'tag', width: 140, height: 51, glass: { x: 10, y: 10, width: 120, height: 31 } });
    return { r, ignores, w };
  };

  it('lets a click through when the pointer is in the band, and takes it on the glass', () => {
    const { r, ignores } = framed();
    r.call('corner-tag:clickable', { on: false });
    expect(ignores.at(-1)).toEqual({ ignore: true, opts: { forward: true } });
    r.call('corner-tag:clickable', { on: true });
    expect(ignores.at(-1)).toEqual({ ignore: false, opts: { forward: true } });
  });

  it('says it once, not on every move of the pointer', () => {
    const { r, ignores } = framed();
    r.call('corner-tag:clickable', { on: false });
    r.call('corner-tag:clickable', { on: false });
    r.call('corner-tag:clickable', { on: false });
    expect(ignores).toHaveLength(1);
  });

  it('never changes it under a live press, so a press that began on the tag ends there', () => {
    const { r, ignores } = framed();
    const b = r.win().bounds;
    r.cursor.x = b.x + 40; r.cursor.y = b.y + 25;
    r.call('corner-tag:press', { x: r.cursor.x, y: r.cursor.y });
    const before = ignores.length;
    r.call('corner-tag:clickable', { on: false });
    expect(ignores).toHaveLength(before);
    r.call('corner-tag:release', { cancelled: false });
  });

  it('leaves the glass the same gap from the screen edge as before, not the window', () => {
    const { r } = framed();
    const b = r.win().bounds;
    // the window hangs 10 further out on each side, so the glass itself still
    // sits MARGIN in from the edge of the screen
    expect(AREA.x + AREA.width - (b.x + b.width - 10)).toBe(18);
    expect(AREA.y + AREA.height - (b.y + b.height - 10)).toBe(18);
  });
});

describe('a drag with the clear band in place', () => {
  // The window the real page reports is the glass plus the band, so a drag
  // from the corner is measured there too: it moves, and nothing changes size.
  const BAND = 10;
  const page = () => {
    const r = rig();
    r.call('zero:corner-tag', { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: r.clock() - 60_000 }], working: 3 });
    r.call('corner-tag:ready', { part: 'tag' });
    // the page draws the glass from the scale it is handed and reports the
    // window: the glass plus the band on every side
    const draw = () => {
      const glass = Math.round(28 * r.scaleSent());
      r.call('corner-tag:size', { part: 'tag', width: Math.round(glass * 3.9) + 2 * BAND, height: glass + 2 * BAND, glass: { x: BAND, y: BAND, width: Math.round(glass * 3.9), height: glass } });
      return glass;
    };
    draw();
    return { r, draw, glass: () => r.win().bounds.height - 2 * BAND };
  };

  it('follows the cursor one pixel for one, and the glass stays its size', () => {
    const { r, draw, glass } = page();
    const was = glass();
    const b = r.win().bounds;
    const grab = { x: b.x + b.width - 2, y: b.y + b.height - 2 };
    r.cursor.x = grab.x; r.cursor.y = grab.y;
    r.call('corner-tag:press', { x: grab.x, y: grab.y, grip: true, corner: 'br' });
    r.cursor.x = grab.x - 28; r.cursor.y = grab.y - 28;
    r.advance(16);
    draw();
    expect(glass()).toBe(was);
    expect(r.win().bounds.x).toBe(b.x - 28);
    expect(r.win().bounds.y).toBe(b.y - 28);
    r.call('corner-tag:release', { cancelled: false });
  });

  it('keeps the window exactly the glass plus the band, so nothing is clipped', () => {
    const { r, draw } = page();
    const b = r.win().bounds;
    const grab = { x: b.x + b.width - 2, y: b.y + b.height - 2 };
    r.cursor.x = grab.x; r.cursor.y = grab.y;
    r.call('corner-tag:press', { x: grab.x, y: grab.y, grip: true, corner: 'br' });
    const drawnGlass = Math.round(28 * r.scaleSent());
    for (const dy of [6, 14, 24, 40, 24, 10]) {
      r.cursor.y = grab.y - dy;
      r.advance(16);
      expect(Math.round(28 * r.scaleSent())).toBe(drawnGlass);
      draw();
      expect(r.win().bounds.height).toBe(drawnGlass + 2 * BAND);
    }
    r.call('corner-tag:release', { cancelled: false });
  });
});

describe('the Size steps in the list', () => {
  const open = () => {
    const r = rig();
    r.show();
    r.call('corner-tag:ready', { part: 'card' });
    r.call('corner-tag:size', { part: 'card', width: 340, height: 170 });
    return r;
  };

  it('steps the tray one notch at a time, and remembers it', () => {
    const r = open();
    const before = r.scaleSent();
    r.call('corner-tag:resize', { by: 1 });
    expect(r.scaleSent()).toBeGreaterThan(before);
    r.redraw();
    r.call('corner-tag:resize', { by: -1 });
    r.call('corner-tag:resize', { by: -1 });
    expect(r.scaleSent()).toBeLessThan(before);
    expect(r.saved.filter((p) => 'cornerTagZoom' in p).length).toBe(3);
  });

  it('leaves the tag in plain sight: the list never lands on top of it', () => {
    const r = open();
    const covers = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    for (let i = 0; i < 6; i++) {
      r.call('corner-tag:resize', { by: 1 });
      r.redraw();
      const card = r.win('card')?.bounds;
      if (card) expect(covers(card, r.win().bounds)).toBe(false);
    }
  });
});
