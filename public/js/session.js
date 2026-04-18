/* ══════════════════════════════════════════════
   session.js — сеанс диализа + настройки аппарата
   ══════════════════════════════════════════════ */

const SHIFT_TIMES = { '1': '06:00', '2': '10:30', '3': '15:00' };

// ID текущего черновика (если сеанс уже начат сегодня)
window.currentDraftId = null;

// ── Собрать данные формы ──
function getSessionFormData() {
  const shift = document.getElementById('sessionShift')?.value || '3';
  return {
    date:           document.getElementById('sessionDate').value || todayStr(),
    shift,
    shift_time:     SHIFT_TIMES[shift],
    current_weight: document.getElementById('currentWeight').value,
    dry_weight:     document.getElementById('dryWeight').value,
    actual_time:    document.getElementById('actualTime').value,
    bp_before:      document.getElementById('bpBefore').value,
    bp_during:      document.getElementById('bpDuring').value,
    bp_after:       document.getElementById('bpAfter').value,
    art_pressure:   document.getElementById('artPressure').value,
    ven_pressure:   document.getElementById('venPressure').value,
    cramps:         parseInt(document.getElementById('cramps').value) || 0,
    hypotension:    parseInt(document.getElementById('hypotension').value) || 0,
    symptoms_before: getChecked('symptomsBefore'),
    symptoms_during: getChecked('symptomsDuring'),
    symptoms_after:  getChecked('symptomsAfter'),
    analysis: window.latestAnalysis || null,
  };
}

function getChecked(containerId) {
  const container = document.getElementById(containerId);
  const checked = {};
  container.querySelectorAll('input[type=checkbox]:checked').forEach(cb => {
    checked[cb.value] = 2;
  });
  return checked;
}

// ══════════════════════════════════════════════
//  Проверить черновик сегодня
// ══════════════════════════════════════════════
async function checkTodayDraft() {
  try {
    const res = await apiFetch('/procedures/today');
    if (res && res.status === 'draft') {
      window.currentDraftId = res.id;
      _loadDraftToForm(res);
      _showFinishMode(res);
    }
  } catch { /* нет черновика — ок */ }
}

function _loadDraftToForm(p) {
  if (p.date) document.getElementById('sessionDate').value = p.date;
  if (p.shift) document.getElementById('sessionShift').value = p.shift;
  if (p.current_weight) document.getElementById('currentWeight').value = p.current_weight;
  if (p.dry_weight)     document.getElementById('dryWeight').value     = p.dry_weight;
  if (p.bp_before)      document.getElementById('bpBefore').value      = p.bp_before;
}

function _showFinishMode(p) {
  // Показать кнопку "Завершить", скрыть "Начало"
  document.getElementById('btnStartSession').classList.add('hidden');
  document.getElementById('btnFinishSession').classList.remove('hidden');

  // Баннер с подсказкой
  const banner = document.getElementById('sessionDraftBanner');
  const shiftLabel = { '1': '1-я (06:00)', '2': '2-я (10:30)', '3': '3-я (15:00)' }[p.shift] || p.shift;
  banner.innerHTML = `
    ✅ <b>Начало сеанса зафиксировано</b> — ${shiftLabel} смена.<br>
    Дополни АД во время/после, симптомы и фактическое время — затем нажми <b>«Завершить сеанс»</b>.
  `;
  banner.classList.remove('hidden');
}

function _showStartMode() {
  document.getElementById('btnStartSession').classList.remove('hidden');
  document.getElementById('btnFinishSession').classList.add('hidden');
  document.getElementById('sessionDraftBanner').classList.add('hidden');
  window.currentDraftId = null;
}

// ══════════════════════════════════════════════
//  РАСЧЁТ (без сохранения)
// ══════════════════════════════════════════════
async function calculate() {
  const data   = getSessionFormData();
  const result = document.getElementById('sessionResult');
  result.innerHTML = '<div class="loading-text">⏳ Расчёт...</div>';
  result.classList.remove('hidden');

  try {
    const res = await apiFetch('/procedures/calculate', {
      method: 'POST',
      body:   JSON.stringify(data),
    });
    window.lastCalcResult = res;
    renderSessionResult(res, result);
    renderMachineSettings(res);
    showToast('✅ Расчёт выполнен', 'success');
  } catch (e) {
    result.innerHTML = `<div class="result-line" style="color:#e74c3c">❌ ${e.message}</div>`;
  }
}

// ══════════════════════════════════════════════
//  НАЧАЛО СЕАНСА — сохранить черновик
// ══════════════════════════════════════════════
async function startSession() {
  const data = getSessionFormData();
  if (!data.current_weight || !data.dry_weight) {
    showToast('⚠️ Введите текущий и сухой вес', 'warn');
    return;
  }
  if (!data.bp_before) {
    showToast('⚠️ Введите АД до диализа', 'warn');
    return;
  }

  try {
    const res = await apiFetch('/procedures', {
      method: 'POST',
      body:   JSON.stringify({ ...data, status: 'draft' }),
    });

    window.currentDraftId = res.procedure.id;
    window.lastCalcResult = res;

    renderSessionResult(res, document.getElementById('sessionResult'));
    document.getElementById('sessionResult').classList.remove('hidden');
    renderMachineSettings(res);

    _showFinishMode(res.procedure);
    showToast('🏁 Начало сеанса зафиксировано', 'success');
  } catch (e) {
    showToast(`❌ Ошибка: ${e.message}`, 'error');
  }
}

