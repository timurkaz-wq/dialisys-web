'use strict';
// ══════════════════════════════════════════════
//  Единый расчётный модуль межсеансового периода
//  Логика: фиксированный лимит на ВЕСЬ период,
//  а не (дни × суточная норма)
// ══════════════════════════════════════════════

// Дни диализа: Вт=2, Чт=4, Сб=6
const DIAL_DAYS = [2, 4, 6];

// Фиксированные лимиты на ВЕСЬ период между диализами
// Одинаковы для 2-дневного и 3-дневного интервала.
// Значит при 3 днях — суточная норма СТРОЖЕ.
const PERIOD_LIMITS = {
  k:     3000,  // мг — калий
  p:     1000,  // мг — фосфор
  na:    2000,  // мг — натрий
  fluid: 1500,  // мл — жидкость
};

// Риски крови
const K_BLOOD_RISK = [
  { max: 5.0, label: 'норма',     icon: '🟢', color: '#27ae60' },
  { max: 5.5, label: 'осторожно', icon: '🟡', color: '#e67e22' },
  { max: 6.0, label: 'риск',      icon: '🔴', color: '#e74c3c' },
  { max: 99,  label: 'опасно',    icon: '🚨', color: '#c0392b' },
];

// ── Определить период по КАЛЕНДАРЮ ──
function getCalendarPeriod(now = new Date()) {
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);

  // Последний день диализа (сегодня или раньше — идём назад)
  let lastDial = null;
  for (let i = 0; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (DIAL_DAYS.includes(d.getDay())) { lastDial = d; break; }
  }

  // Следующий день диализа (начиная с завтра)
  let nextDial = null;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (DIAL_DAYS.includes(d.getDay())) { nextDial = d; break; }
  }

  // Конец периода = день до следующего диализа
  const periodEnd = new Date(nextDial);
  periodEnd.setDate(nextDial.getDate() - 1);

  const toStr = d => d.toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);

  const totalDays    = daysBetween(lastDial, periodEnd) + 1;  // всего дней в периоде
  const daysElapsed  = daysBetween(lastDial, today)     + 1;  // прошло дней
  const daysRemaining = daysBetween(today, periodEnd)   + 1;  // осталось дней

  return {
    periodStart:      toStr(lastDial),
    periodEnd:        toStr(periodEnd),
    nextDialysisDate: toStr(nextDial),
    totalDays,
    daysElapsed,
    daysRemaining,
  };
}

// ── Рассчитать период по накопленным данным ──
function calcPeriodData(periodInfo, consumed, baselineK = 4.5) {
  const { totalDays, daysElapsed, daysRemaining } = periodInfo;
  const { k = 0, p = 0, na = 0, fluid = 0 } = consumed;

  const result = {};

  for (const [key, limit] of Object.entries(PERIOD_LIMITS)) {
    const val     = consumed[key] || 0;
    const pct     = Math.min((val / limit) * 100, 150); // cap at 150%
    const remain  = Math.max(0, limit - val);

    // Безопасная суточная норма на ОСТАВШИЕСЯ дни
    const safePerDay = daysRemaining > 0 ? remain / daysRemaining : 0;

    // Суточная норма если бы распределяли равномерно
    const dailyIdeal = limit / totalDays;

    const status =
      pct > 100 ? { label: 'превышение', color: '#e74c3c', icon: '🔴' } :
      pct >  80 ? { label: 'осторожно',  color: '#e67e22', icon: '🟡' } :
                  { label: 'норма',       color: '#27ae60', icon: '🟢' };

    result[key] = {
      consumed: Math.round(val),
      limit,
      remain:   Math.round(remain),
      pct:      Math.round(pct),
      safePerDay: Math.round(safePerDay),
      dailyIdeal: Math.round(dailyIdeal),
      status,
    };
  }

  // Прогноз калия в крови перед диализом
  const predictedK = parseFloat((baselineK + k * 0.0005).toFixed(2));
  const kRisk = K_BLOOD_RISK.find(r => predictedK <= r.max) || K_BLOOD_RISK.at(-1);

  return {
    nutrients: result,
    prediction: {
      k_blood: predictedK,
      risk:    kRisk,
      baselineK,
    },
  };
}

module.exports = { getCalendarPeriod, calcPeriodData, PERIOD_LIMITS, DIAL_DAYS };
