// sw.js — service worker minimal.
// Fungsinya di sini hanya supaya browser memenuhi syarat "installable" (Add to Home Screen).
// Tidak melakukan caching offline karena data jadwal harus selalu real-time dari server.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Selalu ambil langsung dari jaringan (tidak di-cache), supaya jadwal & status selalu terbaru.
  event.respondWith(fetch(event.request));
});

// ---------- Web Push Notification ----------
// Diterima dari server (lewat sendPushToAll di server.js) walau tab web sedang tertutup,
// selama browser/device masih menyala dan terhubung internet.
self.addEventListener('push', (event) => {
  let data = { title: 'Lonceng Gereja', body: 'Ada pembaruan jadwal.' };
  try {
    if (event.data) data = event.data.json();
  } catch (err) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || 'lonceng-gereja',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Lonceng Gereja', options));
});

// Saat notifikasi diklik: fokuskan tab yang sudah terbuka, atau buka tab baru
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
