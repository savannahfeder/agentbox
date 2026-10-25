// WHICH REQUEST HELD THE APP. A spinning wheel on a Mac is the main process
// not answering, and nothing used to record what it was doing instead. This
// times every request the window makes and keeps the longest freeze; the
// memory log writes both into its minute line (main/memory-log.mjs).
//
// Only the synchronous part of a handler is timed. That is the part that holds
// the process: once a handler waits on a promise the window is free again.
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

export const SLOW_MS = 100;

export function stallWatch({ clock = () => performance.now(), loop = monitorEventLoopDelay({ resolution: 20 }) } = {}) {
  loop.enable();
  let slow = new Map();
  let freezes = [];
  return {
    /** A freeze main/freeze-recorder.mjs caught, with the function that held it. */
    noteFreeze({ ms, where }) {
      freezes.push({ ms, where });
    },
    time(channel, fn) {
      return (...args) => {
        const start = clock();
        try {
          return fn(...args);
        } finally {
          const ms = Math.round(clock() - start);
          if (ms >= SLOW_MS) {
            const seen = slow.get(channel) ?? { channel, times: 0, maxMs: 0 };
            seen.times += 1;
            seen.maxMs = Math.max(seen.maxMs, ms);
            slow.set(channel, seen);
          }
        }
      };
    },
    /** The minute so far, and a fresh start. */
    take() {
      const out = {
        longestStallMs: Math.round(loop.max / 1e6),
        slowRequests: [...slow.values()].sort((a, b) => b.maxMs - a.maxMs).slice(0, 5),
        ...(freezes.length ? { freezes: freezes.sort((a, b) => b.ms - a.ms).slice(0, 5) } : {}),
      };
      loop.reset();
      slow = new Map();
      freezes = [];
      return out;
    },
  };
}
