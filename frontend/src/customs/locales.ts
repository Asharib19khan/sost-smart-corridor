// Strings for the customs console. Keys namespaced "customs.*". ur/en/zh kept in sync.
const en = {
  integrity: { verified: 'Integrity: verified', brokenShort: 'Integrity: broken', checking: 'Checking integrity…', recheck: 'Re-check', unknown: 'Could not check integrity.' },
  queue: { title: 'Arrivals queue — highest risk first', autoRefresh: 'Refreshes every 10 s', updated: 'updated {{time}}', refresh: 'Refresh', empty: 'No shipments yet.', risk: 'Risk', ref: 'Shipment', trader: 'Trader', state: 'State', integrity: 'Integrity', reason: 'Top reason', arrived: 'Arrived' },
  ship: {
    manifest: 'Manifest', chain: 'Event chain', browserCheckNote: 'Signatures re-checked in this browser', payments: 'Payments', receipts: 'Receipts',
    decision: 'Decision', risk: 'Risk', duty: 'Duty (indicative)', created: 'Created', item: 'Item', qty: 'Qty', unitPrice: 'Unit price', total: 'Total', value: 'Value',
    flags: 'Flags', step: 'Step', signer: 'Signer', signedAt: 'Signed', receivedAt: 'Received by server', location: 'Location', server: 'Server check', browser: 'Browser check',
    sigOk: 'Signature valid', sigBad: 'Signature INVALID', sigNa: 'No data', revoked: 'key revoked', noLines: 'No manifest lines.', noPayments: 'No payments.', noReceipts: 'No receipts.',
    noReasons: 'No risk reasons.', noRisk: 'No risk score yet.', noSteps: 'No events yet.', notFound: 'Shipment not found.', seller: 'Seller', amount: 'Amount', paidAt: 'Paid',
    sellerConfirm: 'Seller confirmation', confirmedBy: 'Confirmed by {{name}}', notConfirmed: 'Not confirmed', receiptAlt: 'Receipt {{id}}',
    dutyCol: 'Duty', salesTax: 'Sales tax', dutyTotal: 'Total payable', fx: 'Sandbox rate: 1 CNY = {{rate}} PKR',
  },
  ui: { navQueue: 'Queue', navVerify: 'Verify', navAdmin: 'Admin', signOut: 'Sign out', switchUser: 'Sign in as a different user', noAccessTitle: 'No access', noAccess: '{{name}} ({{role}}) cannot open this page. Sign in as a customs officer.' },
  decide: { title: 'Sign a decision', approve: 'Approve — clear', hold: 'Hold', docs: 'Request documents', reason: 'Reason (shown to the trader)', reasonNeeded: 'Write a reason first.', needKey: 'This browser has no signing key yet.', signing: 'Signing in this browser…', done: 'Decision signed and recorded.', closed: 'Decision is only possible once the shipment is at Sost or held.', current: 'Current state' },
}
const ur: typeof en = {
  integrity: { verified: 'سالمیت: تصدیق شدہ', brokenShort: 'سالمیت: ٹوٹی ہوئی', checking: 'سالمیت جانچی جا رہی ہے…', recheck: 'دوبارہ جانچیں', unknown: 'سالمیت نہیں جانچی جا سکی۔' },
  queue: { title: 'آمد کی قطار — زیادہ خطرہ پہلے', autoRefresh: 'ہر 10 سیکنڈ میں تازہ', updated: 'تازہ کاری {{time}}', refresh: 'تازہ کریں', empty: 'ابھی کوئی کھیپ نہیں۔', risk: 'خطرہ', ref: 'کھیپ', trader: 'تاجر', state: 'حالت', integrity: 'سالمیت', reason: 'اہم وجہ', arrived: 'آمد' },
  ship: {
    manifest: 'مینی فیسٹ', chain: 'واقعات کی زنجیر', browserCheckNote: 'دستخط اسی براؤزر میں دوبارہ جانچے گئے', payments: 'ادائیگیاں', receipts: 'رسیدیں',
    decision: 'فیصلہ', risk: 'خطرہ', duty: 'ڈیوٹی (اندازاً)', created: 'بنائی گئی', item: 'چیز', qty: 'تعداد', unitPrice: 'فی اکائی قیمت', total: 'کل', value: 'مالیت',
    flags: 'نشانیاں', step: 'مرحلہ', signer: 'دستخط کنندہ', signedAt: 'دستخط', receivedAt: 'سرور کو موصول', location: 'مقام', server: 'سرور کی جانچ', browser: 'براؤزر کی جانچ',
    sigOk: 'دستخط درست', sigBad: 'دستخط غلط', sigNa: 'ڈیٹا نہیں', revoked: 'کلید منسوخ', noLines: 'مینی فیسٹ میں کوئی لائن نہیں۔', noPayments: 'کوئی ادائیگی نہیں۔', noReceipts: 'کوئی رسید نہیں۔',
    noReasons: 'خطرے کی کوئی وجہ نہیں۔', noRisk: 'ابھی خطرے کا اسکور نہیں۔', noSteps: 'ابھی کوئی واقعہ نہیں۔', notFound: 'کھیپ نہیں ملی۔', seller: 'بیچنے والا', amount: 'رقم', paidAt: 'ادائیگی کا وقت',
    sellerConfirm: 'بیچنے والے کی تصدیق', confirmedBy: '{{name}} نے تصدیق کی', notConfirmed: 'تصدیق نہیں ہوئی', receiptAlt: 'رسید {{id}}',
    dutyCol: 'ڈیوٹی', salesTax: 'سیلز ٹیکس', dutyTotal: 'کل واجب الادا', fx: 'سینڈ باکس ریٹ: 1 یوآن = {{rate}} روپے',
  },
  ui: { navQueue: 'قطار', navVerify: 'تصدیق', navAdmin: 'ایڈمن', signOut: 'سائن آؤٹ', switchUser: 'دوسرے صارف سے سائن اِن کریں', noAccessTitle: 'رسائی نہیں', noAccess: '{{name}} ({{role}}) یہ صفحہ نہیں کھول سکتے۔ کسٹمز افسر کے طور پر سائن اِن کریں۔' },
  decide: { title: 'فیصلے پر دستخط', approve: 'منظور — کلیئر', hold: 'روکیں', docs: 'دستاویزات مانگیں', reason: 'وجہ (تاجر کو دکھائی جائے گی)', reasonNeeded: 'پہلے وجہ لکھیں۔', needKey: 'اس براؤزر میں ابھی دستخطی کلید نہیں۔', signing: 'اس براؤزر میں دستخط ہو رہے ہیں…', done: 'فیصلے پر دستخط ہو گئے اور درج ہو گیا۔', closed: 'فیصلہ صرف تب ہو سکتا ہے جب کھیپ سوست پہنچ جائے یا روکی گئی ہو۔', current: 'موجودہ حالت' },
}
const zh: typeof en = {
  integrity: { verified: '完整性：已验证', brokenShort: '完整性：已破坏', checking: '正在检查完整性…', recheck: '重新检查', unknown: '无法检查完整性。' },
  queue: { title: '到达队列——风险最高优先', autoRefresh: '每 10 秒刷新', updated: '更新于 {{time}}', refresh: '刷新', empty: '暂无货运。', risk: '风险', ref: '货运', trader: '商人', state: '状态', integrity: '完整性', reason: '主要原因', arrived: '到达' },
  ship: {
    manifest: '货单', chain: '事件链', browserCheckNote: '签名已在本浏览器重新校验', payments: '付款', receipts: '收据',
    decision: '决定', risk: '风险', duty: '关税（参考）', created: '创建', item: '品名', qty: '数量', unitPrice: '单价', total: '合计', value: '价值',
    flags: '标记', step: '步骤', signer: '签名人', signedAt: '签名时间', receivedAt: '服务器接收', location: '位置', server: '服务器校验', browser: '浏览器校验',
    sigOk: '签名有效', sigBad: '签名无效', sigNa: '无数据', revoked: '密钥已吊销', noLines: '货单无明细。', noPayments: '无付款。', noReceipts: '无收据。',
    noReasons: '无风险原因。', noRisk: '暂无风险评分。', noSteps: '暂无事件。', notFound: '未找到货运。', seller: '卖家', amount: '金额', paidAt: '付款时间',
    sellerConfirm: '卖家确认', confirmedBy: '{{name}} 已确认', notConfirmed: '未确认', receiptAlt: '收据 {{id}}',
    dutyCol: '关税', salesTax: '销售税', dutyTotal: '应缴合计', fx: '沙盒汇率：1 人民币 = {{rate}} 卢比',
  },
  ui: { navQueue: '队列', navVerify: '验证', navAdmin: '管理', signOut: '退出', switchUser: '换用户登录', noAccessTitle: '无权限', noAccess: '{{name}}（{{role}}）无法打开此页面。请以海关官员身份登录。' },
  decide: { title: '签署决定', approve: '批准——放行', hold: '扣留', docs: '要求补充文件', reason: '原因（商人可见）', reasonNeeded: '请先填写原因。', needKey: '此浏览器还没有签名密钥。', signing: '正在本浏览器中签名…', done: '决定已签署并记录。', closed: '货物到达苏斯特或被扣留后才能做决定。', current: '当前状态' },
}
export const customsLocales = { en: { customs: en }, ur: { customs: ur }, zh: { customs: zh } }
