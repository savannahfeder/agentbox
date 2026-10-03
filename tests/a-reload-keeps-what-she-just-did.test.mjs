// A RELOAD KEEPS WHAT SHE JUST DID.
//
// w-47218417a5: she closes a thread, or answers one, and presses ⌘R the way
// she often does; the thread comes back to her inbox as if she had never
// touched it.
//
// Measured on main at 40b622a before anything was touched: every close, pick
// and approval goes through `deferCommit` in App.tsx, which holds the write in
// the page's memory for UNDO_GRACE_MS (3000 ms) so Z can take it back. The
// only thing that ever writes it is a setTimeout in that page. ⌘R
// (`reloadRenderer` in main/main.mjs) called `reloadIgnoringCache()` straight
// away, so a reload inside those three seconds threw the timer and the write
// away together, and nothing anywhere else knew the action had happened. A
// typed reply rides the same window and was lost the same way.
//
// The fix: ⌘R asks the page to write what it is holding, waits for it to say
// it has (bounded, so a page that never answers cannot stop ⌘R working), and
// only then reloads. The handshake runs for real below against a fake page;
// the wiring between main, preload and App.tsx is asserted against source,
// because this suite cannot boot the main process.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeHeldThenReload, WRITE_HELD, WROTE_HELD } from '../main/write-before-reload.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => {
  const file = path.join(here, '..', ...p);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};

// A page that holds one close and writes it when asked, the way App.tsx does.
function fakePage({ answers = true, delayMs = 0, wrongNonce = false } = {}) {
  const ipcMain = new EventEmitter();
  const writes = [];
  const webContents = {
    destroyed: false,
    isDestroyed() { return this.destroyed; },
    send(channel, nonce) {
      if (channel !== WRITE_HELD || !answers) return;
      setTimeout(() => {
        writes.push('closed the thread');
        ipcMain.emit(WROTE_HELD, { sender: webContents }, wrongNonce ? `${nonce}-stale` : nonce);
      }, delayMs);
    },
  };
  return { ipcMain, webContents, writes };
}

afterEach(() => vi.useRealTimers());

describe('⌘R writes what the page is holding before it reloads', () => {
  it('the close she made a second ago is written before the page goes', async () => {
    const page = fakePage({ delayMs: 50 });
    const order = [];
    const reload = () => order.push(`reload after ${page.writes.length} write`);
    await writeHeldThenReload({ ...page, reload });
    expect(page.writes).toEqual(['closed the thread']);
    expect(order).toEqual(['reload after 1 write']);
  });

  it('does not reload while the page is still writing', async () => {
    vi.useFakeTimers();
    const page = fakePage({ delayMs: 400 });
    const reload = vi.fn();
    const done = writeHeldThenReload({ ...page, reload, timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(399);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // A page that never answers (it crashed, or it is an older build) must not
  // make ⌘R do nothing, which is the complaint this chord already had twice.
  it('a page that never answers still reloads, at the limit and not before', async () => {
    vi.useFakeTimers();
    const page = fakePage({ answers: false });
    const reload = vi.fn();
    const done = writeHeldThenReload({ ...page, reload, timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  // The case that must NOT match: an answer to some other request (a page from
  // before the last reload, a second ⌘R) is not this page saying it is done.
  it('an answer to a different request does not count as this one', async () => {
    vi.useFakeTimers();
    const page = fakePage({ wrongNonce: true, delayMs: 10 });
    const reload = vi.fn();
    const done = writeHeldThenReload({ ...page, reload, timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(500);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    await done;
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves no listener behind, answered or not', async () => {
    const answered = fakePage();
    await writeHeldThenReload({ ...answered, reload: () => {} });
    expect(answered.ipcMain.listenerCount(WROTE_HELD)).toBe(0);

    vi.useFakeTimers();
    const silent = fakePage({ answers: false });
    const done = writeHeldThenReload({ ...silent, reload: () => {}, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await done;
    expect(silent.ipcMain.listenerCount(WROTE_HELD)).toBe(0);
  });

  it('a window that has gone is not reloaded and not asked', async () => {
    const page = fakePage();
    page.webContents.destroyed = true;
    const reload = vi.fn();
    await writeHeldThenReload({ ...page, reload });
    expect(reload).not.toHaveBeenCalled();
    expect(page.writes).toEqual([]);
  });
});

describe('the wiring from ⌘R to the held write', () => {
  it('main reloads through the handshake, not straight away', () => {
    const main = read('main', 'main.mjs');
    const body = main.slice(main.indexOf('function reloadRenderer'), main.indexOf('async function createWindow'));
    expect(body).toMatch(/writeHeldThenReload\(/);
    expect(body).toMatch(/reloadIgnoringCache\(\)/);
  });

  it('the bridge answers every ask, even when the page has nothing held', () => {
    const preload = read('preload.cjs');
    expect(preload).toMatch(/onWriteHeld/);
    expect(preload).toMatch(/zero:write-held/);
    expect(preload).toMatch(/zero:wrote-held/);
  });

  it('the page hands the bridge the same flush a new action uses', () => {
    const app = read('renderer', 'src', 'App.tsx');
    expect(app).toMatch(/onWriteHeld\?\.\(\s*flushPending\s*\)/);
    // And the page writes it on its own way out too, for a window closed or
    // quit rather than reloaded.
    expect(app).toMatch(/addEventListener\('pagehide'/);
  });
});
