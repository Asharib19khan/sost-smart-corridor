// Server-written sentences (risk reasons, price flags, integrity problems) arrive in English.
// They come from a small fixed set of templates in the backend, so we recognise each template,
// pull out its values, and render it in the viewer's language. Anything unrecognised is shown as-is,
// so a new backend sentence degrades to English instead of disappearing.
//
// Templates live in: backend/app/risk/service.py, ocr/service.py (band_flag, line_value_flag),
// integrity/service.py (_verify_chain), integrity/manifest.py, integrity/routes.py, customs/routes.py.
// serverText.test.ts runs the real strings through this file.
import type { TFunction } from 'i18next'

type Params = Record<string, string>
type Rule = [RegExp, string, (m: RegExpMatchArray, t: TFunction) => Params]

const LINE_CHANGE = /^line was (edited|deleted|added) after sealing$/i

const RULES: Rule[] = [
  // Integrity / chain problems (also nested inside other sentences)
  [/^Step (\d+) is missing or out of order$/, 'stepMissing', (m) => ({ n: m[1] })],
  [/^Link to the previous step is broken \(a step was deleted, reordered or edited\)$/, 'linkBroken', () => ({})],
  [/^Stored record was changed after it was signed$/, 'recordChanged', () => ({})],
  [/^Signed contents were edited \(hash no longer matches\)$/, 'contentsEdited', () => ({})],
  [/^Signature is not valid for this step$/, 'sigInvalid', () => ({})],
  [LINE_CHANGE, 'lineChange', (m, t) => ({ change: t(`srv.change.${m[1].toLowerCase()}`) })],
  [/^Manifest header changed after sealing$/i, 'headerChanged', () => ({})],
  [/^Integrity: verified$/, 'verified', () => ({})],
  [/^Integrity: broken at step (\d+) — line (\d+) was (edited|deleted|added) after sealing(?: \(\+(\d+) more\))?$/, 'brokenAtLine',
    (m, t) => ({ step: m[1], line: m[2], change: t(`srv.change.${m[3]}`), more: m[4] ? t('srv.more', { n: m[4] }) : '' })],
  [/^Integrity: broken at step (\d+) — (.+)$/, 'brokenAt', (m, t) => ({ step: m[1], problem: localizeServerText(t, m[2]) })],
  [/^Not sealed yet: the manifest can still change\. (\d+) signed step\(s\) verified\.$/, 'notSealed', (m) => ({ n: m[1] })],

  // Risk reasons
  [/^Integrity broken at step (\d+): (.+)\.$/, 'integrityStep', (m, t) => ({ step: m[1], problem: localizeServerText(t, m[2]) })],
  [/^Integrity broken: the data changed after it was signed\.$/, 'integrityGeneric', () => ({})],
  [/^Manifest changed after sealing \(line (\d+): (.+)\)\.$/, 'manifestChangedLine', (m, t) => ({ line: m[1], problem: localizeServerText(t, m[2]) })],
  [/^Manifest changed after sealing \(the manifest: (.+)\)\.$/, 'manifestChangedHeader', () => ({})],
  [/^Paid (\S+) but declared (\S+) \((\d+)% gap\)\.$/, 'paymentGap', (m) => ({ paid: m[1], declared: m[2], pct: m[3] })],
  [/^Seller has not confirmed (\d+) payment\(s\): the goods and amount are signed by the trader only\.$/, 'sellerUnconfirmed', (m) => ({ n: m[1] })],
  [/^(\d+) line\(s\) priced outside the usual value band \(line ([\d, ]+)\): (.+)\.$/, 'valueBand',
    (m, t) => ({ n: m[1], lines: m[2], flag: localizeServerText(t, m[3]) })],
  [/^Location at (.+) did not match the expected place \(consistency signal\)\.$/, 'geofence',
    (m, t) => ({ name: t(`customs.step.${m[1]}`, { defaultValue: m[1] }) })],
  [/^New trader: (\d+) cleared shipment\(s\) so far, fewer than 3\.$/, 'newTrader', (m) => ({ n: m[1] })],
  [/^Trusted trader \(trust score (\d+)\) lowers risk\.$/, 'trusted', (m) => ({ score: m[1] })],

  // Price flags on manifest lines
  [/^Unit price (\S+) is far below the usual (\S+) for (.+) \(possible under-invoicing\)$/, 'priceLow', (m, t) => ({ price: m[1], range: m[2], name: cat(t, m[3]) })],
  [/^Unit price (\S+) is above the usual (\S+) for (.+) \(check the price\)$/, 'priceHigh', (m, t) => ({ price: m[1], range: m[2], name: cat(t, m[3]) })],
  [/^Line total (\S+) does not equal (\d+) × (\S+)$/, 'totalMismatch', (m) => ({ total: m[1], qty: m[2], unit: m[3] })],
]

