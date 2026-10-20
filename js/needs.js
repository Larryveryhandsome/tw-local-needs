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
  // 用本機（台灣）日期，不用 toISOString（那是 UTC，台灣 00:00～08:00 會變前一天）
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

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

  /**
   * 去識別化：把文字裡的電話、Email、身分證字號、LINE／IG／FB 帳號蓋掉（居民常把聯絡方式寫進說明欄）。
   * 先做 NFKC 正規化（全形數字／＠ → 半形）、去掉零寬字元、統一各種橫線，再比對，避免用全形、空白、
   * 點、斜線、中文數字等寫法繞過。原則上擋常見格式，後台確認時仍建議人工看一遍。
   */
  function redactText(s) {
    const SEP = String.raw`[\s.\-/()·•,_]*`;
    let t = String(s == null ? '' : s).normalize('NFKC')
      .replace(/[​-‍⁠﻿­]/g, '')
      .replace(/[‐-―−－]/g, '-');
    t = t
      // Email（含 a @ b . com、a(at)b(dot)com、a at b dot com）
      .replace(/[A-Za-z0-9._%+-]+\s*@\s*[A-Za-z0-9-]+(?:\s*\.\s*[A-Za-z0-9-]+)*\s*\.\s*[A-Za-z]{2,}/g, '[Email已隱藏]')
      .replace(/[A-Za-z0-9._%+-]+\s*(?:\(at\)|\[at\]|\s+at\s+)\s*[A-Za-z0-9-]+(?:\s*(?:\(dot\)|\[dot\]|\s+dot\s+|\.)\s*[A-Za-z0-9-]+)*\s*(?:\(dot\)|\[dot\]|\s+dot\s+|\.)\s*[A-Za-z]{2,}/gi, '[Email已隱藏]')
      // 社群網址
      .replace(/(?:https?:\/\/)?(?:line\.me|lin\.ee|wa\.me|t\.me|m\.me|facebook\.com|fb\.com|instagram\.com)\/\S+/gi, '[連結已隱藏]')
      // 身分證字號（中間夾空白也擋）
      .replace(/(?<![A-Za-z])[A-Z]\s?[12](?:\s?\d){8}(?!\d)/gi, '[證號已隱藏]')
      // +886 / 886 開頭
      .replace(new RegExp(String.raw`(?<!\d)\+?886${SEP}\(?0?\)?(?:${SEP}\d){8,9}(?!\d)`, 'g'), '[電話已隱藏]')
      // 0 開頭的手機／市話（8～9 位數字，分隔符號不限）
      .replace(new RegExp(String.raw`(?<!\d)(?<!\d[-/.])\(?0(?:${SEP}\d){8,9}(?!\d)`, 'g'), '[電話已隱藏]')
      // 中文數字寫的電話
      .replace(/[零〇○一二三四五六七八九]{8,}/g, '[電話已隱藏]')
      // 社群帳號：關鍵字＋冒號／id，或關鍵字後面接含數字的帳號
      .replace(/(?<![A-Za-z])(line|賴|ig|instagram|fb|facebook|wechat|weixin|微信|telegram|tg|whatsapp)\s*(?:id|帳號)?\s*[:：=]\s*@?[A-Za-z0-9._-]{2,}/gi, '$1[已隱藏]')
      .replace(/(?<![A-Za-z])(line|賴|ig|instagram|fb|facebook|wechat|weixin|微信|telegram|tg|whatsapp)\s*(?:id|帳號)\s*@?[A-Za-z0-9._-]{2,}/gi, '$1[已隱藏]')
      .replace(/(?<![A-Za-z])(line|賴|ig|fb|wechat|微信|telegram|tg|whatsapp)\s*@?(?=[A-Za-z0-9._-]*\d)[A-Za-z0-9._-]{3,}/gi, '$1[已隱藏]')
      // 單獨的 @帳號
      .replace(/(?<![A-Za-z0-9._@])@[A-Za-z0-9._-]{4,}/g, '[帳號已隱藏]');
    return t;
  }

  /** 公開頁用：只留允許公開的狀態與「白名單欄位」（不是拿掉聯絡方式而已，多餘欄位也不外流），並蓋掉個資。 */
  function publicView(data, config) {
    return data.needs
      .filter(n => config.publicStatuses.includes(n.status))
      .map(n => ({
        id: n.id, status: n.status, created: n.created,
        title: redactText(n.title), description: redactText(n.description), deadline: redactText(n.deadline),
        area: redactText(n.area), category: redactText(n.category) }));
  }

  /** 遮罩聯絡方式（後台列表用）：0900-000-101 → 0900-***-101。 */
  function maskContact(s) {
    const t = String(s || '');
    if (t.length <= 4) return t ? '*'.repeat(t.length) : '';
    const keepEnd = Math.min(3, Math.floor(t.length / 3));
    const keepStart = Math.min(4, Math.floor(t.length / 3));
    return t.slice(0, keepStart) + t.slice(keepStart, t.length - keepEnd).replace(/[^\s\-]/g, '*') + t.slice(t.length - keepEnd);
  }

  const gramsOf = s => {
    const t = String(s || '').replace(/\s+/g, '');
    const set = new Set();
    for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
    return set;
  };
  const overlap = (A, B) => {
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(g => { if (B.has(g)) inter++; });
    return inter / Math.min(A.size, B.size);
  };

  /** 標題字元的重疊比例（0～1），拿來找可能重複的需求。 */
  function similarity(a, b) { return overlap(gramsOf(a), gramsOf(b)); }

  /** 同地區、同類別、標題很像、還沒完成的需求 → 可能重複。回傳 {id: [重複的 id]}。（先分組、標題特徵只算一次，幾千筆也不卡） */
  function findDuplicates(needs, threshold) {
    const th = threshold || 0.6;
    const groups = new Map();
    needs.forEach(n => {
      if (['已完成', '已取消'].includes(n.status)) return;
      const k = n.area + ' ' + n.category;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ n, g: gramsOf(n.title) });
    });
    const out = {};
    groups.forEach(list => {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (overlap(list[i].g, list[j].g) >= th) {
            const a = list[i].n, b = list[j].n;
            (out[a.id] = out[a.id] || []).push(b.id);
            (out[b.id] = out[b.id] || []).push(a.id);
          }
        }
      }
    });
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
      const safe = /^[\t\r\s\u200b]*[=+\-@]/.test(s) || /^[\t\r]/.test(s) ? "'" + s : s;  // 防止被 Excel 當公式執行（含開頭是 Tab／換行）
      return /[",\n\r\t]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const head = columns.map(c => cell(c.label)).join(',');
    const body = rows.map(r => columns.map(c => cell(r[c.key])).join(','));
    return '﻿' + [head, ...body].join('\r\n');
  }

  /**
   * 匯入備份前檢查並「重建」資料：只收白名單欄位、全部轉成字串並限制長度
   * （丟掉 __proto__ 之類的惡意欄位與多餘欄位）、編號重複的會重新編號。
   */
  function validateBackup(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.needs) || !Array.isArray(obj.providers)) throw new Error('備份檔格式不對');
    const str = (v, max) => (v == null || typeof v === 'object' ? '' : String(v)).slice(0, max || 2000);
    const needs = [], providers = [];
    const seenN = new Set(), seenP = new Set();
    obj.needs.forEach(raw => {
      if (!raw || typeof raw !== 'object' || !raw.id || !raw.title) throw new Error('備份檔裡有缺編號或標題的需求');
      needs.push({ id: str(raw.id, 40), title: str(raw.title, 200), area: str(raw.area, 100), category: str(raw.category, 100),
        description: str(raw.description, 5000), deadline: str(raw.deadline, 200), contact: str(raw.contact, 300),
        status: str(raw.status, 40), created: str(raw.created, 40), providerId: str(raw.providerId, 40) });
    });
    obj.providers.forEach(raw => {
      if (!raw || typeof raw !== 'object' || !raw.id) throw new Error('備份檔裡有缺編號的服務者');
      providers.push({ id: str(raw.id, 40), name: str(raw.name, 200), area: str(raw.area, 200),
        category: str(raw.category, 100), contact: str(raw.contact, 300) });
    });
    needs.forEach(n => { if (seenN.has(n.id)) n.id = nextId(needs, 'N'); seenN.add(n.id); });
    providers.forEach(p => { if (seenP.has(p.id)) p.id = nextId(providers, 'P'); seenP.add(p.id); });
    return { needs, providers };
  }

  return { nextId, guessCategory, redactText, validateNeed, addNeed, addProvider, updateNeed, publicView, maskContact,
    similarity, findDuplicates, suggestProviders, stats, toCSV, validateBackup };
});
