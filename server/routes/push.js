'use strict';
// ══════════════════════════════════════════════
//  /api/push — Web Push уведомления
// ══════════════════════════════════════════════
const { Router } = require('express');
const webpush    = require('web-push');
const { query }  = require('../db');

const router = Router();

// Настройка VAPID
webpush.setVapidDetails(
  process.env.VAPID_EMAIL   || 'mailto:admin@dialisys.app',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// GET /api/push/vapid-key — публичный ключ для клиента
router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — сохранить подписку
router.post('/subscribe', async (req, res) => {
  const { subscription, timezone } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Нет endpoint' });

  try {
    // Upsert: если endpoint уже есть — обновить ключи
    await query(`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, timezone)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint) DO UPDATE
        SET p256dh   = EXCLUDED.p256dh,
            auth     = EXCLUDED.auth,
            timezone = EXCLUDED.timezone,
            updated_at = NOW()
    `, [
      subscription.endpoint,
      subscription.keys?.p256dh  || '',
      subscription.keys?.auth    || '',
      timezone || 'Asia/Almaty',
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[Push] subscribe error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/push/unsubscribe
router.delete('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Нет endpoint' });
  try {
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/push/test — тестовое уведомление
router.post('/test', async (req, res) => {
  const { endpoint } = req.body;
  try {
    const { rows } = await query(
      'SELECT * FROM push_subscriptions WHERE endpoint = $1',
      [endpoint]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Подписка не найдена' });

    await sendPush(rows[0], {
      title: '💉 Диализ-Ассистент',
      body:  'Уведомления работают ✅',
      icon:  '/icons/icon-192.png',
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Отправить push одному подписчику ──
async function sendPush(sub, payload) {
  const pushSub = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    await webpush.sendNotification(pushSub, JSON.stringify(payload));
  } catch (e) {
    // 410 Gone — подписка устарела, удаляем
    if (e.statusCode === 410) {
      await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
      console.log('[Push] Удалена устаревшая подписка:', sub.endpoint.slice(-20));
    } else {
      throw e;
    }
  }
}

// ── Broadcast всем подписчикам ──
async function broadcastPush(payload) {
  const { rows } = await query('SELECT * FROM push_subscriptions');
  if (!rows.length) return 0;

  let sent = 0;
  for (const sub of rows) {
    try {
      await sendPush(sub, payload);
      sent++;
    } catch (e) {
      console.error('[Push] Ошибка отправки:', e.message);
    }
  }
  console.log(`[Push] Отправлено: ${sent}/${rows.length}`);
  return sent;
}

module.exports = router;
module.exports.broadcastPush = broadcastPush;
