// RESIZING THE AGENT TRAY, 2026-10-13, second attempt.
//
// The first had one small ledge in the bottom-left corner: "there was no way to
// discover that it was actually expandable... I'm not a fan of that UI". Now
// every corner takes a drag. And it has to be smooth: "as I scaled it, I
// noticed that sometimes the corner visually gets cut off. The dots don't even
// look right and there are a lot of little quirks with it."
//
// The cut-off corner was the window lagging the page. The page redraws at the
// new size and reports it a frame later; until that report the window is still
// the old rectangle, and a tag drawn larger than its window has its corners
// clipped. So a growing drag widens the window BEFORE the page is told, and a
// shrinking one waits for the page. That is what most of this file measures,
// by driving the real controller with a pretend screen, windows and cursor.
import { describe, expect, it } from 'vitest';
import { createCornerTag } from '../main/corner-tag.mjs';
import { EDGE_SLACK, GRIPS, TAG_LIMITS, cardScale, heightFromDrag, tagHeight, tagZoom } from '../shared/corner-tag.mjs';

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

// Hold a corner and move the cursor, redrawing the page as a browser would,
// and report every rectangle the window was given along the way.
function dragCorner(r, corner, steps) {
  const b = r.win().bounds;
  const grab = {
    x: corner.endsWith('r') ? b.x + b.width - 2 : b.x + 2,
    y: corner.startsWith('b') ? b.y + b.height - 2 : b.y + 2,
  };
  r.cursor.x = grab.x; r.cursor.y = grab.y;
  r.call('corner-tag:press', { x: grab.x, y: grab.y, grip: true, corner });
  const frames = [];
  for (const [dx, dy] of steps) {
    r.cursor.x = grab.x + dx; r.cursor.y = grab.y + dy;
    r.advance(16);
    const drawn = { width: Math.round(28 * r.scaleSent() * 3.9), height: Math.round(28 * r.scaleSent()) };
    frames.push({ window: { ...r.win().bounds }, drawn });
    r.redraw();
  }
  r.call('corner-tag:release', { cancelled: false });
  return frames;
}

describe('every corner resizes it', () => {
  it('grows when the corner is dragged away from the tag, from any of the four', () => {
    for (const corner of GRIPS) {
      const r = rig();
      r.show();
      const was = r.win().bounds.height;
      const out = corner.startsWith('b') ? 60 : -60;
      dragCorner(r, corner, [[0, out / 3], [0, out]]);
      expect(r.win().bounds.height).toBeGreaterThan(was);
    }
  });

  it('shrinks when it is dragged into the tag, from any of the four', () => {
    for (const corner of GRIPS) {
      const r = rig({ config: { cornerTagZoom: 1.6 } });
      r.show();
      const was = r.win().bounds.height;
      const inward = corner.startsWith('b') ? -20 : 20;
      dragCorner(r, corner, [[0, inward]]);
      expect(r.win().bounds.height).toBeLessThan(was);
    }
  });

  it('never draws the tag larger than the window it is in, which is what cut the corners off', () => {
    for (const corner of GRIPS) {
      const r = rig();
      r.show();
      const out = corner.startsWith('b') ? 1 : -1;
      const steps = [4, 9, 15, 22, 30, 40, 22, 9, 30, 50].map((n) => [n * (corner.endsWith('r') ? 1 : -1), n * out]);
      for (const frame of dragCorner(r, corner, steps)) {
        expect(frame.window.width).toBeGreaterThanOrEqual(frame.drawn.width);
        expect(frame.window.height).toBeGreaterThanOrEqual(frame.drawn.height);
      }
    }
  });

  it('holds the corner opposite the one she has hold of exactly still', () => {
    for (const corner of GRIPS) {
      const r = rig();
      r.show();
      const b = r.win().bounds;
      const anchor = {
        x: corner.endsWith('r') ? b.x : b.x + b.width,
        y: corner.startsWith('b') ? b.y : b.y + b.height,
      };
      const steps = [[10, 10], [24, 24], [40, 40]].map(([dx, dy]) => [corner.endsWith('r') ? dx : -dx, corner.startsWith('b') ? dy : -dy]);
      for (const frame of dragCorner(r, corner, steps)) {
        const w = frame.window;
        expect(corner.endsWith('r') ? w.x : w.x + w.width).toBe(anchor.x);
        expect(corner.startsWith('b') ? w.y : w.y + w.height).toBe(anchor.y);
      }
    }
  });

  it('stays on its screen, and keeps its corner, once she lets go', () => {
    const r = rig();
    r.show();
    dragCorner(r, 'br', [[40, 40], [80, 80]]);
    const b = r.win().bounds;
    // it may hang off by the tuck she asked for, and never by more
    expect(b.x).toBeGreaterThanOrEqual(AREA.x - EDGE_SLACK);
    expect(b.y).toBeGreaterThanOrEqual(AREA.y - EDGE_SLACK);
    expect(b.x + b.width).toBeLessThanOrEqual(AREA.x + AREA.width + EDGE_SLACK);
    expect(b.y + b.height).toBeLessThanOrEqual(AREA.y + AREA.height + EDGE_SLACK);
    expect(r.config.cornerTagPlace?.corner).toBe('br');
  });

  it('remembers the size as a multiple, once, when she lets go', () => {
    const r = rig();
    r.show();
    dragCorner(r, 'br', [[0, 30]]);
    const zooms = r.saved.filter((p) => 'cornerTagZoom' in p);
    expect(zooms).toHaveLength(1);
    expect(zooms[0].cornerTagZoom).toBeGreaterThan(1);
    expect(zooms[0].cornerTagZoom).toBe(tagZoom(zooms[0].cornerTagZoom));
  });

  it('writes nothing, and opens nothing, when a corner is pressed and let go', () => {
    const r = rig();
    r.show();
    const b = r.win().bounds;
    r.cursor.x = b.x + b.width - 2; r.cursor.y = b.y + b.height - 2;
    r.call('corner-tag:press', { x: r.cursor.x, y: r.cursor.y, grip: true, corner: 'br' });
    r.advance(16);
    r.call('corner-tag:release', { cancelled: false });
    expect(r.saved.filter((p) => 'cornerTagZoom' in p)).toHaveLength(0);
    expect(r.win().bounds.height).toBe(Math.round(28 * tagHeight(AREA.width) / 28));
  });

  it('stays a tag however far the corner is dragged', () => {
    const r = rig();
    r.show();
    dragCorner(r, 'br', [[0, 400], [0, 900]]);
    expect(r.win().bounds.height).toBeLessThanOrEqual(TAG_LIMITS.max);
    const small = rig();
    small.show();
    dragCorner(small, 'br', [[0, -400]]);
    expect(small.win().bounds.height).toBeGreaterThanOrEqual(TAG_LIMITS.min);
  });
});

