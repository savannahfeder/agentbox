// ALERTS AND THE ICON COUNT, ON A PHONE.
//
// The computer sends each alert (main/phone-link.mjs); this is the phone's
// half. It registers the worker that shows alerts while the app is closed
// (main/phone-sw.js), asks to turn them on when somebody taps for it, keeps the
// icon's count while the app is open, and opens the thread an alert was about.
//
// iOS gives a web app alerts only when it was opened from the home screen and
// only over https, which for this app is the Tailscale address. Each state the
// phone can be in has its own sentence, so a button never just does nothing.

import { Name } from '../../shared/product-name.mjs';

export type AlertsState = 'on' | 'off' | 'blocked' | 'needs-home-screen' | 'needs-secure' | 'unsupported';

let auth: { token: string; device: string } | null = null;
let openItem: ((id: string) => void) | null = null;

const IOS = () => /iPhone|iPad/.test(navigator.userAgent);
// iOS says whether the page was opened from the home screen; only iOS needs to.
const standalone = () => (navigator as any).standalone === true;
const pushable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function ask(action: string, extra: Record<string, unknown> = {}) {
  if (!auth) throw new Error('Not on the phone door.');
  const res = await fetch('/phone/alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agentbox-token': auth.token, 'x-agentbox-device': auth.device },
    body: JSON.stringify({ action, ...extra }),
  });
  const said = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(said.error ?? `${Name} could not answer.`);
  return said;
}

const worker = () => navigator.serviceWorker.register('/phone-sw.js', { scope: '/' });

export async function alertsState(): Promise<AlertsState> {
  if (!auth) return 'unsupported';
  if (!isSecureContext) return 'needs-secure';
  if (!pushable()) return IOS() && !standalone() ? 'needs-home-screen' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try { return (await ask('state')).on && Notification.permission === 'granted' ? 'on' : 'off'; } catch { return 'off'; }
}

/** Must run inside a tap: iOS only asks for permission from one. */
export async function turnOnAlerts(): Promise<AlertsState> {
  const state = await alertsState();
  if (state !== 'off') return state;
  const allowed = await Notification.requestPermission();
  if (allowed !== 'granted') return allowed === 'denied' ? 'blocked' : 'off';
  const { publicKey } = await ask('key');
  const reg = await worker();
  await navigator.serviceWorker.ready;
  const had = await reg.pushManager.getSubscription();
  const sub = had ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) });
  await ask('subscribe', { subscription: sub.toJSON() });
  return 'on';
}

export async function turnOffAlerts(): Promise<AlertsState> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    await (await reg?.pushManager.getSubscription())?.unsubscribe();
  } catch { /* the computer forgets it either way */ }
  await ask('unsubscribe');
  return 'off';
}

export async function testAlert(): Promise<boolean> {
  return !!(await ask('test')).sent;
}

export const ALERTS_SAY: Record<AlertsState, string> = {
  on: 'Alerts are on. This phone hears when an agent needs you, and the icon shows how many threads are waiting.',
  off: 'Get an alert when an agent needs you, and a count on the icon.',
  blocked: 'Alerts are blocked for this app. Turn them on in the phone\'s Settings, under Notifications.',
  'needs-home-screen': 'To get alerts, add this page to your home screen (Share, then Add to Home Screen) and open it from there.',
  'needs-secure': 'Alerts need the secure address. On the computer, open Settings, then Phone, and pick Tailscale.',
  unsupported: 'This browser cannot show alerts from a web app.',
};

/** The icon's count, while the app is open. The computer's alerts carry it
 *  while the app is closed. */
export function setIconCount(n: number) {
  const nav = navigator as any;
  try {
    if (n > 0) void nav.setAppBadge?.(n)?.catch?.(() => {});
    else void nav.clearAppBadge?.()?.catch?.(() => {});
  } catch { /* not every browser has a count */ }
}

/**
 * Called once by the bridge on the phone door. `open` opens a thread the way
 * the desktop's own notification does (`zero:open-item`).
 */
export function startPhoneAlerts(given: { token: string; device: string }, open: (id: string) => boolean) {
  auth = given;
  openItem = (id) => {
    // The screen may not be listening yet on a cold start; try for a while.
    let tries = 0;
    const go = () => { if (!open(id) && ++tries < 40) setTimeout(go, 250); };
    go();
  };
  if (pushable() && isSecureContext) {
    worker().catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.agentbox === 'open-item' && typeof e.data.id === 'string') openItem?.(e.data.id);
    });
  }
  const m = location.hash.match(/^#open=(.+)$/);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    openItem(decodeURIComponent(m[1]));
  }
  void offerAlerts();
}

const DISMISSED = 'agentbox-alerts-not-now';

/** One quiet line above the bottom bar, until it is answered. */
async function offerAlerts() {
  const state = await alertsState();
  if (state !== 'off' && state !== 'needs-home-screen') return;
  try { if (localStorage.getItem(DISMISSED) === state) return; } catch { /* private mode */ }
  if (document.getElementById('phone-alerts-ask')) return;
  const bar = document.createElement('div');
  bar.id = 'phone-alerts-ask';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Alerts');
  const say = document.createElement('span');
  say.textContent = state === 'off' ? 'Get an alert when an agent needs you?' : ALERTS_SAY['needs-home-screen'];
  bar.appendChild(say);
  const close = () => bar.remove();
  if (state === 'off') {
    const on = document.createElement('button');
    on.type = 'button';
    on.textContent = 'Turn on';
    on.onclick = async () => {
      on.disabled = true;
      try {
        const now = await turnOnAlerts();
        if (now === 'on') return close();
        say.textContent = ALERTS_SAY[now];
        if (now === 'off') on.disabled = false;
        else on.remove();
      } catch (err) {
        say.textContent = `Alerts could not be turned on: ${(err as Error).message ?? err}`;
        on.disabled = false;
      }
    };
    bar.appendChild(on);
  }
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'quiet';
  later.textContent = 'Not now';
  later.onclick = () => { try { localStorage.setItem(DISMISSED, state); } catch {} close(); };
  bar.appendChild(later);
  document.body.appendChild(bar);
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
