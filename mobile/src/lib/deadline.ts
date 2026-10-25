// Every request the app makes ends: one that never answers is cut off, as the
// desktop's are (main/team/session.mjs `withDeadline`). A caller's own signal
// still ends it sooner.
export const CLOUD_DEADLINE_MS = 60_000;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function withDeadline(fetchImpl: Fetch, ms = CLOUD_DEADLINE_MS): Fetch {
  return (url, init = {}) => {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(new Error('The cloud took too long to answer.')), ms);
    const own = init.signal;
    if (own?.aborted) stop.abort(own.reason);
    else own?.addEventListener('abort', () => stop.abort(own.reason), { once: true });
    return fetchImpl(url, { ...init, signal: stop.signal }).finally(() => clearTimeout(timer));
  };
}
