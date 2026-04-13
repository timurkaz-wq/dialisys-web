'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');

// ══════════════════════════════════════════════
//  Подключение к PostgreSQL (Neon.tech)
// ══════════════════════════════════════════════
// Парсим URL вручную чтобы избежать конфликта ssl параметров
const { parse } = require('pg-connection-string');
const dbConfig   = parse(process.env.DATABASE_URL);
dbConfig.ssl     = { rejectUnauthorized: false }; // Neon требует SSL

const pool = new Pool({
  ...dbConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

// ── Запрос с авто-освобождением клиента ──
async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql, params);
    return res;
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════
//  Инициализация схемы БД
// ══════════════════════════════════════════════
async function initDB() {
  await query(`
    CREATE TABLE IF NOT EXISTS analyses (
      id          SERIAL PRIMARY KEY,
      month_key   VARCHAR(7) NOT NULL UNIQUE,   -- '2026-04'
      date        TIMESTAMP  DEFAULT NOW(),
      k           DECIMAL(4,2),    -- Калий крови (ммоль/л)
      na          DECIMAL(5,1),    -- Натрий крови
      ca          DECIMAL(4,2),    -- Кальций крови
      hco3        DECIMAL(4,1),    -- Бикарбонат
      p           DECIMAL(4,2),    -- Фосфор
      pth         DECIMAL(6,1),    -- Паратгормон
      hb          DECIMAL(4,1),    -- Гемоглобин
      albumin     DECIMAL(4,1),    -- Альбумин
      urea_b      DECIMAL(5,1),    -- Мочевина ДО диализа
      urea_a      DECIMAL(5,1),    -- Мочевина ПОСЛЕ диализа
      creatinine  DECIMAL(6,2),    -- Креатинин
      mg          DECIMAL(4,2),    -- Магний
      notes       TEXT,
      created_at  TIMESTAMP  DEFAULT NOW(),
      updated_at  TIMESTAMP  DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS procedures (
      id                 SERIAL PRIMARY KEY,
      date               DATE        NOT NULL,
      weekday            VARCHAR(20),
      -- Вес
      current_weight     DECIMAL(5,2),
      dry_weight         DECIMAL(5,2),
      target_weight      DECIMAL(5,2),
      -- UF / Время
      fluid_ml           INTEGER,
      uf_ml_h            DECIMAL(7,1),
      uf_mlkg_h          DECIMAL(5,2),
      recommended_time   DECIMAL(4,2),
      actual_time        DECIMAL(4,2),
      -- Давление
      bp_before          VARCHAR(20),
      bp_during          VARCHAR(20),
      bp_after           VARCHAR(20),
      art_pressure       INTEGER,
      ven_pressure       INTEGER,
      -- Настройки аппарата
      qb                 INTEGER,
      qd                 INTEGER     DEFAULT 500,
      dialysate_k        DECIMAL(3,1),
      dialysate_na       INTEGER,
      dialysate_ca       DECIMAL(4,3),
      dialysate_hco3     INTEGER,
      dialysate_temp     DECIMAL(3,1),
      -- Симптомы (JSON)
      symptoms_before    JSONB       DEFAULT '{}',
      symptoms_during    JSONB       DEFAULT '{}',
      symptoms_after     JSONB       DEFAULT '{}',
      -- Расчётные показатели
      urr                DECIMAL(5,2),
      ktv                DECIMAL(4,2),
      cramps             INTEGER     DEFAULT 0,
      hypotension        INTEGER     DEFAULT 0,
      -- Итог
      final_status       VARCHAR(100),
      final_color        VARCHAR(20),
      notes              TEXT,
      created_at         TIMESTAMP   DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS food_logs (
      id            SERIAL PRIMARY KEY,
      date          DATE        NOT NULL,
      procedure_id  INTEGER     REFERENCES procedures(id) ON DELETE SET NULL,
      meal_type     VARCHAR(20) DEFAULT 'meal',   -- breakfast/lunch/dinner/snack/meal
      food_text     TEXT        NOT NULL,          -- сырой ввод пользователя
      ai_analysis   JSONB,                         -- разбор AI: [{name, grams, k, p, na, cal, protein}]
      total_k       DECIMAL(8,1),
      total_p       DECIMAL(8,1),
      total_na      DECIMAL(8,1),
      total_cal     DECIMAL(8,1),
      total_protein DECIMAL(6,1),
      total_fluid_ml DECIMAL(7,1) DEFAULT 0,
      created_at    TIMESTAMP   DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id         SERIAL PRIMARY KEY,
      role       VARCHAR(10)  NOT NULL,  -- user / assistant
      content    TEXT         NOT NULL,
      created_at TIMESTAMP    DEFAULT NOW()
    )
  `);

  // Миграции — добавляем новые колонки если их нет (безопасно)
  await query(`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS shift VARCHAR(20) DEFAULT '3'`);
  await query(`ALTER TABLE procedures ADD COLUMN IF NOT EXISTS shift_time TIME`);

  // Индексы для быстрых запросов
  await query(`CREATE INDEX IF NOT EXISTS idx_procedures_date    ON procedures(date DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_food_logs_date     ON food_logs(date DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_chat_created       ON chat_history(created_at DESC)`);

  console.log('✅ База данных инициализирована');
}

module.exports = { query, initDB };
