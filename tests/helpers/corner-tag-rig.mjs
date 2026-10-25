// A pretend app around main/corner-tag.mjs: windows, a screen, a clock, the
// app's own window gaining and losing focus, and the store of settings.
import { createCornerTag } from '../../main/corner-tag.mjs';

export function cornerTagRig({ config = {}, focused = false, at = 1_000_000_000, glass = null, told = () => [] } = {}) {
  const handlers = {};
  const timers = [];
  let timerId = 0;
  let clock = at;
  const windows = [];
  class FakeWindow {
    constructor(opts) {
      this.opts = opts; this.bounds = null; this.visible = false; this.destroyed = false; this.sent = [];
      this.heard = {};
      this.webContents = {
        send: (ch, p) => this.sent.push([ch, p]),
        on: (ev, fn) => { this.heard[ev] = fn; },
        setZoomFactor: (z) => { (this.zoomed ??= []).push(z); },
      };
      windows.push(this);
    }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    on() {}
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.visible = false; }
    isVisible() { return this.visible; }
    hide() { this.visible = false; }
    showInactive() { this.visible = true; }
    setBounds(b) { this.bounds = b; }
    getBounds() { return this.bounds; }
    setPosition(x, y) { this.bounds = { ...this.bounds, x, y }; }
    setIgnoreMouseEvents() {}
  }
  const area = { x: 0, y: 0, width: 1728, height: 1080 };
  const screen = {
    getAllDisplays: () => [{ workArea: area }], getDisplayMatching: () => ({ workArea: area }),
    getCursorScreenPoint: () => null, on: () => {}, removeListener: () => {},
  };
  const mainListeners = {};
  const main = {
    focused, destroyed: false, sent: [],
    isDestroyed() { return this.destroyed; }, isFocused() { return this.focused; }, isMinimized: () => false,
    restore() {}, show() {}, focus() { this.focused = true; },
    on(ev, fn) { mainListeners[ev] = fn; },
    webContents: { send: (ch, p) => main.sent.push([ch, p]) },
  };
  const saved = [];
  const saveConfig = (c, patch) => { Object.assign(c, patch); saved.push(patch); };
  const tag = createCornerTag({
    BrowserWindow: FakeWindow, screen, ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; }, removeHandler: () => {} },
    powerMonitor: { on: () => {}, removeListener: () => {} },
    Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
    config, saveConfig, mainWindow: main, load: (w, part) => { w.part = part; }, preload: '/p.cjs',
    now: () => clock,
    setTimer: (fn, ms) => { const id = ++timerId; timers.push({ id, fn, at: clock + ms }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    mac: true, glass, told,
  });
  const call = (ch, p) => handlers[ch](null, p);
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
  const lastState = (part = 'tag') => win(part)?.sent.filter((s) => s[0] === 'corner-tag:state').at(-1)?.[1];
  // The app hands over what waits, and the tag's page loads and measures itself.
  const hand = (state) => call('zero:corner-tag', state);
  const pageUp = (part = 'tag', size = { width: 80, height: 26 }) => {
    call('corner-tag:ready', { part });
    call('corner-tag:size', { part, ...size });
  };
  const leaveApp = () => { main.focused = false; mainListeners.blur?.(); };
  const enterApp = () => { main.focused = true; mainListeners.focus?.(); };
  // The page starts loading again, as ⌘R or a crash would make it.
  const reload = (part = 'tag') => win(part).heard['did-start-loading']?.();
  return {
    tag, call, windows, win, lastState, hand, pageUp, leaveApp, enterApp, reload, main, config, saved, advance,
    timers, clock: () => clock,
  };
}
