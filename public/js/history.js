/* ══════════════════════════════════════════════
   history.js — история сеансов + экспорт PDF
   ══════════════════════════════════════════════ */

// ── Загрузить историю ──
async function loadHistory() {
  const container = document.getElementById('historyList');
  container.innerHTML = '<div class="loading-text">Загрузка...</div>';

  try {
    const procedures = await apiFetch('/procedures?limit=60');

    if (!procedures.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📅</div>
          <div class="empty-label">Сеансов нет. Сохраните первый сеанс!</div>
        </div>`;
      return;
    }

    container.innerHTML = '';
    procedures.forEach(p => {
      const colorClass = _getColorClass(p.final_color);
      const item = document.createElement('div');
      item.className = `history-item ${colorClass}`;
      item.innerHTML = `
        <div class="history-header">
          <div>
            <div class="history-date">${formatDate(p.date)} — ${p.weekday || ''}</div>
          </div>
          <div class="history-status" style="color:${p.final_color || '#5f6368'}">
            ${p.final_status || '—'}
          </div>
        </div>
        <div class="history-grid">
          <div class="history-stat">
            <div class="history-stat-label">Вес</div>
            ${p.current_weight || '—'} / ${p.dry_weight || '—'} кг
          </div>
          <div class="history-stat">
            <div class="history-stat-label">Жидкость</div>
            ${p.fluid_ml ? p.fluid_ml + ' мл' : '—'}
          </div>
          <div class="history-stat">
            <div class="history-stat-label">Время рек.</div>
            ${p.recommended_time ? p.recommended_time + ' ч' : '—'}
          </div>
          <div class="history-stat">
            <div class="history-stat-label">UF мл/кг/ч</div>
            <span style="color:${p.final_color || 'inherit'}">${p.uf_mlkg_h || '—'}</span>
          </div>
          <div class="history-stat">
            <div class="history-stat-label">АД до</div>
            ${p.bp_before || '—'}
          </div>
          <div class="history-stat">
            <div class="history-stat-label">K/Na/Ca</div>
            ${p.dialysate_k||'—'}/${p.dialysate_na||'—'}/${p.dialysate_ca||'—'}
          </div>
        </div>
        ${p.notes ? `<div style="font-size:12px;color:#5f6368;margin-top:6px">📝 ${p.notes}</div>` : ''}
      `;
      container.appendChild(item);
    });

    // Статистика вверху
    const summary = _buildSummary(procedures);
    container.insertBefore(summary, container.firstChild);

  } catch (e) {
    container.innerHTML = `<div class="loading-text" style="color:#e74c3c">Ошибка: ${e.message}</div>`;
  }
}

// ── Сводка ──
function _buildSummary(procedures) {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.marginBottom = '12px';

  const ufs = procedures.filter(p => p.uf_mlkg_h).map(p => parseFloat(p.uf_mlkg_h));
  const avgUF = ufs.length ? (ufs.reduce((a,b) => a+b, 0) / ufs.length).toFixed(2) : '—';
  const safeCount   = ufs.filter(u => u <= 8).length;
  const totalCount  = procedures.length;

  card.innerHTML = `
    <div class="card-label">📊 Сводка (последние ${totalCount} сеансов)</div>
    <div class="history-grid">
      <div class="history-stat">
        <div class="history-stat-label">Всего сеансов</div>
        ${totalCount}
      </div>
      <div class="history-stat">
        <div class="history-stat-label">Средний UF</div>
        ${avgUF} мл/кг/ч
      </div>
      <div class="history-stat">
        <div class="history-stat-label">Норма UF (≤8)</div>
        ${safeCount} из ${ufs.length}
      </div>
    </div>
  `;
  return card;
}

// ── Экспорт PDF ──
async function exportPdf() {
  const btn = document.getElementById('btnExportPdf');
  btn.disabled   = true;
  btn.textContent = '⏳ Генерация PDF...';

  try {
    const dateFrom = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
    const dateTo   = todayStr();

    const response = await fetch('/api/export/pdf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from: dateFrom, to: dateTo, include_food: true }),
    });

    if (!response.ok) throw new Error('Ошибка генерации');

    const blob = await response.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `dialysis_report_${dateFrom}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('✅ PDF скачан', 'success');
  } catch (e) {
    showToast(`❌ ${e.message}`, 'error');
  } finally {
    btn.disabled   = false;
    btn.textContent = '📄 PDF для врача';
  }
}

// ── Маппинг цвета → CSS класс ──
function _getColorClass(color) {
  if (!color) return '';
  if (color === '#27ae60') return 'good';
  if (color === '#f39c12') return 'warn';
  if (color === '#e67e22') return 'hard';
  if (color === '#e74c3c') return 'crit';
  return '';
}

// ── Привязка кнопок ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnExportPdf')?.addEventListener('click', exportPdf);
});
