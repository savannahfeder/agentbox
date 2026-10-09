// THE CORNER TAG'S WINDOWS (w-dafae58a23). The rules in shared/corner-tag.mjs
// are only half of it; this pins the live half in main/corner-tag.mjs against
// pretend windows and a pretend screen. What broke without it: nothing outside
// the app said an agent was waiting, so agents sat idle. What it must not
// become: a nag you close once and never see again, a window that steals the
// keyboard or the clicks meant for the app beneath it, a list that opens every
// time the pointer crosses the corner, or a tag that forgets where you put it.
//
// Measured by driving the controller exactly as the app does: the app's page
// hands over what is ready, the app's window gains and loses focus and closes,
// and the tag's pages say they are ready, sized, pointed at, clicked, dragged.
// The cases added after a real-Electron run and a review by Codex are the ones
// about the list's own window, click-through, hiding while open, reloads,
// waking from sleep and the app's window closing.
import { describe, expect, it } from 'vitest';
import { createCornerTag, PAD, CLOSE_AFTER_MS } from '../main/corner-tag.mjs';

function rig({ config = {}, focused = false, at = 1_000_000 } = {}) {
  const handlers = {};
  const removed = [];
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; }, removeHandler: (ch) => removed.push(ch) };
  const timers = [];
  let timerId = 0;
  let clock = at;
  const windows = [];
  class FakeWindow {
    constructor(opts) {
      this.opts = opts; this.bounds = null; this.visible = false; this.destroyed = false; this.sent = []; this.ignore = [];
      this.listeners = {}; this.wcListeners = {};
      this.webContents = {
        send: (ch, p) => this.sent.push([ch, p]),
        on: (ev, fn) => { this.wcListeners[ev] = fn; },
      };
      windows.push(this);
    }
    setAlwaysOnTop(on, level) { this.top = [on, level]; }
    setVisibleOnAllWorkspaces(on, o) { this.everywhere = [on, o]; }
    setIgnoreMouseEvents(on, o) { this.ignore.push([on, o]); }
    on(ev, fn) { this.listeners[ev] = fn; }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.visible = false; }
    isVisible() { return this.visible; }
    hide() { this.visible = false; }
    showInactive() { this.visible = true; }
    setBounds(b) { this.bounds = b; }
    getBounds() { return this.bounds; }
    setPosition(x, y) { this.bounds = { ...this.bounds, x, y }; }
  }
  const area = { x: 0, y: 0, width: 1728, height: 1080 };
  const screenListeners = {};
  // Where the real cursor is; unknown unless a test puts it somewhere.
  const cursor = { x: null, y: null };
  const screen = {
    getAllDisplays: () => [{ workArea: area }], getDisplayMatching: () => ({ workArea: area }),
    getCursorScreenPoint: () => (cursor.x == null ? null : { x: cursor.x, y: cursor.y }),
    on: (ev, fn) => { screenListeners[ev] = fn; }, removeListener: () => {},
  };
  const power = {};
  const powerMonitor = { on: (ev, fn) => { power[ev] = fn; }, removeListener: () => {} };
  const mainListeners = {};
  const main = {
    focused, sent: [], shown: 0, destroyed: false,
    isDestroyed() { return this.destroyed; }, isFocused() { return this.focused; }, isMinimized: () => false,
    restore() {}, show() { this.shown++; }, focus() { this.focused = true; },
    on(ev, fn) { mainListeners[ev] = fn; },
    webContents: { send: (ch, p) => main.sent.push([ch, p]) },
  };
  const saved = [];
  const loads = [];
  const saveConfig = (c, patch) => { Object.assign(c, patch); saved.push(patch); };
  const tag = createCornerTag({
    BrowserWindow: FakeWindow, screen, ipcMain, powerMonitor,
    Menu: { buildFromTemplate: (t) => ({ popup: () => { tag.menu = t; } }) },
    config, saveConfig, mainWindow: main, load: (w, part) => { w.part = part; loads.push(part); }, preload: '/p.cjs',
    now: () => clock,
    setTimer: (fn, ms) => { const id = ++timerId; timers.push({ id, fn, at: clock + ms }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    mac: true,
  });
  const call = (ch, p) => handlers[ch](null, p);
  // Real time, in order: every timer due before the target fires at its own
  // moment, including ones scheduled by timers that fired along the way.
  const advance = (ms) => {
    const target = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      clock = next.at;
      next.fn();
    }
    clock = target;
  };
  // The cursor moves at a given moment of a pretend timeline.
  const later = (ms, fn) => { advance(ms); fn(); };
  const win = (part = 'tag') => windows.filter((w) => w.part === part).at(-1);
  // The app hands over two ready, and the tag's page loads and measures itself.
  const showTag = (state = READY, size = { width: 140, height: 26 }) => {
    call('zero:corner-tag', state);
    call('corner-tag:ready', { part: 'tag' });
    call('corner-tag:size', { part: 'tag', ...size });
  };
  const openList = (size = { width: 360, height: 110 }) => {
    call('corner-tag:toggle');
    call('corner-tag:ready', { part: 'card' });
    call('corner-tag:size', { part: 'card', ...size });
  };
  const pendingTimers = () => timers.length;
  return { tag, call, windows, win, main, mainListeners, config, saved, advance, later, showTag, openList, removed, loads, screenListeners, power, area, cursor, pendingTimers };
}

