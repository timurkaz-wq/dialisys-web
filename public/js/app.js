/* ══════════════════════════════════════════════
   app.js — ядро приложения: API, навигация, утилиты
   ══════════════════════════════════════════════ */

const API = '/api';

// ── Универсальный fetch ──
async function apiFetch(url, options = {}) {
  try {
    const res = await fetch(API + url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    console.error('[API]', url, e.message);
    throw e;
  }
}

// ── Toast уведомления ──
function showToast(msg, type = 'default', duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type}`;
  setTimeout(() => { t.className = 'toast hidden'; }, duration);
}

// ── Форматирование даты ──
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Render строки результата ──
function renderResultLine(text, color = null, bold = false) {
  const div = document.createElement('div');
  div.className = 'result-line' + (bold ? ' bold' : '');
  if (color) div.style.color = color;
  div.textContent = text;
  return div;
}

// ── Глобальный кэш последнего расчёта ──
window.lastCalcResult = null;
window.latestAnalysis = null;

// ══════════════════════════════════════════════
//  Навигация по вкладкам
// ══════════════════════════════════════════════
function initTabs() {
  const buttons  = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      buttons.forEach(b  => b.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');

      // Загрузить данные при переходе на вкладку
      if (target === 'history')  loadHistory();
      if (target === 'food')     loadFoodToday();
      if (target === 'analyses') loadAnalysisHistory();
      if (target === 'chat')     loadChatHistory();
      if (target === 'machine' && window.lastCalcResult) renderMachineSettings(window.lastCalcResult);
    });
  });
}

// ══════════════════════════════════════════════
//  Инициализация
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Дата и время в заголовке (обновляется каждую минуту)
  function updateHeaderDateTime() {
    const now = new Date();
    const date = now.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    document.getElementById('headerDate').innerHTML = `${date}<br>${time}`;
  }
  updateHeaderDateTime();
  setInterval(updateHeaderDateTime, 60000);

  // Дата сеанса — сегодня
  const sessionDateEl = document.getElementById('sessionDate');
  if (sessionDateEl) sessionDateEl.value = todayStr();

  // Месяц анализов — текущий
  const monthEl = document.getElementById('analysisMonth');
  if (monthEl) monthEl.value = currentMonthKey();

  // Инициализация ��кладок
  initTabs();

  // Загрузить данные ��ациента
  try {
    const patient = await apiFetch('/patient');
    document.getElementById('headerPatient').textContent = patient.name;
  } catch { /* игнорируем */ }

  // Загрузить последний анализ в кэш
  try {
    window.latestAnalysis = await apiFetch('/analyses/latest');
  } catch { /* игнорируем */ }

  // Загрузить пи��ание за сегодня
  loadFoodToday();

  // Показать рекомендации с последнего сеанса
  try {
    const last = await apiFetch('/procedures?limit=1');
    if (last?.length) {
      const p = last[0];
      const recs = _buildLastSessionTips(p);
      if (recs.length) {
        const banner = document.getElementById('lastSessionBanner');
        if (banner) {
          banner.innerHTML = `
            <div style="font-weight:700;margin-bottom:6px;color:#1a73e8">
              📋 Рекомендации с последнего сеанса (${formatDate(p.date)}):
            </div>
            ${recs.map(r => `<div style="color:${r.color};padding:3px 0;border-left:3px solid ${r.color};padding-left:8px;margin:3px 0">${r.icon} ${r.text}</div>`).join('')}
          `;
          banner.classList.remove('hidden');
        }
      }
    }
  } catch { /* нет данных — ок */ }

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});

// ── Рекомендации на основе сохранённых данных сеанса ──
function _buildLastSessionTips(p) {
  const tips = [];

  // Парсим симптомы из JSON
  let sDuring = {}, sAfter = {};
  try { sDuring = typeof p.symptoms_during === 'string' ? JSON.parse(p.symptoms_during) : (p.symptoms_during || {}); } catch {}
  try { sAfter  = typeof p.symptoms_after  === 'string' ? JSON.parse(p.symptoms_after)  : (p.symptoms_after  || {}); } catch {}

  const uf = parseFloat(p.uf_mlkg_h || 0);
  if (uf > 10) tips.push({ icon: '💧', text: `UF был ${uf} мл/кг/ч — постарайся набрать меньше жидкости`, color: '#e74c3c' });

  if (parseInt(p.cramps || 0) >= 2)
    tips.push({ icon: '⚡', text: 'Были судороги — в следующий раз Ca диализата 1.5', color: '#e67e22' });

  if ((sDuring['Тошнота'] >= 2) || (sDuring['Головокружение'] >= 2))
    tips.push({ icon: '🟡', text: 'Была тошнота/головокружение во время сеанса', color: '#f39c12' });

  if ((sAfter['Долгое восстановление'] >= 2) || (sAfter['Долгое восстановление после'] >= 2))
    tips.push({ icon: '⏱', text: 'Долгое восстановление — добавь 30 мин к следующему сеансу', color: '#e67e22' });

  if (sAfter['Слабость после'] >= 2)
    tips.push({ icon: '🩸', text: 'Слабость после — проверь Hb и альбумин на следующих анализах', color: '#f39c12' });

  return tips;
}
