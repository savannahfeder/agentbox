/** Calls `read` after a change, at most once every `ms`, and always once after the last change. */
export function askAtMostEvery(ms: number, read: () => void): { changed: () => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  return {
    changed() {
      if (stopped || timer) return;
      timer = setTimeout(() => { timer = null; if (!stopped) read(); }, ms);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
