// HOW OFTEN A PHONE ASKS ITS MAC AGAIN (2026-10-13).
//
// Through the relay every question a phone asks is a request paid for on
// Cloudflare, and the screen was built for a desktop, where asking is free.
// The Mac pushes "something changed" over the event stream, so a phone's
// timers are only a backstop. Measured and counted in
// tests/a-phone-asks-its-mac-only-as-often-as-it-needs.

/** The fastest a timer repeats on a phone. */
export const PHONE_POLL_MS = 30_000;
/** The most often "something changed" reaches a phone's screen. */
export const PHONE_PUSH_MS = 2_000;

/** A timer's interval: unchanged on the desktop, at least PHONE_POLL_MS on a phone. */
export const pollEvery = (ms: number, phone: boolean) => (phone ? Math.max(ms, PHONE_POLL_MS) : ms);

/**
 * A read never asked again on top of itself. A call while one is out asks
 * once more after it, however many calls came, so the newest state still
 * arrives (tests/a-phone-never-piles-up-requests-on-its-computer).
 */
export function oneAtATime(read: () => Promise<unknown>) {
  let out = false;
  let again = false;
  const run = (): void => {
    out = true;
    again = false;
    read().catch(() => {}).finally(() => {
      out = false;
      if (again) run();
    });
  };
  return () => { if (out) again = true; else run(); };
}

/**
 * `fn` at most once every `ms`: the first call at once, and the latest of any
 * that came in between once the time is up, so the last change is never missed.
 */
export function atMostEvery<A>(ms: number, fn: (arg: A) => void) {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: { arg: A } | null = null;
  const run = (arg: A) => { last = Date.now(); fn(arg); };
  return (arg: A) => {
    const wait = last + ms - Date.now();
    if (wait <= 0 && !timer) { run(arg); return; }
    latest = { arg };
    timer ??= setTimeout(() => {
      timer = null;
      const next = latest;
      latest = null;
      if (next) run(next.arg);
    }, Math.max(wait, 0));
  };
}
