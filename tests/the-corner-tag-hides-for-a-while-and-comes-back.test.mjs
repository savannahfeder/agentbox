// THE CORNER TAG'S WINDOWS (w-dafae58a23). The rules in shared/corner-tag.mjs
// are only half of it; this pins the live half in main/corner-tag.mjs against
// pretend windows, a pretend screen and a pretend cursor. What broke without
// it: nothing outside the app said an agent was waiting, so agents sat idle.
// What it must not become: a nag you close once and never see again, a tag
// that pulls the app forward when you touch it, a list that opens every time
// the pointer crosses the corner, or a tag that forgets where you put it.
//
// Measured by driving the controller exactly as the app does: the app's page
// hands over what is ready, the app's window gains and loses focus and closes,
// the tag's pages say they are ready, sized, pointed at, pressed and let go,
// and the cursor moves. The press-and-drag cases replaced the first version's
// page-driven drag after real mouse events (posted with CGEvent, 2026-10-08)
// showed a press on a window that could not take focus pulled the app's main
// window to the front, and the reworked version passed 12 of 12 real checks.
import { describe, expect, it } from 'vitest';
import { createCornerTag, CLOSE_AFTER_MS, DRAG_FROM_PX } from '../main/corner-tag.mjs';

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
      this.opts = opts; this.bounds = null; this.visible = false; this.destroyed = false; this.sent = [];
      this.listeners = {}; this.wcListeners = {};
      this.webContents = {
        send: (ch, p) => this.sent.push([ch, p]),
        on: (ev, fn) => { this.wcListeners[ev] = fn; },
      };
      windows.push(this);
    }
    setAlwaysOnTop(on, level) { this.top = [on, level]; }
    setVisibleOnAllWorkspaces(on, o) { this.everywhere = [on, o]; }
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
  const saveConfig = (c, patch) => { Object.assign(c, patch); saved.push(patch); };
  const tag = createCornerTag({
    BrowserWindow: FakeWindow, screen, ipcMain, powerMonitor,
    Menu: { buildFromTemplate: (t) => ({ popup: () => { tag.menu = t; } }) },
    config, saveConfig, mainWindow: main, load: (w, part) => { w.part = part; }, preload: '/p.cjs',
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
  const win = (part = 'tag') => windows.filter((w) => w.part === part).at(-1);
  // The app hands over what is ready, and the tag's page loads and measures itself.
  const showTag = (state = READY(clock), size = { width: 80, height: 26 }) => {
    call('zero:corner-tag', state);
    call('corner-tag:ready', { part: 'tag' });
    call('corner-tag:size', { part: 'tag', ...size });
  };
  const listUp = (size = { width: 300, height: 110 }) => {
    call('corner-tag:ready', { part: 'card' });
    call('corner-tag:size', { part: 'card', ...size });
  };
  // A press on the middle of the tag, the cursor moving by dx dy, and let go.
  const onTag = () => { const b = win().bounds; cursor.x = b.x + 30; cursor.y = b.y + 13; };
  const pressAndMove = (dx, dy) => {
    onTag();
    call('corner-tag:press');
    cursor.x += dx; cursor.y += dy;
    advance(32);
  };
  const click = () => { onTag(); call('corner-tag:press'); call('corner-tag:release', { cancelled: false }); };
  const pendingTimers = () => timers.length;
  return { tag, call, windows, win, main, mainListeners, config, saved, advance, showTag, listUp, click, pressAndMove, onTag, removed, screenListeners, power, area, cursor, pendingTimers, clock: () => clock };
}

const READY = (now) => ({ ready: [
  { id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: now - 60_000 },
  { id: 'w-old', title: 'Last week', says: 'is ready for you', since: now - 6 * 24 * 3600_000 },
], working: 18 });

describe('it shows up when something needs you, and only then', () => {
  it('appears once its page is ready, when something fresh is ready and you are in another app', () => {
    const r = rig();
    r.call('zero:corner-tag', READY(1_000_000));
    expect(r.win().visible).toBe(false);
    r.call('corner-tag:ready', { part: 'tag' });
    expect(r.win().visible).toBe(true);
    const state = r.win().sent.filter((s) => s[0] === 'corner-tag:state').at(-1)[1];
    expect(state.ready.map((x) => x.id)).toEqual(['w-1']);
  });

  it('counts nothing from an inbox of only old threads, and says how many are working instead', () => {
    const r = rig();
    const now = 1_000_000_000;
    const rr = rig({ at: now });
    rr.call('zero:corner-tag', { ready: [{ id: 'old', title: 'x', says: 'y', since: now - 3 * 24 * 3600_000 }], working: 4 });
    rr.call('corner-tag:ready', { part: 'tag' });
    const state = rr.win().sent.filter((s) => s[0] === 'corner-tag:state').at(-1)[1];
    expect(state.ready).toEqual([]);
    expect(state.working).toBe(4);
    expect(r.windows).toHaveLength(0);
  });

  // The system's frosted material only comes with the system's own rounded
  // corners or square ones, and the approved tag has small 6px corners, so the
  // window is clear and unrounded and the page draws the glass and the corners.
  it('may take focus, so a press never hands it to the app window; floats over full-screen apps; draws its own corners', () => {
    const r = rig();
    r.showTag();
    const o = r.win().opts;
    expect(o.focusable).toBe(true);
    expect(o.type).toBe('panel');
    expect(o.acceptFirstMouse).toBe(true);
    expect(o.vibrancy).toBeUndefined();
    expect(o.transparent).toBe(true);
    expect(o.roundedCorners).toBe(false);
    expect(o.hasShadow).toBe(true);
    expect(r.win().top).toEqual([true, 'floating']);
    expect(r.win().everywhere[1]).toMatchObject({ visibleOnFullScreen: true, skipTransformProcessType: true });
  });

  it('is exactly the size of the tag, with no margin to catch clicks', () => {
    const r = rig();
    r.showTag(undefined, { width: 80, height: 26 });
    expect(r.win().bounds).toEqual({ x: 1728 - 18 - 80, y: 1080 - 18 - 26, width: 80, height: 26 });
  });

  it('stays away while nothing is running', () => {
    const r = rig();
    r.call('zero:corner-tag', { ready: [], working: 0 });
    expect(r.windows).toHaveLength(0);
  });

  it('steps aside while you are in the app, and comes back when you leave it', () => {
    const r = rig({ focused: true });
    r.call('zero:corner-tag', READY(1_000_000));
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
    r.call('zero:corner-tag', READY(r.clock()));
    expect(r.win().sent.length).toBe(before);
    r.call('corner-tag:ready', { part: 'tag' });
    expect(r.win().visible).toBe(true);
  });
});

describe('a click opens the list; a press that moves is a drag', () => {
  it('a click (press and let go, not moving) opens the list beside the tag, and the tag does not move', () => {
    const r = rig();
    r.showTag();
    const before = { ...r.win().bounds };
    r.click();
    r.listUp();
    const card = r.win('card');
    expect(card.visible).toBe(true);
    expect(r.win().bounds).toEqual(before);
    expect(card.bounds.x + card.bounds.width).toBe(before.x + before.width);
    expect(card.bounds.y + card.bounds.height).toBe(before.y - 8);
  });

  it('a second click shuts it', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.listUp();
    r.click();
    expect(r.win('card').visible).toBe(false);
  });

  it('pointing at the tag opens nothing', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:hover', { part: 'tag', inside: true });
    expect(r.win('card')).toBeUndefined();
  });

  it('a press that moves follows the real cursor, opens nothing and is remembered where it lands', () => {
    const r = rig();
    r.showTag();
    const before = { ...r.win().bounds };
    r.pressAndMove(-300, -200);
    expect(r.win().bounds.x).toBe(before.x - 300);
    expect(r.win().bounds.y).toBe(before.y - 200);
    expect(r.win().sent).toContainEqual(['corner-tag:dragging', true]);
    r.call('corner-tag:release', { cancelled: false });
    expect(r.win('card')).toBeUndefined();
    expect(r.config.cornerTagSpot).toEqual({ x: before.x - 300, y: before.y - 200 });
    expect(r.win().sent).toContainEqual(['corner-tag:dragging', false]);
    expect(r.pendingTimers()).toBe(0);
  });

  it('a shaky click under the drag threshold is still a click', () => {
    const r = rig();
    r.showTag();
    const before = { ...r.win().bounds };
    r.pressAndMove(DRAG_FROM_PX - 2, 1);
    r.call('corner-tag:release', { cancelled: false });
    expect(r.win().bounds).toEqual(before);
    expect(r.win('card')).toBeDefined();
  });

  it('a press just over the threshold is a drag', () => {
    const r = rig();
    r.showTag();
    r.pressAndMove(DRAG_FROM_PX + 1, 0);
    r.call('corner-tag:release', { cancelled: false });
    expect(r.win('card')).toBeUndefined();
    expect(r.saved.some((p) => p.cornerTagSpot)).toBe(true);
  });

  it('a drag starts from where the button went down, not from where the cursor had got to (found by real mouse events)', () => {
    const r = rig();
    r.showTag();
    const before = { ...r.win().bounds };
    const downAt = { x: before.x + 30, y: before.y + 13 };
    // The press message arrives after the cursor has already moved 30 px.
    r.cursor.x = downAt.x - 30; r.cursor.y = downAt.y - 20;
    r.call('corner-tag:press', downAt);
    r.cursor.x = downAt.x - 300; r.cursor.y = downAt.y - 200;
    r.advance(32);
    expect(r.win().bounds.x).toBe(before.x - 300);
    expect(r.win().bounds.y).toBe(before.y - 200);
  });

  it('a press that arrives once the tag has hidden starts nothing (found by Codex, fifth review)', () => {
    const r = rig();
    r.showTag();
    r.main.focused = true;
    r.mainListeners.focus();
    r.onTag();
    r.call('corner-tag:press');
    r.cursor.x -= 200;
    r.advance(100);
    expect(r.pendingTimers()).toBe(0);
    expect(r.config.cornerTagSpot).toBeUndefined();
  });

  it('a press taken away before it moved does nothing at all', () => {
    const r = rig();
    r.showTag();
    r.onTag();
    r.call('corner-tag:press');
    r.call('corner-tag:release', { cancelled: true });
    expect(r.win('card')).toBeUndefined();
  });

  it('a drag shuts an open list and cannot be dragged off the screen', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.listUp();
    r.pressAndMove(900, 900);
    expect(r.win('card').visible).toBe(false);
    r.call('corner-tag:release', { cancelled: false });
    expect(r.config.cornerTagSpot).toEqual({ x: 1728 - 80, y: 1080 - 26 });
  });

  it('a press whose release never comes lets go by itself after a minute', () => {
    const r = rig();
    r.showTag();
    r.pressAndMove(-50, -50);
    r.advance(61_000);
    expect(r.pendingTimers()).toBe(0);
    expect(r.config.cornerTagSpot).toBeDefined();
  });

  it('does not jump while dragging when its words change length', () => {
    const r = rig();
    r.showTag();
    r.pressAndMove(-50, -50);
    const mid = { ...r.win().bounds };
    r.call('corner-tag:size', { part: 'tag', width: 60, height: 26 });
    expect(r.win().bounds.x).toBe(mid.x);
  });

  it('lands exactly where you left it after a restart, even near the right edge', () => {
    const spot = { x: 1500, y: 200 };
    const r = rig({ config: { cornerTagSpot: spot } });
    r.showTag(undefined, { width: 80, height: 26 });
    expect(r.win().bounds.x).toBe(spot.x);
    r.call('corner-tag:size', { part: 'tag', width: 60, height: 26 });
    expect(r.win().bounds.x).toBe(spot.x + 20);
  });
});

