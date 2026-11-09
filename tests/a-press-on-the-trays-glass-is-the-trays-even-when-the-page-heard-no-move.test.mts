// A PRESS ON THE TRAY'S GLASS IS THE TRAY'S, EVEN WHEN THE PAGE HEARD NO MOVE
// (2026-11-08, w-4523d1dab3: "having trouble dragging this, a bit buggy").
//
// The tray's window is the glass plus a clear band, and a click in the band is
// let through to whatever is underneath. The window was only told to take
// clicks again when the page saw the pointer move back onto the glass. While
// a window lets clicks through, Electron forwards it pointer moves on macOS
// only when it is the focused window, which the tray almost never is, and on
// Linux never. So once the pointer crossed the band, a press on the glass went
// straight through to the Dock or the app beneath, and nothing dragged.
// Measured against the real controller with a pretend window and cursor: with
// the cursor on the glass and no word from the page, the window kept ignoring
// the mouse for as long as the test waited. Now the main process reads the
// real cursor while the tray is up and lets the glass take the press.
import { describe, expect, it } from 'vitest';
import { createCornerTag, AIM_EVERY_MS, AIM_NEAR_PX } from '../main/corner-tag.mts';

const AREA = { x: 0, y: 0, width: 1728, height: 1080 };
const BAND = 10;

