/* Stack Prep service worker: push notifications only (founder, 18 Nov 2026; apps/api push.py).
   It caches nothing, so the app always loads fresh. A push shows as a phone notification; a tap
   opens the page it points to, in the app if it is already open. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Stack Prep', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Stack Prep', {
      body: data.body || '',
      icon: '/brand/mark-192.png',
      badge: '/brand/mark-96.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/notifications', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) {
        open.focus();
        return open.navigate ? open.navigate(url) : undefined;
      }
      return self.clients.openWindow(url);
    }),
  );
});
