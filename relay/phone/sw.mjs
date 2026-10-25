// THE PHONE'S SERVICE WORKER ON THE RELAY (served at /relay-sw.js by
// relay/worker.mjs, built by relay/build.mjs). It answers every request the
// inbox makes on this site, the page itself included, through the tunnel to
// the Mac (tunnel.mjs), so the relay only ever carries sealed bytes. The
// relay's own few files, and the tunnel's own requests, go straight out.
//
// The build puts main/phone-sw.js after this, so alerts and their taps work
// exactly as they do on the Wi-Fi.
import { relayIds, relayKeys } from '../../shared/relay-crypto.mjs';
import { tunnelFetch, withPatience } from './tunnel.mjs';
import { readKey, keyFor } from './store.mjs';

const OWN = new Set(['/relay-sw.js', '/phone-icon.png', '/apple-touch-icon.png', '/favicon.ico']);

let ctx = null;
let ctxFor = null;
async function context(opened = null) {
  const key = await keyFor(opened);
  if (!key) return null;
  if (key !== ctxFor) {
    const { room } = await relayIds(key);
    ctx = { room, keys: await relayKeys(key) };
    ctxFor = key;
  }
  return ctx;
}

// Where the browser keeps the # out of the worker's view, the "not connected"
// page passes on the key it was opened with (tunnel.mjs TAKE_KEY).
self.addEventListener('message', (event) => {
  if (typeof event.data?.key !== 'string') return;
  event.waitUntil((async () => {
    const kept = await readKey().catch(() => null);
    const now = await keyFor(new URL(`/#k=${event.data.key}`, self.location.href).href);
    if (now !== kept) event.source?.postMessage('key-taken');
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (OWN.has(url.pathname) || url.pathname.startsWith('/t/') || url.pathname.startsWith('/mac/') || url.searchParams.has('boot')) return;
  event.respondWith((async () => {
    const c = await context(event.request.mode === 'navigate' ? event.request.url : null);
    // No key yet: the relay's own first page, which takes it from the address.
    if (!c) return fetch('/?boot=1');
    // Opening the app, from an alert above all, waits a little for a computer
    // that is reconnecting rather than showing "not connected" on the first miss.
    const res = event.request.mode === 'navigate'
      ? await withPatience(() => tunnelFetch(event.request, c))
      : await tunnelFetch(event.request, c);
    // Turned away by the Mac: the key it holds is not this one (a new code was
    // scanned, or the key was reset). The first page sorts out which.
    if (event.request.mode === 'navigate' && res.status === 400) return fetch('/?boot=stale');
    return res;
  })());
});
