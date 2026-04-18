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

// ── Межсеансовый период: накопленные нутриенты ──
async function loadPeriodSummary() {
  const barsEl   = document.getElementById('periodBars');
  const daysEl   = document.getElementById('periodDaysLabel');
  const byDayEl  = document.getElementById('periodByDay');
  const recEl    = document.getElementById('periodRecommendations');
  if (!barsEl) return;

  try {
    const data = await apiFetch('/food/period');
    const { fromDate, toDate, days, byDay, totals, limits, warnings, dialysisDates, recommendations } = data;

    // Заголовок периода
    const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
    daysEl.textContent = fromDate === toDate
      ? `${fmt(fromDate)} (1 день)`
      : `${fmt(fromDate)} — ${fmt(toDate)} (${days} дн.)`;

    // Прогресс-бары накопленных нутриентов
    barsEl.innerHTML = '';
    const nutrients = [
      { key:'k',  label:'Калий',   unit:'мг', val: Math.round(totals.k),  max: limits.k  },
      { key:'p',  label:'Фосфор',  unit:'мг', val: Math.round(totals.p),  max: limits.p  },
      { key:'na', label:'Натрий',  unit:'мг', val: Math.round(totals.na), max: limits.na },
      { key:'fl', label:'Жидкость',unit:'мл', val: Math.round(totals.fluid), max: limits.fluid },
    ];

    nutrients.forEach(n => {
      const pct = Math.min((n.val / n.max) * 100, 100);
      const cls = pct > 90 ? 'danger' : pct > 70 ? 'warn' : 'ok';
      const colors = { ok:'#27ae60', warn:'#e67e22', danger:'#e74c3c' };
      const col = colors[cls];
      const bar = document.createElement('div');
      bar.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
          <span style="font-weight:600;color:#3a4a5a">${n.label}</span>
          <span style="color:${col}">${n.val} / ${n.max} ${n.unit}</span>
        </div>
        <div style="height:6px;background:#dde2e8;border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${col};border-radius:4px;transition:width .4s"></div>
        </div>`;
      barsEl.appendChild(bar);
    });

    // По дням — кнопка раскрыть/скрыть
    if (byDay?.length > 0) {
      const toggle = document.createElement('button');
      toggle.style.cssText = 'margin-top:8px;font-size:12px;color:#1a6ccc;background:none;border:none;cursor:pointer;padding:0';
      toggle.textContent = '▼ Разбивка по дням';
      let open = false;
      toggle.onclick = () => {
        open = !open;
        toggle.textContent = open ? '▲ Скрыть' : '▼ Разбивка по дням';
        byDayEl.style.display = open ? 'block' : 'none';
      };
      barsEl.appendChild(toggle);

      byDayEl.innerHTML = byDay.map(d => {
        const dateStr = new Date(d.date + 'T12:00:00').toLocaleDateString('ru-RU', { weekday:'short', day:'numeric', month:'short' });
        const isDial  = dialysisDates?.includes(d.date);
        const badge   = isDial ? '<span style="background:#e8f0fe;color:#1a6ccc;font-size:10px;padding:1px 5px;border-radius:8px;margin-left:4px">💉 Диализ</span>' : '';
        return `<div style="padding:4px 0;border-bottom:1px solid #e8ecf0">
          <b>${dateStr}</b>${badge} —
          K:${Math.round(d.k||0)}мг  P:${Math.round(d.p||0)}мг  Na:${Math.round(d.na||0)}мг
          <span style="color:#888">${Math.round(d.cal||0)}ккал (${d.entries} прим.)</span>
        </div>`;
      }).join('');
    }

    // AI-рекомендации
    if (recommendations) {
      recEl.style.display = 'block';
      recEl.innerHTML = `<div style="font-weight:700;color:#1a6ccc;margin-bottom:4px">🤖 Что можно есть дальше:</div>`
        + recommendations
            .split('\n')
            .filter(l => l.trim())
            .map(l => `<div style="margin:2px 0">${l}</div>`)
            .join('');
    }

    // Предупреждения
    if (warnings?.length) {
      warnings.forEach(w => {
        const el = document.createElement('div');
        el.style.cssText = `margin-top:6px;padding:6px 8px;background:#fff8f0;border-left:3px solid ${w.color};border-radius:0 6px 6px 0;font-size:12px;color:${w.color}`;
        el.textContent = w.text;
        barsEl.appendChild(el);
      });
    }

  } catch (e) {
    if (barsEl) barsEl.innerHTML = `<div style="color:#999;font-size:12px">Ошибка загрузки периода: ${e.message}</div>`;
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
