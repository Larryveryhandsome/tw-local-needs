/* 在地需求雷達：公開頁＋營運後台的畫面邏輯。資料處理在 needs.js。 */
(function () {
  'use strict';
  const N = window.Needs;
  const C = window.NEEDS_CONFIG;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(C.storageKey);
      if (raw) return N.validateBackup(JSON.parse(raw));
    } catch (e) {
      // 壞掉就用示範資料，但先把壞資料另存一份，避免下次儲存時被蓋掉而無法救回
      try { if (raw) localStorage.setItem(C.storageKey + '-corrupt', raw); } catch (e2) { /* 空間不足就算了 */ }
    }
    return clone(window.NEEDS_SAMPLE);
  }
  // 回傳 true＝真的存進去了；false＝失敗（私密視窗、空間滿了）。呼叫端必須檢查，不能假裝成功。
  function save(d) {
    try { localStorage.setItem(C.storageKey, JSON.stringify(d)); return true; }
    catch (e) {
      alert('儲存失敗：瀏覽器不允許寫入（私密視窗或儲存空間已滿）。這次的變更「沒有」存下來，請先按「下載備份」。');
      return false;
    }
  }
  let data = load();
  // 每次變更前先重新讀取最新資料（另一個分頁可能剛收到新需求），避免用舊資料整份覆蓋而弄丟別人剛送的需求。
  // fn 收到最新資料並回傳新資料；儲存失敗就維持原狀並回傳 false。
  function commit(fn) {
    const latest = load();
    let next;
    try { next = fn(latest); } catch (err) { alert(err.message); return false; }
    if (!save(next)) return false;
    data = next;
    return true;
  }
  // 別的分頁改了資料 → 這頁跟著更新
  window.addEventListener('storage', e => {
    if (e.key === C.storageKey) { data = load(); renderPublic(); renderAdmin(); }
  });
  // 本機（台灣）日期；不用 toISOString，那是 UTC，台灣 00:00～08:00 會變成前一天
  const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  // 套用設定：名稱、地區、類別
  document.querySelectorAll('[data-cfg]').forEach(el => { el.textContent = C[el.dataset.cfg]; });
  document.title = document.title.replace('{name}', C.name);
  const fillSelect = (sel, items, withEmpty) => {
    if (!sel) return;
    sel.innerHTML = (withEmpty ? `<option value="">${esc(withEmpty)}</option>` : '') +
      items.map(x => `<option>${esc(x)}</option>`).join('');
  };
  document.querySelectorAll('select[name=area]').forEach(s => fillSelect(s, C.areas));
  document.querySelectorAll('select[name=category]').forEach(s => fillSelect(s, C.categories.map(c => c.name), s.dataset.empty));

  // ── 公開頁 ────────────────────────────────────────────
  function renderPublic() {
    const el = $('#publicNeeds');
    if (!el) return;
    const list = N.publicView(data, C);
    const s = N.stats(data, C);
    el.innerHTML = list.map(n => `<article class="need-card"><span class="tag">${esc(n.category)}</span>
      <h3>${esc(n.title)}</h3><p>${esc(n.description)}</p>
      <div class="need-meta"><span>${esc(n.area)}</span><span>${esc(n.status)}</span></div></article>`).join('')
      || '<p class="muted">目前沒有公開的需求。</p>';
    $('#needCount').textContent = s.total;
    $('#providerCount').textContent = s.providers;
    $('#resolvedCount').textContent = s.done;
  }

  const form = $('#needForm');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const x = Object.fromEntries(new FormData(form));
      const errors = N.validateNeed(x);
      const msg = $('#formMessage');
      if (!x.consent) errors.push('請勾選同意蒐集與使用資料');
      if (errors.length) { msg.textContent = errors.join('；'); return; }
      let created = null;
      const ok = commit(d => { const r = N.addNeed(d, x, C); created = r.need; return r.data; });
      if (!ok) { msg.textContent = '送出失敗：資料沒有存下來（瀏覽器不允許儲存或空間已滿），請稍後再試。'; return; }
      form.reset();
      msg.textContent = `已收到（編號 ${created.id}）。示範版：資料只存在這個瀏覽器，不會送到任何伺服器。平台確認內容後才會公開摘要，聯絡方式不會公開。`;
      renderPublic();
    });
  }

  // ── 後台 ──────────────────────────────────────────────
  function renderAdmin() {
    const m = $('#metrics');
    if (!m) return;
    const s = N.stats(data, C);
    m.innerHTML = [['需求總數', s.total], ['已確認', s.confirmed], ['已完成', s.done], ['服務者', s.providers]]
      .map(x => `<div class="metric"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');

    const q = ($('#search') && $('#search').value.trim()) || '';
    const fs = ($('#filterStatus') && $('#filterStatus').value) || '';
    const dups = N.findDuplicates(data.needs);
    const matched = data.needs.filter(n => (!fs || n.status === fs) &&
      (!q || [n.id, n.title, n.description, n.area, n.category].join(' ').includes(q)));
    const LIMIT = 300;  // 一次最多畫 300 列，資料很多時用搜尋／狀態篩選縮小
    const rows = matched.slice(0, LIMIT);
    const provName = id => (data.providers.find(p => p.id === id) || {}).name || '';
    $('#adminNeeds').innerHTML = `<table class="data-table"><thead><tr><th>編號</th><th>標題</th><th>地區</th><th>類別</th>
      <th>聯絡（遮罩）</th><th>狀態</th><th>媒合服務者</th><th>建立</th></tr></thead><tbody>${rows.map(n => {
        const sug = N.suggestProviders(n, data.providers, C);
        const opts = [{ id: '', name: '（未指派）' }].concat(sug.length ? sug : data.providers);
        if (n.providerId && !opts.find(p => p.id === n.providerId)) opts.push({ id: n.providerId, name: provName(n.providerId) });
        return `<tr><td>${esc(n.id)}</td><td title="${esc(n.description)}">${esc(n.title)}${dups[n.id] ? `<span class="dup" title="可能和 ${esc(dups[n.id].join('、'))} 重複">可能重複</span>` : ''}</td>
        <td>${esc(n.area)}</td><td>${esc(n.category)}</td>
        <td><button class="link reveal" data-id="${esc(n.id)}" title="點一下顯示完整聯絡方式">${esc(N.maskContact(n.contact))}</button></td>
        <td><select data-status="${esc(n.id)}">${C.statuses.map(st => `<option${st === n.status ? ' selected' : ''}>${esc(st)}</option>`).join('')}</select></td>
        <td><select data-provider="${esc(n.id)}">${opts.map(p => `<option value="${esc(p.id)}"${p.id === n.providerId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></td>
        <td>${esc(n.created)}</td></tr>`;
      }).join('')}</tbody></table>${rows.length ? '' : '<p class="muted">沒有符合的需求。</p>'}${matched.length > LIMIT ? `<p class="small-muted">符合 ${matched.length} 筆，只顯示前 ${LIMIT} 筆，請用搜尋或狀態篩選縮小範圍。</p>` : ''}`;

    document.querySelectorAll('[data-status]').forEach(sel => sel.addEventListener('change', () => {
      commit(d => N.updateNeed(d, sel.dataset.status, { status: sel.value })); renderAdmin();
    }));
    document.querySelectorAll('[data-provider]').forEach(sel => sel.addEventListener('change', () => {
      commit(d => {
        const patch = { providerId: sel.value };
        const cur = d.needs.find(n => n.id === sel.dataset.provider);
        if (sel.value && cur && ['待確認', '已確認'].includes(cur.status)) patch.status = '媒合中';
        return N.updateNeed(d, sel.dataset.provider, patch);
      }); renderAdmin();
    }));
    document.querySelectorAll('.reveal').forEach(b => b.addEventListener('click', () => {
      const n = data.needs.find(x => x.id === b.dataset.id);
      b.textContent = n ? n.contact : '';
    }));

    $('#providers').innerHTML = data.providers.map(p => `<article class="provider-card"><h3>${esc(p.name)}</h3>
      <p>服務範圍：${esc(p.area)}</p><p>服務類別：${esc(p.category)}</p><p>聯繫方式：${esc(p.contact)}</p>
      <p class="small-muted">${esc(p.id)}・已媒合 ${data.needs.filter(n => n.providerId === p.id).length} 件</p></article>`).join('');
  }

  if ($('#metrics')) {
    fillSelect($('#filterStatus'), C.statuses, '全部狀態');
    let searchTimer;
    $('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderAdmin, 150); });
    $('#filterStatus').addEventListener('change', renderAdmin);
    $('#providerBtn').addEventListener('click', () => { $('#providerModal').hidden = false; });
    $('#providerCancel').addEventListener('click', () => { $('#providerModal').hidden = true; });
    $('#providerForm').addEventListener('submit', e => {
      e.preventDefault();
      const input = Object.fromEntries(new FormData(e.target));
      if (commit(d => N.addProvider(d, input).data)) { e.target.reset(); $('#providerModal').hidden = true; renderAdmin(); }
    });
    $('#exportCsv').addEventListener('click', () => {
      const provName = id => (data.providers.find(p => p.id === id) || {}).name || '';
      const rows = data.needs.map(n => Object.assign({}, n, { provider: provName(n.providerId) }));
      download(`needs_${localDate()}.csv`, N.toCSV(rows, [
        { key: 'id', label: '編號' }, { key: 'title', label: '標題' }, { key: 'area', label: '地區' },
        { key: 'category', label: '類別' }, { key: 'description', label: '說明' }, { key: 'deadline', label: '期限' },
        { key: 'status', label: '狀態' }, { key: 'provider', label: '媒合服務者' }, { key: 'created', label: '建立日期' },
        { key: 'contact', label: '聯絡方式' }]), 'text/csv;charset=utf-8');
    });
    $('#exportJson').addEventListener('click', () =>
      download(`needs_backup_${localDate()}.json`, JSON.stringify(data, null, 1), 'application/json'));
    $('#importJson').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const incoming = N.validateBackup(JSON.parse(await f.text()));
        if (!confirm(`匯入會「取代」目前的全部資料（現有 ${data.needs.length} 筆需求）。
備份檔內有 ${incoming.needs.length} 筆需求、${incoming.providers.length} 位服務者。
要繼續嗎？（建議先按「下載備份」）`)) { e.target.value = ''; return; }
        if (commit(() => incoming)) { renderAdmin(); alert(`已匯入 ${data.needs.length} 筆需求、${data.providers.length} 位服務者。`); }
      } catch (err) { alert('匯入失敗：' + err.message); }
      e.target.value = '';
    });
    $('#seedBtn').addEventListener('click', () => {
      if (!$('#seedBtn').dataset.armed) {
        $('#seedBtn').dataset.armed = '1';
        $('#seedBtn').textContent = '再按一次確認（目前資料會被清掉）';
        setTimeout(() => { delete $('#seedBtn').dataset.armed; $('#seedBtn').textContent = '重置示範資料'; }, 4000);
        return;
      }
      commit(() => clone(window.NEEDS_SAMPLE)); renderAdmin();
      delete $('#seedBtn').dataset.armed; $('#seedBtn').textContent = '重置示範資料';
    });
  }

  renderPublic();
  renderAdmin();
})();
