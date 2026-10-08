// THE CORNER TAG'S WINDOW (w-dafae58a23). The rules in shared/corner-tag.mjs
// are only half of it; this pins the live half in main/corner-tag.mjs against
// a pretend window and screen. What broke without it: nothing outside the app
// said an agent was waiting, so agents sat idle. What it must not become: a nag
// you close once and never see again, a window that steals the keyboard, or a
// tag that forgets where you dragged it.
//
// Measured by driving the controller exactly as the app does (the page hands
// over what is ready, the app window gains and loses focus, the tag's page
// asks to hide, drag and open) and reading what the window did.
import { describe, expect, it } from 'vitest';
import { createCornerTag, PAD } from '../main/corner-tag.mjs';

function rig({ config = {}, focused = false, at = 1_000_000 } = {}) {
  const handlers = {};
  const ipcMain = { handle: (ch, fn) => { handlers[ch] = fn; } };
  const timers = [];
  let clock = at;
  const windows = [];
  class FakeWindow {
    constructor(opts) {
      this.opts = opts; this.bounds = null; this.visible = false; this.destroyed = false; this.sent = []; this.loaded = [];
      this.listeners = {};
      this.webContents = {
        send: (ch, p) => this.sent.push([ch, p]),
        once: (ev, fn) => { this.loaded.push(fn); },
        isLoading: () => false,
      };
      windows.push(this);
    }
    setAlwaysOnTop(on, level) { this.top = [on, level]; }
    setVisibleOnAllWorkspaces(on, o) { this.everywhere = [on, o]; }
    on(ev, fn) { this.listeners[ev] = fn; }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    hide() { this.visible = false; }
    showInactive() { this.visible = true; }
    setBounds(b) { this.bounds = b; }
    setPosition(x, y) { this.bounds = { ...this.bounds, x, y }; }
  }
  const area = { x: 0, y: 0, width: 1728, height: 1080 };
  const screen = { getAllDisplays: () => [{ workArea: area }], getDisplayMatching: () => ({ workArea: area }), on() {} };
  const main = {
    focused, sent: [], listeners: {}, shown: 0,
    isDestroyed: () => false, isFocused() { return this.focused; }, isMinimized: () => false,
    restore() {}, show() { this.shown++; }, focus() { this.focused = true; },
    on(ev, fn) { this.listeners[ev] = fn; },
    webContents: { send: (ch, p) => main.sent.push([ch, p]) },
  };
  const saved = [];
  const saveConfig = (c, patch) => { Object.assign(c, patch); saved.push(patch); };
  const tag = createCornerTag({
    BrowserWindow: FakeWindow, screen, ipcMain, Menu: { buildFromTemplate: (t) => ({ popup: () => { tag.menu = t; } }) },
    config, saveConfig, mainWindow: main, load: (w) => w.loaded.forEach((fn) => fn()), preload: '/p.cjs',
    now: () => clock, setTimer: (fn, ms) => { timers.push({ fn, at: clock + ms }); return timers.length; }, clearTimer: () => {}, mac: true,
  });
  const call = (ch, p) => handlers[ch](null, p);
  const advance = (ms) => {
    clock += ms;
    for (const t of timers.splice(0)) { if (t.at <= clock) t.fn(); else timers.push(t); }
  };
  return { tag, call, windows, main, config, saved, advance, win: () => windows[windows.length - 1] };
}

const READY = { ready: [{ id: 'w-1', title: 'Pricing page', says: 'is ready for you', since: 1 }], working: 18 };

describe('it shows up when something needs you, and only then', () => {
  it('appears when an agent is ready and you are in another app', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    expect(r.win().visible).toBe(true);
    expect(r.win().sent.at(-1)[0]).toBe('corner-tag:state');
    expect(r.win().sent.at(-1)[1].ready).toHaveLength(1);
  });

  it('never takes the keyboard and floats over full-screen apps', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    expect(r.win().opts.focusable).toBe(false);
    expect(r.win().opts.type).toBe('panel');
    expect(r.win().top).toEqual([true, 'floating']);
    expect(r.win().everywhere[1]).toMatchObject({ visibleOnFullScreen: true, skipTransformProcessType: true });
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
    r.main.listeners.blur();
    expect(r.win().visible).toBe(true);
    r.main.focused = true;
    r.main.listeners.focus();
    expect(r.win().visible).toBe(false);
  });
});

