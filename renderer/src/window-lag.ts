// HOW HELD THIS WINDOW'S OWN THREAD WAS, SAID ONCE A MINUTE
// (main/window-lag.mts puts it on the minute's memory-log line). The freeze
// recorder watches the main process only, and a window that answers a click
// late with main idle shows in none of its records.

/** An answer to a click or a key this late is one a person notices. */
export const SLOW_INPUT_MS = 100;
const EVERY_MS = 60_000;

export interface WindowLag { longMs: number; longest: number; slow: number; worst: number }

/** Adds up long tasks and slow answers to input until taken. Pure. */
export function lagCounter() {
  let lag: WindowLag = { longMs: 0, longest: 0, slow: 0, worst: 0 };
  let presses = new Set<number>();
  return {
    task(ms: number) {
      lag.longMs += ms;
      lag.longest = Math.max(lag.longest, ms);
    },
    /** `press` is the browser's id for one click or key, which reaches the page as several events. */
    input(ms: number, press?: number) {
      if (!(ms >= SLOW_INPUT_MS)) return;
      lag.worst = Math.max(lag.worst, ms);
      if (press) {
        if (presses.has(press)) return;
        presses.add(press);
      }
      lag.slow += 1;
    },
    /** The minute so far, rounded, and a fresh start; null when nothing was held. */
    take(): WindowLag | null {
      const was = lag;
      lag = { longMs: 0, longest: 0, slow: 0, worst: 0 };
      presses = new Set();
      if (!was.longMs && !was.slow) return null;
      return { longMs: Math.round(was.longMs), longest: Math.round(was.longest), slow: was.slow, worst: Math.round(was.worst) };
    },
  };
}

export function installWindowLag(say: ((lag: WindowLag) => unknown) | undefined = window.zero?.windowLag) {
  if (!say || typeof PerformanceObserver === 'undefined') return;
  const lag = lagCounter();
  try {
    new PerformanceObserver((list) => { for (const task of list.getEntries()) lag.task(task.duration); }).observe({ type: 'longtask' });
  } catch { /* a browser without long tasks says nothing of them */ }
  try {
    // Only entries with an interaction are a click, a key or a tap; the rest are moves and scroll ticks.
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { interactionId?: number })[]) if (e.interactionId) lag.input(e.duration, e.interactionId);
    }).observe({ type: 'event', durationThreshold: SLOW_INPUT_MS } as PerformanceObserverInit);
  } catch { /* nor of slow answers */ }
  setInterval(() => {
    const minute = lag.take();
    // A main process from before this channel refuses it.
    if (minute) void Promise.resolve(say(minute)).catch(() => {});
  }, EVERY_MS);
}
