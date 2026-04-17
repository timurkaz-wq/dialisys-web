'use strict';
// ══════════════════════════════════════════════
//  AI-анализ питания через OpenRouter
//  Текст → список продуктов → нутриенты
//  Неизвестные продукты → AI-поиск нутриентов
// ══════════════════════════════════════════════
const { chatFood, chatQwen } = require('./llm');

// Кэш AI-ответов: не спрашивать одно и то же дважды
const _aiNutrientCache = new Map();

// База нутриентов на 100 г (из JS_Dialisys, расширена)
// cal=ккал, protein=г, k=мг, p=мг, na=мг, fluid=мл
const FOODS_DB = {
  // ── Злаки / крупы ──
  'рис варёный':              { cal: 130, protein: 2.7,  k:  35, p:  40, na:   5, fluid:  0 },
  'гречка варёная':           { cal: 100, protein: 4.0,  k: 130, p: 100, na:   4, fluid:  0 },
  'макароны варёные':         { cal: 130, protein: 4.0,  k:  50, p:  55, na:   5, fluid:  0 },
  'овсянка на воде':          { cal:  70, protein: 2.5,  k:  90, p:  80, na:  50, fluid: 200 },
  'хлеб белый':               { cal: 260, protein: 8.0,  k: 100, p:  90, na: 500, fluid:  0 },
  'хлеб серый':               { cal: 230, protein: 7.5,  k: 180, p: 130, na: 450, fluid:  0 },
  'булгур варёный':            { cal:  83, protein: 3.1,  k:  90, p:  40, na:   5, fluid:  0 },
  'кускус варёный':            { cal: 112, protein: 3.8,  k:  58, p:  35, na:   5, fluid:  0 },
  'манная каша на воде':       { cal:  80, protein: 2.5,  k:  30, p:  35, na:   3, fluid: 200 },
  // ── Картофель (важно: замоченный снижает K на 50%) ──
  'картофель варёный':         { cal:  80, protein: 2.0,  k: 170, p:  44, na:   5, fluid:  0 },
  'картофель жареный':         { cal: 180, protein: 2.5,  k: 250, p:  55, na: 150, fluid:  0 },
  'картофельное пюре':         { cal:  90, protein: 2.0,  k: 180, p:  45, na: 200, fluid:  0 },
  // ── Мясо ──
  'куриная грудка варёная':    { cal: 165, protein: 31.0, k: 230, p: 180, na:  60, fluid:  0 },
  'куриное бедро варёное':     { cal: 185, protein: 25.0, k: 210, p: 160, na:  70, fluid:  0 },
  'индейка варёная':           { cal: 140, protein: 29.0, k: 220, p: 170, na:  55, fluid:  0 },
  'говядина варёная':          { cal: 250, protein: 26.0, k: 260, p: 160, na:  60, fluid:  0 },
  'телятина варёная':          { cal: 190, protein: 30.0, k: 280, p: 170, na:  65, fluid:  0 },
  'кролик тушёный':            { cal: 160, protein: 25.0, k: 200, p: 160, na:  50, fluid:  0 },
  'котлета домашняя':          { cal: 220, protein: 17.0, k: 200, p: 140, na: 350, fluid:  0 },
  'яичный белок':              { cal:  52, protein: 11.0, k: 150, p:  15, na: 160, fluid:  0 },
  'яйцо варёное':              { cal: 155, protein: 13.0, k: 126, p: 172, na: 124, fluid:  0 },
  'яичница':                   { cal: 185, protein: 13.5, k: 130, p: 175, na: 200, fluid:  0 },
  'омлет':                     { cal: 160, protein: 12.0, k: 140, p: 160, na: 250, fluid:  0 },
  // ── Рыба ──
  'треска варёная':            { cal:  80, protein: 17.0, k: 250, p: 160, na:  60, fluid:  0 },
  'минтай варёный':            { cal:  70, protein: 16.0, k: 240, p: 150, na:  60, fluid:  0 },
  'хек варёный':               { cal:  85, protein: 17.0, k: 230, p: 155, na:  55, fluid:  0 },
  'тилапия варёная':           { cal:  96, protein: 20.0, k: 240, p: 170, na:  56, fluid:  0 },
  'судак варёный':             { cal:  84, protein: 19.0, k: 220, p: 145, na:  50, fluid:  0 },
  // ── Овощи ──
  'капуста варёная':           { cal:  20, protein: 1.5,  k:  70, p:  20, na:  15, fluid:  0 },
  'капуста свежая':            { cal:  27, protein: 1.8,  k: 170, p:  26, na:  18, fluid: 20 },
  'кабачки варёные':           { cal:  20, protein: 0.6,  k:  80, p:  25, na:  10, fluid:  0 },
  'огурцы свежие':             { cal:  15, protein: 0.7,  k: 100, p:  20, na:   5, fluid: 50 },
  'морковь варёная':           { cal:  35, protein: 0.8,  k: 120, p:  25, na:  35, fluid:  0 },
  'морковь свежая':            { cal:  41, protein: 0.9,  k: 320, p:  35, na:  69, fluid: 20 },
  'цветная капуста варёная':   { cal:  22, protein: 1.8,  k:  75, p:  25, na:  15, fluid:  0 },
  'баклажаны тушёные':         { cal:  35, protein: 1.0,  k: 100, p:  20, na:   5, fluid:  0 },
  'перец болгарский':          { cal:  25, protein: 1.0,  k: 120, p:  20, na:   3, fluid: 20 },
  'свёкла варёная':            { cal:  45, protein: 1.6,  k: 150, p:  30, na:  40, fluid:  0 },
  'помидор':                   { cal:  18, protein: 0.9,  k: 237, p:  24, na:   5, fluid: 50 },
  'лук репчатый':              { cal:  41, protein: 1.1,  k: 146, p:  29, na:   4, fluid: 10 },
  'брокколи варёная':          { cal:  35, protein: 2.4,  k:  93, p:  40, na:  40, fluid:  0 },
  // ── Фрукты ──
  'яблоко':                    { cal:  52, protein: 0.3,  k: 107, p:  11, na:   1, fluid: 50 },
  'груша':                     { cal:  57, protein: 0.4,  k: 116, p:  12, na:   1, fluid: 50 },
  'арбуз':                     { cal:  30, protein: 0.6,  k: 112, p:  11, na:   1, fluid:150 },
  'черника':                   { cal:  44, protein: 1.1,  k:  77, p:  12, na:   1, fluid: 30 },
  'вишня':                     { cal:  50, protein: 0.8,  k: 173, p:  15, na:   0, fluid: 30 },
  'клубника':                  { cal:  33, protein: 0.7,  k: 153, p:  24, na:   1, fluid: 50 },
  'виноград':                  { cal:  69, protein: 0.7,  k: 191, p:  20, na:   2, fluid: 30 },
  'слива':                     { cal:  46, protein: 0.7,  k: 157, p:  16, na:   0, fluid: 40 },
  // ── Молочное ──
  'творог нежирный':           { cal:  71, protein: 16.5, k:  95, p: 190, na:  44, fluid: 20 },
  'кефир 1%':                  { cal:  40, protein: 3.6,  k: 146, p:  90, na:  53, fluid: 200 },
  'молоко':                    { cal:  52, protein: 2.8,  k: 150, p:  95, na:  50, fluid: 200 },
  'сметана 10%':               { cal: 115, protein: 3.0,  k:  90, p:  85, na:  35, fluid: 20 },
  // ── Жиры ──
  'масло сливочное':           { cal: 748, protein: 0.5,  k:  24, p:  17, na:   7, fluid:  0 },
  'масло растительное':        { cal: 884, protein: 0.0,  k:   0, p:   0, na:   0, fluid:  0 },
  // ── Напитки ──
  'чай чёрный':                { cal:   1, protein: 0.0,  k:  20, p:   2, na:   3, fluid: 200 },
  'чай зелёный':               { cal:   1, protein: 0.0,  k:  20, p:   2, na:   2, fluid: 200 },
  'кофе':                      { cal:   2, protein: 0.3,  k:  92, p:   7, na:   2, fluid: 200 },
  'вода':                      { cal:   0, protein: 0.0,  k:   0, p:   0, na:   0, fluid: 200 },
  'компот домашний':           { cal:  50, protein: 0.2,  k:  40, p:   5, na:   2, fluid: 200 },
  'кисель':                    { cal:  55, protein: 0.1,  k:  30, p:   3, na:   2, fluid: 200 },
  // ── Супы ──
  'куриный суп с рисом':       { cal:  35, protein: 2.5,  k:  80, p:  30, na: 150, fluid: 250 },
  'борщ':                      { cal:  40, protein: 1.8,  k: 120, p:  25, na: 200, fluid: 250 },
  'суп с лапшой':              { cal:  45, protein: 3.0,  k:  85, p:  35, na: 180, fluid: 250 },
  'суп овощной':               { cal:  30, protein: 1.5,  k:  90, p:  20, na: 120, fluid: 250 },
  // ── Сухофрукты (ВЫСОКИЙ КАЛИЙ — опасно для диализника!) ──
  'курага':                    { cal: 241, protein: 3.4,  k:1160, p:  71, na:  10, fluid:  0 },
  'изюм':                      { cal: 299, protein: 3.1,  k: 825, p:  75, na:  26, fluid:  0 },
  'чернослив':                 { cal: 240, protein: 2.2,  k: 732, p:  69, na:   2, fluid:  0 },
  'финики':                    { cal: 282, protein: 2.5,  k: 696, p:  62, na:   2, fluid:  0 },
  'инжир сушёный':             { cal: 257, protein: 3.3,  k: 680, p:  67, na:  10, fluid:  0 },
  'сухофрукты':                { cal: 260, protein: 2.5,  k: 900, p:  70, na:  10, fluid:  0 },
  'смесь сухофруктов':         { cal: 260, protein: 2.5,  k: 900, p:  70, na:  10, fluid:  0 },
  // ── Орехи (ВЫСОКИЙ ФОСФОР — опасно для диализника!) ──
  'грецкий орех':              { cal: 654, protein:15.2,  k: 441, p: 346, na:   2, fluid:  0 },
  'миндаль':                   { cal: 579, protein:21.2,  k: 733, p: 484, na:   1, fluid:  0 },
  'фундук':                    { cal: 628, protein:15.0,  k: 680, p: 290, na:   0, fluid:  0 },
  'орехи':                     { cal: 620, protein:16.0,  k: 600, p: 400, na:   2, fluid:  0 },
  'семечки':                   { cal: 570, protein:21.0,  k: 645, p: 705, na:   4, fluid:  0 },
  // ── Колбасные изделия (ВЫСОКИЙ Na и P — только по праздникам!) ──
  'варёная колбаса':           { cal: 257, protein:12.0,  k: 270, p: 178, na:1000, fluid:  0 },
  'сосиски':                   { cal: 266, protein:11.0,  k: 200, p: 160, na: 900, fluid:  0 },
  'сардельки':                 { cal: 332, protein:11.0,  k: 210, p: 170, na: 850, fluid:  0 },
  'колбаса копчёная':          { cal: 400, protein:17.0,  k: 280, p: 210, na:1500, fluid:  0 },
  'ветчина':                   { cal: 270, protein:22.0,  k: 330, p: 210, na: 800, fluid:  0 },
  // ── Сыры (ОЧЕНЬ ВЫСОКИЙ P — опасно для диализника!) ──
  'сыр твёрдый':               { cal: 380, protein:25.0,  k: 100, p: 600, na: 700, fluid:  0 },
  'сыр мягкий':                { cal: 260, protein:18.0,  k:  80, p: 450, na: 500, fluid:  0 },
  'сыр плавленый':             { cal: 300, protein:17.0,  k: 120, p: 700, na:1000, fluid:  0 },
  'брынза':                    { cal: 261, protein:17.0,  k: 100, p: 400, na:1200, fluid:  0 },
  'творожный сыр':             { cal: 340, protein:10.0,  k:  90, p: 320, na: 350, fluid:  0 },
  // ── Консервы (ВЫСОКИЙ Na!) ──
  'тушёнка говяжья':           { cal: 220, protein:15.0,  k: 200, p: 140, na: 700, fluid:  0 },
  'рыбные консервы':           { cal: 200, protein:18.0,  k: 230, p: 250, na: 600, fluid:  0 },
  'шпроты':                    { cal: 363, protein:17.0,  k: 250, p: 300, na: 750, fluid:  0 },
  // ── Прочее ──
  'сахар':                     { cal: 387, protein: 0.0,  k:   2, p:   0, na:   1, fluid:  0 },
  'варенье':                   { cal: 270, protein: 0.3,  k:  50, p:   5, na:   5, fluid:  0 },
  'мёд':                       { cal: 304, protein: 0.3,  k:  52, p:   6, na:   4, fluid:  0 },
  'шоколад молочный':          { cal: 535, protein: 7.0,  k: 372, p: 208, na:  79, fluid:  0 },
  'печенье':                   { cal: 440, protein: 6.0,  k: 100, p:  80, na: 350, fluid:  0 },
};

