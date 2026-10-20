/*
 * 在地需求雷達：資料處理純函式（不碰畫面）。
 * 瀏覽器：window.Needs；Node：require('./needs.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Needs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clone = o => JSON.parse(JSON.stringify(o));
  const today = () => new Date().toISOString().slice(0, 10);

  function nextId(items, prefix) {
    const max = items.reduce((m, x) => {
      const n = parseInt(String(x.id || '').replace(/\D/g, ''), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `${prefix}-${String(max + 1).padStart(3, '0')}`;
  }

  /** 沒選類別時，用說明文字裡的關鍵字猜；猜不到就給最後一個（其他）。 */
  function guessCategory(text, categories) {
    const t = String(text || '');
    let best = null, bestHits = 0;
    for (const c of categories) {
      const hits = (c.keywords || []).filter(k => k && t.includes(k)).length;
      if (hits > bestHits) { best = c.name; bestHits = hits; }
    }
    return best || (categories.length ? categories[categories.length - 1].name : '');
  }

  /** 檢查表單，回傳錯誤訊息陣列（空＝可以送出）。 */
  function validateNeed(n) {
    const errors = [];
    if (!String(n.title || '').trim()) errors.push('請填需求標題');
    if (String(n.title || '').length > 60) errors.push('標題請在 60 字以內');
    if (!String(n.description || '').trim()) errors.push('請填需求說明');
    if (String(n.description || '').length > 1000) errors.push('說明請在 1000 字以內');
    if (!String(n.contact || '').trim()) errors.push('請留聯絡方式，平台才能聯繫你');
    return errors;
  }

  /** 新增一筆需求（回傳新的 data，不改原本的）。 */
  function addNeed(data, input, config, now) {
    const d = clone(data);
    const n = {
      id: nextId(d.needs, 'N'),
      title: String(input.title || '').trim(),
      area: input.area || '',
      category: input.category || guessCategory(`${input.title} ${input.description}`, config.categories),
      description: String(input.description || '').trim(),
      deadline: String(input.deadline || '').trim(),
      contact: String(input.contact || '').trim(),
      status: config.statuses[0],
      created: now || today(),
      providerId: ''
    };
    d.needs.unshift(n);
    return { data: d, need: n };
  }

  function addProvider(data, input) {
    const d = clone(data);
    const p = {
      id: nextId(d.providers, 'P'),
      name: String(input.name || '').trim(),
      area: String(input.area || '').trim(),
      category: input.category || '',
      contact: String(input.contact || '').trim() || '平台內聯繫'
    };
    if (!p.name) throw new Error('請填服務者名稱');
    d.providers.push(p);
    return { data: d, provider: p };
  }

  function updateNeed(data, id, patch) {
    const d = clone(data);
    const n = d.needs.find(x => x.id === id);
    if (!n) throw new Error(`找不到 ${id}`);
    Object.assign(n, patch);
    return d;
  }

  /** 公開頁用：只留允許公開的狀態，並拿掉聯絡方式。 */
  function publicView(data, config) {
    return data.needs
      .filter(n => config.publicStatuses.includes(n.status))
      .map(({ contact, providerId, ...rest }) => rest);
  }

  /** 遮罩聯絡方式（後台列表用）：0900-000-101 → 0900-***-101。 */
  function maskContact(s) {
    const t = String(s || '');
    if (t.length <= 4) return t ? '*'.repeat(t.length) : '';
    const keepEnd = Math.min(3, Math.floor(t.length / 3));
    const keepStart = Math.min(4, Math.floor(t.length / 3));
    return t.slice(0, keepStart) + t.slice(keepStart, t.length - keepEnd).replace(/[^\s\-]/g, '*') + t.slice(t.length - keepEnd);
  }

  /** 標題字元的重疊比例（0～1），拿來找可能重複的需求。 */
  function similarity(a, b) {
    const grams = s => {
      const t = String(s || '').replace(/\s+/g, '');
      const set = new Set();
      for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
      return set;
    };
    const A = grams(a), B = grams(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(g => { if (B.has(g)) inter++; });
    return inter / Math.min(A.size, B.size);
  }

  /** 同地區、同類別、標題很像、還沒完成的需求 → 可能重複。回傳 {id: [重複的 id]}。 */
  function findDuplicates(needs, threshold) {
    const th = threshold || 0.6;
    const open = needs.filter(n => !['已完成', '已取消'].includes(n.status));
    const out = {};
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        const a = open[i], b = open[j];
        if (a.area === b.area && a.category === b.category && similarity(a.title, b.title) >= th) {
          (out[a.id] = out[a.id] || []).push(b.id);
          (out[b.id] = out[b.id] || []).push(a.id);
        }
      }
    }
    return out;
  }

  /** 建議的服務者：類別相同，且服務範圍包含該地區或寫「全市／全區」。 */
  function suggestProviders(need, providers, config) {
    return providers.filter(p => p.category === need.category &&
      (!p.area || p.area.includes(need.area) || /全(市|區|縣)/.test(p.area) || p.area.includes(config.region)));
  }

  function stats(data, config) {
    const done = data.needs.filter(n => n.status === '已完成').length;
    const confirmed = data.needs.filter(n => n.status !== config.statuses[0] && n.status !== '已取消').length;
    const byCategory = {};
    data.needs.forEach(n => { byCategory[n.category] = (byCategory[n.category] || 0) + 1; });
    return { total: data.needs.length, confirmed, done, providers: data.providers.length, byCategory };
  }

  /** 匯出 CSV（Excel 開不會亂碼：加 BOM、欄位含逗號或換行要加引號）。 */
  function toCSV(rows, columns) {
    const cell = v => {
      const s = String(v == null ? '' : v);
      const safe = /^[=+\-@]/.test(s) ? "'" + s : s;  // 防止被 Excel 當公式執行
      return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const head = columns.map(c => cell(c.label)).join(',');
    const body = rows.map(r => columns.map(c => cell(r[c.key])).join(','));
    return '﻿' + [head, ...body].join('\r\n');
  }

  /** 匯入備份前檢查格式。 */
  function validateBackup(obj) {
    if (!obj || !Array.isArray(obj.needs) || !Array.isArray(obj.providers)) throw new Error('備份檔格式不對');
    obj.needs.forEach(n => { if (!n.id || !n.title) throw new Error('備份檔裡有缺編號或標題的需求'); });
    return { needs: obj.needs, providers: obj.providers };
  }

  return { nextId, guessCategory, validateNeed, addNeed, addProvider, updateNeed, publicView, maskContact,
    similarity, findDuplicates, suggestProviders, stats, toCSV, validateBackup };
});
