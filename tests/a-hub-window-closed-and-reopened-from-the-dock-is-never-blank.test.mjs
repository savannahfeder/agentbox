// A HUB WINDOW CLOSED AND REOPENED FROM THE DOCK IS NEVER BLANK.
//
// Found by Codex's review of the hub client (2026-10-31): on a Mac, closing the
// window and clicking the Dock icon ran `open()` again, which registered the
// notifier's `zero:notify-test` handler a second time. Electron throws on that,
// before the page loads, so the reopened window stayed blank until a restart.
// Reproduced with a fake ipcMain that throws as Electron's does. The whole app
// quits when its window closes (main/main.mts) and so never reopens; the hub
// window now does the same.
import { describe, it, expect, vi, afterEach } from 'vitest';

const fake = vi.hoisted(() => {
  const state = { appEvents: new Map(), handlers: new Map(), windows: [], quit: 0 };
  const app = {
    on: (name, fn) => state.appEvents.set(name, [...(state.appEvents.get(name) ?? []), fn]),
    emit: (name) => (state.appEvents.get(name) ?? []).forEach((fn) => fn()),
    whenReady: () => Promise.resolve(),
    requestSingleInstanceLock: () => true,
    quit: () => { state.quit += 1; },
    dock: { setBadge() {} },
    getAppPath: () => '/',
  };
  const ipcMain = {
    handle(name, fn) {
      if (state.handlers.has(name)) throw new Error(`Attempted to register a second handler for '${name}'`);
      state.handlers.set(name, fn);
    },
    removeHandler: (name) => state.handlers.delete(name),
  };
  class BrowserWindow {
    constructor() {
      this.listeners = {};
      this.loaded = [];
      this.webContents = { setWindowOpenHandler() {}, on() {} };
      state.windows.push(this);
    }
    on(name, fn) { (this.listeners[name] ??= []).push(fn); }
    close() { for (const fn of this.listeners.closed ?? []) fn(); }
    loadURL(url) { this.loaded.push(url); return Promise.resolve(); }
    isMinimized() { return false; }
    restore() {}
    focus() {}
    isFocused() { return true; }
  }
  return { state, app, ipcMain, BrowserWindow };
});

vi.mock('electron', () => ({
  app: fake.app,
  BrowserWindow: fake.BrowserWindow,
  ipcMain: fake.ipcMain,
  Notification: { isSupported: () => false },
  dialog: { showErrorBox() {} },
  nativeImage: null,
  powerMonitor: { on() {} },
  shell: { openExternal() {} },
}));

const HUB = { url: 'https://hub.example.com', key: 'k'.repeat(32) };
const realPlatform = process.platform;

async function startOn(platform) {
  Object.defineProperty(process, 'platform', { value: platform });
  fake.state.appEvents.clear();
  fake.state.handlers.clear();
  fake.state.windows.length = 0;
  fake.state.quit = 0;
  vi.resetModules();
  const { startHubClient } = await import('../main/hub-client.mjs');
  startHubClient(HUB);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fake.state.windows).toHaveLength(1);
}

const showsItsHub = (w) => w.loaded.some((url) => url.startsWith(`${HUB.url}/`));

describe('a hub window closed and reopened from the dock is never blank', () => {
  afterEach(() => Object.defineProperty(process, 'platform', { value: realPlatform }));

  it('on a Mac, closing the window quits the app, as the whole app does', async () => {
    await startOn('darwin');
    fake.state.windows[0].close();
    fake.app.emit('window-all-closed');
    expect(fake.state.quit).toBe(1);
  });

  it('a Dock click after the window closed never leaves a window without its hub', async () => {
    await startOn('darwin');
    fake.state.windows[0].close();
    fake.app.emit('window-all-closed');
    expect(() => fake.app.emit('activate')).not.toThrow();
    expect(fake.state.windows.every(showsItsHub)).toBe(true);
  });

  it('on Linux too, closing the window quits the app', async () => {
    await startOn('linux');
    fake.state.windows[0].close();
    fake.app.emit('window-all-closed');
    expect(fake.state.quit).toBe(1);
  });

  it('while the window is open nothing quits, and a Dock click opens no second window', async () => {
    await startOn('darwin');
    fake.app.emit('activate');
    expect(fake.state.quit).toBe(0);
    expect(fake.state.windows).toHaveLength(1);
    expect(showsItsHub(fake.state.windows[0])).toBe(true);
    expect([...fake.state.handlers.keys()].sort()).toEqual(['hub:open', 'zero:badge', 'zero:notify', 'zero:notify-test']);
  });
});