// ── Системный промпт для анализа питания ──
const FOOD_SYSTEM_PROMPT = `Ты — диетолог-нутрициолог, специализирующийся на питании пациентов на гемодиализе.

Твоя задача: разобрать текст о том, что съел пациент, и вернуть ТОЛЬКО JSON-массив продуктов с граммовками.

ПРАВИЛА:
1. Если грамм не указано — используй типичную порцию для этого блюда
2. Напитки — указывай в мл как "grams"
3. Отвечай СТРОГО в формате JSON без лишнего текста

ФОРМАТ ОТВЕТА (только JSON, без markdown):
[
  {"name": "название продукта по-русски", "grams": 200},
  {"name": "другой продукт", "grams": 150}
]

Примеры типичных порций:
- Каша/гарнир: 200г
- Мясо/рыба: 150г
- Суп: 250мл
- Хлеб: 50г (1 кусок)
- Чай/кофе: 200мл
- Фрукт: 150г`;

// ══════════════════════════════════════════════
//  Поиск в базе (нечёткий, по ключевым словам)
// ══════════════════════════════════════════════
function findInDB(name) {
  const n = name.toLowerCase().trim();

  // Точное совпадение
  if (FOODS_DB[n]) return FOODS_DB[n];

  // Частичное совпадение
  for (const [key, val] of Object.entries(FOODS_DB)) {
    if (n.includes(key) || key.includes(n)) return val;
  }

  // Ключевые слова
  const aliases = {
    'рис': 'рис варёный', 'гречк': 'гречка варёная', 'макарон': 'макароны варёные',
    'овсянк': 'овсянка на воде', 'овсяная каша': 'овсянка на воде', 'хлеб': 'хлеб белый',
    'курица': 'куриная грудка варёная', 'грудк': 'куриная грудка варёная',
    'куриное бедр': 'куриное бедро варёное', 'окорочк': 'куриное бедро варёное',
    'индейк': 'индейка варёная', 'говядин': 'говядина варёная', 'телятин': 'телятина варёная',
    'котлет': 'котлета домашняя', 'фарш': 'говядина варёная',
    'яйц': 'яйцо варёное', 'омлет': 'омлет', 'яичниц': 'яичница',
    'треска': 'треска варёная', 'минтай': 'минтай варёный', 'хек': 'хек варёный',
    'тилапи': 'тилапия варёная', 'судак': 'судак варёный',
    'рыба': 'треска варёная', 'скумбрия': 'треска варёная',
    'капуст': 'капуста варёная', 'борщ': 'борщ', 'суп': 'куриный суп с рисом',
    'кабачк': 'кабачки варёные', 'огурец': 'огурцы свежие', 'огурц': 'огурцы свежие',
    'помидор': 'помидор', 'томат': 'помидор', 'брокколи': 'брокколи варёная',
    'морковь': 'морковь варёная', 'морков': 'морковь варёная',
    'свёкл': 'свёкла варёная', 'свекл': 'свёкла варёная',
    'яблок': 'яблоко', 'груш': 'груша', 'арбуз': 'арбуз',
    'клубник': 'клубника', 'виноград': 'виноград', 'слив': 'слива',
    'творог': 'творог нежирный', 'кефир': 'кефир 1%', 'молоко': 'молоко',
    'сметан': 'сметана 10%',
    'масло': 'масло сливочное', 'растительное': 'масло растительное',
    'чай': 'чай чёрный', 'кофе': 'кофе', 'вода': 'вода', 'компот': 'компот домашний',
    // ── КАРТОФЕЛЬ — правильный маппинг (НЕ рис!) ──
    'картошк': 'картофель варёный', 'картофел': 'картофель варёный',
    'пюре картофельное': 'картофельное пюре', 'пюре': 'картофельное пюре',
    'жареная картошк': 'картофель жареный',
    'сахар': 'сахар', 'мёд': 'мёд', 'варенье': 'варенье',
    // ── Колбасы и мясопродукты ──
    'колбас': 'варёная колбаса', 'варёная колбас': 'варёная колбаса',
    'копчёная колбас': 'колбаса копчёная', 'сосиск': 'сосиски',
    'сардельк': 'сардельки', 'ветчин': 'ветчина',
    // ── Сыры ──
    'сыр': 'сыр твёрдый', 'сырок': 'творожный сыр',
    'плавлен': 'сыр плавленый', 'брынз': 'брынза',
    'творожный сыр': 'творожный сыр',
    // ── Консервы ──
    'тушёнк': 'тушёнка говяжья', 'рыбн': 'рыбные консервы',
    'шпрот': 'шпроты',
    // ── Сухофрукты ──
    'сухофрукт': 'сухофрукты', 'курага': 'курага', 'изюм': 'изюм',
    'чернослив': 'чернослив', 'финик': 'финики', 'инжир': 'инжир сушёный',
    // ── Орехи ──
    'грецк': 'грецкий орех', 'орех': 'орехи', 'миндал': 'миндаль',
    'фундук': 'фундук', 'семечк': 'семечки', 'подсолнух': 'семечки',
  };
  for (const [kw, mapped] of Object.entries(aliases)) {
    if (n.includes(kw)) return FOODS_DB[mapped];
  }

  return null;
}

