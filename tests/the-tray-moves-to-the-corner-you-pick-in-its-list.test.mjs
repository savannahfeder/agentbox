// THE TRAY COULD ONLY BE MOVED BY A DRAG NOBODY KNEW ABOUT (w-6da6d4ad24).
//
// QA reported the tray as a bug for sitting over another app's Get started
// button on 2026-10-25; it never occurred to the tester that it moves. Of the
// ways drawn to say so, the one picked was a Place button at the foot of the
// list that turns the list into the four corners of the screen, each big
// enough to press, because the corners drawn inside the button itself were
// "too small to click reasonably".
//
// Measured on the main process with fake windows: a corner picked from the
// list moves the tag's glass to that corner of the screen it is on, the usual
// gap in, remembers it the way a drag is remembered, and shuts the list.
import { describe, expect, it } from 'vitest';
import { createCornerTag } from '../main/corner-tag.mjs';
import { MARGIN } from '../shared/corner-tag.mjs';

const LAPTOP = { x: 0, y: 0, width: 1728, height: 1080 };
const BIG = { x: 1728, y: 0, width: 3413, height: 1920 };
const BAND = 10;
const GLASS = { width: 96, height: 31 };

function rig(config = {}, displays = [LAPTOP]) {
  const handlers = {}; const windows = []; const timers = []; let timerId = 0; let clock = 1e6;
  class FakeWindow {
    constructor() { this.bounds = null; this.visible = false; this.sent = []; this.webContents = { send: (ch, p) => this.sent.push([ch, p]), on: () => {} }; windows.push(this); }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} on() {} isDestroyed() { return false; }
    isVisible() { return this.visible; } hide() { this.visible = false; } showInactive() { this.visible = true; }
    setBounds(b) { this.bounds = b; } getBounds() { return this.bounds; } setPosition(x, y) { this.bounds = { ...this.bounds, x, y }; }
    setIgnoreMouseEvents() {}
  }
  const cursor = { x: 0, y: 0 };
  const inside = (r, a) => r.x + r.width / 2 >= a.x && r.x + r.width / 2 < a.x + a.width;
  const screen = {
    getAllDisplays: () => displays.map((workArea) => ({ workArea })),
    getDisplayMatching: (r) => ({ workArea: displays.find((a) => inside(r, a)) ?? displays[0] }),
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
  return { call, advance, win, cursor, config, handlers };
}

// The tray up with one thread waiting and its list open under the pointer.
function openList(config = {}, displays) {
  const r = rig({ cornerTag: true, cornerTagZoom: 1, ...config }, displays);
  r.call('zero:corner-tag', { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: 0 }], working: 3 });
  r.call('corner-tag:ready', { part: 'tag' });
  r.call('corner-tag:size', {
    part: 'tag', width: GLASS.width + 2 * BAND, height: GLASS.height + 2 * BAND,
    glass: { x: BAND, y: BAND, ...GLASS },
  });
  const tw = r.win('tag').bounds;
  r.cursor.x = tw.x + BAND + 2; r.cursor.y = tw.y + BAND + 2;
  r.call('corner-tag:hover', { part: 'tag', inside: true });
  r.advance(1000);
  r.call('corner-tag:ready', { part: 'card' });
  r.advance(10);
  r.call('corner-tag:size', { part: 'card', width: 320, height: 200 });
  const cb = r.win('card').bounds;
  r.cursor.x = cb.x + 20; r.cursor.y = cb.y + 20;
  r.call('corner-tag:hover', { part: 'card', inside: true });
  return r;
}
const glassOf = (r) => { const b = r.win('tag').bounds; return { x: b.x + BAND, y: b.y + BAND, ...GLASS }; };
const gaps = (g, a) => ({
  left: g.x - a.x, top: g.y - a.y,
  right: a.x + a.width - (g.x + g.width), bottom: a.y + a.height - (g.y + g.height),
});
const lastState = (r, part) => r.win(part).sent.filter(([ch]) => ch === 'corner-tag:state').at(-1)?.[1];

describe('picking a corner in the list', () => {
  it('moves the tray into that corner, the usual gap in from both edges', () => {
    const want = { tl: ['left', 'top'], tr: ['right', 'top'], bl: ['left', 'bottom'], br: ['right', 'bottom'] };
    for (const [corner, [side, end]] of Object.entries(want)) {
      const r = openList(corner === 'br' ? { cornerTagPlace: { corner: 'tl', dx: 40, dy: 40 } } : {});
      r.call('corner-tag:place', corner);
      const g = gaps(glassOf(r), LAPTOP);
      expect([corner, g[side], g[end]]).toEqual([corner, MARGIN, MARGIN]);
    }
  });

  it('remembers it the way a drag is remembered, so it is there after a restart', () => {
    const r = openList();
    r.call('corner-tag:place', 'tl');
    expect(r.config.cornerTagPlace).toEqual({ corner: 'tl', dx: MARGIN, dy: MARGIN });
    const b = r.win('tag').bounds;
    expect(r.config.cornerTagSpot).toEqual({ x: b.x, y: b.y });
  });

  it('shuts the list, which was left behind in the old corner', () => {
    const r = openList();
    expect(r.win('card').visible).toBe(true);
    r.call('corner-tag:place', 'tr');
    expect(r.win('card').visible).toBe(false);
    expect(r.win('tag').sent.filter(([ch]) => ch === 'corner-tag:open').at(-1)).toEqual(['corner-tag:open', false]);
    // the list hears it too, so it opens on its threads next time, not on the corners
    expect(r.win('card').sent.filter(([ch]) => ch === 'corner-tag:open').at(-1)).toEqual(['corner-tag:open', false]);
  });

  it('tells the list which corner the tray is in, before and after', () => {
    const r = openList();
    expect(lastState(r, 'card').corner).toBe('br');
    r.call('corner-tag:place', 'bl');
    expect(lastState(r, 'card').corner).toBe('bl');
  });

  it('takes a tray tucked past the edge back to the usual gap in the corner it is already in', () => {
    const r = openList({ cornerTagPlace: { corner: 'br', dx: -20, dy: 60 } });
    r.call('corner-tag:place', 'br');
    const g = gaps(glassOf(r), LAPTOP);
    expect([g.right, g.bottom]).toEqual([MARGIN, MARGIN]);
  });

  it('keeps it on the screen it is on, not the first screen', () => {
    const r = openList({ cornerTagPlace: { corner: 'br', dx: MARGIN, dy: MARGIN }, cornerTagSpot: { x: BIG.x + 900, y: 900 } }, [LAPTOP, BIG]);
    expect(glassOf(r).x).toBeGreaterThan(BIG.x);
    r.call('corner-tag:place', 'tl');
    expect(gaps(glassOf(r), BIG)).toMatchObject({ left: MARGIN, top: MARGIN });
  });
});

describe('what must not move it', () => {
  it('ignores anything that is not one of the four corners', () => {
    for (const odd of [undefined, null, '', 'middle', 'TL', { corner: 'tl' }]) {
      const r = openList();
      const before = { ...r.win('tag').bounds };
      const saved = r.config.cornerTagPlace;
      r.call('corner-tag:place', odd);
      expect(r.win('tag').bounds).toEqual(before);
      expect(r.config.cornerTagPlace).toBe(saved);
      expect(r.win('card').visible).toBe(true);
    }
  });
});
