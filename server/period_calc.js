'use strict';
// ══════════════════════════════════════════════
//  Единый расчётный модуль межсеансового периода
//  v2: фиксированный лимит + k_factor + проекция
// ══════════════════════════════════════════════

// Дни диализа: Вт=2, Чт=4, Сб=6
const DIAL_DAYS = [2, 4, 6];

// Базовые фиксированные лимиты на ВЕСЬ период (одинаковы для 2- и 3-дневного)
const PERIOD_LIMITS_BASE = {
  k:     3000,  // мг — калий
  p:     1000,  // мг — фосфор
  na:    2000,  // мг — натрий
  fluid: 1500,  // мл — жидкость
};

// Персональные коэффициенты строгости
const K_FACTORS = {
  normal: 1.0,   // обычный режим
  strict: 0.8,   // строгий режим (−20% от лимитов)
};

// Риски калия в крови (ммоль/л)
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

  // Последний день диализа (сегодня или раньше)
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

  // Конец периода = день ДО следующего диализа
  const periodEnd = new Date(nextDial);
  periodEnd.setDate(nextDial.getDate() - 1);

  const toStr       = d  => d.toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((b - a) / 86400000);

  const totalDays     = daysBetween(lastDial, periodEnd) + 1;
  const daysElapsed   = daysBetween(lastDial, today)     + 1;
  const daysRemaining = daysBetween(today, periodEnd)    + 1;

  return {
    periodStart:      toStr(lastDial),
    periodEnd:        toStr(periodEnd),
    nextDialysisDate: toStr(nextDial),
    totalDays,
    daysElapsed,
    daysRemaining,
  };
}

// ── Главная функция: расчёт + проекция + прогноз крови ──
function calcPeriodData(periodInfo, consumed, baselineK = 4.5, kFactor = 1.0) {
  const { totalDays, daysElapsed, daysRemaining } = periodInfo;

  // Применяем персональный коэффициент строгости
  const limits = {};
  for (const [key, base] of Object.entries(PERIOD_LIMITS_BASE)) {
    limits[key] = Math.round(base * kFactor);
  }

  const nutrients = {};

  for (const [key, limit] of Object.entries(limits)) {
    const val  = consumed[key] || 0;
    const pct  = Math.min((val / limit) * 100, 150);
    const remain = Math.max(0, limit - val);

    // Безопасное потребление в день на оставшиеся дни
    const safePerDay = daysRemaining > 0 ? remain / daysRemaining : 0;

    // Идеальная суточная норма (равномерно на весь период)
    const dailyIdeal = limit / totalDays;

    // ── ПРОЕКЦИЯ: при текущем темпе к концу периода ──
    const avgDaily    = daysElapsed > 0 ? val / daysElapsed : 0;
    const projected   = val + avgDaily * daysRemaining;  // прогноз на конец периода
    const projectedPct = Math.min((projected / limit) * 100, 200);
    const projOverrun  = Math.max(0, projected - limit); // превышение прогноза

    // Статус текущего потребления
    const status =
      pct > 100 ? { label: 'превышение', color: '#e74c3c', icon: '🔴' } :
      pct >  80 ? { label: 'осторожно',  color: '#e67e22', icon: '🟡' } :
                  { label: 'норма',       color: '#27ae60', icon: '🟢' };

    // Статус прогноза
    const projStatus =
      projectedPct > 100 ? { label: 'превысишь',   color: '#e74c3c', icon: '📈' } :
      projectedPct >  85 ? { label: 'на пределе',  color: '#e67e22', icon: '⚠️' } :
                           { label: 'уложишься',   color: '#27ae60', icon: '✅' };

    nutrients[key] = {
      consumed:    Math.round(val),
      limit,
      remain:      Math.round(remain),
      pct:         Math.round(pct),
      safePerDay:  Math.round(safePerDay),
      dailyIdeal:  Math.round(dailyIdeal),
      avgDaily:    Math.round(avgDaily),
      projected:   Math.round(projected),
      projectedPct: Math.round(projectedPct),
      projOverrun: Math.round(projOverrun),
      status,
      projStatus,
      kFactor,
    };
  }

  // ── Прогноз калия в крови (по ПРОГНОЗНОМУ потреблению) ──
  const projectedK   = consumed.k || 0;
  const predictedK   = parseFloat((baselineK + projectedK * 0.0005).toFixed(2));
  const kRisk        = K_BLOOD_RISK.find(r => predictedK <= r.max) || K_BLOOD_RISK.at(-1);

  // Прогноз K крови к концу периода
  const projectedKmg   = nutrients.k?.projected || 0;
  const predictedKEnd  = parseFloat((baselineK + projectedKmg * 0.0005).toFixed(2));
  const kRiskEnd       = K_BLOOD_RISK.find(r => predictedKEnd <= r.max) || K_BLOOD_RISK.at(-1);

  return {
    nutrients,
    limits,
    kFactor,
    prediction: {
      k_blood_now:  predictedK,
      k_blood_end:  predictedKEnd,
      risk_now:     kRisk,
      risk_end:     kRiskEnd,
      baselineK,
    },
  };
}

module.exports = {
  getCalendarPeriod,
  calcPeriodData,
  PERIOD_LIMITS_BASE,
  K_FACTORS,
  DIAL_DAYS,
};
