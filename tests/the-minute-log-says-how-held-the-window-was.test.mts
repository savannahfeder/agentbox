// THE MINUTE LOG SAYS HOW HELD THE WINDOW WAS.
//
// What broke: on 2026-11-23 the app was reported lagging about 25 minutes
// after it started. In the half hour around the report the freeze log, which
// watches the main process, held one freeze of 1.7 s, and the minute log's
// stall figure stayed near 200 ms. The window's own thread was recorded
// nowhere: it only told main of a hold of a second or more, and main only
// counted that during setup or an import. So whether clicks and keys were
// answered late in that half hour could not be read back from anything.
//
// Now the window adds up its long tasks (50 ms or more, the browser's own
// line) and the clicks and keys it answered in 100 ms or more, says so once a
// minute when there is something to say, and each minute's line carries it as
// `windowLag`.
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lagCounter, SLOW_INPUT_MS } from '../renderer/src/window-lag.ts';
import { windowLagCollector } from '../main/window-lag.mts';
import { Supervisor } from '../main/supervisor.mts';

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('what the window counts', () => {
  it('adds up its long tasks and keeps the longest', () => {
    const lag = lagCounter();
    lag.task(60);
    lag.task(400);
    lag.task(55.4);
    expect(lag.take()).toEqual({ longMs: 515, longest: 400, slow: 0, worst: 0 });
  });

  it('counts a click or key answered in 100 ms or more, and not one answered sooner', () => {
    expect(SLOW_INPUT_MS).toBe(100);
    const lag = lagCounter();
    lag.input(99);
    lag.input(100);
    lag.input(640);
    expect(lag.take()).toEqual({ longMs: 0, longest: 0, slow: 2, worst: 640 });
  });

  it('counts one click once, though it reaches the page as a press, a release and a click', () => {
    // The first half hour of readings said 9 to 38 late answers a minute, every event of each press counted.
    const lag = lagCounter();
    lag.input(120, 7);
    lag.input(136, 7);
    lag.input(128, 7);
    lag.input(240, 8);
    expect(lag.take()).toEqual({ longMs: 0, longest: 0, slow: 2, worst: 240 });
    // In the next minute the same press, still being answered, is that minute's to count.
    lag.input(120, 8);
    expect(lag.take()).toEqual({ longMs: 0, longest: 0, slow: 1, worst: 120 });
  });

  it('keeps the worst of a press\'s events, and still counts an event that names no press', () => {
    const lag = lagCounter();
    lag.input(120, 7);
    lag.input(410, 7);
    lag.input(150);
    lag.input(150);
    expect(lag.take()).toEqual({ longMs: 0, longest: 0, slow: 3, worst: 410 });
    expect(read('renderer/src/window-lag.ts')).toMatch(/lag\.input\(e\.duration, e\.interactionId\)/);
  });

  it('starts again after it is taken, and says nothing when nothing was held', () => {
    const lag = lagCounter();
    expect(lag.take()).toBe(null);
    lag.input(40);
    expect(lag.take()).toBe(null);
    lag.task(80);
    expect(lag.take()).not.toBe(null);
    expect(lag.take()).toBe(null);
  });
});

describe('what main keeps of it', () => {
  it('one minute of one window, as it was sent', () => {
    const kept = windowLagCollector();
    expect(kept.add({ longMs: 515, longest: 400, slow: 2, worst: 640 })).toBe(true);
    expect(kept.take()).toEqual({ windowLag: { longMs: 515, longest: 400, slow: 2, worst: 640 } });
  });

  it('adds two reports in one minute: the sums add, the worst stays the worst', () => {
    const kept = windowLagCollector();
    kept.add({ longMs: 100, longest: 100, slow: 1, worst: 120 });
    kept.add({ longMs: 300, longest: 250, slow: 0, worst: 0 });
    expect(kept.take()).toEqual({ windowLag: { longMs: 400, longest: 250, slow: 1, worst: 120 } });
  });

  it('a quiet minute adds nothing to the line, and a taken minute is gone', () => {
    const kept = windowLagCollector();
    expect(kept.take()).toEqual({});
    kept.add({ longMs: 80, longest: 80, slow: 0, worst: 0 });
    kept.take();
    expect(kept.take()).toEqual({});
  });

  it('keeps numbers only, never under nought, and nothing a page could not have measured in two minutes', () => {
    const kept = windowLagCollector();
    for (const junk of [null, 'slow', {}, { longMs: 'many' }, { longMs: NaN, longest: 1, slow: 1, worst: 1 }, { longMs: -5, longest: -5, slow: -1, worst: -1 }]) {
      expect(kept.add(junk)).toBe(false);
    }
    expect(kept.take()).toEqual({});
    expect(kept.add({ longMs: 9e9, longest: 9e9, slow: 9e9, worst: 9e9 })).toBe(true);
    expect(kept.take()).toEqual({ windowLag: { longMs: 120_000, longest: 120_000, slow: 10_000, worst: 120_000 } });
  });
});

describe('the minute line', () => {
  let dir: string;
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('carries what the window said this minute, once', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'window-lag-'));
    const sup = new Supervisor({ home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'] }, { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {} }, dir);
    sup.windowLag = windowLagCollector();
    sup.windowLag.add({ longMs: 515, longest: 400, slow: 2, worst: 640 });
    sup.startMemoryLog();
    try {
      expect(sup._memoryLog.facts()).toMatchObject({ running: 0, windowLag: { longMs: 515, longest: 400, slow: 2, worst: 640 } });
      expect(sup._memoryLog.facts().windowLag).toBeUndefined();
    } finally {
      clearInterval(sup._memoryLogTimer);
    }
  });
});

describe('the wire from the window to main', () => {
  it('the window watches long tasks and answers to input, and is started with the page', () => {
    const src = read('renderer/src/window-lag.ts');
    expect(src).toMatch(/type: 'longtask'/);
    expect(src).toMatch(/type: 'event'/);
    expect(read('renderer/src/main.tsx')).toMatch(/installWindowLag\(\)/);
  });

  it('goes over one channel that takes it from the app\'s own window only', () => {
    expect(read('preload.cjs')).toMatch(/windowLag: \(lag\) => ipcRenderer\.invoke\('zero:window-lag', lag\)/);
    const ipc = read('main/ipc.mts');
    const at = ipc.indexOf("ipcMain.handle('zero:window-lag'");
    expect(at).toBeGreaterThan(0);
    // Strictly: a request with no sender at all is the browser door's, and a tab's lag is its browser's.
    expect(ipc.slice(at, at + 400)).toMatch(/\|\| event\.sender !== window\.webContents\) return false/);
    expect(read('shared/bridge-map.mts')).toMatch(/windowLag: 'zero:window-lag'/);
    expect(read('main/main.mts')).toMatch(/supervisor\.windowLag = windowLagCollector\(\)/);
  });
});
