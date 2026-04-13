/* ══════════════════════════════════════════════
   Service Worker — PWA кэширование
   ══════════════════════════════════════════════ */

const CACHE_NAME = 'dialisys-v1';
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

// Активация — удаляем старый кэш
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — Network first для API, Cache first для статики
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API — всегда сеть
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() =>
      new Response(JSON.stringify({ error: 'Нет соединения' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    ));
    return;
  }

  // Статика — кэш + обновление в фоне
  event.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});
