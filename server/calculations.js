'use strict';
// ══════════════════════════════════════════════
//  Медицинские расчёты — ядро системы
//  Формулы точно соответствуют dialysis_calculator.xlsx
// ══════════════════════════════════════════════
const cfg = require('./config');

// ── Утилита ──
function safeFloat(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ── Возраст ──
function calcAge(dobStr) {
  const [d, m, y] = dobStr.split('.').map(Number);
  const birth = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return age;
}

// ══════════════════════════════════════════════
//  UF — объём жидкости для удаления
//  Формула Excel: =(текВес - сухВес) * 1000
// ══════════════════════════════════════════════
function calcFluidMl(currentWeight, dryWeight) {
  const excess = currentWeight - dryWeight + cfg.RETURN_VOLUME_L;
  return excess > 0 ? Math.round(excess * 1000) : 0;
}

// ══════════════════════════════════════════════
//  Минимальное безопасное время диализа
//  Формула Excel: =UF_мл / (сухВес * 8)
//  Гарантирует UF ≤ 8 мл/кг/ч
// ══════════════════════════════════════════════
function calcMinSafeTime(fluidMl, dryWeight) {
  if (dryWeight <= 0 || fluidMl <= 0) return 0;
  return fluidMl / (dryWeight * cfg.UF_SAFE);
}

// Округление до ближайших 30 минут вверх
function roundUpHalfHour(hours) {
  return Math.ceil(hours * 2) / 2;
}

// ══════════════════════════════════════════════
//  UF скорость
//  Формула Excel: =UF_мл / время_ч
// ══════════════════════════════════════════════
function calcUF(dryWeight, fluidMl, hours) {
  if (hours <= 0) return { ufMlH: 0, ufMlkgH: 0 };
  const ufMlH   = fluidMl / hours;
  const ufMlkgH = ufMlH / dryWeight;
  return { ufMlH, ufMlkgH };
}

// ── Оценка UF ──
function ufRating(ufMlkgH) {
  if (ufMlkgH <= cfg.UF_SAFE) return { text: '🟢 Норма (≤8 мл/кг/ч)',        color: '#27ae60', level: 'safe' };
  if (ufMlkgH <= cfg.UF_WARN) return { text: '🟡 Допустимо (8–10 мл/кг/ч)', color: '#f39c12', level: 'warn' };
  if (ufMlkgH <= cfg.UF_CRIT) return { text: '🟠 Жёстко (10–12 мл/кг/ч)',   color: '#e67e22', level: 'hard' };
  return                              { text: '🔴 Опасно! >12 мл/кг/ч',       color: '#e74c3c', level: 'crit' };
}

// ── Нагрузка мл/кг ──
function loadRating(loading) {
  if (loading < cfg.LOAD_NORMAL)    return { text: 'Норма',         color: '#27ae60' };
  if (loading < cfg.LOAD_HIGH)      return { text: 'Много',         color: '#f39c12' };
  if (loading < cfg.LOAD_VERY_HIGH) return { text: 'Тяжело',        color: '#e67e22' };
  return                                   { text: 'ОЧЕНЬ ТЯЖЕЛО',  color: '#e74c3c' };
}

// ══════════════════════════════════════════════
//  Qb — скорость кровотока
//  Формула Excel: =IF(сухВес>85, 380, 320)
// ══════════════════════════════════════════════
function calcQb(dryWeight) {
  return dryWeight > 85 ? 380 : 320;
}

// ══════════════════════════════════════════════
//  Настройки диализата — ТОЧНЫЕ формулы из Excel
// ══════════════════════════════════════════════

// K диализата: =IF(K>5.5, 2, IF(K>=4.5, 2.5, 3))
function calcDialysateK(kBlood) {
  if (kBlood === null) return cfg.DEFAULT_K;
  if (kBlood > 5.5)  return 2.0;
  if (kBlood >= 4.5) return 2.5;
  return 3.0;
}

// Na диализата: =IF(OR(АД<110, гипотония=1), 139, IF(Na>140, 136, 138))
function calcDialysateNa(naBlood, bpSystolic, hypotension) {
  if (hypotension === 1 || (bpSystolic !== null && bpSystolic < 110)) return 139;
  if (naBlood !== null && naBlood > 140) return 136;
  return 138;
}

// Ca диализата: =IF(OR(Ca<1.1, судороги>=2), 1.5, 1.25)
function calcDialysateCa(caBlood, cramps) {
  const crampVal = cramps || 0;
  if ((caBlood !== null && caBlood < 1.1) || crampVal >= 2) return 1.5;
  return 1.25;
}

// HCO3 диализата: =IF(HCO3<22, 36, 32)
function calcDialysateHco3(hco3Blood) {
  if (hco3Blood !== null && hco3Blood < 22) return 36;
  return 32;
}

// Температура: =IF(гипотония=1, 36, 36.5)
function calcTemp(hypotension) {
  return hypotension === 1 ? 36.0 : 36.5;
}

// ══════════════════════════════════════════════
//  Полный расчёт настроек аппарата
// ══════════════════════════════════════════════
function calcMachineSettings({ dryWeight, currentWeight, analysis, bpSystolic, cramps, hypotension }) {
  const fluidMl        = calcFluidMl(currentWeight, dryWeight);
  const minSafeTime    = calcMinSafeTime(fluidMl, dryWeight);
  const recommendedTime = roundUpHalfHour(minSafeTime);

  const qb = calcQb(dryWeight);
  const qd = 500;

  const k     = analysis ? safeFloat(analysis.k)    : null;
  const na    = analysis ? safeFloat(analysis.na)   : null;
  const ca    = analysis ? safeFloat(analysis.ca)   : null;
  const hco3  = analysis ? safeFloat(analysis.hco3) : null;

  const dialysateK    = calcDialysateK(k);
  const dialysateNa   = calcDialysateNa(na, bpSystolic, hypotension);
  const dialysateCa   = calcDialysateCa(ca, cramps);
  const dialysateHco3 = calcDialysateHco3(hco3);
  const dialysateTemp = calcTemp(hypotension);

  return {
    fluidMl,
    minSafeTimeH:    parseFloat(minSafeTime.toFixed(2)),
    recommendedTime,
    qb,
    qd,
    dialysate: {
      k:    dialysateK,
      na:   dialysateNa,
      ca:   dialysateCa,
      hco3: dialysateHco3,
      temp: dialysateTemp,
    },
  };
}

// ══════════════════════════════════════════════
//  URR и Kt/V
// ══════════════════════════════════════════════
function calcUrr(ureaBefore, ureaAfter) {
  if (!ureaBefore || ureaBefore <= 0) return { urr: null, ktv: null };
  const urr = ((ureaBefore - ureaAfter) / ureaBefore) * 100;
  // Ограничиваем 99.9% чтобы избежать Infinity в JSON (log(0) = -Infinity)
  const clampedUrr = Math.min(urr, 99.9);
  const ktv = -Math.log(1 - clampedUrr / 100);
  return {
    urr: parseFloat(clampedUrr.toFixed(1)),
    ktv: parseFloat(ktv.toFixed(2)),
  };
}

// ── Оценка URR/KtV ──
function urrRating(urr, ktv) {
  const lines = [];
  if (urr !== null) {
    if (urr >= cfg.URR_TARGET) {
      lines.push({ text: `✅ URR: ${urr}% — норма (цель ≥${cfg.URR_TARGET}%)`, color: '#27ae60' });
    } else {
      lines.push({ text: `⚠️ URR: ${urr}% — ниже цели (${cfg.URR_TARGET}%)`, color: '#e67e22' });
    }
  }
  if (ktv !== null && isFinite(ktv)) {
    if (ktv >= cfg.KTV_TARGET) {
      lines.push({ text: `✅ Kt/V: ${ktv} — норма (цель ≥${cfg.KTV_TARGET})`, color: '#27ae60' });
    } else {
      lines.push({ text: `⚠️ Kt/V: ${ktv} — ниже цели (${cfg.KTV_TARGET})`, color: '#e67e22' });
    }
  }
  return lines;
}

// ══════════════════════════════════════════════
//  Итоговый статус сеанса
// ══════════════════════════════════════════════
function finalStatus(ufMlkgH, urrOk) {
  if (ufMlkgH <= cfg.UF_SAFE) {
    if (urrOk) return { text: '🟢 ХОРОШИЙ ДИАЛИЗ', color: '#27ae60' };
    return           { text: '🟡 НОРМ — очистка слабая', color: '#f39c12' };
  }
  if (ufMlkgH <= cfg.UF_WARN) return { text: '🟡 НОРМ — следить за самочувствием', color: '#f39c12' };
  if (ufMlkgH <= cfg.UF_CRIT) return { text: '🟠 ЖЁСТКО — увеличить время', color: '#e67e22' };
  return                              { text: '🔴 ПЕРЕГРУЗ — УВЕЛИЧИТЬ ВРЕМЯ!', color: '#e74c3c' };
}

// ══════════════════════════════════════════════
//  Оценка анализов крови
// ══════════════════════════════════════════════
function evaluateAnalysis(analysis) {
  const results = [];

  const checks = [
    { key: 'k',         label: 'Калий',       unit: 'ммоль/л', range: cfg.K_BLOOD_RANGE,  icon: '⚡' },
    { key: 'na',        label: 'Натрий',      unit: 'ммоль/л', range: cfg.NA_BLOOD_RANGE, icon: '🧂' },
    { key: 'ca',        label: 'Кальций',     unit: 'ммоль/л', range: cfg.CA_BLOOD_RANGE, icon: '🦴' },
    { key: 'hco3',      label: 'Бикарбонат',  unit: 'ммоль/л', range: cfg.HCO3_RANGE,     icon: '🧪' },
    { key: 'p',         label: 'Фосфор',      unit: 'ммоль/л', range: cfg.P_RANGE,        icon: '🧬' },
    { key: 'pth',       label: 'ПТГ',         unit: 'пг/мл',   range: cfg.PTH_RANGE,      icon: '🧠' },
    { key: 'hb',        label: 'Гемоглобин',  unit: 'г/л',     range: cfg.HB_RANGE,       icon: '🩸' },
    { key: 'albumin',   label: 'Альбумин',    unit: 'г/л',     range: cfg.ALBUMIN_RANGE,  icon: '💪' },
    { key: 'mg',        label: 'Магний',      unit: 'ммоль/л', range: cfg.MG_RANGE,       icon: '⚖️'  },
  ];

  for (const { key, label, unit, range, icon } of checks) {
    const val = safeFloat(analysis[key]);
    if (val === null) continue;
    const [lo, hi] = range;
    let status, color;
    if (val < lo)      { status = `↓ ниже нормы (${lo}–${hi})`; color = '#e67e22'; }
    else if (val > hi) { status = `↑ выше нормы (${lo}–${hi})`; color = '#e74c3c'; }
    else               { status = `✓ норма (${lo}–${hi})`;       color = '#27ae60'; }
    results.push({ key, icon, label, value: val, unit, status, color });
  }

  // Мочевина — для URR
  if (analysis.urea_b && analysis.urea_a) {
    const { urr, ktv } = calcUrr(safeFloat(analysis.urea_b), safeFloat(analysis.urea_a));
    results.push(...urrRating(urr, ktv));
  }

  return results;
}

// ══════════════════════════════════════════════
//  Симптомы — диагностика
// ══════════════════════════════════════════════
function symptomDiagnostics({ scoresBefore = {}, scoresDuring = {}, scoresAfter = {} }, ufMlkgH, na, ca) {
  const tips = [];

  if ((scoresBefore['Одышка'] || 0) >= 2 || (scoresBefore['Отёки'] || 0) >= 2)
    tips.push({ text: '🟡 ДО: отёки/одышка → слишком много жидкости набрано', color: '#e67e22' });

  if ((scoresDuring['Судороги'] || 0) >= 2) {
    if (ufMlkgH && ufMlkgH > cfg.UF_WARN)
      tips.push({ text: '🚨 Судороги + высокий UF → СНИЗИТЬ UF или увеличить время!', color: '#e74c3c' });
    if (ca && ca < cfg.CA_RANGE[0])
      tips.push({ text: '→ Судороги + низкий Ca → ПОВЫСИТЬ Ca диализата', color: '#e67e22' });
  }

  if ((scoresDuring['Падение давления'] || 0) >= 2) {
    if (ufMlkgH && ufMlkgH > cfg.UF_WARN)
      tips.push({ text: '🚨 Гипотония + высокий UF → UF слишком высокий!', color: '#e74c3c' });
    if (na && na < cfg.NA_RANGE[0])
      tips.push({ text: '→ Гипотония + низкий Na → ПОВЫСИТЬ Na', color: '#e67e22' });
  }

  if ((scoresAfter['Долгое восстановление'] || 0) >= 2) {
    tips.push({ text: '⚠️ Долгое восстановление → попробовать увеличить время на 30–60 мин', color: '#e74c3c' });
  }

  if ((scoresAfter['Слабость после'] || 0) >= 2)
    tips.push({ text: '→ Слабость после → проверить электролиты, давление, гемоглобин', color: '#e67e22' });

  return tips;
}

// ══════════════════════════════════════════════
//  Влияние питания на настройки аппарата
//  Если K из еды высокий → предупреждение
// ══════════════════════════════════════════════
function foodImpact(totalKMg, totalPMg, totalNaMg) {
  const warnings = [];
  if (totalKMg > cfg.DAILY_K_MAX)
    warnings.push({ text: `⚠️ Калий из еды: ${totalKMg} мг — превышена норма (${cfg.DAILY_K_MAX} мг/сут)`, color: '#e74c3c', key: 'k' });
  else if (totalKMg > cfg.DAILY_K_MAX * 0.8)
    warnings.push({ text: `🟡 Калий из еды: ${totalKMg} мг — близко к норме (${cfg.DAILY_K_MAX} мг/сут)`, color: '#f39c12', key: 'k' });

  if (totalPMg > cfg.DAILY_P_MAX)
    warnings.push({ text: `⚠️ Фосфор из еды: ${totalPMg} мг — превышена норма (${cfg.DAILY_P_MAX} мг/сут)`, color: '#e74c3c', key: 'p' });

  if (totalNaMg > cfg.DAILY_NA_MAX)
    warnings.push({ text: `⚠️ Натрий из еды: ${totalNaMg} мг — превышена норма (${cfg.DAILY_NA_MAX} мг/сут)`, color: '#e74c3c', key: 'na' });

  return warnings;
}

module.exports = {
  safeFloat,
  calcAge,
  calcFluidMl,
  calcMinSafeTime,
  roundUpHalfHour,
  calcUF,
  ufRating,
  loadRating,
  calcQb,
  calcDialysateK,
  calcDialysateNa,
  calcDialysateCa,
  calcDialysateHco3,
  calcTemp,
  calcMachineSettings,
  calcUrr,
  urrRating,
  finalStatus,
  evaluateAnalysis,
  symptomDiagnostics,
  foodImpact,
};