const READY = { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: 1 }], working: 18 };

describe('it shows up when something needs you, and only then', () => {
  it('appears once its page is ready, when an agent is ready and you are in another app', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    expect(r.win().visible).toBe(false);
    r.call('corner-tag:ready', { part: 'tag' });
    expect(r.win().visible).toBe(true);
    expect(r.win().sent.at(-1)[0]).toBe('corner-tag:state');
    expect(r.win().sent.at(-1)[1].ready).toHaveLength(1);
  });

  it('never takes the keyboard, floats over full-screen apps and takes a first click', () => {
    const r = rig();
    r.showTag();
    const o = r.win().opts;
    expect(o.focusable).toBe(false);
    expect(o.type).toBe('panel');
    expect(o.acceptFirstMouse).toBe(true);
    expect(r.win().top).toEqual([true, 'floating']);
    expect(r.win().everywhere[1]).toMatchObject({ visibleOnFullScreen: true, skipTransformProcessType: true });
  });

  it('lets clicks fall through its empty margin until the pointer is over the tag', () => {
    const r = rig();
    r.showTag();
    expect(r.win().ignore[0]).toEqual([true, { forward: true }]);
    r.call('corner-tag:solid', { part: 'tag', solid: true });
    expect(r.win().ignore.at(-1)).toEqual([false, undefined]);
    r.call('corner-tag:solid', { part: 'tag', solid: false });
    expect(r.win().ignore.at(-1)).toEqual([true, { forward: true }]);
  });

  it('stays away while nothing is running', () => {
    const r = rig();
    r.call('zero:corner-tag', { ready: [], working: 0 });
    expect(r.windows).toHaveLength(0);
  });

  it('steps aside while you are in the app, and comes back when you leave it', () => {
    const r = rig({ focused: true });
    r.call('zero:corner-tag', READY);
    expect(r.windows).toHaveLength(0);
    r.main.focused = false;
    r.mainListeners.blur();
    r.call('corner-tag:ready', { part: 'tag' });
    expect(r.win().visible).toBe(true);
    r.main.focused = true;
    r.mainListeners.focus();
    expect(r.win().visible).toBe(false);
  });

  it('waits for a reloaded page before it sends anything or shows', () => {
    const r = rig();
    r.showTag();
    r.win().wcListeners['did-start-loading']();
    expect(r.win().visible).toBe(false);
    const before = r.win().sent.length;
    r.call('zero:corner-tag', READY);
    expect(r.win().sent.length).toBe(before);
    expect(r.win().visible).toBe(false);
    r.call('corner-tag:ready', { part: 'tag' });
    expect(r.win().visible).toBe(true);
  });
});

