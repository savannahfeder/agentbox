// CLOSING THE WINDOW KILLED THE APP BEFORE IT COULD SAY ANYTHING (w-60c8ddbab6,
// 2026-10-15).
//
// Three crash reports arrived from 0.1.13 installs, all of them the same stack:
//
//   main/main.mjs:1190  window-all-closed -> app.quit()
//   main/main.mjs:761   before-quit -> phone.close()
//   main/phone-link.mjs:525  close() -> relay.stop()
//   main/relay-client.mjs:236  stop() -> onChange()
//   main/main.mjs:750   onChange -> window.isDestroyed()
//   TypeError: Cannot read properties of null (reading 'isDestroyed')
//
// Closing the main window runs its `closed` handler, which sets `window = null`,
// and THEN `window-all-closed` quits. By the time `phone.close()` tells the
// relay to stop, and the relay reports the change back, there is no window left
// to ask. Measured on an Electron harness (scripts/scratch, one-off): the throw
// aborts the rest of the `before-quit` listeners, `main/crash-report.mjs`
// rethrows it as designed, and the process dies fatally. `updater.stop()` never
// ran, `will-quit` never fired, and so `analytics.flush()` NEVER RAN.
//
// That is the whole measurement blind spot this thread was opened to explain. Of
// the fourteen installs that arrived on 0.1.13 or 0.1.14, thirteen launched the
// app exactly once and never came back (PostHog, 2026-10-15). A crash report is
// written to disk and drained on the NEXT launch, so every one of those closes
// left a report nobody will ever receive, and the last batch of counts went with
// it. Exactly one install in the cohort relaunched, and it is the only one that
// delivered the crash.
//
// So two things have to hold, and the second is the one that matters even when
// some other step throws for some other reason: the phone's change handler must
// survive a window that has gone, and NO quit step may be able to take down the
// app before the counts are flushed.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { createPhoneLink } from '../main/phone-link.mjs';
import { createAnalytics } from '../main/analytics.mjs';
import { quitStep, flushBeforeQuit, FLUSH_DEADLINE_MS } from '../main/quit-sequence.mjs';

/** Electron's `app`, as far as quitting goes: before-quit, then will-quit, then quit. */
function fakeApp() {
  const app = new EventEmitter();
  app.quit = () => {
    let held = false;
    app.emit('before-quit', { preventDefault() {} });
    app.emit('will-quit', { preventDefault() { held = true; } });
    if (!held) app.emit('quit', {});
  };
  return app;
}

describe('the relay reports back on the way out', () => {
  it('closing the phone link tells its onChange, so a dead window is reached', () => {
    const onChange = vi.fn();
    const link = createPhoneLink({
      file: '/nowhere/phone-link.json',
      channels: new Map(),
      listeners: new Set(),
      relayUrl: 'wss://relay.example/room',
      onChange,
      interfaces: () => ({}),
      log: { warn() {} },
      tailscale: null,
    });
    onChange.mockClear();
    link.close();
    // THE CASE THAT MUST NOT BE WISHED AWAY. If this ever stops being true the
    // guard below is dead code, and someone will delete it.
    expect(onChange).toHaveBeenCalled();
  });
});

