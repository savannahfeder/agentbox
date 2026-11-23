// WHEN THIS WINDOW'S OWN THREAD HOLDS FOR A SECOND OR MORE, main hears how
// long (main/setup-freezes.mts). The freeze recorder only watches the main
// process, and a window busy drawing chats coming in looks just as stuck.
const HELD_MS = 1000;

export function installWindowHolds(say: ((ms: number) => unknown) | undefined = window.zero?.windowHeld) {
  if (!say || typeof PerformanceObserver === 'undefined') return;
  try {
    new PerformanceObserver((list) => {
      for (const task of list.getEntries()) if (task.duration >= HELD_MS) void say(Math.round(task.duration));
    }).observe({ type: 'longtask' });
  } catch { /* a browser without long tasks says nothing */ }
}
