// 2026-10-13: "I think this should be right-aligned, meaning the component
// extends over the position of the agent tray... For the top-right corner, it
// is a little too far to the right. If I drag the component to the far
// top-left corner, it's perfectly aligned... It's just the right sides that
// seem to be improperly aligned."
//
// MEASURED IN HER PICTURE: the tag's glass ends at 910 device px and the list
// at 959, 49 device px (24.5 points) further right. The gap between the two,
// 15 device px, says the shot is 2x, and the glass's 53 device px of height
// says the tag was drawn at scale 0.95, whose clear band is only 9.5 points.
// So the drift is not the band: it is bigger than the band.
//
// The window can be WIDER than the page draws. A grip drag widens the window
// first and lets the page catch up (resizing-the-tray-from-any-corner-is-
// smooth), so the last guess of a drag outlives it: the glass is drawn at the
// left of a window with spare room on its right. Placing the list from the
// window's edge then pushes it past the glass on the right, while on the left
// the two edges still agree — exactly what she sees.
//
// So the page reports the GLASS's own rectangle inside its window, and the
// list is placed against that. Then it cannot matter how big the window is.
import { describe, expect, it } from 'vitest';
import { createCornerTag } from '../main/corner-tag.mjs';

const AREA = { x: 0, y: 0, width: 3413, height: 1920 };

function rig(config = {}) {
  const handlers = {}; const windows = []; const timers = []; let timerId = 0; let clock = 1e6;
  class FakeWindow {
    constructor() { this.bounds = null; this.visible = false; this.sent = []; this.webContents = { send: (ch, p) => this.sent.push([ch, p]), on: () => {} }; windows.push(this); }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} on() {} isDestroyed() { return false; }
    isVisible() { return this.visible; } hide() { this.visible = false; } showInactive() { this.visible = true; }
    setBounds(b) { this.bounds = b; } getBounds() { return this.bounds; } setPosition(x, y) { this.bounds = { ...this.bounds, x, y }; }
    setIgnoreMouseEvents() {}
  }
  const cursor = { x: 0, y: 0 };
  const screen = {
    getAllDisplays: () => [{ workArea: AREA }], getDisplayMatching: () => ({ workArea: AREA }),
    getCursorScreenPoint: () => cursor, on: () => {}, removeListener: () => {},
  };
  createCornerTag({
    BrowserWindow: FakeWindow, screen, ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, removeHandler: () => {} },
    powerMonitor: { on: () => {}, removeListener: () => {} },
    Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
    config, saveConfig: (c, patch) => Object.assign(c, patch),
    mainWindow: { isDestroyed: () => false, isFocused: () => false, isMinimized: () => false, on: () => {}, show: () => {}, focus: () => {}, restore: () => {}, webContents: { send: () => {} } },
    load: (w, part) => { w.part = part; }, preload: '/p.cjs', now: () => clock,
    setTimer: (fn, ms) => { const id = ++timerId; timers.push({ id, fn, at: clock + ms }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    mac: true,
  });
  const call = (ch, p) => handlers[ch](null, p);
  const advance = (ms) => { const target = clock + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const n = timers[0]; if (!n || n.at > target) break; timers.shift(); clock = n.at; n.fn(); } clock = target; };
  const win = (part) => windows.filter((w) => w.part === part).at(-1);
  return { call, advance, win, cursor };
}

/**
 * The tag parked in one corner, drawn with a band, inside a window `spare`
 * points wider and taller than the page needs. Returns the glass as drawn and
 * the list as placed.
 */
function openIn(corner, { spare = 0, band = 10 } = {}) {
  const r = rig({ cornerTag: true, cornerTagZoom: 1, cornerTagPlace: { corner, dx: 60, dy: 60 } });
  r.call('zero:corner-tag', { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: 0 }], working: 3 });
  r.call('corner-tag:ready', { part: 'tag' });
  const glass = { width: 260, height: 31 };
  r.call('corner-tag:size', {
    part: 'tag',
    width: glass.width + 2 * band + spare,
    height: glass.height + 2 * band + spare,
    glass: { x: band, y: band, width: glass.width, height: glass.height },
  });
  const tw = r.win('tag').bounds;
  r.cursor.x = tw.x + band + 2; r.cursor.y = tw.y + band + 2;
  r.call('corner-tag:hover', { part: 'tag', inside: true });
  r.advance(1000);
  r.call('corner-tag:ready', { part: 'card' });
  r.advance(10);
  r.call('corner-tag:size', { part: 'card', width: 420, height: 200 });
  const card = r.win('card').bounds;
  return { glass: { x: tw.x + band, y: tw.y + band, ...glass }, card, window: tw };
}

describe('the list opens against the glass', () => {
  it('lines its outer edge up with the tag, in every corner', () => {
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      const { glass, card } = openIn(corner);
      if (corner.endsWith('r')) expect([corner, card.x + card.width]).toEqual([corner, glass.x + glass.width]);
      else expect([corner, card.x]).toEqual([corner, glass.x]);
    }
  });

  it('still does when the window is wider than the page drew', () => {
    // what a grip drag leaves behind: the window grew first, the page never
    // reported again, and the glass sits at the left of a roomy window.
    for (const corner of ['tr', 'br']) {
      const { glass, card } = openIn(corner, { spare: 24 });
      expect([corner, card.x + card.width]).toEqual([corner, glass.x + glass.width]);
    }
    for (const corner of ['tl', 'bl']) {
      const { glass, card } = openIn(corner, { spare: 24 });
      expect([corner, card.x]).toEqual([corner, glass.x]);
    }
  });

  it('keeps the gap it leaves off the glass, not off the window', () => {
    const { glass, card } = openIn('br', { spare: 24 });
    expect(glass.y - (card.y + card.height)).toBe(8);
  });
});