// ══════════════════════════════════════════════
//  AI-поиск нутриентов для неизвестных продуктов
//  Qwen3 знает состав любого продукта
// ══════════════════════════════════════════════
async function lookupNutrientsFromAI(productName) {
  const key = productName.toLowerCase().trim();
  if (_aiNutrientCache.has(key)) return _aiNutrientCache.get(key);

  try {
    const messages = [
      {
        role: 'system',
        content: `Ты — база данных нутриентов. Для любого продукта питания возвращай ТОЛЬКО JSON с нутриентами на 100 г.
Формат (строго JSON, без markdown, без пояснений):
{"cal":0,"protein":0,"k":0,"p":0,"na":0,"fluid":0}
Где:
- cal: калории (ккал)
- protein: белок (г)
- k: калий (мг)
- p: фосфор (мг)
- na: натрий (мг)
- fluid: содержание жидкости (мл, для напитков ~200, для твёрдых продуктов 0)
Отвечай ТОЛЬКО JSON-объектом.`,
      },
      {
        role: 'user',
        content: `Нутриенты на 100г: "${productName}"`,
      },
    ];

    const result = await chatQwen(messages);
    if (!result?.content) return null;

    const clean = result.content.replace(/```json|```/gi, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const data = JSON.parse(jsonMatch[0]);
    // Валидация — должны быть числа
    const validated = {
      cal:     parseFloat(data.cal)     || 0,
      protein: parseFloat(data.protein) || 0,
      k:       parseFloat(data.k)       || 0,
      p:       parseFloat(data.p)       || 0,
      na:      parseFloat(data.na)      || 0,
      fluid:   parseFloat(data.fluid)   || 0,
    };

    // Кэшируем чтобы не спрашивать повторно
    _aiNutrientCache.set(key, validated);
    console.log(`[FoodAI] Нашёл через AI: "${productName}" → K:${validated.k} P:${validated.p} Na:${validated.na}`);
    return validated;
  } catch (e) {
    console.error('[FoodAI] Ошибка поиска нутриентов:', e.message);
    return null;
  }
}

// ══════════════════════════════════════════════
//  Расчёт нутриентов по разобранному списку
//  (async: неизвестные продукты ищет через AI)
// ══════════════════════════════════════════════
async function calcNutrients(items) {
  let totalK = 0, totalP = 0, totalNa = 0, totalCal = 0, totalProtein = 0, totalFluid = 0;
  const detailed = [];

  for (const item of items) {
    const grams = item.grams || 100;
    const factor = grams / 100;

    // Сначала ищем в локальной базе (мгновенно)
    let db = findInDB(item.name);
    let source = 'db';

    // Если не нашли — спрашиваем AI (автоматически)
    if (!db) {
      db = await lookupNutrientsFromAI(item.name);
      source = 'ai';
    }

    if (db) {
      const row = {
        name:    item.name,
        grams,
        cal:     Math.round(db.cal     * factor),
        protein: parseFloat((db.protein * factor).toFixed(1)),
        k:       Math.round(db.k       * factor),
        p:       Math.round(db.p       * factor),
        na:      Math.round(db.na      * factor),
        fluid:   Math.round(db.fluid   * factor),
        found:   true,
        source,  // 'db' или 'ai'
      };
      totalK       += row.k;
      totalP       += row.p;
      totalNa      += row.na;
      totalCal     += row.cal;
      totalProtein += row.protein;
      totalFluid   += row.fluid;
      detailed.push(row);
    } else {
      detailed.push({ name: item.name, grams, found: false, source: 'unknown' });
    }
  }

  return {
    items:         detailed,
    total_k:       totalK,
    total_p:       totalP,
    total_na:      totalNa,
    total_cal:     totalCal,
    total_protein: parseFloat(totalProtein.toFixed(1)),
    total_fluid:   totalFluid,
  };
}

// ══════════════════════════════════════════════
//  Главная функция: текст → нутриенты
// ══════════════════════════════════════════════
async function analyzeFoodText(text) {
  if (!text || !text.trim()) throw new Error('Пустой текст питания');

  // 1. AI парсит текст → список продуктов
  const messages = [
    { role: 'system', content: FOOD_SYSTEM_PROMPT },
    { role: 'user',   content: `Что съел пациент: "${text}"` },
  ];

  let parsed = [];
  try {
    const aiResponse = await chatFood(messages);
    if (aiResponse && aiResponse.trim()) {
      // Убираем возможные markdown ```json ... ``` блоки
      const clean = aiResponse.replace(/```json|```/gi, '').trim();
      const jsonMatch = clean.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
          // Валидация: должен быть массив объектов с name и grams
          if (!Array.isArray(parsed)) parsed = [];
          parsed = parsed.filter(i => i && typeof i.name === 'string');
        } catch (parseErr) {
          console.error('[FoodAnalysis] JSON parse error:', parseErr.message);
          parsed = [{ name: text.trim(), grams: 200 }];
        }
      }
    }
  } catch (err) {
    console.error('[FoodAnalysis] AI ошибка:', err.message);
    parsed = [{ name: text.trim(), grams: 200 }];
  }

  // Fallback если ничего не распознали
  if (!parsed.length) {
    parsed = [{ name: text.trim(), grams: 200 }];
  }

  // 2. Считаем нутриенты: локальная база → AI для неизвестных
  const nutrients = await calcNutrients(parsed);

  return {
    original_text: text,
    parsed_items:  parsed,
    ...nutrients,
  };
}

module.exports = { analyzeFoodText, calcNutrients, findInDB, FOODS_DB };