describe('which way a corner means bigger', () => {
  it('follows the corner she has hold of, not the screen', () => {
    expect(heightFromDrag('br', 31, 0, 20)).toBe(51);
    expect(heightFromDrag('tr', 31, 0, -20)).toBe(51);
    expect(heightFromDrag('bl', 31, -20, 0)).toBe(38);
    expect(heightFromDrag('tl', 31, -20, -20)).toBe(58);
    expect(heightFromDrag('br', 31, 0, -20)).toBe(11);
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
  // The window is the glass plus a band, so the arrows can hang over its
  // corners. A transparent window floating over somebody's work must not eat
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
  // SHE FOUND THIS IN THE RUNNING APP: "it kind of jumps and when I try to
  // expand it, it jumps to about three times its size." The band made the
  // window taller than the glass, and the resize still measured the window:
  // a 31px tag reported 51, so the first pull of the cursor already asked for
  // two thirds more than it had. Everything the drag works from is the glass.
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

  it('follows the cursor one pixel for one, with no jump on the first move', () => {
    const { r, draw, glass } = page();
    const was = glass();
    const b = r.win().bounds;
    const grab = { x: b.x + b.width - 2, y: b.y + b.height - 2 };
    r.cursor.x = grab.x; r.cursor.y = grab.y;
    r.call('corner-tag:press', { x: grab.x, y: grab.y, grip: true, corner: 'br' });
    // the first move past the drag threshold: a few pixels, not a leap
    r.cursor.y = grab.y + 8;
    r.advance(16);
    draw();
    expect(glass()).toBeGreaterThanOrEqual(was);
    expect(glass() - was).toBeLessThanOrEqual(10);
    // and twenty more pixels is twenty more points of tag
    r.cursor.y = grab.y + 28;
    r.advance(16);
    draw();
    expect(Math.abs(glass() - (was + 28))).toBeLessThanOrEqual(2);
    r.call('corner-tag:release', { cancelled: false });
  });

  it('keeps the window exactly the glass plus the band, so nothing is clipped', () => {
    const { r, draw } = page();
    const b = r.win().bounds;
    const grab = { x: b.x + b.width - 2, y: b.y + b.height - 2 };
    r.cursor.x = grab.x; r.cursor.y = grab.y;
    r.call('corner-tag:press', { x: grab.x, y: grab.y, grip: true, corner: 'br' });
    for (const dy of [6, 14, 24, 40, 24, 10]) {
      r.cursor.y = grab.y + dy;
      r.advance(16);
      const drawnGlass = Math.round(28 * r.scaleSent());
      expect(r.win().bounds.height).toBeGreaterThanOrEqual(drawnGlass + 2 * BAND);
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
