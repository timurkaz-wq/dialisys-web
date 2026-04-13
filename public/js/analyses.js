/* ══════════════════════════════════════════════
   analyses.js — ввод и отображение анализов
   ══════════════════════════════════════════════ */

const MONTH_NAMES = ['','Январь','Февраль','Март','Апрель','Май','Июнь',
                     'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function monthLabel(key) {
  if (!key) return '—';
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[parseInt(m)]} ${y}`;
}

// ── Сохранить анализы ──
async function saveAnalysis() {
  const month_key = document.getElementById('analysisMonth').value;
  if (!month_key) { showToast('Выберите ��есяц', 'warn'); return; }

  const data = {
    month_key,
    k:          document.getElementById('anaK').value          || null,
    na:         document.getElementById('anaNa').value         || null,
    ca:         document.getElementById('anaCa').value         || null,
    hco3:       document.getElementById('anaHco3').value       || null,
    p:          document.getElementById('anaP').value          || null,
    pth:        document.getElementById('anaPth').value        || null,
    mg:         document.getElementById('anaMg').value         || null,
    creatinine: document.getElementById('anaCreatinine').value || null,
    hb:         document.getElementById('anaHb').value         || null,
    albumin:    document.getElementById('anaAlbumin').value    || null,
    urea_b:     document.getElementById('anaUreaB').value      || null,
    urea_a:     document.getElementById('anaUreaA').value      || null,
  };

  try {
    const res = await apiFetch('/analyses', { method: 'POST', body: JSON.stringify(data) });
    window.latestAnalysis = res.analysis;

    // Показать оценку
    const resultEl = document.getElementById('analysisResult');
    resultEl.innerHTML = '';
    resultEl.classList.remove('hidden');

    const title = document.createElement('div');
    title.className = 'result-line bold';
    title.textContent = `✅ Анализы за ${monthLabel(month_key)} сохранены`;
    title.style.color = '#27ae60';
    resultEl.appendChild(title);

    if (res.evaluation?.length) {
      res.evaluation.forEach(item => {
        if (item.text) {
          const el = renderResultLine(item.text, item.color);
          resultEl.appendChild(el);
        } else if (item.icon) {
          const el = renderResultLine(
            `${item.icon} ${item.label}: ${item.value} ${item.unit} — ${item.status}`,
            item.color
          );
          resultEl.appendChild(el);
        }
      });
    }

    showToast('✅ Анализы сохранены', 'success');
    loadAnalysisHistory();
  } catch (e) {
    showToast(`❌ ${e.message}`, 'error');
  }
}

// ── Автозаполнение формы последними анализами ──
async function autoFillAnalysisForm() {
  try {
    const analyses = await apiFetch('/analyses');
    if (!analyses.length) return;

    // Берём самый свежий анализ
    const latest = analyses[0];

    // Заполняем форму только если поля пустые (не перетираем то, что вводит пользователь)
    const monthEl = document.getElementById('analysisMonth');
    if (!monthEl.value || monthEl.value === currentMonthKey()) {
      // Показываем месяц последнего анализа
      monthEl.value = latest.month_key;
    }

    // Заполняем поля значениями из последнего анализа
    const fill = (id, val) => {
      const el = document.getElementById(id);
      if (el && !el.value) el.value = val || '';
    };

    fill('anaK',          latest.k);
    fill('anaNa',         latest.na);
    fill('anaCa',         latest.ca);
    fill('anaHco3',       latest.hco3);
    fill('anaP',          latest.p);
    fill('anaPth',        latest.pth);
    fill('anaMg',         latest.mg);
    fill('anaCreatinine', latest.creatinine);
    fill('anaHb',         latest.hb);
    fill('anaAlbumin',    latest.albumin);
    fill('anaUreaB',      latest.urea_b);
    fill('anaUreaA',      latest.urea_a);
  } catch { /* нет анализов — ок */ }
}

// ── Загрузить историю анализов ──
async function loadAnalysisHistory() {
  const container = document.getElementById('analysisHistory');
  container.innerHTML = '<div class="loading-text">Загрузка...</div>';

  // Автозаполнение формы при первом открытии вкладки
  await autoFillAnalysisForm();

  try {
    const analyses = await apiFetch('/analyses');
    if (!analyses.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🧪</div>
          <div class="empty-label">Анализы не введены</div>
        </div>`;
      return;
    }

    container.innerHTML = '';
    analyses.forEach(a => {
      const item = document.createElement('div');
      item.className = 'analysis-history-item';
      item.innerHTML = `
        <div class="analysis-month">🧪 ${monthLabel(a.month_key)}</div>
        <div style="display:flex;flex-wrap:wrap">
          ${_badge('K', a.k, [3.5,5.0])}
          ${_badge('Na', a.na, [136,145])}
          ${_badge('Ca', a.ca, [2.1,2.55])}
          ${_badge('HCO₃', a.hco3, [22,26])}
          ${_badge('P', a.p, [0.87,1.78])}
          ${_badge('PTH', a.pth, [150,300])}
          ${_badge('Hb', a.hb, [110,150])}
          ${_badge('Albumin', a.albumin, [35,50])}
          ${_badge('Mg', a.mg, [0.7,1.1])}
        </div>
        <div style="margin-top:6px;font-size:11px;color:#5f6368">
          Обновлено: ${a.updated_at ? new Date(a.updated_at).toLocaleDateString('ru-RU') : '—'}
        </div>
        <button class="btn btn-outline" style="margin-top:8px;padding:6px 12px;font-size:12px"
          onclick="loadAnalysisToForm('${a.month_key}')">✏️ Редактировать</button>
      `;
      container.appendChild(item);
    });
  } catch (e) {
    container.innerHTML = `<div class="loading-text" style="color:#e74c3c">Ошибка: ${e.message}</div>`;
  }
}

// ── Загрузить анализ в форму для редактирования ──
async function loadAnalysisToForm(monthKey) {
  try {
    const a = await apiFetch(`/analyses/${monthKey}`);
    if (!a) return;

    document.getElementById('analysisMonth').value = monthKey;
    document.getElementById('anaK').value          = a.k          || '';
    document.getElementById('anaNa').value         = a.na         || '';
    document.getElementById('anaCa').value         = a.ca         || '';
    document.getElementById('anaHco3').value       = a.hco3       || '';
    document.getElementById('anaP').value          = a.p          || '';
    document.getElementById('anaPth').value        = a.pth        || '';
    document.getElementById('anaMg').value         = a.mg         || '';
    document.getElementById('anaCreatinine').value = a.creatinine || '';
    document.getElementById('anaHb').value         = a.hb         || '';
    document.getElementById('anaAlbumin').value    = a.albumin    || '';
    document.getElementById('anaUreaB').value      = a.urea_b     || '';
    document.getElementById('anaUreaA').value      = a.urea_a     || '';

    // Прокрутить наверх формы
    document.querySelector('#tab-analyses').scrollTop = 0;
    showToast(`📋 Анализы ${monthLabel(monthKey)} загружены`, 'success');
  } catch (e) {
    showToast(`❌ ${e.message}`, 'error');
  }
}

// ── Значок анализа ──
function _badge(label, value, range) {
  if (value === null || value === undefined || value === '') return '';
  const v = parseFloat(value);
  let cls = 'ok';
  if (v < range[0] || v > range[1]) cls = v < range[0] * 0.8 || v > range[1] * 1.3 ? 'danger' : 'warn';
  return `<span class="analysis-badge ${cls}">${label}: ${v}</span>`;
}

// ── Привязка кнопок ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnSaveAnalysis')?.addEventListener('click', saveAnalysis);
});
