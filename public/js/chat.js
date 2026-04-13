/* ══════════════════════════════════════════════
   chat.js — ИИ нефролог
   ══════════════════════════════════════════════ */

// ── Загрузить и показать статистику токенов ──
async function loadTokenStats() {
  try {
    const data = await apiFetch('/chat/tokens');
    const total = parseInt(data.totals?.total_tokens || 0);
    const cost  = parseFloat(data.totals?.cost_usd   || 0);

    // Последняя использованная модель
    const topModel = data.by_model?.[0]?.model || '—';

    document.getElementById('tokenTotal').textContent =
      total > 0 ? `${total.toLocaleString('ru-RU')} токенов` : '— токенов';
    document.getElementById('tokenCost').textContent =
      cost > 0 ? `≈ $${cost.toFixed(4)}` : '— $';
    document.getElementById('tokenModel').textContent = topModel;
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
function appendChatMessage(role, content, isTyping = false, model = null) {
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

  // Бейджик с именем модели под ответом ассистента
  if (role === 'assistant' && !isTyping && model) {
    const badge = document.createElement('div');
    badge.className = 'chat-model-badge';
    badge.textContent = model;
    msgDiv.appendChild(badge);
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
      body:   JSON.stringify({ message, include_context: includeContext }),
    });

    // Убрать "печатает" и добавить ответ с именем модели
    typingDiv.remove();
    appendChatMessage('assistant', res.response, false, res.model);
    scrollChat();
    loadTokenStats(); // обновить счётчик
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
  loadTokenStats(); // загрузить при старте

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