describe('nothing is left half-done (found by Codex, second review)', () => {
  it('a page reloaded in the middle of a drag does not leave the tag refusing clicks', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:drag-start');
    const before = r.win().ignore.length;
    r.win().wcListeners['did-start-loading']();
    expect(r.win().ignore.slice(before)).toContainEqual([true, { forward: true }]);
    r.call('corner-tag:ready', { part: 'tag' });
    r.call('corner-tag:toggle');
    expect(r.win('card')).toBeDefined();
  });

  it('a click that arrives as the tag hides does not open the list on its own', () => {
    const r = rig();
    r.showTag();
    r.main.focused = true;
    r.mainListeners.focus();
    r.call('corner-tag:toggle');
    expect(r.win('card')).toBeUndefined();
    r.config.cornerTag = false;
    r.main.focused = false;
    r.call('corner-tag:toggle');
    expect(r.win('card')).toBeUndefined();
  });

  it('the list opening for the first time is not mistaken for a reload', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:toggle');
    r.win('card').wcListeners['did-start-loading']();
    r.call('corner-tag:ready', { part: 'card' });
    r.call('corner-tag:size', { part: 'card', width: 360, height: 110 });
    expect(r.win('card').visible).toBe(true);
  });

  it('a list that has been shut stops catching clicks', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.call('corner-tag:solid', { part: 'card', solid: true });
    r.call('corner-tag:toggle');
    expect(r.win('card').ignore.at(-1)).toEqual([true, { forward: true }]);
  });

  it('notices the pointer has gone even when the page never said so', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.call('corner-tag:solid', { part: 'tag', solid: true });
    r.call('corner-tag:hover', { part: 'tag', inside: true });
    r.cursor.x = 10; r.cursor.y = 10;
    r.advance(300);
    r.advance(CLOSE_AFTER_MS + 50);
    expect(r.win('card').visible).toBe(false);
    expect(r.win().ignore.at(-1)).toEqual([true, { forward: true }]);
  });

  it('keeps the list open while the pointer really is on it, whatever the page said', () => {
    const r = rig();
    r.showTag();
    r.openList();
    const c = r.win('card').bounds;
    r.cursor.x = c.x + PAD + 20; r.cursor.y = c.y + PAD + 20;
    r.call('corner-tag:hover', { part: 'card', inside: false });
    r.advance(300);
    r.advance(CLOSE_AFTER_MS + 300);
    expect(r.win('card').visible).toBe(true);
  });
});

describe('the real cursor has the last word (found by Codex, third review)', () => {
  const inCard = (r) => { const c = r.win('card').bounds; r.cursor.x = c.x + PAD + 20; r.cursor.y = c.y + PAD + 20; };
  const away = (r) => { r.cursor.x = 10; r.cursor.y = 10; };

  it('does not shut the list under a pointer that came back without the page noticing', () => {
    const r = rig();
    r.showTag();
    r.openList();
    away(r);
    r.call('corner-tag:hover', { part: 'tag', inside: false });
    r.later(CLOSE_AFTER_MS - 40, () => inCard(r));
    r.advance(100);
    expect(r.win('card').visible).toBe(true);
  });

  it('shuts a list opened by a click whose pointer had already left, and stops checking after', () => {
    const r = rig();
    r.showTag();
    away(r);
    r.call('corner-tag:hover', { part: 'tag', inside: false });
    r.openList();
    r.advance(5000);
    expect(r.win('card').visible).toBe(false);
    expect(r.pendingTimers()).toBe(0);
  });

  it('takes clicks on the list when the pointer is on it, even if the page missed it arriving', () => {
    const r = rig();
    r.showTag();
    r.openList();
    inCard(r);
    r.advance(250);
    expect(r.win('card').ignore.at(-1)).toEqual([false, undefined]);
    expect(r.win('card').visible).toBe(true);
  });

  it('checks nothing while nothing depends on the pointer', () => {
    const r = rig();
    r.showTag();
    r.advance(10_000);
    expect(r.pendingTimers()).toBe(0);
  });
});

