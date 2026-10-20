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