function rig() {
  const handlers = {};
  const timers = [];
  let timerId = 0;
  let clock = 1_000_000;
  const windows = [];
  const ignores = [];
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
    setIgnoreMouseEvents(ignore, opts) { this.ignoring = ignore; ignores.push({ ignore, opts }); }
  }
  const cursor = { x: 5, y: 5 };
  let cursorReads = 0;
  const screen = {
    getAllDisplays: () => [{ workArea: AREA }], getDisplayMatching: () => ({ workArea: AREA }),
    getCursorScreenPoint: () => { cursorReads++; return { x: cursor.x, y: cursor.y }; },
    on: () => {}, removeListener: () => {},
  };
  const main = {
    focused: false, on: () => {}, isDestroyed: () => false, isFocused() { return this.focused; }, isMinimized: () => false,
    show: () => {}, focus: () => {}, restore: () => {}, webContents: { send: () => {} },
  };
  const api = createCornerTag({
    BrowserWindow: FakeWindow, screen, ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, removeHandler: () => {} },
    powerMonitor: { on: () => {}, removeListener: () => {} },
    Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
    config: {}, saveConfig: () => {}, mainWindow: main,
    load: (w, part) => { w.part = part; }, preload: '/p.cjs', now: () => clock,
    setTimer: (fn, ms) => { const id = ++timerId; timers.push({ id, fn, at: clock + ms }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    mac: true,
  });
  const call = (ch, p) => handlers[ch](null, p);
  const advance = (ms) => {
    if (!(ms > 0)) throw new Error(`advance needs a time, got ${ms}`);
    const target = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift(); clock = next.at; next.fn();
    }
    clock = target;
  };
  const win = () => windows.filter((w) => w.part === 'tag').at(-1);
  call('zero:corner-tag', { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready', since: clock - 60_000 }], working: 0 });
  call('corner-tag:ready', { part: 'tag' });
  call('corner-tag:size', { part: 'tag', width: 120 + 2 * BAND, height: 31 + 2 * BAND, glass: { x: BAND, y: BAND, width: 120, height: 31 } });
  const glass = () => { const b = win().bounds; return { x: b.x + BAND, y: b.y + BAND, width: b.width - 2 * BAND, height: b.height - 2 * BAND }; };
  // The pointer crosses the band on its way in: the page hears that move.
  const crossBand = () => {
    const g = glass();
    cursor.x = g.x + 20; cursor.y = g.y - BAND / 2;
    call('corner-tag:clickable', { on: false });
  };
  return { call, advance, win, cursor, glass, ignores, main, crossBand, api, reads: () => cursorReads };
}

describe('a press on the glass after the pointer crossed the band', () => {
  it('lands on the tray though the page never heard the pointer arrive', () => {
    const r = rig();
    r.crossBand();
    expect(r.win().ignoring).toBe(true);
    const g = r.glass();
    r.cursor.x = g.x + 40; r.cursor.y = g.y + 15;
    r.advance(AIM_EVERY_MS);
    expect(r.win().ignoring).toBe(false);
  });

  it('takes it from the glass edge in, and not from a point outside it', () => {
    const r = rig();
    r.crossBand();
    const g = r.glass();
    r.cursor.x = g.x - 1; r.cursor.y = g.y + 15;
    r.advance(AIM_EVERY_MS * 3);
    expect(r.win().ignoring).toBe(true);
    r.cursor.x = g.x; r.cursor.y = g.y;
    r.advance(AIM_EVERY_MS);
    expect(r.win().ignoring).toBe(false);
    // Taking clicks again, the window hears the pointer go back into the band.
    r.cursor.x = g.x + g.width; r.cursor.y = g.y + 15;
    r.call('corner-tag:clickable', { on: false });
    r.advance(AIM_EVERY_MS * 3);
    expect(r.win().ignoring).toBe(true);
    r.cursor.x = g.x + g.width - 1;
    r.advance(AIM_EVERY_MS);
    expect(r.win().ignoring).toBe(false);
  });

  it('still lets a click in the band through to what is underneath', () => {
    const r = rig();
    r.crossBand();
    r.advance(AIM_EVERY_MS * 50);
    expect(r.win().ignoring).toBe(true);
  });

  it('then drags, wherever the cursor goes', () => {
    const r = rig();
    r.crossBand();
    const g = r.glass();
    r.cursor.x = g.x + 40; r.cursor.y = g.y + 15;
    r.advance(AIM_EVERY_MS);
    const was = { ...r.win().bounds };
    r.call('corner-tag:press', { x: r.cursor.x, y: r.cursor.y });
    r.cursor.x -= 200; r.cursor.y -= 150;
    r.advance(AIM_EVERY_MS * 10);
    expect(r.win().ignoring).toBe(false);
    r.call('corner-tag:release', { cancelled: false });
    expect(r.win().bounds.x).toBe(was.x - 200);
    expect(r.win().bounds.y).toBe(was.y - 150);
  });
});

describe('the cursor is read only while the pointer is near and the tray lets clicks through', () => {
  it('reads nothing before the pointer has come near', () => {
    const r = rig();
    r.advance(10_000);
    expect(r.reads()).toBe(0);
  });

  it('takes clicks again and stops reading once the pointer goes far off', () => {
    const r = rig();
    r.crossBand();
    const g = r.glass();
    r.cursor.x = g.x - AIM_NEAR_PX; r.cursor.y = g.y + 15;
    r.advance(AIM_EVERY_MS * 3);
    expect(r.win().ignoring).toBe(true);
    r.cursor.x = g.x - AIM_NEAR_PX - 1;
    r.advance(AIM_EVERY_MS);
    expect(r.win().ignoring).toBe(false);
    const before = r.reads();
    r.advance(10_000);
    expect(r.reads()).toBe(before);
  });

  it('stops while the app is in front and the tray is hidden', () => {
    const r = rig();
    r.crossBand();
    r.main.focused = true;
    r.api.refresh();
    expect(r.win().visible).toBe(false);
    r.advance(AIM_EVERY_MS);
    const before = r.reads();
    r.advance(10_000);
    expect(r.reads()).toBe(before);
  });

  it('picks up again when the tray comes back still letting clicks through', () => {
    const r = rig();
    r.crossBand();
    r.main.focused = true;
    r.api.refresh();
    r.main.focused = false;
    const g = r.glass();
    r.cursor.x = g.x + 40; r.cursor.y = g.y + 15;
    r.api.refresh();
    expect(r.win().visible).toBe(true);
    r.advance(AIM_EVERY_MS);
    expect(r.win().ignoring).toBe(false);
  });
});
