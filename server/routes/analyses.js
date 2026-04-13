'use strict';
// ══════════════════════════════════════════════
//  /api/analyses — месячные анализы крови
// ══════════════════════════════════════════════
const { Router } = require('express');
const { query }  = require('../db');
const calc       = require('../calculations');

const router = Router();

// GET /api/analyses — все анализы (от новых к старым)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM analyses ORDER BY month_key DESC LIMIT 24'
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/analyses/latest — самый свежий анализ
router.get('/latest', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM analyses ORDER BY month_key DESC LIMIT 1'
    );
    res.json(rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/analyses/:monthKey — конкретный месяц (2026-04)
router.get('/:monthKey', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM analyses WHERE month_key = $1',
      [req.params.monthKey]
    );
    res.json(rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/analyses — сохранить/обновить анализ за месяц
router.post('/', async (req, res) => {
  try {
    const {
      month_key,
      k, na, ca, hco3, p, pth, hb, albumin,
      urea_b, urea_a, creatinine, mg, notes,
    } = req.body;

    if (!month_key) return res.status(400).json({ error: 'month_key обязателен (2026-04)' });

    // Upsert: обновить если есть, вставить если нет
    const { rows } = await query(`
      INSERT INTO analyses
        (month_key, k, na, ca, hco3, p, pth, hb, albumin, urea_b, urea_a, creatinine, mg, notes, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW())
      ON CONFLICT (month_key) DO UPDATE SET
        k=$2, na=$3, ca=$4, hco3=$5, p=$6, pth=$7, hb=$8, albumin=$9,
        urea_b=$10, urea_a=$11, creatinine=$12, mg=$13, notes=$14, updated_at=NOW()
      RETURNING *
    `, [month_key, k, na, ca, hco3, p, pth, hb, albumin, urea_b, urea_a, creatinine, mg, notes]);

    // Добавить оценку анализов
    const evaluation = calc.evaluateAnalysis(rows[0]);
    res.json({ analysis: rows[0], evaluation });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/analyses/:monthKey/evaluate — оценить анализ
router.get('/:monthKey/evaluate', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM analyses WHERE month_key = $1',
      [req.params.monthKey]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Анализ не найден' });
    const evaluation = calc.evaluateAnalysis(rows[0]);
    res.json({ analysis: rows[0], evaluation });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
