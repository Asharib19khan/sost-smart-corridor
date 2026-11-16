// Public verify page strings. Keys namespaced "verify.*".
const en = {
  title: 'Shipment check', entryTitle: 'Check a shipment seal', entryIntro: 'Scan the seal QR on the paperwork, or paste its link. No account needed.',
  scan: 'Scan QR code', stopCamera: 'Stop camera', paste: 'Or paste the seal link', check: 'Check', badCode: 'That is not a Sost seal link. Scan the QR code printed on the shipment papers.', noCamera: 'Could not open the camera. Paste the link instead.',
  allOk: 'Verified. Nothing has changed since sealing.', partial: 'Chain is intact, but the seal itself could not be fully confirmed. See below.',
  needsSeal: 'Needs the seal code: scan the QR on the paperwork.',
  localSig: 'Seal signature is valid (checked on this device)', noSeal: 'No seal code in this link', keyReg: 'Signing key is registered and not revoked', matchesNow: 'Sealed manifest matches the manifest on file today',
  manifestOk: 'Every line matches what was sealed', manifestBad: 'Changed after sealing: line {{n}}', chainOk: 'All {{n}} recorded steps are signed and in order', chainBad: 'Event chain broken at step {{n}}',
  sealed: 'Sealed fingerprint', history: 'History',
}
const zh: typeof en = {
  title: '货运核验', entryTitle: '核验货运封签', entryIntro: '扫描单据上的封签二维码，或粘贴链接。无需账号。',
  scan: '扫描二维码', stopCamera: '关闭相机', paste: '或粘贴封签链接', check: '核验', badCode: '这不是苏斯特封签链接。请扫描货运单据上的二维码。', noCamera: '无法打开相机，请改为粘贴链接。',
  allOk: '已验证：封签后没有任何改动。', partial: '事件链完好，但封签本身未能完全确认，详见下方。',
  needsSeal: '需要封签码：请扫描单据上的二维码。',
  localSig: '封签签名有效（在本设备上校验）', noSeal: '此链接中没有封签码', keyReg: '签名密钥已登记且未吊销', matchesNow: '封签时的货单与当前存档货单一致',
  manifestOk: '每一行都与封签时一致', manifestBad: '封签后被改动：第 {{n}} 行', chainOk: '全部 {{n}} 个步骤均已签名且顺序正确', chainBad: '事件链在第 {{n}} 步断裂',
  sealed: '封签指纹', history: '历史',
}
const ur: typeof en = {
  title: 'کھیپ کی جانچ', entryTitle: 'کھیپ کی مہر جانچیں', entryIntro: 'کاغذات پر چھپا مہر کا کیو آر کوڈ اسکین کریں یا لنک پیسٹ کریں۔ اکاؤنٹ کی ضرورت نہیں۔',
  scan: 'کیو آر کوڈ اسکین کریں', stopCamera: 'کیمرہ بند کریں', paste: 'یا مہر کا لنک پیسٹ کریں', check: 'جانچیں', badCode: 'یہ سوست کی مہر کا لنک نہیں۔ کھیپ کے کاغذات پر چھپا کیو آر کوڈ اسکین کریں۔', noCamera: 'کیمرہ نہیں کھل سکا۔ لنک پیسٹ کریں۔',
  allOk: 'تصدیق شدہ۔ مہر لگنے کے بعد کچھ نہیں بدلا۔', partial: 'زنجیر درست ہے مگر مہر کی مکمل تصدیق نہیں ہو سکی۔ نیچے دیکھیں۔',
  needsSeal: 'مہر کا کوڈ چاہیے: کاغذات پر لگا QR اسکین کریں۔',
  localSig: 'مہر کا دستخطدرست ہے (اسی ڈیوائس پر جانچا گیا)', noSeal: 'اس لنک میں مہر کا کوڈ نہیں', keyReg: 'دستخطی کلید رجسٹرڈ ہے اور منسوخ نہیں', matchesNow: 'مہر کے وقت کا مینی فیسٹ آج کے ریکارڈ سے مطابقت رکھتا ہے',
  manifestOk: 'ہر لائن مہر کے وقت جیسی ہے', manifestBad: 'مہر کے بعد بدلی گئی: لائن {{n}}', chainOk: 'تمام {{n}} مراحل دستخط شدہ اور ترتیب میں ہیں', chainBad: 'واقعات کی زنجیر مرحلہ {{n}} پر ٹوٹ گئی',
  sealed: 'مہر کا فنگر پرنٹ', history: 'تاریخ',
}
export const verifyLocales = { en: { verify: en }, ur: { verify: ur }, zh: { verify: zh } }
