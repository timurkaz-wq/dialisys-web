/* ══════════════════════════════════════════════
   notifications.js — управление push-уведомлениями
   + звук через Web Audio API (без файлов)
   ══════════════════════════════════════════════ */

// ── Синтез звука будильника (Web Audio API) ──
function playAlarmSound(type = 'alarm') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    if (type === 'alarm') {
      // Три двойных коротких сигнала + долгий — как будильник
      const schedule = [
        { freq: 880, start: 0.0,  dur: 0.15 },
        { freq: 880, start: 0.20, dur: 0.15 },
        { freq: 1047, start: 0.5,  dur: 0.15 },
        { freq: 1047, start: 0.70, dur: 0.15 },
        { freq: 1319, start: 1.0,  dur: 0.40 },
        { freq: 1047, start: 1.5,  dur: 0.40 },
      ];
      schedule.forEach(({ freq, start, dur }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type      = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.6, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      });
      // Закрыть контекст через 2.5 сек
      setTimeout(() => ctx.close(), 2500);

    } else {
      // Мягкий одиночный сигнал для напоминания о еде
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.55);
      setTimeout(() => ctx.close(), 800);
    }
  } catch (e) {
    console.warn('[Sound] Web Audio не поддерживается:', e.message);
  }
}

// ── Конвертация VAPID public key в Uint8Array ──
function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ── Проверить поддержку push ──
function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

// ── Получить текущее состояние ──
async function getPushState() {
  if (!isPushSupported()) return 'unsupported';
  const perm = Notification.permission;
  if (perm === 'denied')  return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'subscribed' : 'unsubscribed';
}

// ── Подписаться на уведомления ──
async function subscribePush() {
  if (!isPushSupported()) {
    showToast('Уведомления не поддерживаются в вашем браузере', 'warn');
    return false;
  }

  // Запросить разрешение
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    showToast('Доступ к уведомлениям запрещён', 'warn');
    return false;
  }

  try {
    // Получить VAPID public key
    const { publicKey } = await apiFetch('/push/vapid-key');

    // Зарегистрировать подписку
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: _urlBase64ToUint8Array(publicKey),
    });

    // Отправить на сервер
    await apiFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        subscription: sub.toJSON(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });

    showToast('🔔 Уведомления включены', 'success');
    _updatePushUI('subscribed');
    return true;
  } catch (e) {
    console.error('[Push] Ошибка подписки:', e);
    showToast('Ошибка подключения уведомлений', 'error');
    return false;
  }
}

// ── Отписаться ──
async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await apiFetch('/push/unsubscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    showToast('🔕 Уведомления отключены', 'success');
    _updatePushUI('unsubscribed');
  } catch (e) {
    showToast('Ошибка отключения уведомлений', 'error');
  }
}

// ── Тестовое уведомление ──
async function testPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) { showToast('Сначала включи уведомления', 'warn'); return; }
    await apiFetch('/push/test', {
      method: 'POST',
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    showToast('📨 Тест отправлен', 'success');
  } catch (e) {
    showToast('Ошибка теста', 'error');
  }
}

// ── Обновить кнопку в UI ──
function _updatePushUI(state) {
  const btn     = document.getElementById('btnPushToggle');
  const btnTest = document.getElementById('btnPushTest');
  const label   = document.getElementById('pushStatusLabel');
  if (!btn) return;

  if (state === 'subscribed') {
    btn.textContent = '🔕 Отключить';
    btn.style.cssText = 'padding:5px 12px;font-size:12px;border-radius:16px;border:1.5px solid #e74c3c;background:#fff0f0;color:#e74c3c;cursor:pointer';
    btn.onclick = unsubscribePush;
    if (label) { label.textContent = '🔔 Включены'; label.style.color = '#27ae60'; }
    if (btnTest) btnTest.style.display = 'inline-block';
  } else if (state === 'denied') {
    btn.textContent = '🚫 Запрещены';
    btn.disabled    = true;
    btn.style.cssText = 'padding:5px 12px;font-size:12px;border-radius:16px;border:1.5px solid #ccc;background:#f4f6f8;color:#999;cursor:not-allowed';
    if (label) { label.textContent = 'Запрещены в браузере'; label.style.color = '#e74c3c'; }
    if (btnTest) btnTest.style.display = 'none';
  } else if (state === 'unsupported') {
    btn.textContent = '—';
    btn.disabled    = true;
    if (label) { label.textContent = 'Не поддерживается'; label.style.color = '#999'; }
    if (btnTest) btnTest.style.display = 'none';
  } else {
    // unsubscribed
    btn.textContent = '🔔 Включить';
    btn.style.cssText = 'padding:5px 12px;font-size:12px;border-radius:16px;border:1.5px solid #27ae60;background:#eafaf1;color:#27ae60;cursor:pointer';
    btn.onclick = subscribePush;
    if (label) { label.textContent = '🔕 Отключены'; label.style.color = '#888'; }
    if (btnTest) btnTest.style.display = 'none';
  }
}

// ── Слушаем сообщения от Service Worker (push пришёл пока приложение открыто) ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    const msg = event.data;
    if (msg?.type !== 'PUSH_RECEIVED') return;

    const tag = msg.data?.tag || '';
    const isAlarm = tag === 'dialysis-day' || tag === 'pre-dialysis';
    playAlarmSound(isAlarm ? 'alarm' : 'remind');
  });
}

// ── Инициализация при загрузке ──
document.addEventListener('DOMContentLoaded', async () => {
  if (!isPushSupported()) {
    _updatePushUI('unsupported');
    return;
  }
  const state = await getPushState();
  _updatePushUI(state);

  document.getElementById('btnPushToggle')?.addEventListener('click', subscribePush);
  document.getElementById('btnPushTest')?.addEventListener('click', testPush);
});
