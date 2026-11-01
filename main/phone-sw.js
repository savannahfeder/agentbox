// THE PHONE'S ALERT WORKER (main/phone-link.mjs serves it at /phone-sw.js).
//
// It runs on the phone, not here, and only for the app on the home screen. It
// does two things when an alert arrives from the computer, even while the app
// is closed: it sets the count on the icon, and it shows the alert. Tapping the
// alert opens the app on the thread it was about.
//
// Plain script, no imports: a service worker is fetched on its own and has no
// bundler behind it. The app's name is filled in as it is served.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let say = {};
  try { say = event.data ? event.data.json() : {}; } catch { say = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    // The icon's count. iOS lets an app set it from here, and only with alerts
    // allowed, which they are if this ran at all.
    if (typeof say.count === 'number' && self.navigator.setAppBadge) {
      try {
        if (say.count > 0) await self.navigator.setAppBadge(say.count);
        else await self.navigator.clearAppBadge();
      } catch { /* a count is a nicety; the alert still shows */ }
    }
    // Every push must show something on iOS, or it stops delivering them.
    await self.registration.showNotification(say.title || '__APP_NAME__', {
      body: say.body || '',
      tag: say.tag || 'agentbox',
      icon: '/phone-icon.png',
      badge: '/phone-icon.png',
      data: { open: say.open || null },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const open = event.notification.data && event.notification.data.open;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        if (open) client.postMessage({ agentbox: 'open-item', id: open });
        return client.focus();
      }
    }
    return self.clients.openWindow(open ? `/#open=${encodeURIComponent(open)}` : '/');
  })());
});