describe('a quit step cannot take the app down with it', () => {
  it('a step that throws does not stop the steps after it', () => {
    const app = fakeApp();
    const ran = [];
    quitStep(app, 'before-quit', 'killAll', () => ran.push('killAll'), { log: { warn() {} } });
    quitStep(app, 'before-quit', 'phone.close', () => { throw new TypeError("Cannot read properties of null (reading 'isDestroyed')"); }, { log: { warn() {} } });
    quitStep(app, 'before-quit', 'updater.stop', () => ran.push('updater.stop'), { log: { warn() {} } });
    expect(() => app.quit()).not.toThrow();
    expect(ran).toEqual(['killAll', 'updater.stop']);
  });

  it('says in the log which step failed, so it is not a silent swallow', () => {
    const app = fakeApp();
    const warn = vi.fn();
    quitStep(app, 'before-quit', 'phone.close', () => { throw new Error('no window'); }, { log: { warn } });
    app.quit();
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).toContain('phone.close');
    expect(String(warn.mock.calls[0][0])).toContain('no window');
  });

  it('runs its step once, not once per quit attempt', () => {
    const app = fakeApp();
    const step = vi.fn();
    quitStep(app, 'before-quit', 'codexWatch.stop', step, { log: { warn() {} } });
    app.quit();
    app.quit();
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('and the step that throws still lets the counts out', async () => {
    const app = fakeApp();
    let flushed = false;
    quitStep(app, 'before-quit', 'phone.close', () => { throw new TypeError('no window'); }, { log: { warn() {} } });
    flushBeforeQuit(app, async () => { flushed = true; }, { log: { warn() {} } });
    app.quit();
    await vi.waitFor(() => expect(flushed).toBe(true));
  });
});

describe('the last batch of counts gets out', () => {
  it('holds the quit open until the flush has finished, then quits', async () => {
    const app = fakeApp();
    let land = null;
    const quits = [];
    flushBeforeQuit(app, () => new Promise((r) => { land = r; }), { log: { warn() {} } });
    app.quit = () => quits.push(1);
    app.emit('will-quit', { preventDefault() {} });
    // The flush is started on a microtask, so give it one before holding it to
    // its word.
    await Promise.resolve();
    expect(typeof land).toBe('function');
    expect(quits).toEqual([]);          // still held: nothing has landed
    land();
    await vi.waitFor(() => expect(quits).toEqual([1]));
  });

  it('a flush that never lands does not hold the quit for ever', async () => {
    vi.useFakeTimers();
    try {
      const app = fakeApp();
      const quits = [];
      flushBeforeQuit(app, () => new Promise(() => {}), { log: { warn() {} } });
      app.quit = () => quits.push(1);
      app.emit('will-quit', { preventDefault() {} });
      expect(quits).toEqual([]);
      await vi.advanceTimersByTimeAsync(FLUSH_DEADLINE_MS - 1);
      expect(quits).toEqual([]);        // the boundary just short of the deadline
      await vi.advanceTimersByTimeAsync(1);
      expect(quits).toEqual([1]);       // and on it, the app goes anyway
    } finally { vi.useFakeTimers().clearAllTimers(); vi.useRealTimers(); }
  });

  it('a flush that throws is not a quit that hangs', async () => {
    const app = fakeApp();
    const quits = [];
    flushBeforeQuit(app, () => { throw new Error('posthog is not there'); }, { log: { warn() {} } });
    app.quit = () => quits.push(1);
    app.emit('will-quit', { preventDefault() {} });
    await vi.waitFor(() => expect(quits).toEqual([1]));
  });

  it('quits once however many times will-quit comes round', async () => {
    const app = fakeApp();
    const quits = [];
    const flush = vi.fn(async () => {});
    flushBeforeQuit(app, flush, { log: { warn() {} } });
    app.quit = () => quits.push(1);
    app.emit('will-quit', { preventDefault() {} });
    app.emit('will-quit', { preventDefault() {} });
    await vi.waitFor(() => expect(quits).toEqual([1]));
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe('a flush the quit now waits for still honours the switch', () => {
  const client = () => {
    const calls = { flush: 0, capture: 0 };
    return [calls, { capture: () => { calls.capture += 1; }, flush: async () => { calls.flush += 1; }, shutdown: async () => {} }];
  };

  it('flushes on the way out when diagnostics are on', async () => {
    const [calls, fake] = client();
    const a = createAnalytics({ config: {}, version: '0.1.14', client: fake });
    a.track('day_active');
    await a.flush();
    expect(calls.capture).toBe(1);
    expect(calls.flush).toBe(1);
  });

  it('does not flush once they are turned off, however they were captured', async () => {
    const config = {};
    const [calls, fake] = client();
    const a = createAnalytics({ config, version: '0.1.14', client: fake });
    a.track('day_active');                 // captured while the switch was on
    config.diagnostics = false;            // and then she turns it off
    await a.flush();
    expect(calls.capture).toBe(1);
    expect(calls.flush).toBe(0);           // section 10: from that moment
  });

  it('and turning them back on flushes again', async () => {
    const config = { diagnostics: false };
    const [calls, fake] = client();
    const a = createAnalytics({ config, version: '0.1.14', client: fake });
    await a.flush();
    expect(calls.flush).toBe(0);
    config.diagnostics = true;
    await a.flush();
    expect(calls.flush).toBe(1);
  });
});

describe('and the app is wired that way', () => {
  const main = fs.readFileSync(new URL('../main/main.mjs', import.meta.url), 'utf8');

  it('every quit step goes through the wrapper, and the flush holds the quit', () => {
    expect(main).toMatch(/import \{[^}]*flushBeforeQuit[^}]*\} from '\.\/quit-sequence\.mjs'/);
    expect(main).toMatch(/flushBeforeQuit\(app, \(\) => analytics\.flush\(\)/);
    // No bare quit listeners left: a step added without the wrapper is a step
    // that can kill the app on the way out again.
    expect(main.match(/app\.on\('before-quit'/g) ?? []).toHaveLength(0);
    expect(main.match(/app\.on\('will-quit'/g) ?? []).toHaveLength(0);
  });
});
