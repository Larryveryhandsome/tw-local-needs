/*
 * 在地需求雷達設定檔：改成你的城市／社區就好（用記事本打開改，存成 UTF-8）。
 * 示範資料全部是虛構的。
 */
window.NEEDS_CONFIG = {
  // 平台名稱與地區（會出現在標題、表單、頁尾）
  name: '示範市需求雷達',
  englishName: 'LOCAL NEEDS RADAR',
  region: '示範市',
  // 表單的「地區」選項
  areas: ['東區', '西區', '南區', '北區', '中區', '其他地區'],
  // 需求類別，以及自動分類用的關鍵字（使用者沒選類別時，依說明文字猜）
  categories: [
    { name: '居住與搬遷', keywords: ['搬家', '搬運', '租屋', '找房', '房子', '家具'] },
    { name: '修繕與清運', keywords: ['修', '漏水', '水電', '清運', '油漆', '冷氣', '裝潢', '雜物'] },
    { name: '餐食與團訂', keywords: ['便當', '午餐', '團訂', '外燴', '餐', '飲料'] },
    { name: '長者與家庭日常', keywords: ['長輩', '陪伴', '接送', '看護', '照顧', '小孩', '課輔'] },
    { name: '其他生活服務', keywords: [] }
  ],
  statuses: ['待確認', '已確認', '媒合中', '已完成', '已取消'],
  // 公開頁只顯示這些狀態的需求（待確認的先不公開，避免廣告或亂填）
  publicStatuses: ['已確認', '媒合中', '已完成'],
  // 瀏覽器儲存用的鍵（同一個網址放兩個平台時要改成不同名稱）
  storageKey: 'tw-local-needs-v1'
};

window.NEEDS_SAMPLE = {
  needs: [
    { id: 'N-001', title: '東區需要小型搬家協助', area: '東區', category: '居住與搬遷', description: '一樓搬到二樓，家具不多，希望本週內確認。', deadline: '本週內', status: '媒合中', created: '2026-10-04', contact: '0900-000-101', providerId: 'P-001' },
    { id: 'N-002', title: '中區公司平日午餐團訂', area: '中區', category: '餐食與團訂', description: '約 25 份平日午餐，需要固定配送與統一開立收據。', deadline: '下週起', status: '已確認', created: '2026-10-03', contact: '0900-000-102', providerId: '' },
    { id: 'N-003', title: '西區老屋修繕初步評估', area: '西區', category: '修繕與清運', description: '屋主希望先確認漏水與雜物清運的處理順序。', deadline: '兩週內', status: '已完成', created: '2026-10-02', contact: '0900-000-103', providerId: 'P-003' },
    { id: 'N-004', title: '北區長輩回診接送', area: '北區', category: '長者與家庭日常', description: '每月一次，上午回診，需要能協助上下車。', deadline: '月底前', status: '待確認', created: '2026-10-05', contact: '0900-000-104', providerId: '' }
  ],
  providers: [
    { id: 'P-001', name: '示範搬運協作隊', area: '東區、中區', category: '居住與搬遷', contact: '平台內聯繫' },
    { id: 'P-002', name: '示範團膳服務', area: '全市', category: '餐食與團訂', contact: '平台內聯繫' },
    { id: 'P-003', name: '示範修繕合作夥伴', area: '西區、南區', category: '修繕與清運', contact: '平台內聯繫' }
  ]
};
