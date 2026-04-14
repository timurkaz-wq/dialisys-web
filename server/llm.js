'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fetch = globalThis.fetch || require('node-fetch');
const cfg   = require('./config');

const DR7_URL        = 'https://dr7.ai/api/v1/medical/chat/completions';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ══════════════════════════════════════════════
//  Универсальный вызов OpenRouter
// ══════════════════════════════════════════════
async function _openrouter(model, messages, { maxTokens = 2000, temperature = 0.5 } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не задан');

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://dialisys.app',
      'X-Title':       'Dialisys Assistant',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter ошибка ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const msg  = data.choices?.[0]?.message;

  // Thinking-модели: финальный ответ в content, мышление в reasoning — берём только content
  // Instruct-модели: иногда оборачивают в <think> теги — вырезаем
  let content = msg?.content || null;
  if (content) {
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || null;
  }
  // Если content пуст, но есть reasoning — значит модель вернула только мышление (fallback)
  if (!content && msg?.reasoning) {
    content = msg.reasoning.trim() || null;
  }

  const tokens = data.usage || null;
  return { content, tokens };
}

// ══════════════════════════════════════════════
//  Qwen3 Instruct — быстрый, основная модель
// ══════════════════════════════════════════════
async function chatQwen(messages) {
  const { content, tokens } = await _openrouter(cfg.MODEL_CHAT, messages);
  console.log(`[Qwen Instruct] токенов: ${tokens?.total_tokens ?? '?'}`);
  return { content, model: 'Qwen3 235B', tokens };
}

// ══════════════════════════════════════════════
//  Qwen3 Thinking — глубокое мышление
// ══════════════════════════════════════════════
async function chatQwenThinking(messages) {
  // Thinking-модели требуют больше токенов (мышление + ответ)
  const { content, tokens } = await _openrouter(cfg.MODEL_THINKING, messages, { maxTokens: 8000, temperature: 0.6 });
  console.log(`[Qwen Thinking] токенов: ${tokens?.total_tokens ?? '?'}`);
  return { content, model: 'Qwen3 Thinking', tokens };
}

// ══════════════════════════════════════════════
//  MedGemma (DR7.ai) — на выбор пользователя
// ══════════════════════════════════════════════
async function chatMedGemma(messages) {
  const apiKey = process.env.DR7_API_KEY;
  if (!apiKey) throw new Error('DR7_API_KEY не задан на сервере');

  const response = await fetch(DR7_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       cfg.MODEL_MEDGEMMA,
      messages,
      max_tokens:  2000,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`MedGemma ошибка ${response.status}: ${errText}`);
  }

  const data    = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim() || null;
  const tokens  = data.usage || null;
  console.log(`[MedGemma] ответил, токенов: ${tokens?.total_tokens ?? '?'}`);
  return { content, model: 'MedGemma 4B', tokens };
}

// ══════════════════════════════════════════════
//  OpenRouter — анализ питания
// ══════════════════════════════════════════════
async function chatFood(messages) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не задан');

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'https://dialisys.app',
      'X-Title':       'Dialisys Assistant',
    },
    body: JSON.stringify({
      model:       cfg.MODEL_FOOD,
      messages,
      max_tokens:  1500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) throw new Error(`OpenRouter ошибка: ${response.status}`);

  const data    = await response.json();
  let   content = data.choices?.[0]?.message?.content || null;
  if (content) {
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || null;
  }
  return content;
}

module.exports = { chatQwen, chatQwenThinking, chatMedGemma, chatFood };
