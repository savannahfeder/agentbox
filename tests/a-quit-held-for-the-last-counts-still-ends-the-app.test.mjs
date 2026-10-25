// ON LINUX THE APP NEVER FINISHED QUITTING (w-badfef97d5, 2026-10-24).
//
// `main/quit-sequence.mjs` holds `will-quit` open for two seconds so the last
// batch of counts can leave, then calls `app.quit()` a second time to let the
// quit through. On Linux that second call does NOTHING. Measured on a real
// launch under Xvfb with every quit event logged:
//
//   before-quit        <- app.quit()
//   flush-held         <- will-quit held for the counts
//   will-quit
//   flush-go           <- the flush finished and called app.quit() again
//   (nothing, for ever)
//
// WHICH QUITS IT RUINS, measured on the same launches: it depends on whether a
// window was open when the quit was asked for.
//
//   `app.quit()` with the window still open — the menu's Quit, the tray's Quit,
//   the screenshot run — is the broken one. Electron closes the window, raises
//   `will-quit` from "all windows are closed", and that is the one whose
//   refusal leaves the app thinking it is still quitting: every later
//   `app.quit()` returns at once and raises nothing. The window is gone, the
//   process is not, and it still holds the single-instance lock, so the next
//   launch focuses a window that is not there.
//
//   Closing the window yourself still works. `window-all-closed` asks to quit
//   with no windows left, Electron goes straight to `will-quit`, and the
//   refusal there does reset it: the second ask raises before-quit, will-quit
//   and quit, and the app ends. Measured at 4.9 s on the same box.
//
// So this does not rest on either shape. The second ask is made and given two
// seconds, and the process ends whether the ask worked or not.
//
// The ask is still made, because it is the ordinary way out and the one that
// fires `quit` for whoever is listening: electron-updater installs a
// downloaded update there, and it only ever runs in a packaged app, where the
// ask works.
//
// Verified on the real app on this box: a screenshot run ended in 6.4 s with
// this deadline, against 11.6 s of the shell's `timeout` killing it before.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  flushBeforeQuit, FLUSH_DEADLINE_MS, SECOND_QUIT_DEADLINE_MS, EXIT_DEADLINE_MS,
} from '../main/quit-sequence.mjs';

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * Electron's `app`, as far as quitting goes. `ignoresTheSecondQuit` is the
 *  Linux shape above: the first quit runs its events, the second does nothing
 *  at all. */
function fakeApp({ ignoresTheSecondQuit = false } = {}) {
  const app = new EventEmitter();
  app.quits = 0;
  app.exited = null;
  app.exit = (code) => { app.exited = code; app.emit('quit', {}); };
  app.quit = () => {
    app.quits += 1;
    if (ignoresTheSecondQuit && app.quits > 1) return;
    let held = false;
    app.emit('before-quit', { preventDefault() {} });
    app.emit('will-quit', { preventDefault() { held = true; } });
    if (!held) app.emit('quit', {});
  };
  return app;
}

describe('a quit held for the last counts still ends the app', () => {
  it('ends the process when the second ask is ignored, as Quit with a window open is', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const app = fakeApp({ ignoresTheSecondQuit: true });
    const flush = vi.fn(() => Promise.resolve());
    flushBeforeQuit(app, flush, { log: { warn } });

    app.quit();
    await vi.advanceTimersByTimeAsync(0);
    expect(flush).toHaveBeenCalled();
    expect(app.quits).toBe(2);           // the ordinary way out is still asked for
    expect(app.exited).toBe(null);       // and it is given its two seconds

    await vi.advanceTimersByTimeAsync(SECOND_QUIT_DEADLINE_MS - 1);
    expect(app.exited).toBe(null);
    await vi.advanceTimersByTimeAsync(1);
    expect(app.exited).toBe(0);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/asked the app to quit/);
    vi.useRealTimers();
  });

  it('leaves a quit that works alone, as closing the window is', async () => {
    vi.useFakeTimers();
    const app = fakeApp();
    const quits = [];
    app.on('quit', () => quits.push('quit'));
    flushBeforeQuit(app, () => Promise.resolve(), { log: { warn() {} } });

    app.quit();
    await vi.advanceTimersByTimeAsync(0);
    expect(quits).toEqual(['quit']);
    await vi.advanceTimersByTimeAsync(SECOND_QUIT_DEADLINE_MS * 4);
    // Nothing was ended by hand, so every `quit` listener ran as it always has.
    expect(app.exited).toBe(null);
    expect(quits).toEqual(['quit']);
    vi.useRealTimers();
  });

  it('does not wait on a flush that never answers before asking again', async () => {
    vi.useFakeTimers();
    const app = fakeApp({ ignoresTheSecondQuit: true });
    flushBeforeQuit(app, () => new Promise(() => {}), { log: { warn() {} } });

    app.quit();
    await vi.advanceTimersByTimeAsync(FLUSH_DEADLINE_MS - 1);
    expect(app.quits).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(app.quits).toBe(2);
    // Two seconds and the counts' two: the whole way out is bounded.
    await vi.advanceTimersByTimeAsync(SECOND_QUIT_DEADLINE_MS);
    expect(app.exited).toBe(0);
    vi.useRealTimers();
  });

  it('ends a quit sooner than a screenshot run ends itself', () => {
    // Both deadlines are armed on a screenshot run. This one is the quit's own
    // and it has to be the one that fires, or the line in the log names the
    // wrong thing.
    expect(FLUSH_DEADLINE_MS + SECOND_QUIT_DEADLINE_MS).toBeLessThan(EXIT_DEADLINE_MS);
  });

  it('is the only app.quit() left in the quit sequence', () => {
    const code = fs.readFileSync(path.join(repo, 'main', 'quit-sequence.mjs'), 'utf8')
      .split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    // One, inside quitThenExit. A bare `app.quit()` anywhere else here is a way
    // out that can be ignored again.
    expect(code.match(/app\.quit\(\)/g)).toHaveLength(1);
    const source = fs.readFileSync(path.join(repo, 'main', 'quit-sequence.mjs'), 'utf8');
    expect(source).toMatch(/quitThenExit\(app, \{[^}]*deadlineMs: SECOND_QUIT_DEADLINE_MS/);
  });
});