// ══════════════════════════════════════════════
//  ЗАВЕРШИТЬ СЕАНС — дополнить черновик
// ══════════════════════════════════════════════
async function finishSession() {
  if (!window.currentDraftId) {
    showToast('⚠️ Сначала зафиксируй начало сеанса', 'warn');
    return;
  }

  const data = getSessionFormData();

  try {
    const res = await apiFetch(`/procedures/${window.currentDraftId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        bp_during:       data.bp_during,
        bp_after:        data.bp_after,
        art_pressure:    data.art_pressure,
        ven_pressure:    data.ven_pressure,
        actual_time:     data.actual_time,
        symptoms_during: data.symptoms_during,
        symptoms_after:  data.symptoms_after,
        cramps:          data.cramps,
        hypotension:     data.hypotension,
      }),
    });

    window.lastCalcResult = res;
    renderSessionResult(res, document.getElementById('sessionResult'));
    document.getElementById('sessionResult').classList.remove('hidden');
    renderMachineSettings(res);

    _showStartMode();
    showToast('✅ Сеанс завершён и сохранён', 'success');
  } catch (e) {
    showToast(`❌ Ошибка: ${e.message}`, 'error');
  }
}

// ══════════════════════════════════════════════
//  Рендер результата сеанса
// ══════════════════════════════════════════════
function renderSessionResult(res, container) {
  container.innerHTML = '';

  const { fluidMl, recommendedTime, minSafeTimeH, ufMlH, ufMlkgH,
          loadingMlKg, ufRating, loadRating, finalStatus, machineSettings } = res;

  const statusEl = document.createElement('div');
  statusEl.className = 'result-line bold';
  statusEl.style.cssText = `color:${finalStatus.color}; font-size:17px; padding:10px 0`;
  statusEl.textContent = finalStatus.text;
  container.appendChild(statusEl);

  const lines = [
    { text: `💧 Убрать жидкости: ${fluidMl} мл`, color: '#1a73e8', bold: true },
    { text: `⏱ Рекомендуемое время: ${recommendedTime} ч  (мин. безопасное: ${minSafeTimeH} ч)`,
      color: recommendedTime > (parseFloat(document.getElementById('actualTime').value) || 4)
             ? '#e67e22' : '#27ae60', bold: true },
    { text: `📊 UF: ${Math.round(ufMlH)} мл/ч  |  ${ufMlkgH} мл/кг/ч  — ${ufRating.text}`, color: ufRating.color },
    { text: `💪 Нагрузка: ${loadingMlKg} мл/кг — ${loadRating.text}`, color: loadRating.color },
  ];
  lines.forEach(l => container.appendChild(renderResultLine(l.text, l.color, l.bold)));

  if (machineSettings?.dialysate) {
    container.appendChild(renderResultLine('─── Настройки аппарата ───', '#5f6368'));
    const d = machineSettings.dialysate;
    container.appendChild(renderResultLine(`Qb: ${machineSettings.qb} мл/мин  |  Qd: ${machineSettings.qd} мл/мин`, '#1a73e8'));
    container.appendChild(renderResultLine(
      `K: ${d.k}  |  Na: ${d.na}  |  Ca: ${d.ca}  |  HCO₃: ${d.hco3}  |  Темп: ${d.temp}°C`, '#1a73e8'));
  }

  // ── Питание: красные предупреждения по накопленным нутриентам ──
  if (res.foodAlerts?.length) {
    const foodDiv = document.createElement('div');
    foodDiv.style.cssText = 'margin-top:12px; border-top:2px solid #e74c3c; padding-top:10px';

    const foodTitle = document.createElement('div');
    foodTitle.style.cssText = 'color:#e74c3c; font-size:14px; font-weight:700; margin-bottom:6px';
    foodTitle.textContent = '🍽️ Внимание! По данным питания:';
    foodDiv.appendChild(foodTitle);

    res.foodAlerts.forEach(alert => {
      const el = document.createElement('div');
      el.style.cssText = `margin:6px 0; padding:8px 10px; background:${alert.level==='critical'?'#fff0f0':'#fff8f0'};
        border-left:4px solid ${alert.color}; border-radius:0 8px 8px 0; font-size:13px`;
      el.innerHTML = `<div style="color:${alert.color};font-weight:700">${alert.icon} ${alert.text}</div>
        <div style="color:#555;margin-top:3px">→ ${alert.recommendation}</div>`;
      foodDiv.appendChild(el);
    });

    container.appendChild(foodDiv);
  }

  // Рекомендации для следующего сеанса
  if (res.nextRecommendations?.length) {
    const recDiv = document.createElement('div');
    recDiv.style.cssText = 'margin-top:12px; border-top:2px solid #e0e0e0; padding-top:10px';

    const recTitle = document.createElement('div');
    recTitle.className = 'result-line bold';
    recTitle.style.cssText = 'color:#1a73e8; font-size:14px; margin-bottom:6px';
    recTitle.textContent = '📋 Рекомендации для следующего сеанса:';
    recDiv.appendChild(recTitle);

    res.nextRecommendations.forEach(tip => {
      const el = document.createElement('div');
      el.className = 'result-line';
      el.style.cssText = `color:${tip.color}; padding:4px 0; border-left:3px solid ${tip.color}; padding-left:8px; margin:4px 0`;
      el.textContent = `${tip.icon} ${tip.text}`;
      recDiv.appendChild(el);
    });
    container.appendChild(recDiv);
  }

  const btnMachine = document.createElement('button');
  btnMachine.className = 'btn btn-outline';
  btnMachine.style.marginTop = '10px';
  btnMachine.textContent = '💧 Открыть настройки аппарата';
  btnMachine.onclick = () => document.querySelector('[data-tab="machine"]').click();
  container.appendChild(btnMachine);
}

// ══════════════════════════════════════════════
//  АППАРАТ — полные настройки
// ══════════════════════════════════════════════
function renderMachineSettings(res) {
  const container = document.getElementById('machineSettings');
  if (!res?.machineSettings) return;

  const { machineSettings, fluidMl, recommendedTime, ufMlkgH, ufRating } = res;
  const d = machineSettings.dialysate;

  container.innerHTML = '';

  const highlightDiv = document.createElement('div');
  highlightDiv.className = 'machine-highlight';
  highlightDiv.innerHTML = `
    <div class="machine-label">⏱ Рекомендуемое время диализа</div>
    <div class="machine-value">${recommendedTime} ч</div>
    <div class="machine-unit">при UF ≤ 8 мл/кг/ч | жидкость: ${fluidMl} мл</div>
  `;
  container.appendChild(highlightDiv);

  const ufDiv = document.createElement('div');
  ufDiv.className = 'card';
  ufDiv.innerHTML = `
    <div class="card-label" style="color:${ufRating.color}">${ufRating.text}</div>
    <div style="font-size:13px;color:#5f6368">UF скорость: ${ufMlkgH} мл/кг/ч</div>
  `;
  container.appendChild(ufDiv);

  const settings = [
    { label: 'Qb — кровоток',   value: machineSettings.qb,   unit: 'мл/мин' },
    { label: 'Qd — диализат',   value: machineSettings.qd,   unit: 'мл/мин' },
    { label: 'K диализата',     value: d.k,                   unit: 'ммоль/л' },
    { label: 'Na диализата',    value: d.na,                  unit: 'ммоль/л' },
    { label: 'Ca диализата',    value: d.ca,                  unit: 'ммоль/л' },
    { label: 'HCO₃ диализата',  value: d.hco3,                unit: 'ммоль/л' },
    { label: 'Температура',     value: d.temp,                unit: '°C'      },
  ];

  const grid = document.createElement('div');
  grid.className = 'machine-grid';
  settings.forEach(s => {
    const item = document.createElement('div');
    item.className = 'machine-item';
    item.innerHTML = `
      <div class="machine-label">${s.label}</div>
      <div class="machine-value">${s.value}</div>
      <div class="machine-unit">${s.unit}</div>
    `;
    grid.appendChild(item);
  });
  container.appendChild(grid);

  const MONTHS_RU = ['','Январь','Февраль','Март','Апрель','Май','Июнь',
                     'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const ana = window.latestAnalysis;
  let anaInfo = 'анализы не введены';
  if (ana) {
    const [y, m] = ana.month_key.split('-');
    const monthName = `${MONTHS_RU[parseInt(m)]} ${y}`;
    const parts = [];
    if (ana.k)    parts.push(`K=${ana.k}`);
    if (ana.na)   parts.push(`Na=${ana.na}`);
    if (ana.ca)   parts.push(`Ca=${ana.ca}`);
    if (ana.hco3) parts.push(`HCO₃=${ana.hco3}`);
    anaInfo = `${monthName}${parts.length ? ': ' + parts.join(', ') : ''}`;
  }

  const infoDiv = document.createElement('div');
  infoDiv.className = 'card info-card';
  infoDiv.style.marginTop = '10px';
  infoDiv.innerHTML = `
    <div class="info-text">
      📋 Анализы: <b>${anaInfo}</b><br>
      Настройки рассчитаны автоматически. Перед процедурой уточните у медперсонала.
    </div>
  `;
  container.appendChild(infoDiv);
}

// ── Привязка кнопок ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnCalculate')   ?.addEventListener('click', calculate);
  document.getElementById('btnStartSession') ?.addEventListener('click', startSession);
  document.getElementById('btnFinishSession')?.addEventListener('click', finishSession);

  // Проверить черновик при загрузке
  checkTodayDraft();
});
