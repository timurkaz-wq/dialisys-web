'use strict';
// ══════════════════════════════════════════════
//  /api/food — питание + AI-анализ
// ══════════════════════════════════════════════
const { Router }       = require('express');
const { query }        = require('../db');
const { analyzeFoodText } = require('../food_analysis');
const { chatQwen }     = require('../llm');
const calc             = require('../calculations');
const cfg              = require('../config');

const router = Router();

// GET /api/food?date=2026-04-13 — все записи за дату
router.get('/', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const { rows } = await query(
      'SELECT * FROM food_logs WHERE date = $1 ORDER BY created_at ASC',
      [date]
    );

    // Суммарные нутриенты за день
    const totals = _sumTotals(rows);
    const warnings = calc.foodImpact(totals.k, totals.p, totals.na);

    res.json({ logs: rows, totals, warnings, date });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/food/period — нутриенты за весь межсеансовый период (от посл. диализа до сегодня)
router.get('/period', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Последний сеанс диализа
    const { rows: procs } = await query(
      "SELECT date FROM procedures ORDER BY date DESC LIMIT 1"
    );
    const lastDialysisRaw  = procs[0]?.date;
    const lastDialysisDate = lastDialysisRaw
      ? new Date(lastDialysisRaw).toISOString().slice(0, 10)
      : null;
    const fromDate = lastDialysisDate || today;

    // Питание по дням за период
    const { rows: byDay } = await query(`
      SELECT
        date::text,
        SUM(total_k)        AS k,
        SUM(total_p)        AS p,
        SUM(total_na)       AS na,
        SUM(total_cal)      AS cal,
        SUM(total_protein)  AS protein,
        SUM(total_fluid_ml) AS fluid,
        COUNT(*)            AS entries
      FROM food_logs
      WHERE date >= $1 AND date <= $2
      GROUP BY date ORDER BY date ASC
    `, [fromDate, today]);

    // Дни диализа в периоде
    const { rows: dialProcs } = await query(
      "SELECT date::text FROM procedures WHERE date >= $1 AND date <= $2 ORDER BY date ASC",
      [fromDate, today]
    );
    const dialysisDates = dialProcs.map(r => r.date);

    // Количество дней в периоде
    const start = new Date(fromDate);
    const end   = new Date(today);
    const days  = Math.round((end - start) / 86400000) + 1;

    // Суммарные нутриенты за период
    const totals = byDay.reduce((acc, r) => ({
      k:       acc.k       + parseFloat(r.k   || 0),
      p:       acc.p       + parseFloat(r.p   || 0),
      na:      acc.na      + parseFloat(r.na  || 0),
      cal:     acc.cal     + parseFloat(r.cal || 0),
      protein: acc.protein + parseFloat(r.protein || 0),
      fluid:   acc.fluid   + parseFloat(r.fluid   || 0),
    }), { k:0, p:0, na:0, cal:0, protein:0, fluid:0 });

    // Нормы за период (дни × суточная норма)
    const limits = {
      k:     days * cfg.DAILY_K_MAX,
      p:     days * cfg.DAILY_P_MAX,
      na:    days * cfg.DAILY_NA_MAX,
      fluid: days * cfg.DAILY_FLUID_MAX,
    };

    // Предупреждения по периоду
    const warnings = [];
    const kPct  = totals.k  / limits.k  * 100;
    const pPct  = totals.p  / limits.p  * 100;
    const naPct = totals.na / limits.na * 100;

    if (kPct > 90)  warnings.push({ nutrient:'K',  pct: Math.round(kPct),  text: `⚠️ Калий ${Math.round(totals.k)}/${limits.k} мг (${Math.round(kPct)}%) — избегай бананов, картофеля, орехов, сухофруктов`, color:'#e74c3c' });
    else if (kPct > 70) warnings.push({ nutrient:'K', pct: Math.round(kPct), text: `🟡 Калий ${Math.round(totals.k)}/${limits.k} мг (${Math.round(kPct)}%) — приближается к норме`, color:'#e67e22' });

    if (pPct > 90)  warnings.push({ nutrient:'P',  pct: Math.round(pPct),  text: `⚠️ Фосфор ${Math.round(totals.p)}/${limits.p} мг (${Math.round(pPct)}%) — избегай сыра, орехов, молочного, колбасы`, color:'#e74c3c' });
    else if (pPct > 70) warnings.push({ nutrient:'P', pct: Math.round(pPct), text: `🟡 Фосфор ${Math.round(totals.p)}/${limits.p} мг (${Math.round(pPct)}%) — будь осторожен с молочным`, color:'#e67e22' });

    if (naPct > 90) warnings.push({ nutrient:'Na', pct: Math.round(naPct), text: `⚠️ Натрий ${Math.round(totals.na)}/${limits.na} мг (${Math.round(naPct)}%) — не соли, избегай колбас и консервов`, color:'#e74c3c' });
    else if (naPct > 70) warnings.push({ nutrient:'Na', pct: Math.round(naPct), text: `🟡 Натрий ${Math.round(totals.na)}/${limits.na} мг (${Math.round(naPct)}%) — меньше соли`, color:'#e67e22' });

    // AI-рекомендации что можно есть при текущем уровне
    let recommendations = null;
    try {
      recommendations = await _buildFoodRecommendations(totals, limits, days);
    } catch (e) {
      console.error('[Period] Ошибка рекомендаций:', e.message);
    }

    res.json({ fromDate, toDate: today, days, lastDialysisDate, byDay, totals, limits, warnings, dialysisDates, recommendations });
  } catch (e) {
    console.error('[Period]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── AI-рекомендации по питанию исходя из остатка нормы ──
async function _buildFoodRecommendations(totals, limits, days) {
  const remainK  = Math.max(0, limits.k  - totals.k);
  const remainP  = Math.max(0, limits.p  - totals.p);
  const remainNa = Math.max(0, limits.na - totals.na);

  const messages = [
    {
      role: 'system',
      content: `Ты — диетолог для пациентов на гемодиализе. Давай краткие конкретные советы что можно съесть.
Отвечай на русском, кратко (3-4 пункта), в формате маркированного списка.`,
    },
    {
      role: 'user',
      content: `Пациент за ${days} дней накопил:
- Калий: ${Math.round(totals.k)} мг (лимит ${limits.k} мг, осталось ${Math.round(remainK)} мг)
- Фосфор: ${Math.round(totals.p)} мг (лимит ${limits.p} мг, осталось ${Math.round(remainP)} мг)
- Натрий: ${Math.round(totals.na)} мг (лимит ${limits.na} мг, осталось ${Math.round(remainNa)} мг)

Что можно/нельзя есть в оставшееся время до следующего диализа? Дай конкретные рекомендации по продуктам.`,
    },
  ];

  const result = await chatQwen(messages);
  return result?.content || null;
}

// GET /api/food/history?days=7 — история питания по дням
router.get('/history', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const { rows } = await query(`
      SELECT
        date,
        SUM(total_k)       AS total_k,
        SUM(total_p)       AS total_p,
        SUM(total_na)      AS total_na,
        SUM(total_cal)     AS total_cal,
        SUM(total_protein) AS total_protein,
        SUM(total_fluid_ml) AS total_fluid,
        COUNT(*)            AS entries
      FROM food_logs
      WHERE date >= CURRENT_DATE - $1
      GROUP BY date
      ORDER BY date DESC
    `, [days]);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/food/menu — AI генерирует меню на день для диализника
router.get('/menu', async (req, res) => {
  try {
    // Текущие нутриенты за день (если уже что-то ели)
    const date = new Date().toISOString().slice(0, 10);
    const { rows: todayLogs } = await query(
      'SELECT * FROM food_logs WHERE date = $1', [date]
    );
    const eaten = todayLogs.map(r => r.food_text).join('; ') || 'ничего';

    const messages = [
      {
        role: 'system',
        content: `Ты — диетолог, специализирующийся на питании пациентов на гемодиализе.
Составь меню на один день (завтрак, обед, ужин и перекус) строго по нормам для диализника:
• Калий (K): не более 2000 мг/сут
• Фосфор (P): не более 800 мг/сут
• Натрий (Na): не более 1500 мг/сут
• Жидкость: не более 1000 мл/сут
• Белок: 1.2 г/кг/сут (пациент ~75 кг → ~90 г)
• Калорийность: 1800-2200 ккал/сут

ПРАВИЛА:
- Избегай сухофруктов, орехов, бобовых, молочных (высокий K/P)
- Картофель только после 2-часового вымачивания
- Используй простые доступные продукты
- Порции реальные (не слишком маленькие)

ФОРМАТ ОТВЕТА (строго JSON):
{
  "breakfast": {"name": "Завтрак", "dishes": [{"dish": "название блюда", "portion": "200г", "note": "подсказка"}]},
  "lunch":     {"name": "Обед",    "dishes": [...]},
  "dinner":    {"name": "Ужин",    "dishes": [...]},
  "snack":     {"name": "Перекус", "dishes": [...]}
}`,
      },
      {
        role: 'user',
        content: `Составь меню на сегодня. Сегодня уже съедено: ${eaten}. Учти это и дополни оставшиеми приёмами пищи.`,
      },
    ];

    const result = await chatQwen(messages);
    if (!result?.content) throw new Error('AI не ответил');

    // Парсим JSON из ответа
    const clean = result.content.replace(/```json|```/gi, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Неверный формат ответа AI');

    const menu = JSON.parse(jsonMatch[0]);
    res.json({ menu, date });
  } catch (e) {
    console.error('[Menu]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/food/analyze — только анализ, без сохранения (для превью)
router.post('/analyze', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Введите текст питания' });
    const result = await analyzeFoodText(text);
    const warnings = calc.foodImpact(result.total_k, result.total_p, result.total_na);
    res.json({ ...result, warnings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/food — сохранить запись питания
router.post('/', async (req, res) => {
  try {
    const { text, date, meal_type, procedure_id } = req.body;
    if (!text) return res.status(400).json({ error: 'Введите текст питания' });

    const logDate = date || new Date().toISOString().slice(0, 10);

    // AI-анализ
    const analysis = await analyzeFoodText(text);

    const { rows } = await query(`
      INSERT INTO food_logs
        (date, procedure_id, meal_type, food_text, ai_analysis,
         total_k, total_p, total_na, total_cal, total_protein, total_fluid_ml)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      logDate,
      procedure_id || null,
      meal_type || 'meal',
      text,
      JSON.stringify(analysis.parsed_items),
      analysis.total_k,
      analysis.total_p,
      analysis.total_na,
      analysis.total_cal,
      analysis.total_protein,
      analysis.total_fluid || 0,
    ]);

    // Пересчёт суммарных нутриентов за день
    const { rows: dayRows } = await query(
      'SELECT * FROM food_logs WHERE date = $1 ORDER BY created_at ASC',
      [logDate]
    );
    const totals   = _sumTotals(dayRows);
    const warnings = calc.foodImpact(totals.k, totals.p, totals.na);

    res.json({
      log:      rows[0],
      analysis,
      totals,
      warnings,
      norms: {
        k:  { max: cfg.DAILY_K_MAX,    unit: 'мг/сут' },
        p:  { max: cfg.DAILY_P_MAX,    unit: 'мг/сут' },
        na: { max: cfg.DAILY_NA_MAX,   unit: 'мг/сут' },
        fluid: { max: cfg.DAILY_FLUID_MAX, unit: 'мл/сут' },
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/food/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM food_logs WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Суммарные нутриенты за день ──
function _sumTotals(rows) {
  return rows.reduce((acc, r) => ({
    k:       (acc.k       || 0) + (parseFloat(r.total_k)       || 0),
    p:       (acc.p       || 0) + (parseFloat(r.total_p)       || 0),
    na:      (acc.na      || 0) + (parseFloat(r.total_na)      || 0),
    cal:     (acc.cal     || 0) + (parseFloat(r.total_cal)     || 0),
    protein: (acc.protein || 0) + (parseFloat(r.total_protein) || 0),
    fluid:   (acc.fluid   || 0) + (parseFloat(r.total_fluid_ml)|| 0),
  }), {});
}

module.exports = router;