export function localizeServerText(t: TFunction, text: string | null | undefined): string {
  if (!text) return ''
  // Several price flags are joined with "; " on one line.
  if (text.includes('; ') && !/^\d+ line\(s\)/.test(text)) return text.split('; ').map((p) => localizeServerText(t, p)).join(t('srv.sep'))
  for (const [re, key, params] of RULES) {
    const m = text.match(re)
    if (m) {
      const out = t(`srv.${key}`, { ...params(m, t), interpolation: { escapeValue: false } })
      // Keep the sentence case of the original (the same problem appears standalone and mid-sentence).
      return /^[A-Z]/.test(text) && /^[a-z]/.test(out) ? out[0].toUpperCase() + out.slice(1) : out
    }
  }
  return text
}

// Goods categories named in price flags (backend/app/ocr/seed.py value bands, first clause, lower-cased).
const CATS: Record<string, { ur: string; zh: string }> = {
  't-shirts': { ur: 'ٹی شرٹس', zh: 'T恤' },
  "men's trousers/jeans": { ur: 'مردانہ پتلون / جینز', zh: '男裤 / 牛仔裤' },
  "women's dresses": { ur: 'زنانہ لباس', zh: '女装连衣裙' },
  'jackets/anoraks': { ur: 'جیکٹیں', zh: '夹克 / 防风外套' },
  'sweaters/pullovers': { ur: 'سویٹر', zh: '毛衣 / 套衫' },
  scarves: { ur: 'اسکارف', zh: '围巾' },
  'sports shoes': { ur: 'کھیلوں کے جوتے', zh: '运动鞋' },
  'leather shoes': { ur: 'چمڑے کے جوتے', zh: '皮鞋' },
  'plastic/rubber footwear': { ur: 'پلاسٹک / ربڑ کے جوتے', zh: '塑料 / 橡胶鞋' },
  handbags: { ur: 'ہینڈ بیگ', zh: '手提包' },
  'suitcases/backpacks': { ur: 'سوٹ کیس / بیگ', zh: '行李箱 / 背包' },
  'leather belts': { ur: 'چمڑے کی بیلٹ', zh: '皮带' },
  'phone cases and other plastic articles': { ur: 'فون کور اور دیگر پلاسٹک اشیاء', zh: '手机壳及其他塑料制品' },
  'phone chargers / power adapters': { ur: 'فون چارجر / پاور اڈاپٹر', zh: '手机充电器 / 电源适配器' },
  'power banks (lithium-ion)': { ur: 'پاور بینک', zh: '充电宝' },
  'usb/charging cables': { ur: 'USB / چارجنگ کیبل', zh: 'USB / 充电线' },
  'earphones / headphones': { ur: 'ایئر فون / ہیڈ فون', zh: '耳机' },
  'led lamps and bulbs': { ur: 'ایل ای ڈی لیمپ اور بلب', zh: 'LED 灯和灯泡' },
  'led lights / light fittings': { ur: 'ایل ای ڈی لائٹس', zh: 'LED 灯具' },
  'electric kettles / coffee makers': { ur: 'بجلی کی کیتلی / کافی میکر', zh: '电水壶 / 咖啡机' },
  'blenders / food grinders': { ur: 'بلینڈر / گرائنڈر', zh: '搅拌机 / 研磨机' },
  'stainless steel kitchenware': { ur: 'اسٹین لیس اسٹیل کے برتن', zh: '不锈钢厨具' },
  'aluminium cookware': { ur: 'ایلومینیم کے برتن', zh: '铝制炊具' },
  'ceramic tableware': { ur: 'چینی کے برتن', zh: '陶瓷餐具' },
  'plastic tableware and kitchenware': { ur: 'پلاسٹک کے برتن', zh: '塑料餐具和厨具' },
  'plastic household goods (buckets': { ur: 'پلاسٹک کا گھریلو سامان', zh: '塑料家居用品' },
  toys: { ur: 'کھلونے', zh: '玩具' },
  'synthetic woven fabric': { ur: 'مصنوعی بُنا ہوا کپڑا', zh: '合成纤维机织物' },
  'cotton woven fabric': { ur: 'سوتی بُنا ہوا کپڑا', zh: '棉机织物' },
  blankets: { ur: 'کمبل', zh: '毛毯' },
  towels: { ur: 'تولیے', zh: '毛巾' },
  'raisins / dried grapes': { ur: 'کشمش', zh: '葡萄干' },
  'dried apricots and other dried fruit': { ur: 'خشک خوبانی اور دیگر خشک میوہ', zh: '杏干及其他干果' },
  'pistachios / walnuts in shell': { ur: 'پستہ / اخروٹ', zh: '带壳开心果 / 核桃' },
  'black tea': { ur: 'کالی چائے', zh: '红茶' },
  'cosmetics / skin care preparations': { ur: 'کاسمیٹکس / جلد کی دیکھ بھال', zh: '化妆品 / 护肤品' },
  'motor vehicle spare parts': { ur: 'گاڑیوں کے پرزے', zh: '汽车零配件' },
  'oil/fuel filters for engines': { ur: 'انجن کے تیل / ایندھن فلٹر', zh: '发动机机油 / 燃油滤清器' },
  'hand tools': { ur: 'ہاتھ کے اوزار', zh: '手工工具' },
  'electric drills': { ur: 'بجلی کی ڈرل', zh: '电钻' },
  'dried apricots': { ur: 'خشک خوبانی', zh: '杏干' },
  'dried fruit': { ur: 'خشک میوہ', zh: '干果' },
  'bags and cases': { ur: 'بیگ اور کیس', zh: '包袋及箱包' },
  "babies' garments": { ur: 'بچوں کے کپڑے', zh: '婴儿服装' },
  'sports footwear': { ur: 'کھیلوں کے جوتے', zh: '运动鞋' },
}

