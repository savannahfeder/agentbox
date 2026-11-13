// expo-router unbinds its imperative router while the root remounts (Android
// recreates the activity on a font-size or density change) and every call in
// that gap throws, which a release build turns into a crash. This wrapper holds
// the newest call until the router is bound again, and gives up after a deadline.
//
// expo-router's own binding can also stay lost: the new root binds it before the
// old root's cleanup unbinds it. So the root layout hands over the router its
// hook made (bindLive), and only the root that bound a router can take it away.
export const NOT_READY = 'The imperative router is unavailable before the first render has finished.';

const ASKS = new Set(['canGoBack', 'canDismiss']);

type Options = { later?: (f: () => void) => unknown; giveUpMs?: number; now?: () => number; warn?: (msg: string) => void };

type Methods = Record<string, (...args: unknown[]) => unknown>;

export type PatientRouter<R> = R & { bindLive: (live: object) => () => void };

const notReady = (e: unknown) => e instanceof Error && e.message === NOT_READY;

export function patientRouter<R extends object>(real: R, opts: Options = {}): PatientRouter<R> {
  const later = opts.later ?? ((f) => setTimeout(f, 50));
  const giveUpMs = opts.giveUpMs ?? 5000;
  const now = opts.now ?? Date.now;
  const warn = opts.warn ?? ((m) => console.warn(m));
  let pending: { name: string; args: unknown[]; since: number } | null = null;
  let live: { router: Methods } | null = null;

  const call = (name: string, args: unknown[]) => {
    const target = live ? live.router : (real as Methods);
    const fn = target[name];
    if (typeof fn !== 'function') throw new Error(NOT_READY);
    return fn(...args);
  };

  const attempt = () => {
    const p = pending;
    if (!p) return;
    try {
      call(p.name, p.args);
      pending = null;
    } catch (e) {
      if (!notReady(e)) { pending = null; throw e; }
      if (now() - p.since >= giveUpMs) { pending = null; warn(`router.${p.name} dropped: the screen did not come back within ${giveUpMs} ms`); return; }
      later(attempt);
    }
  };

  const bindLive = (router: object) => {
    const mine = { router: router as Methods };
    live = mine;
    return () => { if (live === mine) live = null; };
  };

  return new Proxy(real, {
    get(target, name) {
      if (name === 'bindLive') return bindLive;
      const value = (target as Record<string | symbol, unknown>)[name];
      if (typeof value !== 'function' || typeof name !== 'string') return value;
      return (...args: unknown[]) => {
        try {
          const out = call(name, args);
          if (!ASKS.has(name)) pending = null;
          return out;
        } catch (e) {
          if (!notReady(e)) throw e;
          if (ASKS.has(name)) return false;
          // A later tap replaces the held one, so a rebuild never replays two.
          const waiting = pending != null;
          pending = { name, args, since: now() };
          if (!waiting) later(attempt);
          return undefined;
        }
      };
    },
  }) as PatientRouter<R>;
}
