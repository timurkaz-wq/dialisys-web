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

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
