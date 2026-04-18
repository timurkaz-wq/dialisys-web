'use strict';
// ══════════════════════════════════════════════
//  Push-уведомления по расписанию (node-cron)
//  Расписание диализа: Вт / Чт / Сб
// ══════════════════════════════════════════════
const cron    = require('node-cron');
const { query } = require('./db');
const { broadcastPush } = require('./routes/push');

// Дни диализа: 2=Вт, 4=Чт, 6=Сб
const DIAL_DAYS = new Set([2, 4, 6]);
// Дни накануне диализа: 1=Пн, 3=Ср, 5=Пт
const PRE_DIAL_DAYS = new Set([1, 3, 5]);

function today() {
  return new Date();
}

// ── Проверка: записано ли питание сегодня ──
async function hasFoodToday() {
  try {
    const d = today().toISOString().slice(0, 10);
    const { rows } = await query(
      'SELECT COUNT(*) AS cnt FROM food_logs WHERE date = $1',
      [d]
    );
    return parseInt(rows[0]?.cnt || 0) > 0;
  } catch {
    return true; // при ошибке не спамим
  }
}

// ── Напоминание о приёме пищи (ежедневно в 13:00) ──
cron.schedule('0 13 * * *', async () => {
  const hasFood = await hasFoodToday();
  if (!hasFood) {
    console.log('[Push Scheduler] Напоминание об обеде');
    await broadcastPush({
      title: '🍽️ Обед',
      body:  'Не забудь записать что поел — это важно для контроля калия',
      icon:  '/icons/icon-192.png',
      tag:   'meal-reminder',
    });
  }
}, { timezone: 'Asia/Almaty' });

// ── Вечернее напоминание накануне диализа (Пн/Ср/Пт в 19:00) ──
cron.schedule('0 19 * * 1,3,5', async () => {
  const day = today().getDay();
  if (!PRE_DIAL_DAYS.has(day)) return;

  // Подтянуть текущий баланс K за период
  let kInfo = '';
  try {
    const { rows } = await query(`
      SELECT SUM(total_k) AS total_k
      FROM food_logs
      WHERE date >= CURRENT_DATE - INTERVAL '3 days'
    `);
    const totalK = Math.round(parseFloat(rows[0]?.total_k || 0));
    const limit  = 3000;
    const pct    = Math.round((totalK / limit) * 100);
    if (totalK > 0) kInfo = ` Калий за период: ${totalK} мг (${pct}% от лимита).`;
  } catch { /* тихо */ }

  console.log('[Push Scheduler] Уведомление накануне диализа');
  await broadcastPush({
    title: '💉 Завтра диализ',
    body:  `Проверь баланс калия и жидкость за период.${kInfo} Не переусердствуй вечером!`,
    icon:  '/icons/icon-192.png',
    tag:   'pre-dialysis',
  });
}, { timezone: 'Asia/Almaty' });

// ── Утреннее напоминание в день диализа (Вт/Чт/Сб в 08:00) ──
cron.schedule('0 8 * * 2,4,6', async () => {
  const day = today().getDay();
  if (!DIAL_DAYS.has(day)) return;

  console.log('[Push Scheduler] Утро дня диализа');
  await broadcastPush({
    title: '💉 Сегодня диализ!',
    body:  'Запишите текущий вес и АД перед процедурой. Удачного сеанса 💪',
    icon:  '/icons/icon-192.png',
    tag:   'dialysis-day',
  });
}, { timezone: 'Asia/Almaty' });

// ── Напоминание записать ужин (ежедневно в 19:30) ──
cron.schedule('30 19 * * *', async () => {
  const hasFood = await hasFoodToday();
  if (!hasFood) {
    console.log('[Push Scheduler] Напоминание об ужине');
    await broadcastPush({
      title: '🌙 Ужин',
      body:  'Сегодня не записано питание. Внеси данные чтобы отслеживать калий',
      icon:  '/icons/icon-192.png',
      tag:   'dinner-reminder',
    });
  }
}, { timezone: 'Asia/Almaty' });

console.log('[Push Scheduler] Расписание уведомлений активно (Asia/Almaty)');
