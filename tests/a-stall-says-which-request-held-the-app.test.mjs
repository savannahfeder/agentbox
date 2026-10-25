// A freeze of the app leaves a note saying which request held it.
//
// The spinning wheel kept coming up while reading threads and nothing recorded
// why, so the cause could only be guessed from reading the code. The minute
// line in the memory log (main/memory-log.mjs) now carries the longest time
// the main process went without answering, and every request from the window
// that held it for 100 ms or more, by name.
import { describe, it, expect } from 'vitest';
import { stallWatch, SLOW_MS } from '../main/stall-watch.mjs';

// A clock that moves only when a handler says it worked.
function watched() {
  let t = 0;
  const loop = { max: 0, enable() {}, reset() { this.max = 0; } };
  const watch = stallWatch({ clock: () => t, loop });
  return { watch, loop, work: (ms) => { t += ms; } };
}

describe('a request that holds the main process', () => {
  it('is named with how long it held it', () => {
    const { watch, work } = watched();
    watch.time('zero:open-artifact', () => work(840))();
    expect(watch.take().slowRequests).toEqual([{ channel: 'zero:open-artifact', times: 1, maxMs: 840 }]);
  });

  it('is counted each time and kept at its worst', () => {
    const { watch, work } = watched();
    const handler = watch.time('zero:code-change', (ms) => work(ms));
    handler(120); handler(300); handler(150);
    expect(watch.take().slowRequests).toEqual([{ channel: 'zero:code-change', times: 3, maxMs: 300 }]);
  });

  it('is named at exactly the threshold and not just under it', () => {
    const { watch, work } = watched();
    watch.time('at', () => work(SLOW_MS))();
    watch.time('under', () => work(SLOW_MS - 1))();
    expect(watch.take().slowRequests.map((s) => s.channel)).toEqual(['at']);
  });

  it('is still named when it throws, and the throw still reaches the window', () => {
    const { watch, work } = watched();
    const handler = watch.time('zero:read-doc', () => { work(500); throw new Error('gone'); });
    expect(() => handler()).toThrow('gone');
    expect(watch.take().slowRequests[0].channel).toBe('zero:read-doc');
  });

  it('hands back exactly what the handler returned', async () => {
    const { watch } = watched();
    const answer = { ok: true };
    expect(watch.time('a', () => answer)()).toBe(answer);
    expect(await watch.time('b', async () => answer)()).toBe(answer);
  });
});

describe('what is NOT a stall', () => {
  it('a request that waits on the disk without holding the process is not named', async () => {
    const { watch } = watched();
    // Its time passes while it is parked on a promise, which is when the
    // window is free to do everything else.
    await watch.time('zero:session-trace', () => new Promise((r) => setTimeout(r, 20)))();
    expect(watch.take().slowRequests).toEqual([]);
  });
});

describe('the minute line', () => {
  it('carries the longest freeze in whole milliseconds, the five worst requests, and starts again after', () => {
    const { watch, loop, work } = watched();
    loop.max = 2_400_000_000;
    for (const [channel, ms] of [['a', 100], ['b', 900], ['c', 200], ['d', 700], ['e', 300], ['f', 400]]) {
      watch.time(channel, () => work(ms))();
    }
    const line = watch.take();
    expect(line.longestStallMs).toBe(2400);
    expect(line.slowRequests.map((s) => s.channel)).toEqual(['b', 'd', 'f', 'e', 'c']);
    expect(watch.take()).toEqual({ longestStallMs: 0, slowRequests: [] });
  });
});
