/* ══════════════════════════════════════════════
   chat.js — ИИ нефролог
   ══════════════════════════════════════════════ */

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

// ── Добавить сообщение в DOM ──
function appendChatMessage(role, content, isTyping = false) {
  const container = document.getElementById('chatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-msg ${role}${isTyping ? ' typing' : ''}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.textContent = content;
  msgDiv.appendChild(bubble);
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

    // Убрать "печатает" и добавить ответ
    typingDiv.remove();
    appendChatMessage('assistant', res.response);
    scrollChat();
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
