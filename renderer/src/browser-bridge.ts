// THE SAME BRIDGE, IN A TAB.
//
// The screen talks to the rest of the app through `window.zero`, which on the
// desktop is built by preload.cjs out of Electron's private channel between a
// window and the app. A browser tab has no such channel, so this builds the
// identical object out of ordinary http instead: every name calls the same
// handler, through the server in main/serve.mjs.
//
// It is built rather than written out. Both halves read shared/bridge-map.mjs,
// so a channel cannot be added to one door and forgotten on the other, and
// nothing in api.ts had to change to gain a second transport: it asks whether
// `window.zero` is there, and now it is either way.
//
// WHY THIS RUNS BEFORE ANYTHING ELSE. api.ts decides between real data and
// fixtures once, at module load, by reading `window.zero`. So this has to have
// finished before the first import of api.ts, which is why main.tsx calls it
// on its very first line.

import { REQUEST_CHANNELS, PUSH_CHANNELS, WRAPPED_ARGS, DESKTOP_ONLY } from '../../shared/bridge-map.mjs';
import { Name } from '../../shared/product-name.mjs';

type Push = (payload: unknown) => void;

// The header and the storage key are spelled out rather than built from the
// product name, on purpose. They are wire identifiers that main/serve.mjs has
// to agree with exactly, and renaming the app should not invalidate a token a
// tab is already holding. Everything a person READS uses `Name`.
const TOKEN_HEADER = 'x-agentbox-token';
const TOKEN_KEY = 'agentbox-token';

/**
 * Is this a tab talking to a local Agentbox, or something else?
 *
 *  The token is put in the url by the terminal that started the server. It is
 *  taken out of the address bar straight away: it is a password, the page does
 *  not want it in a screenshot, and it would otherwise ride along into every
 *  link somebody copies out of here.
 */
function takeToken(): string | null {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('token');
  if (fromUrl) {
    url.searchParams.delete('token');
    history.replaceState(null, '', url.toString());
    // Kept for the life of the tab only. A reload without the url is a reload
    // that cannot talk, and sessionStorage is what makes ⌘R survivable while
    // still being gone when the tab closes.
    try { sessionStorage.setItem(TOKEN_KEY, fromUrl); } catch { /* private mode */ }
    return fromUrl;
  }
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function installBrowserBridge(): boolean {
  // A desktop window already has the real bridge and must keep it.
  if (typeof window === 'undefined' || (window as any).zero) return false;
  const token = takeToken();
  if (!token) return false;

  const ask = async (channel: string, payload?: unknown) => {
    const res = await fetch(`/api/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TOKEN_HEADER]: token },
      body: JSON.stringify(payload ?? null),
    });
    if (!res.ok) {
      // The screen shows what comes back from a channel, so this has to read as
      // a sentence rather than a status code.
      const said = await res.json().catch(() => ({}));
      throw new Error(said.error ?? `${Name} could not answer ${channel}.`);
    }
    return res.json();
  };

  const bridge: Record<string, unknown> = {};

  for (const [name, channel] of Object.entries(REQUEST_CHANNELS as Record<string, string>)) {
    const keys = (WRAPPED_ARGS as Record<string, string[]>)[name];
    bridge[name] = keys
      ? (...args: unknown[]) => ask(channel, Object.fromEntries(keys.map((k, i) => [k, args[i]])))
      : (payload?: unknown) => ask(channel, payload);
  }

  for (const name of DESKTOP_ONLY as string[]) bridge[name] = () => null;

  // The other direction. One event stream carries all eight channels, and each
  // `onSomething` is a subscription to its own name within it. The return value
  // is the unsubscribe function, because that is what preload.cjs returns and
  // the screen calls it on unmount.
  const listeners = new Map<string, Set<Push>>();
  for (const [name, channel] of Object.entries(PUSH_CHANNELS as Record<string, string>)) {
    bridge[name] = (fn: Push) => {
      const set = listeners.get(channel) ?? new Set<Push>();
      listeners.set(channel, set);
      set.add(fn);
      return () => set.delete(fn);
    };
  }

  // EventSource reconnects on its own, which is why the server sends a retry
  // hint and a heartbeat. A closed laptop lid is the ordinary case here.
  const stream = new EventSource(`/events?token=${encodeURIComponent(token)}`);
  stream.onmessage = (event) => {
    let message: { channel?: string; args?: unknown[] };
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message.channel) return;
    for (const fn of listeners.get(message.channel) ?? []) {
      try { fn(message.args?.[0]); } catch { /* one listener's fault is its own */ }
    }
  };

  (window as any).zero = bridge;
  return true;
}