describe('the list opens on a click, not on a pass', () => {
  it('a pointer resting on the tag does not open the list', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:hover', { part: 'tag', inside: true });
    expect(r.win('card')).toBeUndefined();
  });

  it('a click opens it in its own window, up and to the left, and the tag does not move', () => {
    const r = rig();
    r.showTag();
    const before = { ...r.win().bounds };
    r.openList();
    const card = r.win('card');
    expect(card.visible).toBe(true);
    expect(card.opts.focusable).toBe(false);
    expect(r.win().bounds).toEqual(before);
    const tagRight = before.x + before.width - PAD;
    expect(card.bounds.x + card.bounds.width - PAD).toBe(tagRight);
    expect(card.bounds.y + card.bounds.height - PAD).toBe(before.y + PAD - 8);
    expect(r.win().sent).toContainEqual(['corner-tag:open', true]);
  });

  it('a second click shuts it', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.call('corner-tag:toggle');
    expect(r.win('card').visible).toBe(false);
  });

  it('stays open while the pointer crosses from the tag to the list, and shuts once it has left both', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.call('corner-tag:hover', { part: 'tag', inside: false });
    r.advance(100);
    r.call('corner-tag:hover', { part: 'card', inside: true });
    r.advance(CLOSE_AFTER_MS + 50);
    expect(r.win('card').visible).toBe(true);
    r.call('corner-tag:hover', { part: 'card', inside: false });
    r.advance(CLOSE_AFTER_MS - 50);
    expect(r.win('card').visible).toBe(true);
    r.advance(100);
    expect(r.win('card').visible).toBe(false);
  });

  it('follows the list as it grows or shrinks while open', () => {
    const r = rig();
    r.showTag();
    r.openList({ width: 360, height: 110 });
    const tagTop = r.win().bounds.y + PAD;
    r.call('corner-tag:size', { part: 'card', width: 360, height: 180 });
    expect(r.win('card').bounds.y + r.win('card').bounds.height - PAD).toBe(tagTop - 8);
  });

  it('comes back shut after it was hidden with the list open', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.main.focused = true;
    r.mainListeners.focus();
    expect(r.win('card').visible).toBe(false);
    expect(r.win().sent.map((s) => s[0])).toContain('corner-tag:reset');
    r.main.focused = false;
    r.mainListeners.blur();
    expect(r.win().visible).toBe(true);
    expect(r.win('card').visible).toBe(false);
  });
});

describe('hiding it for a while', () => {
  it('hides for 30 minutes, remembers it, and comes back on its own', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:hide', '30m');
    expect(r.win().visible).toBe(false);
    expect(r.config.cornerTagHiddenUntil).toBe(1_000_000 + 30 * 60_000);
    r.advance(29 * 60_000);
    expect(r.win().visible).toBe(false);
    r.advance(2 * 60_000);
    expect(r.win().visible).toBe(true);
  });

  it('stays hidden across a restart until the hide runs out', () => {
    const r = rig({ config: { cornerTagHiddenUntil: 1_000_000 + 60_000 } });
    r.call('zero:corner-tag', READY);
    expect(r.windows).toHaveLength(0);
  });

  it('has no way to hide it for good from the tag', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:hide', 'forever');
    expect(r.win().visible).toBe(true);
    expect(r.saved).toHaveLength(0);
  });

  it('offers the hides and a way to Settings on right-click, and nothing that closes it for good', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:menu');
    const labels = r.tag.menu.filter((m) => m.label).map((m) => m.label);
    expect(labels).toEqual(['Hide for 5 minutes', 'Hide for 30 minutes', 'Hide for the rest of today', 'Turn off in Settings…']);
  });

  it('shows again after waking from sleep once a hide has run out meanwhile', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:hide', '5m');
    r.config.cornerTagHiddenUntil = 0;
    r.power.resume();
    expect(r.win().visible).toBe(true);
  });
});

describe('turning it off', () => {
  it('never shows once Settings turned it off', () => {
    const r = rig({ config: { cornerTag: false } });
    r.call('zero:corner-tag', READY);
    expect(r.windows).toHaveLength(0);
  });

  it('takes you to Settings from the tag', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:settings');
    expect(r.main.shown).toBe(1);
    expect(r.main.sent).toContainEqual(['zero:open-settings', { pane: 'general' }]);
  });
});

