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
import { setIconCount, startPhoneAlerts } from './phone-alerts';
import { installPhoneFiles } from './phone-files';
import { installPhoneScreen } from './phone-screen';
import { atMostEvery, PHONE_PUSH_MS } from './phone-polls';

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
// THE PHONE DOOR IS THE OTHER CASE (main/phone-link.mjs). Its address is not
// this computer's own, and there the key stays in the address bar on purpose:
// a phone's home-screen icon is saved from that address, and on a phone the
// icon gets storage of its own, so a key kept anywhere else is lost to it.
const LOOPBACK = /^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/;
export const onPhoneDoor = (host = location.hostname) => !LOOPBACK.test(host);

/** A made-up name for this browser, so Settings can list the phones. */
function deviceId(): string {
  const KEY = 'agentbox-device';
  try {
    const had = localStorage.getItem(KEY);
    if (had) return had;
    const made = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(KEY, made);
    return made;
  } catch {
    return 'private-tab';
  }
}

/** The key was reset on the computer: say so, rather than leave a dead inbox. */
function showLockedOut() {
  if (document.getElementById('phone-locked-out')) return;
  const box = document.createElement('div');
  box.id = 'phone-locked-out';
  box.setAttribute('role', 'alert');
  box.innerHTML = `<div><strong>This phone is disconnected.</strong><p>The key was reset on the computer. Open ${Name} there, go to Settings, then Phone, and scan the new code.</p></div>`;
  document.body.appendChild(box);
}

