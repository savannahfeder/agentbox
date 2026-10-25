// A SCREENSHOT RUN TOOK THE PICTURE AND THEN NEVER ENDED (QA, 2026-10-23).
//
// `ZERO_NO_SUPERVISOR=1 ZERO_SCREENSHOT=/tmp/shot.png timeout 40 agentbox` on
// Linux wrote the file, logged `screenshot: /tmp/shot.png`, and then sat there
// until the shell's `timeout` killed it: exit 124, forty seconds, every time,
// through the launcher and through npx alike. The `app.quit()` at the end of
// that path did not end the app.
//
// WHERE IT STOPS, measured on 2026-10-24 by logging every quit event of a real
// Linux launch: `before-quit` fires, `will-quit` fires and is held for the last
// batch of counts (flushBeforeQuit), the flush finishes and asks again, and
// that second ask does nothing at all — no event, no exit. The whole account,
// and which quits it ruins, is in
// tests/a-quit-held-for-the-last-counts-still-ends-the-app, where that hold now
// ends the process itself. This deadline is the outer one, for a screenshot run
// that never gets as far as a quit.
//
// `app.quit()` only asks. It is still asked first, because that is what runs
// the quit steps and lets the workers go, and if the quit has not happened by
// the deadline the process is ended outright with a line saying so.
//
// The deadline has to outlast that flush hold, or a quit that is working would
// be cut off mid-way.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  quitThenExit, flushBeforeQuit, EXIT_DEADLINE_MS, FLUSH_DEADLINE_MS,
} from '../main/quit-sequence.mjs';

const repo = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

/** Electron's `app`, as far as quitting goes, with a quit that can be refused. */
function fakeApp({ quits = true } = {}) {
  const app = new EventEmitter();
  app.exited = null;
  app.quits = 0;
  app.exit = (code) => { app.exited = code; };
  app.quit = () => {
    app.quits += 1;
    let held = false;
    app.emit('before-quit', { preventDefault() {} });
    app.emit('will-quit', { preventDefault() { held = true; } });
    if (!held && quits) app.emit('quit', {});
  };
  return app;
}

describe('a screenshot run ends when it has taken the picture', () => {
  it('asks for the quit first, and leaves it there when the quit happens', () => {
    vi.useFakeTimers();
    const app = fakeApp();
    quitThenExit(app, { what: 'the screenshot run', log: { warn() {} } });
    expect(app.quits).toBe(1);
    expect(app.exited).toBe(null);
    vi.advanceTimersByTime(EXIT_DEADLINE_MS * 3);
    expect(app.exited).toBe(null);
    vi.useRealTimers();
  });

  it('ends the process anyway when the quit never comes', () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    const app = fakeApp({ quits: false });
    quitThenExit(app, { what: 'the screenshot run', log: { warn } });
    expect(app.quits).toBe(1);
    // Right up to the deadline it is still the app's own quit that is wanted.
    vi.advanceTimersByTime(EXIT_DEADLINE_MS - 1);
    expect(app.exited).toBe(null);
    vi.advanceTimersByTime(1);
    expect(app.exited).toBe(0);
    expect(warn.mock.calls[0][0]).toMatch(/the screenshot run asked the app to quit/);
    vi.useRealTimers();
  });

  it('gives a quit held open for the last counts time to finish', async () => {
    vi.useFakeTimers();
    const app = fakeApp();
    const flush = vi.fn(() => new Promise(() => {}));   // one that never answers
    flushBeforeQuit(app, flush, { log: { warn() {} } });
    expect(EXIT_DEADLINE_MS).toBeGreaterThan(FLUSH_DEADLINE_MS);

    quitThenExit(app, { what: 'the screenshot run', log: { warn() {} } });
    await Promise.resolve();
    expect(flush).toHaveBeenCalled();
    expect(app.exited).toBe(null);
    // The flush gives up at its own deadline and the quit goes through, so the
    // fallback never fires.
    vi.advanceTimersByTime(FLUSH_DEADLINE_MS);
    vi.advanceTimersByTime(EXIT_DEADLINE_MS);
    expect(app.exited).toBe(null);
    vi.useRealTimers();
  });

  it('is what the screenshot path uses, and the only thing that uses it', () => {
    const main = fs.readFileSync(path.join(repo, 'main', 'main.mjs'), 'utf8');
    const block = main.slice(main.indexOf('const shotPath = process.env.ZERO_SCREENSHOT'));
    expect(block.slice(0, block.indexOf('window.on(\'closed\''))).toMatch(/quitThenExit\(app, \{ what: 'the screenshot run' \}\)/);
    // A quit somebody asked for by hand is not cut short: this is for a run
    // that is meant to end by itself.
    expect(main.match(/quitThenExit\(/g)).toHaveLength(1);
  });
});
