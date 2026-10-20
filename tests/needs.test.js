const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const N = require('../js/needs.js');

// 讀 config.js（瀏覽器檔案，裡面寫 window.XXX）
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8'), ctx);
const C = ctx.window.NEEDS_CONFIG;
const SAMPLE = ctx.window.NEEDS_SAMPLE;
const fresh = () => JSON.parse(JSON.stringify(SAMPLE));

test('設定檔與示範資料完整', () => {
  assert.ok(C.areas.length >= 2);
  assert.strictEqual(C.statuses[0], '待確認');
  for (const n of SAMPLE.needs) assert.ok(C.areas.includes(n.area) && C.statuses.includes(n.status));
});

test('新增需求：編號遞增、狀態待確認、不改原資料', () => {
  const d = fresh();
  const r = N.addNeed(d, { title: '南區冷氣不冷要修', area: '南區', description: '冷氣怪怪的', contact: '0900-000-999' }, C, '2026-10-10');
  assert.strictEqual(r.need.id, 'N-005');
  assert.strictEqual(r.need.status, '待確認');
  assert.strictEqual(r.need.category, '修繕與清運');   // 自動分類
  assert.strictEqual(r.data.needs[0].id, 'N-005');
  assert.strictEqual(d.needs.length, 4);
});

test('自動分類猜不到時給「其他」', () => {
  assert.strictEqual(N.guessCategory('想找人一起爬山', C.categories), '其他生活服務');
  assert.strictEqual(N.guessCategory('長輩需要接送和陪伴', C.categories), '長者與家庭日常');
});

test('表單檢查', () => {
  assert.deepStrictEqual(N.validateNeed({ title: 'a', description: 'b', contact: 'c' }), []);
  assert.strictEqual(N.validateNeed({}).length, 3);
  assert.ok(N.validateNeed({ title: 'x'.repeat(61), description: 'b', contact: 'c' })[0].includes('60'));
});

test('公開頁：不顯示待確認的需求，也不帶聯絡方式', () => {
  const pub = N.publicView(fresh(), C);
  assert.deepStrictEqual(pub.map(n => n.id), ['N-001', 'N-002', 'N-003']);
  for (const n of pub) { assert.ok(!('contact' in n)); assert.ok(!('providerId' in n)); }
});

test('聯絡方式遮罩', () => {
  assert.strictEqual(N.maskContact('0900-000-101'), '0900-***-101');
  assert.strictEqual(N.maskContact('abc'), '***');
  assert.strictEqual(N.maskContact(''), '');
  assert.ok(!N.maskContact('line_id_demo123').includes('id_demo'));
});

test('找可能重複的需求（同區同類、標題相似、未完成）', () => {
  let d = fresh();
  d = N.addNeed(d, { title: '東區需要搬家協助', area: '東區', category: '居住與搬遷', description: 'x', contact: 'y' }, C).data;
  d = N.addNeed(d, { title: '西區需要搬家協助', area: '西區', category: '居住與搬遷', description: 'x', contact: 'y' }, C).data;
  const dup = N.findDuplicates(d.needs);
  assert.deepStrictEqual(dup['N-005'], ['N-001']);
  assert.ok(!dup['N-006']);
  assert.ok(N.similarity('東區需要搬家協助', '東區需要小型搬家協助') > 0.6);
  assert.strictEqual(N.similarity('', 'abc'), 0);
});

test('建議服務者：類別相符且服務範圍包含地區或全市', () => {
  const d = fresh();
  const need = d.needs.find(n => n.id === 'N-002');  // 中區 餐食
  assert.deepStrictEqual(N.suggestProviders(need, d.providers, C).map(p => p.id), ['P-002']);
  const move = d.needs.find(n => n.id === 'N-001');  // 東區 搬遷
  assert.deepStrictEqual(N.suggestProviders(move, d.providers, C).map(p => p.id), ['P-001']);
});

test('新增服務者、更新需求、統計', () => {
  let d = N.addProvider(fresh(), { name: '示範長照夥伴', area: '北區', category: '長者與家庭日常' }).data;
  assert.strictEqual(d.providers[3].id, 'P-004');
  assert.strictEqual(d.providers[3].contact, '平台內聯繫');
  assert.throws(() => N.addProvider(d, { name: ' ' }));
  d = N.updateNeed(d, 'N-004', { status: '已完成', providerId: 'P-004' });
  const s = N.stats(d, C);
  assert.deepStrictEqual([s.total, s.confirmed, s.done, s.providers], [4, 4, 2, 4]);
  assert.throws(() => N.updateNeed(d, 'N-999', {}));
});

test('CSV：BOM、引號、防公式', () => {
  const csv = N.toCSV([{ a: '含,逗號', b: '=SUM(A1)', c: '有"引號"\n換行' }],
    [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }]);
  assert.ok(csv.startsWith('﻿A,B,C\r\n'));
  assert.ok(csv.includes('"含,逗號"'));
  assert.ok(csv.includes("'=SUM(A1)"));
  assert.ok(csv.includes('"有""引號""\n換行"'));
});

