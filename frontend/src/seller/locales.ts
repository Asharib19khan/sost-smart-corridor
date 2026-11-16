// Seller page strings. Keys namespaced "seller.*". Mandarin is the default on this page.
const en = {
  title: 'Seller confirmation', intro: 'A trader has paid you for these goods. Check the list. If it is right, confirm with your phone — this signs it with a key that stays on this phone.',
  earlier: 'Confirmed earlier ({{n}})', none: 'Nothing is waiting for you to confirm.',buyer: 'Buyer', ref: 'Shipment', paid: 'Amount paid to you', confirm: 'Confirm the goods and amount', confirmed: 'You have confirmed this shipment.',
  thanks: 'Thank you. {{ref}} is confirmed.', keyNote: 'No account needed. The first time, this phone creates its own signing key.',
}
const zh: typeof en = {
  title: '卖家确认', intro: '有商人已向您付款购买以下货物。请核对清单，无误后用手机确认——将使用只保存在本手机上的密钥签名。',
  earlier: '之前已确认（{{n}}）', none: '目前没有待您确认的货运。',buyer: '买家', ref: '货运编号', paid: '已付给您的金额', confirm: '确认货物与金额', confirmed: '您已确认此货运。',
  thanks: '谢谢。{{ref}} 已确认。', keyNote: '无需账号。首次使用时，本手机会生成自己的签名密钥。',
}
const ur: typeof en = {
  title: 'بیچنے والے کی تصدیق', intro: 'ایک تاجر نے ان اشیاء کی ادائیگی کر دی ہے۔ فہرست دیکھیں۔ درست ہو تو اپنے فون سے تصدیق کریں — یہ اس کلید سے دستخط ہوتا ہے جو اسی فون میں رہتی ہے۔',
  earlier: 'پہلے تصدیق شدہ ({{n}})', none: 'آپ کی تصدیق کے لیے کچھ منتظر نہیں۔',buyer: 'خریدار', ref: 'کھیپ', paid: 'آپ کو ادا کی گئی رقم', confirm: 'اشیاء اور رقم کی تصدیق کریں', confirmed: 'آپ نے یہ کھیپ تصدیق کر دی ہے۔',
  thanks: 'شکریہ۔ {{ref}} کی تصدیق ہو گئی۔', keyNote: 'اکاؤنٹ کی ضرورت نہیں۔ پہلی بار یہ فون اپنی دستخطی کلید بناتا ہے۔',
}
export const sellerLocales = { en: { seller: en }, ur: { seller: ur }, zh: { seller: zh } }