describe('opening what is ready', () => {
  it('brings the app forward on the thread you picked, and shuts the list', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.call('corner-tag:go', 'w-1');
    expect(r.main.shown).toBe(1);
    expect(r.main.sent).toContainEqual(['zero:open-item', { id: 'w-1' }]);
    expect(r.win('card').visible).toBe(false);
  });

  it('brings the app forward without a thread for a line with nowhere more exact to go', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:go', null);
    expect(r.main.shown).toBe(1);
    expect(r.main.sent.filter((s) => s[0] === 'zero:open-item')).toHaveLength(0);
  });
});

describe('the app window closing', () => {
  it('takes the tag and its list with it, so the app can quit', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.main.destroyed = true;
    r.mainListeners.closed();
    expect(r.win().destroyed).toBe(true);
    expect(r.win('card').destroyed).toBe(true);
    expect(r.removed).toContain('zero:corner-tag');
    r.call('zero:corner-tag', READY);
    expect(r.windows.filter((w) => !w.destroyed)).toHaveLength(0);
  });
});

describe('it goes where you put it', () => {
  it('rests in the bottom-right corner the first time', () => {
    const r = rig();
    r.showTag();
    expect(r.win().bounds).toEqual({ x: 1728 - 18 - 140 - PAD, y: 1080 - 18 - 26 - PAD, width: 140 + 2 * PAD, height: 26 + 2 * PAD });
  });

  it('follows a drag, shuts the list, takes the clicks while dragging, and is there again after a restart', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.call('corner-tag:drag-start');
    expect(r.win('card').visible).toBe(false);
    expect(r.win().ignore.at(-1)).toEqual([false, undefined]);
    r.call('corner-tag:solid', { part: 'tag', solid: false });
    expect(r.win().ignore.at(-1)).toEqual([false, undefined]);
    r.call('corner-tag:drag', { dx: -1000, dy: -600 });
    r.call('corner-tag:drag-end');
    const spot = r.config.cornerTagSpot;
    expect(spot).toEqual({ x: 1728 - 18 - 140 - 1000, y: 1080 - 18 - 26 - 600 });

    const again = rig({ config: { cornerTagSpot: spot } });
    again.showTag();
    expect(again.win().bounds.x).toBe(spot.x - PAD);
    expect(again.win().bounds.y).toBe(spot.y - PAD);
  });

  it('does not jump while dragging when its words change length', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:drag-start');
    r.call('corner-tag:drag', { dx: -50, dy: -50 });
    const mid = { ...r.win().bounds };
    r.call('corner-tag:size', { part: 'tag', width: 100, height: 26 });
    expect(r.win().bounds).toEqual(mid);
  });

  it('lands exactly where you left it after a restart, even near the right edge', () => {
    const spot = { x: 1500, y: 200 };
    const r = rig({ config: { cornerTagSpot: spot } });
    r.showTag();
    expect(r.win().bounds.x).toBe(spot.x - PAD);
    r.call('corner-tag:size', { part: 'tag', width: 100, height: 26 });
    expect(r.win().bounds.x).toBe(spot.x + 40 - PAD);
  });

  it('cannot be dragged off the screen', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:drag-start');
    r.call('corner-tag:drag', { dx: 900, dy: 900 });
    r.call('corner-tag:drag-end');
    expect(r.config.cornerTagSpot).toEqual({ x: 1728 - 140, y: 1080 - 26 });
  });

  it('is pulled back onto a screen when the one it was on changes, and shuts its list', () => {
    const r = rig();
    r.showTag();
    r.openList();
    r.area.width = 1200;
    r.area.height = 800;
    r.screenListeners['display-metrics-changed']();
    expect(r.win('card').visible).toBe(false);
    expect(r.win().bounds.x + r.win().bounds.width - PAD).toBeLessThanOrEqual(1200);
    expect(r.win().bounds.y + r.win().bounds.height - PAD).toBeLessThanOrEqual(800);
  });
});
