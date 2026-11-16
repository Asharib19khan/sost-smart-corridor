// Shared strings (nav, states, errors). Keys namespaced "common.*".
export const commonLocales = {
  en: { common: { route: 'Kashgar · Khunjerab · Sost', appName: 'Sost Smart Corridor',language: 'Language', retry: 'Try again', loading: 'Loading…',
    band: { green: 'low', amber: 'medium', red: 'high' },
    role: { trader: 'trader', driver: 'driver',seller: 'seller', customs: 'customs officer', admin: 'admin' },
    state: { draft: 'Draft',paid: 'Paid', sealed: 'Sealed', departed_kashgar: 'Left Kashgar', crossed_khunjerab: 'Crossed Khunjerab', arrived_sost: 'At Sost', cleared: 'Cleared', held: 'Held' } } },
  ur: { common: { route: 'کاشغر · خنجراب · سوست', appName:'سوست اسمارٹ کوریڈور', language: 'زبان', retry: 'دوبارہ کوشش کریں', loading: 'لوڈ ہو رہا ہے…',
    band: { green: 'کم', amber: 'درمیانہ', red: 'زیادہ' },
    role: { trader: 'تاجر',driver: 'ڈرائیور', seller: 'بیچنے والا', customs: 'کسٹمز افسر', admin: 'ایڈمن' },
    state: { draft: 'مسودہ',paid: 'ادا شدہ', sealed: 'مہر بند', departed_kashgar: 'کاشغر سے روانہ', crossed_khunjerab: 'خنجراب پار', arrived_sost: 'سوست پہنچ گیا', cleared: 'کلیئر', held: 'روک لیا گیا' } } },
  zh: { common: { route: '喀什 · 红其拉甫 · 苏斯特', appName:'苏斯特智慧走廊', language: '语言', retry: '重试', loading: '加载中…',
    band: { green: '低', amber: '中', red: '高' },
    role: { trader: '商人',driver: '司机', seller: '卖家', customs: '海关官员', admin: '管理员' },
    state: { draft: '草稿',paid: '已付款', sealed: '已封签', departed_kashgar: '已离开喀什', crossed_khunjerab: '已过红其拉甫', arrived_sost: '已到苏斯特', cleared: '已放行', held: '已扣留' } } },
}