function cat(t: TFunction, name: string): string {
  const lng = t('srv.lang') as 'en' | 'ur' | 'zh'
  return lng === 'en' ? name : CATS[name]?.[lng] ?? name
}

export const serverTextLocales = {
  en: {
    srv: {
      lang: 'en', sep: '; ', more: ' (+{{n}} more)',
      change: { edited: 'edited', deleted: 'deleted', added: 'added' },
      stepMissing: 'Step {{n}} is missing or out of order',
      linkBroken: 'Link to the previous step is broken (a step was deleted, reordered or edited)',
      recordChanged: 'Stored record was changed after it was signed',
      contentsEdited: 'Signed contents were edited (hash no longer matches)',
      sigInvalid: 'Signature is not valid for this step',
      lineChange: 'line was {{change}} after sealing',
      headerChanged: 'Manifest header changed after sealing',
      verified: 'Integrity: verified',
      brokenAtLine: 'Integrity: broken at step {{step}} — line {{line}} was {{change}} after sealing{{more}}',
      brokenAt: 'Integrity: broken at step {{step}} — {{problem}}',
      notSealed: 'Not sealed yet: the manifest can still change. {{n}} signed step(s) verified.',
      integrityStep: 'Integrity broken at step {{step}}: {{problem}}.',
      integrityGeneric: 'Integrity broken: the data changed after it was signed.',
      manifestChangedLine: 'Manifest changed after sealing (line {{line}}: {{problem}}).',
      manifestChangedHeader: 'Manifest header changed after sealing.',
      paymentGap: 'Paid {{paid}} but declared {{declared}} ({{pct}}% gap).',
      sellerUnconfirmed: 'Seller has not confirmed {{n}} payment(s): the goods and amount are signed by the trader only.',
      valueBand: '{{n}} line(s) priced outside the usual value band (line {{lines}}): {{flag}}.',
      geofence: 'Location at {{name}} did not match the expected place (consistency signal).',
      newTrader: 'New trader: {{n}} cleared shipment(s) so far, fewer than 3.',
      trusted: 'Trusted trader (trust score {{score}}) lowers risk.',
      priceLow: 'Unit price {{price}} is far below the usual {{range}} for {{name}} (possible under-invoicing)',
      priceHigh: 'Unit price {{price}} is above the usual {{range}} for {{name}} (check the price)',
      totalMismatch: 'Line total {{total}} does not equal {{qty}} × {{unit}}',
    },
  },
  ur: {
    srv: {
      lang: 'ur', sep: '؛ ', more: ' (+{{n}} مزید)',
      change: { edited: 'تبدیل کی گئی', deleted: 'حذف کی گئی', added: 'شامل کی گئی' },
      stepMissing: 'مرحلہ {{n}} غائب ہے یا ترتیب سے باہر ہے',
      linkBroken: 'پچھلے مرحلے سے ربط ٹوٹ گیا ہے (کوئی مرحلہ حذف، آگے پیچھے یا تبدیل کیا گیا)',
      recordChanged: 'دستخط کے بعد محفوظ ریکارڈ تبدیل کیا گیا',
      contentsEdited: 'دستخط شدہ مواد میں ترمیم کی گئی (ہیش اب نہیں ملتا)',
      sigInvalid: 'اس مرحلے کا دستخط درست نہیں',
      lineChange: 'مہر کے بعد لائن {{change}}',
      headerChanged: 'مہر کے بعد مینی فیسٹ کا ہیڈر تبدیل ہوا',
      verified: 'سالمیت: تصدیق شدہ',
      brokenAtLine: 'سالمیت ٹوٹ گئی، مرحلہ {{step}}: لائن {{line}} مہر کے بعد {{change}}{{more}}',
      brokenAt: 'سالمیت ٹوٹ گئی، مرحلہ {{step}}: {{problem}}',
      notSealed: 'ابھی مہر نہیں لگی: مینی فیسٹ اب بھی بدل سکتا ہے۔ {{n}} دستخط شدہ مراحل کی تصدیق ہو گئی۔',
      integrityStep: 'مرحلہ {{step}} پر سالمیت ٹوٹ گئی: {{problem}}۔',
      integrityGeneric: 'سالمیت ٹوٹ گئی: دستخط کے بعد ڈیٹا تبدیل ہوا۔',
      manifestChangedLine: 'مہر کے بعد مینی فیسٹ تبدیل ہوا (لائن {{line}}: {{problem}})۔',
      manifestChangedHeader: 'مہر کے بعد مینی فیسٹ کا ہیڈر تبدیل ہوا۔',
      paymentGap: 'ادائیگی {{paid}} مگر اعلان {{declared}} ({{pct}}% فرق)۔',
      sellerUnconfirmed: 'بیچنے والے نے {{n}} ادائیگی کی تصدیق نہیں کی: سامان اور رقم پر صرف تاجر کا دستخط ہے۔',
      valueBand: '{{n}} لائن کی قیمت معمول کی حد سے باہر ہے (لائن {{lines}}): {{flag}}۔',
      geofence: '{{name}} پر مقام متوقع جگہ سے نہیں ملا (مطابقت کا اشارہ)۔',
      newTrader: 'نیا تاجر: اب تک {{n}} کھیپ کلیئر ہوئی، 3 سے کم۔',
      trusted: 'قابلِ اعتماد تاجر (اعتماد اسکور {{score}}) خطرہ کم کرتا ہے۔',
      priceLow: 'فی یونٹ قیمت {{price}} عام حد {{range}} ({{name}}) سے بہت کم ہے (ممکنہ کم انوائسنگ)',
      priceHigh: 'فی یونٹ قیمت {{price}} عام حد {{range}} ({{name}}) سے زیادہ ہے (قیمت چیک کریں)',
      totalMismatch: 'لائن کا کل {{total}} برابر نہیں: {{qty}} × {{unit}}',
    },
  },
  zh: {
    srv: {
      lang: 'zh', sep: '；', more: '（另有 {{n}} 处）',
      change: { edited: '被修改', deleted: '被删除', added: '被添加' },
      stepMissing: '第 {{n}} 步缺失或顺序错乱',
      linkBroken: '与上一步的链接已断开（有步骤被删除、调换或修改）',
      recordChanged: '记录在签名后被修改',
      contentsEdited: '已签名内容被修改（哈希不再匹配）',
      sigInvalid: '此步骤的签名无效',
      lineChange: '封签后该行{{change}}',
      headerChanged: '封签后货单抬头被修改',
      verified: '完整性：已验证',
      brokenAtLine: '完整性在第 {{step}} 步被破坏：第 {{line}} 行在封签后{{change}}{{more}}',
      brokenAt: '完整性在第 {{step}} 步被破坏：{{problem}}',
      notSealed: '尚未封签：货单仍可修改。已验证 {{n}} 个签名步骤。',
      integrityStep: '完整性在第 {{step}} 步被破坏：{{problem}}。',
      integrityGeneric: '完整性被破坏：数据在签名后被修改。',
      manifestChangedLine: '封签后货单被修改（第 {{line}} 行：{{problem}}）。',
      manifestChangedHeader: '封签后货单抬头被修改。',
      paymentGap: '实付 {{paid}}，申报 {{declared}}（相差 {{pct}}%）。',
      sellerUnconfirmed: '卖家尚未确认 {{n}} 笔付款：货物和金额仅有商人签名。',
      valueBand: '{{n}} 行价格超出常规范围（第 {{lines}} 行）：{{flag}}。',
      geofence: '{{name}} 的位置与预期地点不符（一致性信号）。',
      newTrader: '新商人：目前已放行 {{n}} 票，少于 3 票。',
      trusted: '可信商人（信任分 {{score}}）降低风险。',
      priceLow: '单价 {{price}} 远低于{{name}}的常规价格 {{range}}（可能低报）',
      priceHigh: '单价 {{price}} 高于{{name}}的常规价格 {{range}}（请核对价格）',
      totalMismatch: '行合计 {{total}} 不等于 {{qty}} × {{unit}}',
    },
  },
}
