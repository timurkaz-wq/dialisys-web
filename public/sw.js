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
//  Виброритм будильника (3 импульса как звонок)
// ══════════════════════════════════════════════
const VIBRATE_ALARM  = [300,100,300,100,300,200,500,150,500]; // тр-тр-тр... дилинь-дилинь
const VIBRATE_REMIND = [200, 100, 200];                        // лёгкий сигнал

// Цвет подсветки (Android LED) по типу уведомления
const ALARM_COLORS = {
  'dialysis-day':   '#e74c3c',   // красный — день диализа
  'pre-dialysis':   '#e67e22',   // оранжевый — накануне
  'meal-reminder':  '#27ae60',   // зелёный — еда
  'dinner-reminder':'#1a73e8',   // синий — ужин
};

// Кнопки действий по типу
const ACTIONS_MAP = {
  'dialysis-day':  [
    { action: 'open',    title: '💉 Открыть' },
    { action: 'dismiss', title: '✖ Позже'   },
  ],
  'pre-dialysis':  [
    { action: 'open',    title: '📊 Проверить' },
    { action: 'dismiss', title: '✖ Понял'      },
  ],
  'meal-reminder':  [
    { action: 'open',    title: '🍽️ Записать' },
    { action: 'dismiss', title: '✖ Не нужно'  },
  ],
  'dinner-reminder': [
    { action: 'open',    title: '🌙 Записать' },
    { action: 'dismiss', title: '✖ Не нужно' },
  ],
};

// ══════════════════════════════════════════════
//  Push — показать уведомление
// ══════════════════════════════════════════════
self.addEventListener('push', event => {
  let data = {
    title: '💉 Диализ-Ассистент',
    body:  'Напоминание',
    icon:  '/icons/icon-192.png',
    tag:   'dialisys',
  };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}

  const tag       = data.tag || 'dialisys';
  const isAlarm   = tag === 'dialysis-day' || tag === 'pre-dialysis';
  const vibrate   = isAlarm ? VIBRATE_ALARM : VIBRATE_REMIND;
  const lightColor = ALARM_COLORS[tag] || '#1a73e8';

  const options = {
    body:             data.body,
    icon:             data.icon || '/icons/icon-192.png',
    badge:            '/icons/icon-72.png',
    tag,
    renotify:         true,              // всегда звук, даже если тот же тег
    requireInteraction: isAlarm,         // диализные уведомления не исчезают сами
    silent:           false,             // разрешить системный звук
    vibrate,
    timestamp:        Date.now(),
    actions:          ACTIONS_MAP[tag] || [
      { action: 'open',    title: '📱 Открыть' },
      { action: 'dismiss', title: '✖ Закрыть'  },
    ],
    data: { url: '/', tag, lightColor },
  };

  // Попытаться добавить LED-цвет (Android Chrome)
  try { options.icon = data.icon || '/icons/icon-192.png'; } catch {}

  event.waitUntil(
    Promise.all([
      // Показываем уведомление
      self.registration.showNotification(data.title, options),
      // Пробуждаем открытые вкладки чтобы они сыграли звук
      self.clients.matchAll({ type: 'window' }).then(list => {
        list.forEach(client => client.postMessage({ type: 'PUSH_RECEIVED', data }));
      }),
    ])
  );
});

// ══════════════════════════════════════════════
//  Клик по уведомлению или кнопке действия
// ══════════════════════════════════════════════
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return; // просто закрыть

  // Открыть приложение
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
