// The window went blank, grey edge to edge, and developer tools would not
// open: the founder's screenshot shows nothing but the window's own background
// (#1a1a1c). That colour is what a Mac draws when the page's process has died,
// or has frozen and lost its last frame. The app only wrote a crash report on
// render-process-gone and had no handler for 'unresponsive' at all, so the
// window stayed blank until ⌘R. Measured in Electron 43 under Xvfb: after
// forcefullyCrashRenderer, render-process-gone arrives (12 to 14 s later on
// that box) and reload() from that handler brings the page back; reload()
// before the event does nothing. A page stuck in a loop fires 'unresponsive'
// about 18 s in.
import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { keepThePageAlive, REVIVE_LOOP_MS, revivedLine } from '../main/when-the-page-stops.mjs';

function fakeWindow() {
  const win = new EventEmitter();
  win.destroyed = false;
  win.isDestroyed = () => win.destroyed;
  win.webContents = new EventEmitter();
  win.webContents.reloads = 0;
  win.webContents.killed = 0;
  win.webContents.reload = () => { win.webContents.reloads += 1; };
  win.webContents.forcefullyCrashRenderer = () => { win.webContents.killed += 1; };
  return win;
}

function fakeDialog(answer = 0) {
  const d = { asked: [], answer };
  d.showMessageBox = (_win, opts) => new Promise((resolve) => {
    d.asked.push(opts);
    opts.signal?.addEventListener('abort', () => resolve({ response: opts.cancelId }));
    if (d.answer !== null) resolve({ response: d.answer });
  });
  return d;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('a window whose page dies or freezes comes back', () => {
  let win; let dialog; let clock; let said; let reports;
  const start = (answer = 0) => {
    dialog = fakeDialog(answer);
    keepThePageAlive({ window: win, dialog, name: 'Agentbox', now: () => clock, onRevived: (line) => said.push(line), report: (kind) => reports.push(kind) });
  };
  beforeEach(() => { win = fakeWindow(); clock = 1_000_000; said = []; reports = []; });

  it('a page that crashes is reloaded at once and says why', async () => {
    start();
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 133 });
    await tick();
    expect(win.webContents.reloads).toBe(1);
    expect(dialog.asked).toHaveLength(0);
    expect(said).toEqual([revivedLine('crashed')]);
  });

  it('a page that ran out of memory says so', () => {
    expect(revivedLine('oom')).toMatch(/ran out of memory/);
    expect(revivedLine('crashed')).toMatch(/crashed/);
    expect(revivedLine('froze')).toMatch(/froze/);
  });

  it('a page that closed on purpose is left alone', async () => {
    start();
    win.webContents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
    await tick();
    expect(win.webContents.reloads).toBe(0);
  });

  it('a second death within a minute of its own reload asks instead of reloading', async () => {
    start(1);
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    clock += REVIVE_LOOP_MS - 1;
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    await tick();
    expect(win.webContents.reloads).toBe(1);
    expect(dialog.asked).toHaveLength(1);
    expect(dialog.asked[0].buttons[0]).toBe('Reload');
  });

  it('pressing Reload on that question reloads', async () => {
    start(0);
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    clock += 1000;
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    await tick();
    expect(win.webContents.reloads).toBe(2);
  });

  it('a death a minute or more after the last reload reloads on its own again', async () => {
    start();
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    clock += REVIVE_LOOP_MS;
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    await tick();
    expect(win.webContents.reloads).toBe(2);
    expect(dialog.asked).toHaveLength(0);
  });

  it('a frozen page asks, and Reload ends the page and reloads it once it is gone', async () => {
    start(0);
    win.emit('unresponsive');
    await tick();
    expect(reports).toEqual(['renderer-hung']);
    expect(dialog.asked).toHaveLength(1);
    expect(win.webContents.killed).toBe(1);
    // Reloading before the process is gone does nothing, so it waits for the event.
    expect(win.webContents.reloads).toBe(0);
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    await tick();
    expect(win.webContents.reloads).toBe(1);
    expect(said).toEqual([revivedLine('froze')]);
  });

  it('Wait leaves a frozen page alone', async () => {
    start(1);
    win.emit('unresponsive');
    await tick();
    expect(win.webContents.killed).toBe(0);
    expect(win.webContents.reloads).toBe(0);
  });

  it('a page that comes back by itself closes the question', async () => {
    start(null);
    win.emit('unresponsive');
    await tick();
    win.emit('responsive');
    await tick();
    expect(win.webContents.killed).toBe(0);
  });

  it('a page that stays frozen is asked about once, not on every report of it', async () => {
    start(null);
    win.emit('unresponsive');
    win.emit('unresponsive');
    await tick();
    expect(dialog.asked).toHaveLength(1);
  });

  it('a closed window is never reloaded', async () => {
    start();
    win.destroyed = true;
    win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    await tick();
    expect(win.webContents.reloads).toBe(0);
  });

  it('the main window is wired to it', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(new URL('../main/main.mjs', import.meta.url), 'utf8')).toMatch(/keepThePageAlive\(\{\s*window,/);
  });
});
