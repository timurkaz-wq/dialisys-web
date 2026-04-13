'use strict';
// ══════════════════════════════════════════════
//  /api/export — PDF отчёт для врача
// ══════════════════════════════════════════════
const { Router } = require('express');
const { query }  = require('../db');
const cfg        = require('../config');
const path       = require('path');
const fs         = require('fs');

const router = Router();

// POST /api/export/pdf — сгенерировать PDF
router.post('/pdf', async (req, res) => {
  try {
    const { from, to, include_food } = req.body;
    const dateFrom = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
    const dateTo   = to   || new Date().toISOString().slice(0,10);

    // Загрузить данные
    const { rows: procedures } = await query(
      'SELECT * FROM procedures WHERE date BETWEEN $1 AND $2 ORDER BY date ASC',
      [dateFrom, dateTo]
    );
    const { rows: analyses } = await query(
      'SELECT * FROM analyses ORDER BY month_key DESC LIMIT 6'
    );
    let foodData = [];
    if (include_food) {
      const { rows } = await query(
        'SELECT * FROM food_logs WHERE date BETWEEN $1 AND $2 ORDER BY date ASC',
        [dateFrom, dateTo]
      );
      foodData = rows;
    }

    const PdfPrinter = require('pdfmake/src/printer');
    const vfs        = require('pdfmake/build/vfs_fonts'); // {Roboto-Regular.ttf: base64, ...}

    const fonts = {
      Roboto: {
        normal:      Buffer.from(vfs['Roboto-Regular.ttf'],     'base64'),
        bold:        Buffer.from(vfs['Roboto-Medium.ttf'],      'base64'),
        italics:     Buffer.from(vfs['Roboto-Italic.ttf'],      'base64'),
        bolditalics: Buffer.from(vfs['Roboto-MediumItalic.ttf'],'base64'),
      }
    };

    const printer = new PdfPrinter(fonts);

    const docDef = _buildDocDef(procedures, analyses, foodData, dateFrom, dateTo);
    const pdfDoc = printer.createPdfKitDocument(docDef);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dialysis_report_${dateFrom}_${dateTo}.pdf"`);
    pdfDoc.pipe(res);
    pdfDoc.end();

  } catch (e) {
    console.error('[Export PDF]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/export/summary — сводка (для превью)
router.get('/summary', async (req, res) => {
  try {
    const { rows: procedures } = await query(
      'SELECT * FROM procedures ORDER BY date DESC LIMIT 30'
    );
    const { rows: analyses } = await query(
      'SELECT * FROM analyses ORDER BY month_key DESC LIMIT 3'
    );
    const { rows: foodStats } = await query(`
      SELECT
        COUNT(*)            AS days_logged,
        AVG(total_k)        AS avg_k,
        AVG(total_p)        AS avg_p,
        AVG(total_na)       AS avg_na,
        AVG(total_cal)      AS avg_cal
      FROM (
        SELECT date, SUM(total_k) AS total_k, SUM(total_p) AS total_p,
               SUM(total_na) AS total_na, SUM(total_cal) AS total_cal
        FROM food_logs
        WHERE date >= CURRENT_DATE - 30
        GROUP BY date
      ) daily
    `);

    res.json({
      procedures_count: procedures.length,
      avg_uf: procedures.length
        ? (procedures.reduce((s,p) => s + parseFloat(p.uf_mlkg_h || 0), 0) / procedures.length).toFixed(2)
        : null,
      analyses: analyses[0] || null,
      food: foodStats[0] || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Построение PDF документа ──
function _buildDocDef(procedures, analyses, foodData, dateFrom, dateTo) {
  const now = new Date().toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' });

  const content = [
    // Заголовок
    { text: 'Отчёт по гемодиализу', style: 'title' },
    { text: `Пациент: ${cfg.PATIENT_NAME}`, style: 'subtitle' },
    { text: `Период: ${dateFrom} — ${dateTo}  |  Сформирован: ${now}`, style: 'meta' },
    { text: ' ' },

    // Анализы
    { text: 'Лабораторные анализы', style: 'header' },
    _analysesTable(analyses),
    { text: ' ' },

    // Сеансы диализа
    { text: `Сеансы диализа (${procedures.length} сеансов)`, style: 'header' },
    procedures.length ? _proceduresTable(procedures) : { text: 'Нет данных', italics: true },
    { text: ' ' },
  ];

  if (foodData.length) {
    content.push({ text: 'Питание', style: 'header' });
    content.push(_foodTable(foodData));
  }

  return {
    content,
    styles: {
      title:    { fontSize: 18, bold: true, margin: [0, 0, 0, 6] },
      subtitle: { fontSize: 13, margin: [0, 0, 0, 3] },
      meta:     { fontSize: 10, color: '#666', margin: [0, 0, 0, 12] },
      header:   { fontSize: 13, bold: true, margin: [0, 8, 0, 4], color: '#1a73e8' },
    },
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    pageMargins: [30, 30, 30, 30],
  };
}

function _analysesTable(analyses) {
  if (!analyses.length) return { text: 'Нет данных', italics: true };
  const headers = ['Месяц','K','Na','Ca','HCO₃','P','ПТГ','Hb','Альбумин','Mg'];
  const rows = analyses.map(a => [
    a.month_key, a.k||'-', a.na||'-', a.ca||'-', a.hco3||'-',
    a.p||'-', a.pth||'-', a.hb||'-', a.albumin||'-', a.mg||'-',
  ]);
  return {
    table: {
      headerRows: 1,
      widths: ['auto','auto','auto','auto','auto','auto','auto','auto','auto','auto'],
      body: [headers.map(h => ({ text: h, bold: true, fillColor: '#e8f0fe' })), ...rows],
    },
    layout: 'lightHorizontalLines',
  };
}

function _proceduresTable(procedures) {
  const headers = ['Дата','День','Вес тек.','Вес сух.','Жидкость','Время рек.','UF мл/кг/ч','АД до','Статус'];
  const rows = procedures.map(p => [
    p.date, p.weekday||'-',
    p.current_weight||'-', p.dry_weight||'-',
    p.fluid_ml ? `${p.fluid_ml} мл` : '-',
    p.recommended_time ? `${p.recommended_time} ч` : '-',
    p.uf_mlkg_h||'-',
    p.bp_before||'-',
    p.final_status||'-',
  ]);
  return {
    table: {
      headerRows: 1,
      widths: ['auto','auto','auto','auto','auto','auto','auto','auto','*'],
      body: [headers.map(h => ({ text: h, bold: true, fillColor: '#e8f0fe' })), ...rows],
    },
    layout: 'lightHorizontalLines',
  };
}

function _foodTable(foodData) {
  const headers = ['Дата','Тип','Питание','K мг','P мг','Na мг','Ккал'];
  const rows = foodData.map(f => [
    f.date, f.meal_type||'-',
    { text: f.food_text.slice(0, 60), fontSize: 8 },
    Math.round(f.total_k)||0,
    Math.round(f.total_p)||0,
    Math.round(f.total_na)||0,
    Math.round(f.total_cal)||0,
  ]);
  return {
    table: {
      headerRows: 1,
      widths: ['auto','auto','*','auto','auto','auto','auto'],
      body: [headers.map(h => ({ text: h, bold: true, fillColor: '#e8f0fe' })), ...rows],
    },
    layout: 'lightHorizontalLines',
  };
}

module.exports = router;