describe('hiding it for a while', () => {
  it('hides for 30 minutes, remembers it, and comes back on its own', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
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
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:hide', 'forever');
    expect(r.win().visible).toBe(true);
    expect(r.saved).toHaveLength(0);
  });

  it('offers the hides and a way to Settings on right-click, and nothing that closes it for good', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:menu');
    const labels = r.tag.menu.filter((m) => m.label).map((m) => m.label);
    expect(labels).toEqual(['Hide for 5 minutes', 'Hide for 30 minutes', 'Hide for the rest of today', 'Turn off in Settings…']);
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
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:settings');
    expect(r.main.shown).toBe(1);
    expect(r.main.sent).toContainEqual(['zero:open-settings', { pane: 'general' }]);
  });
});

describe('opening what is ready', () => {
  it('brings the app forward on the thread you picked', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:go', 'w-1');
    expect(r.main.shown).toBe(1);
    expect(r.main.sent).toContainEqual(['zero:open-item', { id: 'w-1' }]);
  });
});

describe('it goes where you put it', () => {
  it('rests in the bottom-right corner the first time', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:size', { width: 140, height: 26 });
    expect(r.win().bounds).toEqual({ x: 1728 - 18 - 140 - PAD, y: 1080 - 18 - 26 - PAD, width: 140 + 2 * PAD, height: 26 + 2 * PAD });
  });

  it('follows a drag, and is there again after a restart', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:size', { width: 140, height: 26 });
    r.call('corner-tag:drag-start');
    r.call('corner-tag:drag', { dx: -1000, dy: -600 });
    r.call('corner-tag:drag-end');
    const spot = r.config.cornerTagSpot;
    expect(spot).toEqual({ x: 1728 - 18 - 140 - 1000, y: 1080 - 18 - 26 - 600 });

    const again = rig({ config: { cornerTagSpot: spot } });
    again.call('zero:corner-tag', READY);
    again.call('corner-tag:size', { width: 140, height: 26 });
    expect(again.win().bounds.x).toBe(spot.x - PAD);
    expect(again.win().bounds.y).toBe(spot.y - PAD);
  });

  it('lands exactly where you left it after a restart, even near the right edge', () => {
    const spot = { x: 1500, y: 200 };
    const r = rig({ config: { cornerTagSpot: spot } });
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:size', { width: 140, height: 26 });
    expect(r.win().bounds.x).toBe(spot.x - PAD);
    r.call('corner-tag:size', { width: 100, height: 26 });
    expect(r.win().bounds.x).toBe(spot.x + 40 - PAD);
  });

  it('cannot be dragged off the screen', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:size', { width: 140, height: 26 });
    r.call('corner-tag:drag-start');
    r.call('corner-tag:drag', { dx: 900, dy: 900 });
    r.call('corner-tag:drag-end');
    expect(r.config.cornerTagSpot).toEqual({ x: 1728 - 140, y: 1080 - 26 });
  });

  it('opens its list toward the middle of the screen, inside one window', () => {
    const r = rig();
    r.call('zero:corner-tag', READY);
    r.call('corner-tag:size', { width: 140, height: 26 });
    const at = r.call('corner-tag:open', { width: 360, height: 110 });
    expect(at.above).toBe(true);
    expect(at.alignRight).toBe(true);
    expect(at.card.y).toBe(PAD);
    expect(at.tag.y).toBe(PAD + 110 + 8);
    expect(r.win().bounds.height).toBe(110 + 8 + 26 + 2 * PAD);
    r.call('corner-tag:close');
    expect(r.win().bounds.height).toBe(26 + 2 * PAD);
  });
});
