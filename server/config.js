'use strict';
// ══════════════════════════════════════════════
//  Константы пациента и медицинские нормы
// ══════════════════════════════════════════════

module.exports = {
  // Пациент
  PATIENT_NAME: 'Тимур Исянов',
  PATIENT_DOB:  '30.03.1975',

  // ── UF нормы (мл/кг/ч) ──
  UF_SAFE: 8.0,   // норма
  UF_WARN: 10.0,  // предупреждение
  UF_CRIT: 12.0,  // критично

  // ── Возврат крови ──
  RETURN_VOLUME_L: 0.7,  // литры

  // ── Нормы диализата ──
  NA_RANGE:   [136, 140],
  K_RANGE:    [2.0, 3.0],
  CA_RANGE:   [1.25, 1.5],
  HCO3_RANGE: [32, 38],

  // ── Нормы анализов крови ──
  P_RANGE:       [0.87, 1.78],
  PTH_RANGE:     [150, 300],
  HB_RANGE:      [110, 150],
  ALBUMIN_RANGE: [35, 50],
  MG_RANGE:      [0.7, 1.1],
  K_BLOOD_RANGE: [3.5, 5.0],
  NA_BLOOD_RANGE:[136, 145],
  CA_BLOOD_RANGE:[2.1, 2.55],

  // ── Нагрузка мл/кг ──
  LOAD_NORMAL:    20,
  LOAD_HIGH:      30,
  LOAD_VERY_HIGH: 40,

  // ── Стандартные значения диализата (по умолчанию) ──
  DEFAULT_NA:   138,
  DEFAULT_K:    2.0,
  DEFAULT_CA:   1.375,
  DEFAULT_HCO3: 35,
  DEFAULT_TEMP: 36.5,

  // ── URR / Kt/V цели ──
  URR_TARGET: 65.0,
  KTV_TARGET: 1.2,

  // ── Набор жидкости ──
  GAIN_WARN: 2.5,

  // ── Давление доступа ──
  ART_PRESSURE_MIN: -250,
  ART_PRESSURE_MAX: -100,
  VEN_PRESSURE_MIN: 100,
  VEN_PRESSURE_MAX: 250,

  // ── Суточные нормы нутриентов для диализника ──
  DAILY_K_MAX:    2000,  // мг/сут (калий)
  DAILY_P_MAX:    800,   // мг/сут (фосфор)
  DAILY_NA_MAX:   1500,  // мг/сут (натрий)
  DAILY_FLUID_MAX: 1000, // мл/сут (жидкость)

  // ── Дни диализа ──
  DIALYSIS_DAYS: ['Вторник', 'Четверг', 'Суббота'],

  // ── OpenRouter модели (проверены через API openrouter.ai/api/v1/models) ──
  MODEL_FOOD:     process.env.MODEL_FOOD     || 'qwen/qwen3-next-80b-a3b-instruct:free',
  MODEL_CHAT:     process.env.MODEL_CHAT     || 'qwen/qwen3-235b-a22b',
  MODEL_THINKING: process.env.MODEL_THINKING || 'qwen/qwen3-235b-a22b-thinking-2507',
  MODEL_FALLBACK: process.env.MODEL_FALLBACK || 'qwen/qwen3-next-80b-a3b-instruct:free',

  // ── DR7.ai — MedGemma (медицинский чат) ──
  MODEL_MEDGEMMA: process.env.MODEL_MEDGEMMA || 'medgemma-4b-it',
};
