/* ══════════════════════════════════════════════
   Service Worker — PWA кэширование
   ══════════════════════════════════════════════ */

const CACHE_NAME = 'dialisys-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/session.js',
  '/js/analyses.js',
  '/js/food.js',
  '/js/history.js',
  '/js/chat.js',
  '/manifest.json',
];

// Установка — кэшируем статику
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Активация — удаляем ВСЕ старые кэши
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — Network first для всего (всегда свежие файлы)
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API — только сеть
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'Нет соединения' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // Статика — Network first: сначала сеть, при ошибке кэш
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// ══════════════════════════════════════════════
//  Push — показать уведомление
// ══════════════════════════════════════════════
self.addEventListener('push', event => {
  let data = { title: '💉 Диализ-Ассистент', body: 'Новое уведомление', icon: '/icons/icon-192.png' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon  || '/icons/icon-192.png',
      badge:   '/icons/icon-72.png',
      tag:     data.tag   || 'dialisys',
      vibrate: [200, 100, 200],
      data:    { url: '/' },
    })
  );
});

// ══════════════════════════════════════════════
//  Клик по уведомлению — открыть приложение
// ══════════════════════════════════════════════
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Если приложение уже открыто — фокус на него
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Иначе — открыть новую вкладку
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
