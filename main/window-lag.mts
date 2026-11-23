// WHAT THE WINDOWS SAID OF THEIR OWN LAG THIS MINUTE, kept until the minute's
// memory-log line takes it (renderer/src/window-lag.ts sends it).

export interface WindowLag { longMs: number; longest: number; slow: number; worst: number }

/** More than a page could have measured between two lines of the log. */
const MOST_MS = 120_000;
const MOST_INPUTS = 10_000;

const amount = (v: unknown, most: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(most, Math.round(v)) : null);

export function windowLagCollector() {
  let kept: WindowLag | null = null;
  return {
    /** One window's minute. False for anything that is not four amounts. */
    add(said: unknown): boolean {
      const s = (said ?? {}) as Record<string, unknown>;
      const longMs = amount(s.longMs, MOST_MS);
      const longest = amount(s.longest, MOST_MS);
      const slow = amount(s.slow, MOST_INPUTS);
      const worst = amount(s.worst, MOST_MS);
      if (longMs === null || longest === null || slow === null || worst === null) return false;
      kept = {
        longMs: Math.min(MOST_MS, (kept?.longMs ?? 0) + longMs),
        longest: Math.max(kept?.longest ?? 0, longest),
        slow: Math.min(MOST_INPUTS, (kept?.slow ?? 0) + slow),
        worst: Math.max(kept?.worst ?? 0, worst),
      };
      return true;
    },
    /** The line's `windowLag`, or nothing for a minute no window spoke in. */
    take(): { windowLag?: WindowLag } {
      const was = kept;
      kept = null;
      return was ? { windowLag: was } : {};
    },
  };
}

export type WindowLagCollector = ReturnType<typeof windowLagCollector>;