test('備份格式檢查', () => {
  assert.deepStrictEqual(N.validateBackup(fresh()).needs.length, 4);
  assert.throws(() => N.validateBackup({ needs: 'x' }));
  assert.throws(() => N.validateBackup({ needs: [{ id: 'N-1' }], providers: [] }));
});

test('去識別化：說明文字裡的電話、Email、身分證、LINE ID 不會出現在公開頁', () => {
  const t = N.redactText('請找王先生 0912-345-678 或 02-2345-6789，信箱 a.b@example.com，LINE ID: wang123，證號 A123456789，約 25 份 2026-10-04 共 1000 元');
  for (const leak of ['0912', '2345-6789', 'a.b@example.com', 'wang123', 'A123456789']) assert.ok(!t.includes(leak), leak);
  assert.ok(t.includes('25 份'));
  assert.ok(t.includes('1000 元'));
  const d = fresh();
  d.needs[1].description = '請打 0933123456 聯絡';
  const pub = N.publicView(d, C).find(n => n.id === d.needs[1].id);
  assert.ok(!pub.description.includes('0933123456'));
  assert.ok(!('contact' in pub));
});

test('去識別化：全形數字、點／斜線／空白分隔、+886、中文數字、Email 變形都擋得住', () => {
  const leaks = ['０９１２３４５６７８', '0912.345.678', '0912/345/678', '09 12 34 56 78', '+886912345678', '＋886 912 345 678',
    '+886-912-345-678', '零九一二三四五六七八', 'abc＠gmail.com', 'abc @ gmail.com', 'abc at gmail dot com', '0912\u200b345678', '0912‑345‑678'];
  for (const s of leaks) {
    const t = N.redactText('請聯絡 ' + s + ' 謝謝');
    assert.ok(/已隱藏/.test(t), `沒蓋掉：${s} → ${t}`);
    assert.ok(!/345|gmail|三四五/.test(t), `漏字：${s} → ${t}`);
  }
  for (const s of ['加賴 mysecret99', 'Ｌｉｎｅ：abc_123', 'IG: foo.bar', '@wang_999', 'https://line.me/ti/p/abc123', '身分證 Ａ１２３４５６７８９', 'a1 23456789']) {
    const t = N.redactText(s);
    assert.ok(/已隱藏/.test(t), `沒蓋掉：${s} → ${t}`);
  }
  // 不能誤傷一般數字
  const ok = N.redactText('約 25 份 2026-10-04 共 1000 元 0.75 公斤 預算 100000000');
  assert.strictEqual(ok, '約 25 份 2026-10-04 共 1000 元 0.75 公斤 預算 100000000');
});

test('公開頁只輸出白名單欄位（多餘欄位、聯絡方式都不外流）', () => {
  const d = fresh();
  d.needs[1].email = 'secret@x.com'; d.needs[1].note = '內部備註';
  const pub = N.publicView(d, C).find(n => n.id === d.needs[1].id);
  assert.deepStrictEqual(Object.keys(pub).sort(), ['area', 'category', 'created', 'deadline', 'description', 'id', 'status', 'title']);
});

test('CSV：開頭是 Tab／換行／空白再接 = 的也要擋', () => {
  const cols = [{ key: 'a', label: 'A' }];
  for (const v of ['\t=1+1', '\r=2', ' =3', '＝x'.replace('＝', '@'), '+1', '-1']) {
    const csv = N.toCSV([{ a: v }], cols).split('\r\n').slice(1).join('\r\n');
    assert.ok(/^"?'/.test(csv), `沒防住：${JSON.stringify(v)} → ${JSON.stringify(csv)}`);
  }
});

test('匯入備份：丟掉多餘／惡意欄位、轉成字串、重複編號重新編號', () => {
  const bad = JSON.parse('{"needs":[{"id":"N-1","title":"a","__proto__":{"polluted":1},"extra":"x","description":{"a":1}},{"id":"N-1","title":"b"}],"providers":[{"id":"P-1","name":"p"},{"id":"P-1","name":"q"}]}');
  const r = N.validateBackup(bad);
  assert.strictEqual({}.polluted, undefined);
  assert.ok(!('extra' in r.needs[0]));
  assert.strictEqual(r.needs[0].description, '');
  assert.notStrictEqual(r.needs[0].id, r.needs[1].id);
  assert.notStrictEqual(r.providers[0].id, r.providers[1].id);
  assert.throws(() => N.validateBackup(null));
  assert.throws(() => N.validateBackup({ needs: [null], providers: [] }));
});

test('新增需求的建立日期用本機日期（不是 UTC）', () => {
  const d = new Date(); const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r = N.addNeed(fresh(), { title: 't', description: 'd', contact: 'c' }, C);
  assert.strictEqual(r.need.created, local);
});
