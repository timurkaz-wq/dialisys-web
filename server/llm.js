'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
// Node 18+ имеет встроенный fetch — используем его если доступен, иначе node-fetch
const fetch  = globalThis.fetch || require('node-fetch');
const cfg    = require('./config');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// ══════════════════════════════════════════════
//  OpenRouter — единая точка запросов к LLM
// ══════════════════════════════════════════════
async function chat({ messages, model, temperature = 0.5, maxTokens = 2000 }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY не задан в .env');

  const usedModel = model || cfg.MODEL_CHAT;

  const body = {
    model: usedModel,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'HTTP-Referer':  'https://dialisys.app',
        'X-Title':       'Dialisys Assistant',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Сетевая ошибка — пробуем fallback модель
    console.error(`[LLM] Сетевая ошибка (${usedModel}):`, err.message);
    return tryFallback(messages, temperature, maxTokens);
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[LLM] Ошибка ${response.status} (${usedModel}):`, errText);
    if (usedModel !== cfg.MODEL_FALLBACK) {
      console.warn('[LLM] Переключаюсь на fallback модель...');
      return tryFallback(messages, temperature, maxTokens);
    }
    throw new Error(`OpenRouter ошибка: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || null;
  // Убираем блок <think>...</think> из Qwen3 моделей (extended thinking)
  if (content) {
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
  return content;
}

async function tryFallback(messages, temperature, maxTokens) {
  try {
    return await chat({ messages, model: cfg.MODEL_FALLBACK, temperature, maxTokens });
  } catch (e) {
    console.error('[LLM] Fallback тоже недоступен:', e.message);
    return null;
  }
}

// ══════════════════════════════════════════════
//  Быстрый вызов для анализа питания (дешёвая модель)
// ══════════════════════════════════════════════
async function chatFood(messages) {
  return chat({ messages, model: cfg.MODEL_FOOD, temperature: 0.3, maxTokens: 1500 });
}

// ══════════════════════════════════════════════
//  Вызов для медицинского чата (мощная модель)
// ══════════════════════════════════════════════
async function chatMedical(messages) {
  return chat({ messages, model: cfg.MODEL_CHAT, temperature: 0.5, maxTokens: 2000 });
}

module.exports = { chat, chatFood, chatMedical };
