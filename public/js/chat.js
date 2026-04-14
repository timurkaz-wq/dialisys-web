/* ══════════════════════════════════════════════
   chat.js — ИИ нефролог
   ══════════════════════════════════════════════ */

// ── Обновить счётчик токенов вверху ──
function updateTokenCounter(totalTokens, costUsd, model) {
  const el = document.getElementById('tokenCounter');
  if (!el) return;
  document.getElementById('tcTotal').textContent =
    totalTokens > 0 ? `${totalTokens.toLocaleString('ru-RU')} токенов` : '0 токенов';
  document.getElementById('tcCost').textContent =
    costUsd > 0 ? `$${costUsd.toFixed(4)}` : '$0.00';
  document.getElementById('tcModel').textContent = model || '—';
}

// ── Загрузить статистику при старте ──
async function loadTokenStats() {
  try {
    const data  = await apiFetch('/chat/tokens');
    const total = parseInt(data.totals?.total_tokens || 0);
    const cost  = parseFloat(data.totals?.cost_usd   || 0);
    const model = data.by_model?.[0]?.model || '—';
    updateTokenCounter(total, cost, model);
  } catch { /* нет данных — ок */ }
}

// ── Загрузить историю чата ──
async function loadChatHistory() {
  const container = document.getElementById('chatMessages');
  try {
    const history = await apiFetch('/chat/history');
    if (!history.length) return;

    // Очистить и перерендерить
    container.innerHTML = '';
    history.forEach(msg => appendChatMessage(msg.role, msg.content));
    scrollChat();
  } catch { /* нет истории — ок */ }
}

// ── Markdown → HTML (простой рендер без библиотек) ──
function markdownToHtml(text) {
  return text
    // Заголовки ### ## #
    .replace(/^###\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^##\s+(.+)$/gm, '<b>$1</b>')
    .replace(/^#\s+(.+)$/gm, '<b>$1</b>')
    // Жирный **текст** и __текст__
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<b>$1</b>')
    // Курсив *текст* и _текст_
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/_(.+?)_/g, '<i>$1</i>')
    // Код `inline`
    .replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
    // Маркированный список
    .replace(/^[-•]\s+(.+)$/gm, '• $1')
    // Нумерованный список
    .replace(/^\d+\.\s+(.+)$/gm, '→ $1')
    // Горизонтальная линия
    .replace(/^---+$/gm, '──────────')
    // Переносы строк
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

// ── Добавить сообщение в DOM ──
function appendChatMessage(role, content, isTyping = false, model = null, tokens = 0) {
  const container = document.getElementById('chatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${role}${isTyping ? ' typing' : ''}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';

  if (role === 'assistant' && !isTyping) {
    bubble.innerHTML = markdownToHtml(content);
  } else {
    bubble.textContent = content;
  }

  msgDiv.appendChild(bubble);

  // Два бейджа под ответом ассистента
  if (role === 'assistant' && !isTyping && model) {
    // 1. Название модели
    const modelBadge = document.createElement('div');
    modelBadge.className = 'chat-model-badge badge-model';
    modelBadge.textContent = model;
    msgDiv.appendChild(modelBadge);

    // 2. Токены этого запроса
    if (tokens > 0) {
      const tokenBadge = document.createElement('div');
      tokenBadge.className = 'chat-model-badge badge-tokens';
      tokenBadge.textContent = `${tokens.toLocaleString('ru-RU')} токенов`;
      msgDiv.appendChild(tokenBadge);
    }
  }

  container.appendChild(msgDiv);
  return msgDiv;
}

function scrollChat() {
  const container = document.getElementById('chatMessages');
  container.scrollTop = container.scrollHeight;
}

// ── Отправить сообщение ──
async function sendChat() {
  const input   = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  const includeContext = document.getElementById('chatIncludeContext')?.checked;
  const llmModel = document.querySelector('.model-btn.active')?.dataset.model || 'qwen';
  const sendBtn = document.getElementById('btnChatSend');

  // Добавить сообщение пользователя
  appendChatMessage('user', message);
  input.value   = '';
  sendBtn.disabled = true;
  scrollChat();

  // Индикатор "печатает..."
  const typingDiv = appendChatMessage('assistant', '⏳ Думаю...', true);
  scrollChat();

  try {
    const res = await apiFetch('/chat', {
      method: 'POST',
      body:   JSON.stringify({ message, include_context: includeContext, llm_model: llmModel }),
    });

    // Убрать "печатает" и добавить ответ с именем модели и токенами
    typingDiv.remove();
    appendChatMessage('assistant', res.response, false, res.model, res.tokens || 0);
    scrollChat();

    // Обновить счётчик вверху
    if (res.totalTokens) {
      const pricePerM = 2.0;
      const cost = (res.totalTokens / 1_000_000) * pricePerM;
      updateTokenCounter(res.totalTokens, cost, res.model);
    }
  } catch (e) {
    typingDiv.remove();
    appendChatMessage('assistant', `❌ Ошибка: ${e.message}`);
    showToast(`❌ ${e.message}`, 'error');
  } finally {
    sendBtn.disabled = false;
  }
}

// ── Быстрые подсказки ──
const QUICK_PROMPTS = [
  'Какие продукты богаты калием и почему они опасны?',
  'Что значит UF больше 10 мл/кг/ч?',
  'Как интерпретировать мой Kt/V?',
  'Что можно есть между сеансами?',
];

function renderQuickPrompts() {
  const container = document.getElementById('chatMessages');
  const quickDiv  = document.createElement('div');
  quickDiv.style.cssText = 'padding:8px 0; display:flex; flex-wrap:wrap; gap:6px';

  QUICK_PROMPTS.forEach(prompt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.style.cssText = 'font-size:12px; padding:6px 10px; flex:none';
    btn.textContent = prompt;
    btn.onclick = () => {
      document.getElementById('chatInput').value = prompt;
      sendChat();
      quickDiv.remove();
    };
    quickDiv.appendChild(btn);
  });

  container.appendChild(quickDiv);
}

// ── Привязка кнопок ──
document.addEventListener('DOMContentLoaded', () => {
  const sendBtn = document.getElementById('btnChatSend');
  const input   = document.getElementById('chatInput');

  sendBtn?.addEventListener('click', sendChat);
  loadTokenStats();

  // Переключатель модели
  document.querySelectorAll('.model-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  input?.addEventListener('keydown', (e) => {
    // Enter без Shift — отправить (Shift+Enter = новая строка)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  // Добавить быстрые подсказки при открытии чата
  document.querySelector('[data-tab="chat"]')?.addEventListener('click', () => {
    const hasQuick = document.getElementById('chatMessages').querySelector('button');
    if (!hasQuick) renderQuickPrompts();
  });
});
