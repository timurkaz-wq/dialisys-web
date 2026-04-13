'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const { initDB } = require('./db');
const cfg      = require('./config');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════
//  Middleware
// ══════════════════════════════════════════════
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Статика — frontend
app.use(express.static(path.join(__dirname, '../public')));

// ══════════════════════════════════════════════
//  API Routes
// ══════════════════════════════════════════════
app.use('/api/analyses',   require('./routes/analyses'));
app.use('/api/procedures', require('./routes/procedures'));
app.use('/api/food',       require('./routes/food'));
app.use('/api/chat',       require('./routes/chat'));
app.use('/api/export',     require('./routes/export'));

// ── Инфо о пациенте ──
app.get('/api/patient', (req, res) => {
  res.json({
    name: cfg.PATIENT_NAME,
    dob:  cfg.PATIENT_DOB,
    dialysis_days: cfg.DIALYSIS_DAYS,
  });
});

// ── Нормы (для фронтенда) ──
app.get('/api/norms', (req, res) => {
  res.json({
    uf:      { safe: cfg.UF_SAFE, warn: cfg.UF_WARN, crit: cfg.UF_CRIT },
    urr:     cfg.URR_TARGET,
    ktv:     cfg.KTV_TARGET,
    food:    { k: cfg.DAILY_K_MAX, p: cfg.DAILY_P_MAX, na: cfg.DAILY_NA_MAX, fluid: cfg.DAILY_FLUID_MAX },
    analyses: {
      k: cfg.K_BLOOD_RANGE, na: cfg.NA_BLOOD_RANGE, ca: cfg.CA_BLOOD_RANGE,
      hco3: cfg.HCO3_RANGE, p: cfg.P_RANGE, pth: cfg.PTH_RANGE,
      hb: cfg.HB_RANGE, albumin: cfg.ALBUMIN_RANGE, mg: cfg.MG_RANGE,
    },
  });
});

// ── Health check (для Render/Railway) ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── SPA fallback (все остальные → index.html) ──
// Express 5: wildcard требует именованный параметр
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Глобальный обработчик ошибок ──
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ══════════════════════════════════════════════
//  Запуск
// ══════════════════════════════════════════════
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`\n💉 Dialisys Web запущен`);
      console.log(`   Локально:  http://localhost:${PORT}`);
      console.log(`   Пациент:   ${cfg.PATIENT_NAME}`);
      console.log(`   Модель AI: ${cfg.MODEL_CHAT}\n`);
    });
  } catch (err) {
    console.error('❌ Ошибка запуска:', err.message);
    process.exit(1);
  }
}

start();
