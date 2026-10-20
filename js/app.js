/* 在地需求雷達：公開頁＋營運後台的畫面邏輯。資料處理在 needs.js。 */
(function () {
  'use strict';
  const N = window.Needs;
  const C = window.NEEDS_CONFIG;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  function load() {
    try {
      const raw = localStorage.getItem(C.storageKey);
      if (raw) return N.validateBackup(JSON.parse(raw));
    } catch (e) { /* 壞掉就用示範資料 */ }
    return clone(window.NEEDS_SAMPLE);
  }
  function save(d) {
    try { localStorage.setItem(C.storageKey, JSON.stringify(d)); } catch (e) { alert('瀏覽器不允許儲存（可能是私密視窗）。'); }
  }
  let data = load();

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
      if (errors.length) { msg.textContent = errors.join('；'); return; }
      const r = N.addNeed(data, x, C);
      data = r.data; save(data); form.reset();
      msg.textContent = `已收到（編號 ${r.need.id}）。平台確認內容後才會公開摘要，聯絡方式不會公開。`;
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
    const rows = data.needs.filter(n => (!fs || n.status === fs) &&
      (!q || [n.id, n.title, n.description, n.area, n.category].join(' ').includes(q)));
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
      }).join('')}</tbody></table>${rows.length ? '' : '<p class="muted">沒有符合的需求。</p>'}`;

    document.querySelectorAll('[data-status]').forEach(sel => sel.addEventListener('change', () => {
      data = N.updateNeed(data, sel.dataset.status, { status: sel.value }); save(data); renderAdmin();
    }));
    document.querySelectorAll('[data-provider]').forEach(sel => sel.addEventListener('change', () => {
      const patch = { providerId: sel.value };
      const cur = data.needs.find(n => n.id === sel.dataset.provider);
      if (sel.value && cur && ['待確認', '已確認'].includes(cur.status)) patch.status = '媒合中';
      data = N.updateNeed(data, sel.dataset.provider, patch); save(data); renderAdmin();
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
    $('#search').addEventListener('input', renderAdmin);
    $('#filterStatus').addEventListener('change', renderAdmin);
    $('#providerBtn').addEventListener('click', () => { $('#providerModal').hidden = false; });
    $('#providerCancel').addEventListener('click', () => { $('#providerModal').hidden = true; });
    $('#providerForm').addEventListener('submit', e => {
      e.preventDefault();
      try {
        data = N.addProvider(data, Object.fromEntries(new FormData(e.target))).data;
        save(data); e.target.reset(); $('#providerModal').hidden = true; renderAdmin();
      } catch (err) { alert(err.message); }
    });
    $('#exportCsv').addEventListener('click', () => {
      const provName = id => (data.providers.find(p => p.id === id) || {}).name || '';
      const rows = data.needs.map(n => Object.assign({}, n, { provider: provName(n.providerId) }));
      download(`needs_${new Date().toISOString().slice(0, 10)}.csv`, N.toCSV(rows, [
        { key: 'id', label: '編號' }, { key: 'title', label: '標題' }, { key: 'area', label: '地區' },
        { key: 'category', label: '類別' }, { key: 'description', label: '說明' }, { key: 'deadline', label: '期限' },
        { key: 'status', label: '狀態' }, { key: 'provider', label: '媒合服務者' }, { key: 'created', label: '建立日期' },
        { key: 'contact', label: '聯絡方式' }]), 'text/csv;charset=utf-8');
    });
    $('#exportJson').addEventListener('click', () =>
      download(`needs_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json'));
    $('#importJson').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        data = N.validateBackup(JSON.parse(await f.text())); save(data); renderAdmin();
        alert(`已匯入 ${data.needs.length} 筆需求、${data.providers.length} 位服務者。`);
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
      data = clone(window.NEEDS_SAMPLE); save(data); renderAdmin();
      delete $('#seedBtn').dataset.armed; $('#seedBtn').textContent = '重置示範資料';
    });
  }

  renderPublic();
  renderAdmin();
})();
