// The minute log counts what the window asked and what it cost.
//
// 2026-11-23: with no agent running at all, the app's main thread was busy
// 14% of the time, and the window's request for the inbox was a tenth of
// that. Nothing recorded how often the window asks. The minute line names a
// request only when one call holds the app for 100 ms, so a request made
// often at a few milliseconds a time left no trace, and how often it came
// could only be guessed from its share of a CPU record.
import { describe, it, expect } from 'vitest';
import { stallWatch, SLOW_MS } from '../main/stall-watch.mts';

// A clock that moves only when a handler says it worked.
function watched() {
  let t = 0;
  const loop = { max: 0, enable() {}, reset() { this.max = 0; } };
  const watch = stallWatch({ clock: () => t, loop });
  return { watch, work: (ms: number) => { t += ms; } };
}

describe('a request the window makes often and quickly', () => {
  it('is counted, with the time all of its calls took together', () => {
    const { watch, work } = watched();
    const snapshot = watch.time('zero:snapshot', () => work(6));
    for (let n = 0; n < 150; n += 1) snapshot();
    const line = watch.take();
    expect(line.requests).toEqual([{ channel: 'zero:snapshot', times: 150, ms: 900 }]);
    // None of them held the app, so none is named as slow.
    expect(line.slowRequests).toEqual([]);
  });

  it('adds up calls of under a millisecond rather than rounding each to nothing', () => {
    const { watch, work } = watched();
    const quick = watch.time('zero:thread-live', () => work(0.4));
    for (let n = 0; n < 1000; n += 1) quick();
    expect(watch.take().requests).toEqual([{ channel: 'zero:thread-live', times: 1000, ms: 400 }]);
  });

  it('is still counted when it throws', () => {
    const { watch, work } = watched();
    const handler = watch.time('zero:read-doc', () => { work(3); throw new Error('gone'); });
    expect(() => handler()).toThrow('gone');
    expect(watch.take().requests).toEqual([{ channel: 'zero:read-doc', times: 1, ms: 3 }]);
  });
});

describe('the minute\'s requests', () => {
  it('are the five that cost most together, most first, however many were made', () => {
    const { watch, work } = watched();
    const cost: Record<string, number> = { a: 1, b: 9, c: 3, d: 7, e: 5, f: 2, g: 8 };
    for (const [channel, ms] of Object.entries(cost)) { const fn = watch.time(channel, () => work(ms)); fn(); fn(); }
    expect(watch.take().requests).toEqual([
      { channel: 'b', times: 2, ms: 18 }, { channel: 'g', times: 2, ms: 16 }, { channel: 'd', times: 2, ms: 14 },
      { channel: 'e', times: 2, ms: 10 }, { channel: 'c', times: 2, ms: 6 },
    ]);
  });

  it('count a slow call too, which is also named as slow', () => {
    const { watch, work } = watched();
    watch.time('zero:open-artifact', () => work(SLOW_MS + 40))();
    const line = watch.take();
    expect(line.requests).toEqual([{ channel: 'zero:open-artifact', times: 1, ms: SLOW_MS + 40 }]);
    expect(line.slowRequests).toEqual([{ channel: 'zero:open-artifact', times: 1, maxMs: SLOW_MS + 40 }]);
  });

  it('start again each minute', () => {
    const { watch, work } = watched();
    watch.time('zero:snapshot', () => work(6))();
    watch.take();
    watch.time('zero:snapshot', () => work(6))();
    expect(watch.take().requests).toEqual([{ channel: 'zero:snapshot', times: 1, ms: 6 }]);
  });

  it('are left off a minute in which the window asked for nothing', () => {
    const { watch } = watched();
    expect(watch.take()).toEqual({ longestStallMs: 0, slowRequests: [] });
  });
});
