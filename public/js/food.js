/* ══════════════════════════════════════════════
   food.js — питание + AI-анализ нутриентов
   ══════════════════════════════════════════════ */

const MEAL_LABELS = {
  breakfast: '🌅 Завтрак',
  lunch:     '☀️ Обед',
  dinner:    '🌙 Ужин',
  snack:     '🍎 Перекус',
  meal:      '🍽️ Приём пищи',
};

const FOOD_NORMS = { k: 2000, p: 800, na: 1500 };

// ── Добавить питание + AI анализ ──
async function addFood() {
  const text     = document.getElementById('foodInput').value.trim();
  const mealType = document.getElementById('mealType').value;
  const date     = document.getElementById('foodDate')?.value || todayStr();

  if (!text) { showToast('Опишите что съели', 'warn'); return; }

  const btn = document.getElementById('btnAddFood');
  btn.disabled   = true;
  btn.textContent = '⏳ AI анализирует...';

  const resultEl = document.getElementById('foodAnalysisResult');
  resultEl.innerHTML = '<div class="loading-text">🤖 AI разбирает продукты...</div>';
  resultEl.classList.remove('hidden');

  try {
    const res = await apiFetch('/food', {
      method: 'POST',
      body:   JSON.stringify({ text, meal_type: mealType, date }),
    });

    // Показать разбор
    renderFoodAnalysis(res, resultEl);

    // Обновить нормы
    updateFoodNorms(res.totals);

    // Обновить список и период
    loadFoodToday();
    loadPeriodSummary();

    document.getElementById('foodInput').value = '';
    showToast('✅ Питание добавлено', 'success');
  } catch (e) {
    resultEl.innerHTML = `<div class="result-line" style="color:#e74c3c">❌ ${e.message}</div>`;
    showToast(`❌ ${e.message}`, 'error');
  } finally {
    btn.disabled   = false;
    btn.textContent = '🤖 AI Анализ';
  }
}

// ── Рендер результата AI-анализа ──
function renderFoodAnalysis(res, container) {
  const { analysis, totals, warnings, norms } = res;
  container.innerHTML = '';

  // Заголовок
  const title = document.createElement('div');
  title.className = 'result-line bold';
  title.textContent = '🤖 AI разобрал:';
  container.appendChild(title);

  // Список продуктов
  if (analysis?.items?.length) {
    analysis.items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'result-line';
      el.style.paddingLeft = '12px';
      if (item.found) {
        const srcBadge = item.source === 'ai'
          ? ' <span style="font-size:10px;color:#1a73e8;background:#e8f0fe;padding:1px 5px;border-radius:8px">🤖 AI</span>'
          : '';
        el.innerHTML = `• <b>${item.name}</b> ${item.grams}г${srcBadge} — K:${item.k}мг  P:${item.p}мг  Na:${item.na}мг  ${item.cal}ккал`;
      } else {
        el.textContent = `• ${item.name} ${item.grams}г — (не найден)`;
        el.style.color = '#999';
      }
      container.appendChild(el);
    });
  }

  // Итого
  const sep = document.createElement('div');
  sep.className = 'result-line bold';
  sep.style.cssText = 'border-top:2px solid #e0e0e0; margin-top:6px; padding-top:8px; color:#1a73e8';
  sep.textContent = `Итого: K:${Math.round(totals.k||0)}мг  P:${Math.round(totals.p||0)}мг  Na:${Math.round(totals.na||0)}мг  ${Math.round(totals.cal||0)}ккал`;
  container.appendChild(sep);

  // Предупреждения
  if (warnings?.length) {
    warnings.forEach(w => {
      container.appendChild(renderResultLine(w.text, w.color));
    });
  }
}

// ── Обновить индикаторы норм ──
function updateFoodNorms(totals) {
  if (!totals) return;

  _updateNormItem('normK',  totals.k  || 0, FOOD_NORMS.k,  'мг', 'Калий');
  _updateNormItem('normP',  totals.p  || 0, FOOD_NORMS.p,  'мг', 'Фосфор');
  _updateNormItem('normNa', totals.na || 0, FOOD_NORMS.na, 'мг', 'Натрий');

  const calEl = document.getElementById('normCal');
  if (calEl) {
    calEl.querySelector('.norm-val').textContent = `${Math.round(totals.cal||0)} ккал`;
  }
}

