'use strict';
// ══════════════════════════════════════════════
//  /api/procedures — сеансы диализа
// ══════════════════════════════════════════════
const { Router } = require('express');
const { query }  = require('../db');
const calc       = require('../calculations');

const router = Router();

const WEEKDAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];

// GET /api/procedures — история (последние 90 записей)
router.get('/', async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit)  || 90,  1), 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const { rows } = await query(
      'SELECT * FROM procedures ORDER BY date DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/procedures/today — сеанс сегодня (если есть)
router.get('/today', async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM procedures WHERE date = CURRENT_DATE ORDER BY created_at DESC LIMIT 1"
    );
    res.json(rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/procedures/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM procedures WHERE id = $1', [req.params.id]);
    res.json(rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/procedures/calculate — только расчёт, без сохранения
router.post('/calculate', async (req, res) => {
  try {
    const result = _doCalculate(req.body);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/procedures — сохранить сеанс + расчёты
router.post('/', async (req, res) => {
  try {
    const {
      date,
      current_weight, dry_weight, target_weight,
      actual_time,
      bp_before, bp_during, bp_after,
      art_pressure, ven_pressure,
      symptoms_before, symptoms_during, symptoms_after,
      cramps, hypotension, notes,
      analysis_id,
    } = req.body;

    const dw  = calc.safeFloat(dry_weight);
    const cw  = calc.safeFloat(current_weight);
    if (!dw || !cw) return res.status(400).json({ error: 'Укажите текущий и сухой вес' });

    // Загрузить свежий анализ
    let analysis = null;
    if (analysis_id) {
      const ar = await query('SELECT * FROM analyses WHERE id = $1', [analysis_id]);
      analysis = ar.rows[0] || null;
    } else {
      const ar = await query('SELECT * FROM analyses ORDER BY month_key DESC LIMIT 1');
      analysis = ar.rows[0] || null;
    }

    // Расчёты
    const bpSys = _parseSystolic(bp_before);
    const machineSettings = calc.calcMachineSettings({
      dryWeight:   dw,
      currentWeight: cw,
      analysis,
      bpSystolic:  bpSys,
      cramps:      cramps || 0,
      hypotension: hypotension || 0,
    });

    const hoursUsed = calc.safeFloat(actual_time) || machineSettings.recommendedTime;
    const { ufMlH, ufMlkgH } = calc.calcUF(dw, machineSettings.fluidMl, hoursUsed);
    const loading = machineSettings.fluidMl / dw;
    const urrOk   = analysis?.urea_b && analysis?.urea_a
      ? calc.calcUrr(calc.safeFloat(analysis.urea_b), calc.safeFloat(analysis.urea_a)).urr >= 65
      : false;
    const status  = calc.finalStatus(ufMlkgH, urrOk);
    const weekday = WEEKDAYS[new Date(date || Date.now()).getDay()];

    // URR если есть мочевина
    let urr = null, ktv = null;
    if (analysis?.urea_b && analysis?.urea_a) {
      ({ urr, ktv } = calc.calcUrr(calc.safeFloat(analysis.urea_b), calc.safeFloat(analysis.urea_a)));
    }

    const { rows } = await query(`
      INSERT INTO procedures (
        date, weekday,
        current_weight, dry_weight, target_weight,
        fluid_ml, uf_ml_h, uf_mlkg_h,
        recommended_time, actual_time,
        bp_before, bp_during, bp_after,
        art_pressure, ven_pressure,
        qb, qd,
        dialysate_k, dialysate_na, dialysate_ca, dialysate_hco3, dialysate_temp,
        symptoms_before, symptoms_during, symptoms_after,
        urr, ktv, cramps, hypotension,
        final_status, final_color, notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
        $23,$24,$25,$26,$27,$28,$29,$30,$31,$32
      ) RETURNING *
    `, [
      date || new Date().toISOString().slice(0,10),
      weekday,
      cw, dw, calc.safeFloat(target_weight) || dw,
      machineSettings.fluidMl,
      parseFloat(ufMlH.toFixed(1)),
      parseFloat(ufMlkgH.toFixed(2)),
      machineSettings.recommendedTime,
      hoursUsed,
      bp_before, bp_during, bp_after,
      art_pressure, ven_pressure,
      machineSettings.qb, machineSettings.qd,
      machineSettings.dialysate.k,
      machineSettings.dialysate.na,
      machineSettings.dialysate.ca,
      machineSettings.dialysate.hco3,
      machineSettings.dialysate.temp,
      JSON.stringify(symptoms_before  || {}),
      JSON.stringify(symptoms_during  || {}),
      JSON.stringify(symptoms_after   || {}),
      urr, ktv,
      cramps || 0, hypotension || 0,
      status.text, status.color,
      notes,
    ]);

    res.json({
      procedure:       rows[0],
      machineSettings,
      // Поля для renderSessionResult
      fluidMl:         machineSettings.fluidMl,
      recommendedTime: machineSettings.recommendedTime,
      minSafeTimeH:    machineSettings.minSafeTimeH,
      ufMlH:           parseFloat(ufMlH.toFixed(1)),
      ufMlkgH:         parseFloat(ufMlkgH.toFixed(2)),
      loadingMlKg:     parseFloat(loading.toFixed(1)),
      ufRating:        calc.ufRating(ufMlkgH),
      loadRating:      calc.loadRating(loading),
      finalStatus:     status,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/procedures/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM procedures WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Утилита: расчёт без сохранения ──
function _doCalculate(body) {
  const dw = calc.safeFloat(body.dry_weight);
  const cw = calc.safeFloat(body.current_weight);
  if (!dw || !cw) throw new Error('Укажите текущий и сухой вес');

  const bpSys   = _parseSystolic(body.bp_before);
  const machine = calc.calcMachineSettings({
    dryWeight:    dw,
    currentWeight: cw,
    analysis:     body.analysis || null,
    bpSystolic:   bpSys,
    cramps:       body.cramps    || 0,
    hypotension:  body.hypotension || 0,
  });

  const hours = calc.safeFloat(body.actual_time) || machine.recommendedTime;
  const { ufMlH, ufMlkgH } = calc.calcUF(dw, machine.fluidMl, hours);
  const loading = machine.fluidMl / dw;
  const status  = calc.finalStatus(ufMlkgH, false);

  return {
    fluidMl:         machine.fluidMl,
    recommendedTime: machine.recommendedTime,
    minSafeTimeH:    machine.minSafeTimeH,
    ufMlH:           parseFloat(ufMlH.toFixed(1)),
    ufMlkgH:         parseFloat(ufMlkgH.toFixed(2)),
    loadingMlKg:     parseFloat(loading.toFixed(1)),
    machineSettings: machine,
    ufRating:        calc.ufRating(ufMlkgH),
    loadRating:      calc.loadRating(loading),
    finalStatus:     status,
  };
}

function _parseSystolic(bpStr) {
  if (!bpStr) return null;
  const m = String(bpStr).match(/^(\d+)/);
  return m ? parseInt(m[1]) : null;
}

module.exports = router;
