/* ══════════════════════════════════════════════
   session.js — сеанс диализа + настройки аппарата
   ══════════════════════════════════════════════ */

// ── Собрать данные формы ──
const SHIFT_TIMES = { '1': '07:30', '2': '11:30', '3': '15:30', '4': '19:30' };

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
    checked[cb.value] = 2; // умеренная выраженност�� по умолчанию
  });
  return checked;
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

    // Обновить вкладку аппарата сразу
    renderMachineSettings(res);
    showToast('✅ Расчёт выполнен', 'success');
  } catch (e) {
    result.innerHTML = `<div class="result-line" style="color:#e74c3c">❌ ${e.message}</div>`;
  }
}

// ══════════════════════════════════════════════
//  Рендер результата сеанса
// ══════════════════════════════════════════════
function renderSessionResult(res, container) {
  container.innerHTML = '';

  const { fluidMl, recommendedTime, minSafeTimeH, ufMlH, ufMlkgH,
          loadingMlKg, ufRating, loadRating, finalStatus, machineSettings } = res;

  // Итоговый статус — крупно
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

  // Настройки аппарата — краткий блок
  if (machineSettings?.dialysate) {
    container.appendChild(renderResultLine('─── Настройки аппарата ───', '#5f6368'));
    const d = machineSettings.dialysate;
    container.appendChild(renderResultLine(`Qb: ${machineSettings.qb} мл/мин  |  Qd: ${machineSettings.qd} мл/мин`, '#1a73e8'));
    container.appendChild(renderResultLine(
      `K: ${d.k}  |  Na: ${d.na}  |  Ca: ${d.ca}  |  HCO₃: ${d.hco3}  |  Темп: ${d.temp}°C`, '#1a73e8'));
  }

  // Кнопка перейти на аппарат
  const btnMachine = document.createElement('button');
  btnMachine.className = 'btn btn-outline';
  btnMachine.style.marginTop = '10px';
  btnMachine.textContent = '💧 Открыть настройки аппарата';
  btnMachine.onclick = () => {
    document.querySelector('[data-tab="machine"]').click();
  };
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

  // Главная карточка — время
  const highlightDiv = document.createElement('div');
  highlightDiv.className = 'machine-highlight';
  highlightDiv.innerHTML = `
    <div class="machine-label">⏱ Рекомендуемое время диализа</div>
    <div class="machine-value">${recommendedTime} ч</div>
    <div class="machine-unit">при UF ≤ 8 мл/кг/ч | жидкость: ${fluidMl} мл</div>
  `;
  container.appendChild(highlightDiv);

  // UF статус
  const ufDiv = document.createElement('div');
  ufDiv.className = 'card';
  ufDiv.innerHTML = `
    <div class="card-label" style="color:${ufRating.color}">${ufRating.text}</div>
    <div style="font-size:13px;color:#5f6368">UF скорость: ${ufMlkgH} мл/кг/ч</div>
  `;
  container.appendChild(ufDiv);

  // Сетка настроек
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

  // Источники данных
  const infoDiv = document.createElement('div');
  infoDiv.className = 'card info-card';
  infoDiv.style.marginTop = '10px';
  infoDiv.innerHTML = `
    <div class="info-text">
      Настройки рассчитаны по формулам Excel и последним анализам
      ${window.latestAnalysis ? `(${window.latestAnalysis.month_key})` : ''}.
      Перед процедурой уточните у медперсонала.
    </div>
  `;
  container.appendChild(infoDiv);
}

// ══════════════════════════════════════════════
//  СОХРАНИТЬ СЕАНС
// ══════════════════════════════════════════════
async function saveSession() {
  const data = getSessionFormData();
  if (!data.current_weight || !data.dry_weight) {
    showToast('⚠️ Введите текущий и сухой вес', 'warn');
    return;
  }

  try {
    const res = await apiFetch('/procedures', {
      method: 'POST',
      body:   JSON.stringify(data),
    });
    showToast('✅ Сеанс сохранён', 'success');
    window.lastCalcResult = { ...res, machineSettings: res.machineSettings };
    renderSessionResult(window.lastCalcResult, document.getElementById('sessionResult'));
    document.getElementById('sessionResult').classList.remove('hidden');
  } catch (e) {
    showToast(`❌ Ошибка: ${e.message}`, 'error');
  }
}

// ── Привязка кнопок ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnCalculate')  ?.addEventListener('click', calculate);
  document.getElementById('btnSaveSession')?.addEventListener('click', saveSession);
});