function takeToken(): string | null {
  const url = new URL(location.href);
  // THROUGH THE RELAY the key is after the # (relay/phone/), which a browser
  // never sends, so the relay never sees it.
  const fromHash = onPhoneDoor() ? /(?:^#|&)k=([A-Za-z0-9_-]{24,})/.exec(url.hash)?.[1] ?? null : null;
  const fromUrl = url.searchParams.get('token') ?? fromHash;
  if (fromUrl && onPhoneDoor()) {
    try { localStorage.setItem(TOKEN_KEY, fromUrl); } catch { /* private mode */ }
    return fromUrl;
  }
  if (!fromUrl && onPhoneDoor()) {
    try { const kept = localStorage.getItem(TOKEN_KEY); if (kept) return kept; } catch { /* private mode */ }
  }
  if (fromUrl) {
    url.searchParams.delete('token');
    // The entry's own mark stays: on a phone it may be the floor (./phone-screen).
    history.replaceState(history.state, '', url.toString());
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

  const device = deviceId();
  const phone = onPhoneDoor();
  if (phone) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = `/manifest.webmanifest?token=${encodeURIComponent(token)}`;
    document.head.appendChild(manifest);
    document.documentElement.dataset.door = 'phone';
    // After a turn sideways and back, iOS can leave the page scrolled by the
    // status bar's height (phone.css says why). Put it back once it settles.
    const unscroll = () => requestAnimationFrame(() => { if (scrollX || scrollY) scrollTo(0, 0); });
    addEventListener('orientationchange', () => { unscroll(); setTimeout(unscroll, 350); });
    addEventListener('resize', unscroll);
    visualViewport?.addEventListener('resize', unscroll);
    // The keyboard, the colour Safari paints round the page, and the
    // home-screen swipe back (phone-screen.ts).
    installPhoneScreen();
  }

  // PICTURES, IN EVERY TAB AND NOT ONLY ON A PHONE (w-326fb83c0e). The window
  // asks for them on the app's own scheme, which only Electron answers, so in
  // the browser copy every local picture in a thread drew as missing. They come
  // from this computer under the file key, which reads files and nothing else
  // (main/serve.mjs fileKey).
  fetch('/file-key', { headers: { [TOKEN_HEADER]: token } })
    .then((res) => (res.ok ? res.json() : null))
    .then((said) => { if (said?.key) installPhoneFiles(said.key); })
    .catch(() => { /* pictures stay blank; everything else still works */ });

  const ask = async (channel: string, payload?: unknown) => {
    const res = await fetch(`/api/${encodeURIComponent(channel)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TOKEN_HEADER]: token, 'x-agentbox-device': device },
      body: JSON.stringify(payload ?? null),
    });
    if (res.status === 403 && phone) showLockedOut();
    if (!res.ok) {
      // The screen shows what comes back from a channel, so this has to read as
      // a sentence rather than a status code.
      const said = await res.json().catch(() => ({}));
      throw new Error(said.error ?? `${Name} could not answer ${channel}.`);
    }
    return res.json();
  };

  const bridge: Record<string, unknown> = {};

  for (const [name, channel] of Object.entries(REQUEST_CHANNELS)) {
    const keys = WRAPPED_ARGS[name];
    bridge[name] = keys
      ? (...args: unknown[]) => ask(channel, Object.fromEntries(keys.map((k, i) => [k, args[i]])))
      : (payload?: unknown) => ask(channel, payload);
  }

  for (const name of DESKTOP_ONLY) bridge[name] = () => null;

  // ON A PHONE THE COUNT GOES ON THIS APP'S OWN ICON, not the computer's Dock.
  // The computer's alerts carry it while the app is closed (phone-alerts.ts).
  if (phone) bridge.badge = (count: unknown) => { setIconCount(Number(count) || 0); return Promise.resolve(null); };

  // The other direction. One event stream carries all eight channels, and each
  // `onSomething` is a subscription to its own name within it. The return value
  // is the unsubscribe function, because that is what preload.cjs returns and
  // the screen calls it on unmount.
  const listeners = new Map<string, Set<Push>>();
  for (const [name, channel] of Object.entries(PUSH_CHANNELS)) {
    bridge[name] = (fn: Push) => {
      const set = listeners.get(channel) ?? new Set<Push>();
      listeners.set(channel, set);
      set.add(fn);
      return () => set.delete(fn);
    };
  }

  // EventSource reconnects on its own, which is why the server sends a retry
  // hint and a heartbeat. A closed laptop lid is the ordinary case here.
  const stream = new EventSource(`/events?token=${encodeURIComponent(token)}&device=${encodeURIComponent(device)}`);
  // A refused stream is closed for good, where a dropped one only reconnects.
  // On a phone the one refusal there is is a key that was reset.
  stream.onerror = () => { if (phone && stream.readyState === EventSource.CLOSED) showLockedOut(); };
  const deliver = (channel: string, payload: unknown) => {
    for (const fn of listeners.get(channel) ?? []) {
      try { fn(payload); } catch { /* one listener's fault is its own */ }
    }
  };
  // "SOMETHING CHANGED" COMES UP TO 2.5 TIMES A SECOND while an agent writes,
  // and each one has the screen ask for the inbox and the thread again. On a
  // phone each of those is a paid request through the relay, so it reaches
  // the screen at most every 2 seconds, the last one always (./phone-polls).
  const changed = atMostEvery(PHONE_PUSH_MS, (payload: unknown) => deliver(PUSH_CHANNELS.onChanged, payload));
  stream.onmessage = (event) => {
    let message: { channel?: string; args?: unknown[] };
    try { message = JSON.parse(event.data); } catch { return; }
    if (!message.channel) return;
    if (phone && message.channel === PUSH_CHANNELS.onChanged) { changed(message.args?.[0]); return; }
    deliver(message.channel, message.args?.[0]);
  };

  (window as any).zero = bridge;
  // A tapped alert opens its thread, the way the desktop's notification does.
  if (phone) {
    startPhoneAlerts({ token, device }, (id) => {
      const set = listeners.get(PUSH_CHANNELS.onOpenItem);
      if (!set?.size) return false;
      for (const fn of set) { try { fn({ id }); } catch { /* its own fault */ } }
      return true;
    });
  }
  // A tab has no title bar to clear, so the window's top inset can match its
  // bottom one (renderer/src/threads/pages.css reads this).
  if (typeof document !== 'undefined') document.documentElement.dataset.shell = 'tab';
  return true;
}