function _updateNormItem(id, current, max, unit, label) {
  const el = document.getElementById(id);
  if (!el) return;

  const pct = Math.min((current / max) * 100, 100);
  let cls = 'ok';
  if (pct > 90) cls = 'danger';
  else if (pct > 70) cls = 'warn';

  el.className = `norm-item ${cls}`;
  el.innerHTML = `
    <span class="norm-label">${label}</span>
    <span class="norm-val">${Math.round(current)} / ${max} ${unit}</span>
    <div class="nutrient-bar-track" style="margin-top:4px">
      <div class="nutrient-bar-fill ${cls}" style="width:${pct}%"></div>
    </div>
  `;
}

// ── Загрузить записи питания за день ──
async function loadFoodToday() {
  const date      = document.getElementById('foodDate')?.value || todayStr();
  const container = document.getElementById('foodLogList');
  if (!container) return;

  try {
    const res = await apiFetch(`/food?date=${date}`);
    updateFoodNorms(res.totals);

    if (!res.logs?.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🍽️</div>
          <div class="empty-label">Записей питания нет</div>
        </div>`;
      return;
    }

    container.innerHTML = '';

    // Предупреждения вверху
    if (res.warnings?.length) {
      const warnDiv = document.createElement('div');
      warnDiv.className = 'card';
      warnDiv.style.borderLeft = '4px solid #e74c3c';
      res.warnings.forEach(w => {
        const el = document.createElement('div');
        el.style.cssText = `color:${w.color}; font-size:13px; padding:3px 0`;
        el.textContent = w.text;
        warnDiv.appendChild(el);
      });
      container.appendChild(warnDiv);
    }

    // Список приёмов пищи
    res.logs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'food-log-item';
      item.innerHTML = `
        <div class="food-log-header">
          <span class="food-log-type">${MEAL_LABELS[log.meal_type] || '🍽️'}</span>
          <div>
            <span class="food-log-time">${new Date(log.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</span>
            <button class="food-log-delete" onclick="deleteFood(${log.id})">🗑</button>
          </div>
        </div>
        <div class="food-log-text">${log.food_text}</div>
        <div class="food-log-nutrients">
          ${log.total_k  ? `<span class="food-nutrient">K: ${Math.round(log.total_k)}мг</span>` : ''}
          ${log.total_p  ? `<span class="food-nutrient">P: ${Math.round(log.total_p)}мг</span>` : ''}
          ${log.total_na ? `<span class="food-nutrient">Na: ${Math.round(log.total_na)}мг</span>` : ''}
          ${log.total_cal ? `<span class="food-nutrient">${Math.round(log.total_cal)} ккал</span>` : ''}
          ${log.total_protein ? `<span class="food-nutrient">Белок: ${log.total_protein}г</span>` : ''}
        </div>
      `;
      container.appendChild(item);
    });
  } catch (e) {
    if (container) container.innerHTML = `<div class="loading-text" style="color:#e74c3c">Ошибка: ${e.message}</div>`;
  }
}

// ── Удалить запись питания ──
async function deleteFood(id) {
  if (!confirm('Удалить эту запись?')) return;
  try {
    await apiFetch(`/food/${id}`, { method: 'DELETE' });
    showToast('Удалено', 'success');
    loadFoodToday();
  } catch (e) {
    showToast(`❌ ${e.message}`, 'error');
  }
}

// ── Межсеансовый период — новая логика ──
async function loadPeriodSummary() {
  const barsEl  = document.getElementById('periodBars');
  const daysEl  = document.getElementById('periodDaysLabel');
  const byDayEl = document.getElementById('periodByDay');
  const recEl   = document.getElementById('periodRecommendations');
  if (!barsEl) return;

  try {
    const data = await apiFetch('/food/period');
    const {
      periodStart, periodEnd, nextDialysisDate,
      totalDays, daysElapsed, daysRemaining,
      nutrients, prediction, byDay, recommendations,
    } = data;

    // ── Заголовок периода ──
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { weekday:'short', day:'numeric', month:'short' });
    const nextFmt = new Date(nextDialysisDate + 'T12:00:00').toLocaleDateString('ru-RU', { weekday:'short', day:'numeric', month:'short' });
    daysEl.innerHTML = `${fmt(periodStart)} → Диализ ${nextFmt} · <b style="color:#1a6ccc">осталось ${daysRemaining} дн.</b>`;

    barsEl.innerHTML = '';

    // ── Прогресс-бары: потреблено / лимит периода ──
    const nutrientCfg = [
      { key:'k',     label:'Калий',    unit:'мг' },
      { key:'p',     label:'Фосфор',   unit:'мг' },
      { key:'na',    label:'Натрий',   unit:'мг' },
      { key:'fluid', label:'Жидкость', unit:'мл' },
    ];

    nutrientCfg.forEach(({ key, label, unit }) => {
      const n = nutrients?.[key];
      if (!n) return;
      const pct = Math.min(n.pct, 100);
      const col = n.status.color;

      const wrap = document.createElement('div');
      wrap.style.marginBottom = '8px';
      wrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;align-items:baseline">
          <span style="font-weight:700;color:#3a4a5a">${n.status.icon} ${label}</span>
          <span style="color:${col};font-size:11px">
            ${n.consumed} / ${n.limit} ${unit}
            <span style="color:#888;margin-left:4px">·</span>
            <span style="color:#1a6ccc">можно ${n.safePerDay} ${unit}/день</span>
          </span>
        </div>
        <div style="height:8px;background:#dde2e8;border-radius:5px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${col};border-radius:5px;transition:width .5s"></div>
        </div>
        <div style="font-size:11px;color:#888;margin-top:2px;text-align:right">
          Осталось: <b style="color:${col}">${n.remain} ${unit}</b>
          · Норма/день: ${n.dailyIdeal} ${unit}
        </div>`;
      barsEl.appendChild(wrap);
    });

    // ── Прогноз калия в крови ──
    if (prediction) {
      const pred = document.createElement('div');
      pred.style.cssText = `margin-top:8px;padding:8px 10px;border-radius:8px;background:${prediction.risk.color}18;border:1px solid ${prediction.risk.color}44;font-size:12px`;
      pred.innerHTML = `
        <span style="font-weight:700;color:${prediction.risk.color}">${prediction.risk.icon} Прогноз K в крови перед диализом: ${prediction.k_blood} ммоль/л — ${prediction.risk.label}</span>
        <span style="color:#888;font-size:11px;margin-left:6px">(базовый: ${prediction.baselineK} ммоль/л)</span>`;
      barsEl.appendChild(pred);
    }

    // ── По дням (раскрываемый список) ──
    if (byDay?.length > 0) {
      const dialDays = [2, 4, 6]; // Вт Чт Сб
      const toggle = document.createElement('button');
      toggle.style.cssText = 'margin-top:8px;font-size:12px;color:#1a6ccc;background:none;border:none;cursor:pointer;padding:2px 0;display:block';
      toggle.textContent = '▼ Разбивка по дням';
      let open = false;
      toggle.onclick = () => {
        open = !open;
        toggle.textContent = open ? '▲ Скрыть' : '▼ Разбивка по дням';
        byDayEl.style.display = open ? 'block' : 'none';
      };
      barsEl.appendChild(toggle);

      byDayEl.innerHTML = byDay.map(d => {
        const dt = new Date(d.date + 'T12:00:00');
        const dateStr = dt.toLocaleDateString('ru-RU', { weekday:'short', day:'numeric', month:'short' });
        const isDial  = dialDays.includes(dt.getDay());
        const badge   = isDial ? '<span style="background:#e8f0fe;color:#1a6ccc;font-size:10px;padding:1px 5px;border-radius:8px;margin-left:4px">💉 Диализ</span>' : '';
        return `<div style="padding:5px 0;border-bottom:1px solid #e8ecf0;font-size:12px">
          <b>${dateStr}</b>${badge}<br>
          K:${Math.round(d.k||0)}мг &nbsp; P:${Math.round(d.p||0)}мг &nbsp; Na:${Math.round(d.na||0)}мг &nbsp;
          <span style="color:#888">${Math.round(d.cal||0)} ккал &nbsp; (${d.entries} прим.)</span>
        </div>`;
      }).join('');
    } else {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;color:#888;margin-top:6px';
      empty.textContent = 'Записей питания за период нет — начни вносить еду';
      barsEl.appendChild(empty);
    }

    // ── AI-рекомендации ──
    if (recommendations) {
      recEl.style.display = 'block';
      recEl.innerHTML = `<div style="font-weight:700;color:#1a6ccc;margin-bottom:4px">🤖 Что можно есть:</div>`
        + recommendations.split('\n').filter(l => l.trim())
            .map(l => `<div style="margin:3px 0;color:#1a1e24">${l}</div>`).join('');
    }

  } catch (e) {
    if (barsEl) barsEl.innerHTML = `<div style="color:#e74c3c;font-size:12px">❌ Ошибка: ${e.message}</div>`;
  }
}

// ── Меню дня от AI ──
async function loadDailyMenu() {
  const btn = document.getElementById('btnLoadMenu');
  const resultEl = document.getElementById('menuResult');
  if (!btn || !resultEl) return;

  btn.disabled = true;
  btn.textContent = '⏳ AI думает...';
  resultEl.innerHTML = '<div style="color:#888">🤖 Составляю меню под ваши нормы...</div>';

  try {
    const res = await apiFetch('/food/menu');
    renderDailyMenu(res.menu, resultEl);
  } catch (e) {
    resultEl.innerHTML = `<div style="color:#e74c3c">❌ ${e.message}</div>`;
    showToast('Ошибка загрузки меню', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Обновить меню';
  }
}

function renderDailyMenu(menu, container) {
  if (!menu) { container.innerHTML = '<div style="color:#e74c3c">Нет данных</div>'; return; }

  const mealIcons = { breakfast:'🌅', lunch:'☀️', dinner:'🌙', snack:'🍎' };
  const mealOrder = ['breakfast','lunch','snack','dinner'];

  container.innerHTML = '';

  mealOrder.forEach(key => {
    const meal = menu[key];
    if (!meal) return;

    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #dde2e8';

    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700; color:#1a6ccc; margin-bottom:4px';
    title.textContent = `${mealIcons[key] || '🍽️'} ${meal.name}`;
    section.appendChild(title);

    (meal.dishes || []).forEach(d => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:2px 0 2px 8px; color:#1a1e24; font-size:13px';
      row.innerHTML = `• <b>${d.dish}</b> <span style="color:#888">${d.portion || ''}</span>${d.note ? ` <span style="color:#e67e22; font-size:12px">— ${d.note}</span>` : ''}`;
      section.appendChild(row);
    });

    container.appendChild(section);
  });

  // Кнопка "Использовать в питании"
  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:6px; font-size:12px; color:#888';
  hint.textContent = '💡 Чтобы записать приём пищи — опишите что съели в поле выше';
  container.appendChild(hint);
}

// ── Привязка кнопок ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnAddFood')?.addEventListener('click', addFood);
  document.getElementById('btnLoadMenu')?.addEventListener('click', loadDailyMenu);

  // Установить дату по умолчанию
  const foodDateEl = document.getElementById('foodDate');
  if (foodDateEl) {
    foodDateEl.value = todayStr();
    foodDateEl.addEventListener('change', loadFoodToday);
  }

  // Загрузить данные периода сразу
  loadPeriodSummary();
});

// Перезагружать период при добавлении еды
const _origAddFood = addFood;
async function addFoodAndRefreshPeriod() {
  await _origAddFood();
  await loadPeriodSummary();
}
