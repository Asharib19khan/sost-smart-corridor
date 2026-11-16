// Admin console strings. Keys namespaced "admin.*".
const en = {
  tamper: { title: 'Tamper lab', note: 'Edits the database directly, bypassing the app, exactly like an attacker would. Then re-verify: the system must notice. Every attack is audited and can be restored.', shipment: 'Shipment', action: 'Attack', lineNo: 'Line no.', seq: 'Step (seq)', value: 'Value', run: 'Run attack', restore: 'Restore original', verify: 'Verify now', done: 'Attack applied directly in the database.', restored: 'Original data restored.',
    a: { edit_line_price: 'Change a line price (fen)', edit_line_qty: 'Change a line quantity', delete_event: 'Delete a chain step', swap_events: 'Swap two chain steps (value = other seq)', edit_event_payload: 'Edit a step payload (value)' } },
  users: { title: 'Users and keys', name: 'User', role: 'Role', keys: 'Signing keys', revoke: 'Revoke', revoked: 'revoked' },
  audit: { title: 'Audit log', note: 'Append-only: the database refuses edits and deletes of these rows.', when: 'When (UTC)', action: 'Action', target: 'Target' },
}
const zh: typeof en = {
  tamper: { title: '篡改实验室', note: '像攻击者一样绕过应用直接修改数据库，然后重新验证：系统必须发现。每次攻击都会被审计，并可恢复。', shipment: '货运', action: '攻击方式', lineNo: '行号', seq: '步骤（seq）', value: '数值', run: '执行攻击', restore: '恢复原始数据', verify: '立即验证', done: '已直接在数据库中完成攻击。', restored: '已恢复原始数据。',
    a: { edit_line_price: '修改某行单价（分）', edit_line_qty: '修改某行数量', delete_event: '删除一个链上步骤', swap_events: '交换两个链上步骤（数值=另一个 seq）', edit_event_payload: '修改步骤内容（数值）' } },
  users: { title: '用户与密钥', name: '用户', role: '角色', keys: '签名密钥', revoke: '吊销', revoked: '已吊销' },
  audit: { title: '审计日志', note: '仅可追加：数据库拒绝修改或删除这些记录。', when: '时间（UTC）', action: '操作', target: '对象' },
}
const ur: typeof en = {
  tamper: { title: 'چھیڑ چھاڑ کی لیب', note: 'ایپ کو بائی پاس کر کے براہِ راست ڈیٹا بیس میں ترمیم، بالکل حملہ آور کی طرح۔ پھر دوبارہ جانچیں: نظام کو پکڑنا ہوگا۔ ہر حملہ آڈٹ ہوتا ہے اور بحال ہو سکتا ہے۔', shipment: 'کھیپ', action: 'حملہ', lineNo: 'لائن نمبر', seq: 'مرحلہ (seq)', value: 'قدر', run: 'حملہ کریں', restore: 'اصل ڈیٹا بحال کریں', verify: 'ابھی جانچیں', done: 'حملہ براہِ راست ڈیٹا بیس میں لگا دیا گیا۔', restored: 'اصل ڈیٹا بحال ہو گیا۔',
    a: { edit_line_price: 'لائن کی قیمت بدلیں (فین)', edit_line_qty: 'لائن کی تعداد بدلیں', delete_event: 'زنجیر کا ایک مرحلہ حذف کریں', swap_events: 'دو مراحل آپس میں بدلیں (قدر = دوسرا seq)', edit_event_payload: 'مرحلے کا مواد بدلیں (قدر)' } },
  users: { title: 'صارفین اور کلیدیں', name: 'صارف', role: 'کردار', keys: 'دستخطی کلیدیں', revoke: 'منسوخ کریں', revoked: 'منسوخ' },
  audit: { title: 'آڈٹ لاگ', note: 'صرف اضافہ ممکن: ڈیٹا بیس ان قطاروں کی ترمیم اور حذف سے انکار کرتا ہے۔', when: 'وقت (UTC)', action: 'عمل', target: 'ہدف' },
}
export const adminLocales = { en: { admin: en }, ur: { admin: ur }, zh: { admin: zh } }
