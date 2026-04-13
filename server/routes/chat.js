'use strict';
// ══════════════════════════════════════════════
//  /api/chat — ИИ нефролог (OpenRouter)
// ══════════════════════════════════════════════
const { Router }       = require('express');
const { query }        = require('../db');
const { chatMedical }  = require('../llm');
const cfg              = require('../config');

const router = Router();

// Системный промпт нефролога
const SYSTEM_PROMPT = `Ты — опытный врач-нефролог, специализирующийся на гемодиализе.
Ты помогаешь пациенту ${cfg.PATIENT_NAME} (${cfg.PATIENT_DOB}) контролировать своё состояние.

При ответах опирайся на:
• KDIGO (Kidney Disease: Improving Global Outcomes) — стандарты нефрологии
• PubMed / NCBI — научные публикации
• Cochrane Library — доказательная медицина
• WHO — международные протоколы

ПРАВИЛА:
1. Отвечай на РУССКОМ языке, кратко и по делу
2. Если есть опасность — начни с предупреждения ⚠️
3. Всегда добавляй: "Окончательное решение — за лечащим врачом"
4. Не назначай дозировки лекарств
5. Если вопрос не о нефрологии/диализе — скажи об этом

КОНТЕКСТ ПАЦИЕНТА (используй при необходимости):
- Режим диализа: 3 раза в неделю (Вт, Чт, Сб)
- Целевой UF: ≤ 8 мл/кг/ч
- Целевой URR: ≥ 65%
- Целевой Kt/V: ≥ 1.2

ФОРМАТ: 3–5 абзацев или маркированный список. Указывай источники.`;

// GET /api/chat/history — последние 50 сообщений
router.get('/history', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM chat_history ORDER BY created_at DESC LIMIT 50'
    );
    res.json(rows.reverse()); // от старых к новым
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/chat — отправить сообщение
router.post('/', async (req, res) => {
  try {
    const { message, include_context } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Введите сообщение' });

    // Сохранить сообщение пользователя
    await query(
      'INSERT INTO chat_history (role, content) VALUES ($1, $2)',
      ['user', message]
    );

    // Загрузить последние 10 сообщений как контекст
    const { rows: history } = await query(
      'SELECT role, content FROM chat_history ORDER BY created_at DESC LIMIT 10'
    );
    const conversationHistory = history.reverse();

    // Добавить контекст пациента если запрошено
    let systemContent = SYSTEM_PROMPT;
    if (include_context) {
      const ctx = await _buildPatientContext();
      if (ctx) systemContent += `\n\nТЕКУЩИЕ ДАННЫЕ ПАЦИЕНТА:\n${ctx}`;
    }

    const messages = [
      { role: 'system', content: systemContent },
      ...conversationHistory,
    ];

    // Запрос к LLM
    const aiResponse = await chatMedical(messages);
    if (!aiResponse) throw new Error('LLM не ответил');

    // Сохранить ответ ассистента
    await query(
      'INSERT INTO chat_history (role, content) VALUES ($1, $2)',
      ['assistant', aiResponse]
    );

    res.json({ response: aiResponse });
  } catch (e) {
    console.error('[Chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/chat/history — очистить историю
router.delete('/history', async (req, res) => {
  try {
    await query('DELETE FROM chat_history');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Контекст пациента для LLM ──
async function _buildPatientContext() {
  try {
    const parts = [];

    // Последний анализ
    const { rows: an } = await query(
      'SELECT * FROM analyses ORDER BY month_key DESC LIMIT 1'
    );
    if (an[0]) {
      const a = an[0];
      parts.push(`Последние анализы (${a.month_key}): K=${a.k}, Na=${a.na}, Ca=${a.ca}, HCO3=${a.hco3}, P=${a.p}, PTH=${a.pth}, Hb=${a.hb}, Альбумин=${a.albumin}, Mg=${a.mg}`);
    }

    // Последние 3 сеанса
    const { rows: pr } = await query(
      'SELECT * FROM procedures ORDER BY date DESC LIMIT 3'
    );
    if (pr.length) {
      const lines = pr.map(p =>
        `  ${p.date}: вес ${p.current_weight}/${p.dry_weight} кг, UF ${p.uf_mlkg_h} мл/кг/ч, статус: ${p.final_status}`
      );
      parts.push(`Последние сеансы:\n${lines.join('\n')}`);
    }

    return parts.join('\n\n') || null;
  } catch {
    return null;
  }
}

module.exports = router;