describe('the list shuts when the pointer has gone', () => {
  const inCard = (r) => { const c = r.win('card').bounds; r.cursor.x = c.x + 20; r.cursor.y = c.y + 20; };
  const away = (r) => { r.cursor.x = 10; r.cursor.y = 10; };

  it('stays open while the pointer crosses from the tag to the list, and shuts once it has left both', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.listUp();
    r.call('corner-tag:hover', { part: 'tag', inside: false });
    r.cursor.x = null;
    r.advance(100);
    r.call('corner-tag:hover', { part: 'card', inside: true });
    r.advance(CLOSE_AFTER_MS + 50);
    expect(r.win('card').visible).toBe(true);
    r.call('corner-tag:hover', { part: 'card', inside: false });
    r.advance(CLOSE_AFTER_MS + 50);
    expect(r.win('card').visible).toBe(false);
  });

  it('does not shut the list under a pointer that came back without the page noticing', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.listUp();
    away(r);
    r.call('corner-tag:hover', { part: 'tag', inside: false });
    r.advance(CLOSE_AFTER_MS - 40);
    inCard(r);
    r.advance(100);
    expect(r.win('card').visible).toBe(true);
  });

  it('shuts a list whose pointer had already left when it opened, and stops checking after', () => {
    const r = rig();
    r.showTag();
    r.click();
    away(r);
    r.call('corner-tag:hover', { part: 'tag', inside: false });
    r.listUp();
    r.advance(5000);
    expect(r.win('card').visible).toBe(false);
    expect(r.pendingTimers()).toBe(0);
  });

  it('checks nothing while nothing depends on the pointer', () => {
    const r = rig();
    r.showTag();
    r.advance(10_000);
    expect(r.pendingTimers()).toBe(0);
  });

  it('comes back shut after it was hidden with the list open', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.listUp();
    r.main.focused = true;
    r.mainListeners.focus();
    expect(r.win('card').visible).toBe(false);
    expect(r.win().sent.map((s) => s[0])).toContain('corner-tag:reset');
    r.main.focused = false;
    r.mainListeners.blur();
    expect(r.win().visible).toBe(true);
    expect(r.win('card').visible).toBe(false);
  });

  it('a click that arrives as the tag hides does not open the list on its own', () => {
    const r = rig();
    r.showTag();
    r.main.focused = true;
    r.mainListeners.focus();
    r.call('corner-tag:toggle');
    expect(r.win('card')).toBeUndefined();
  });

  it('the list opening for the first time is not mistaken for a reload', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.win('card').wcListeners['did-start-loading']();
    r.listUp();
    expect(r.win('card').visible).toBe(true);
  });

  it('a page reloaded in the middle of a press lets the press go', () => {
    const r = rig();
    r.showTag();
    r.pressAndMove(-40, -40);
    r.win().wcListeners['did-start-loading']();
    expect(r.pendingTimers()).toBe(0);
    r.call('corner-tag:ready', { part: 'tag' });
    r.click();
    expect(r.win('card')).toBeDefined();
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
    r.call('zero:corner-tag', READY(r.clock()));
    r.advance(2 * 60_000);
    expect(r.win().visible).toBe(true);
  });

  it('stays hidden across a restart until the hide runs out', () => {
    const r = rig({ config: { cornerTagHiddenUntil: 1_000_000 + 60_000 } });
    r.call('zero:corner-tag', READY(1_000_000));
    expect(r.windows).toHaveLength(0);
  });

  it('has no way to hide it for good from the tag', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:hide', 'forever');
    expect(r.win().visible).toBe(true);
    expect(r.saved.filter((p) => 'cornerTagHiddenUntil' in p)).toHaveLength(0);
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

describe('turning it off, and opening things', () => {
  it('never shows once Settings turned it off', () => {
    const r = rig({ config: { cornerTag: false } });
    r.call('zero:corner-tag', READY(1_000_000));
    expect(r.windows).toHaveLength(0);
  });

  it('takes you to Settings from the tag', () => {
    const r = rig();
    r.showTag();
    r.call('corner-tag:settings');
    expect(r.main.shown).toBe(1);
    expect(r.main.sent).toContainEqual(['zero:open-settings', { pane: 'general' }]);
  });

  it('a line in the list is what brings the app forward, on that thread', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.listUp();
    r.call('corner-tag:go', 'w-1');
    expect(r.main.shown).toBe(1);
    expect(r.main.sent).toContainEqual(['zero:open-item', { id: 'w-1' }]);
    expect(r.win('card').visible).toBe(false);
  });

  it('neither a click nor a drag on the tag brings the app forward', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.pressAndMove(-80, -40);
    r.call('corner-tag:release', { cancelled: false });
    expect(r.main.shown).toBe(0);
  });
});

describe('the app window closing, and screens changing', () => {
  it('takes the tag and its list with it, so the app can quit', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.listUp();
    r.main.destroyed = true;
    r.mainListeners.closed();
    expect(r.win().destroyed).toBe(true);
    expect(r.win('card').destroyed).toBe(true);
    expect(r.removed).toContain('zero:corner-tag');
  });

  it('is pulled back onto a screen when the one it was on changes, and shuts its list', () => {
    const r = rig();
    r.showTag();
    r.click();
    r.listUp();
    r.area.width = 1200;
    r.area.height = 800;
    r.screenListeners['display-metrics-changed']();
    expect(r.win('card').visible).toBe(false);
    expect(r.win().bounds.x + r.win().bounds.width).toBeLessThanOrEqual(1200);
    expect(r.win().bounds.y + r.win().bounds.height).toBeLessThanOrEqual(800);
  });
});
