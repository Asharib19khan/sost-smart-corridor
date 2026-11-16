import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { commonLocales } from '../locales'
import { traderLocales } from '../../trader/locales'
import { sellerLocales } from '../../seller/locales'
import { customsLocales } from '../../customs/locales'
import { serverTextLocales } from '../serverText'
import { homeLocales } from '../../home/locales'
import { verifyLocales } from '../../verify/locales'
import { adminLocales } from '../../admin/locales'

export const LANGS = [
  { code: 'ur', label: 'اردو', dir: 'rtl' },
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'zh', label: '中文', dir: 'ltr' },
] as const
export type Lang = (typeof LANGS)[number]['code']

const all = [commonLocales, traderLocales, sellerLocales, customsLocales, verifyLocales, adminLocales, serverTextLocales, homeLocales]
const resources = Object.fromEntries(
  (['en', 'ur', 'zh'] as const).map((l) => [l, { translation: Object.assign({}, ...all.map((a) => a[l])) }]),
)

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('sost.lang')
    if (saved === 'ur' || saved === 'en' || saved === 'zh') return saved
  } catch { /* ignore */ }
  return 'en'
}

export function applyDir(lang: string) {
  const def = LANGS.find((l) => l.code === lang)
  document.documentElement.lang = lang
  document.documentElement.dir = def?.dir ?? 'ltr'
}

i18n.use(initReactI18next).init({ resources, lng: initialLang(), fallbackLng: 'en', interpolation: { escapeValue: false } })
applyDir(i18n.language)
i18n.on('languageChanged', (l) => {
  applyDir(l)
  try { localStorage.setItem('sost.lang', l) } catch { /* ignore */ }
})

export default i18n
