// Real sentences as the backend writes them. If a backend template changes, these fail instead of the UI
// silently falling back to English.
import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { localizeServerText, serverTextLocales } from './serverText'

const SENTENCES = [
  'Integrity: verified',
  'Integrity: broken at step 3 — line 2 was edited after sealing',
  'Integrity: broken at step 2 — line 2 was edited after sealing (+1 more)',
  'Integrity: broken at step 4 — Link to the previous step is broken (a step was deleted, reordered or edited)',
  'Not sealed yet: the manifest can still change. 2 signed step(s) verified.',
  'Integrity broken at step 4: Signature is not valid for this step.',
  'Integrity broken: the data changed after it was signed.',
  'Manifest changed after sealing (line 2: line was edited after sealing).',
  'Paid ¥15,350 but declared ¥14,350 (7% gap).',
  'Seller has not confirmed 1 payment(s): the goods and amount are signed by the trader only.',
  '1 line(s) priced outside the usual value band (line 2): Unit price ¥0.80 is far below the usual ¥5.00–¥150.00 for earphones / headphones (possible under-invoicing).',
  'Location at khunjerab did not match the expected place (consistency signal).',
  'New trader: 0 cleared shipment(s) so far, fewer than 3.',
  'Trusted trader (trust score 85) lowers risk.',
  'Unit price ¥0.80 is far below the usual ¥5.00–¥150.00 for earphones / headphones (possible under-invoicing)',
  'Unit price ¥900.00 is above the usual ¥5.00–¥150.00 for earphones / headphones (check the price)',
  'Line total ¥320.00 does not equal 400 × ¥0.90; Unit price ¥0.90 is far below the usual ¥5.00–¥150.00 for earphones / headphones (possible under-invoicing)',
  'Step 3 is missing or out of order',
  'Line was deleted after sealing',
]

async function tFor(lng: string) {
  const i = i18next.createInstance()
  await i.init({
    lng, fallbackLng: 'en', interpolation: { escapeValue: false },
    resources: Object.fromEntries(Object.entries(serverTextLocales).map(([l, v]) => [l, { translation: v }])),
  })
  return i.t
}

describe('localizeServerText', () => {
  it('reproduces every English sentence exactly', async () => {
    const t = await tFor('en')
    for (const s of SENTENCES) expect(localizeServerText(t, s)).toBe(s)
  })

  it('translates every sentence into Urdu and Chinese, keeping the numbers', async () => {
    for (const lng of ['ur', 'zh']) {
      const t = await tFor(lng)
      for (const s of SENTENCES) {
        const out = localizeServerText(t, s)
        expect(out, `${lng}: ${s}`).not.toBe(s)
        expect(out, `${lng}: ${s}`).not.toMatch(/\b(the|was|after|is|for|earphones|headphones)\b/) // no English words left over
        for (const n of s.match(/¥[\d,.]+|\b\d+\b/g) ?? []) expect(out, `${lng}: ${s}`).toContain(n)
      }
    }
  })

  it('leaves unknown text untouched', async () => {
    const t = await tFor('ur')
    expect(localizeServerText(t, 'Something new from the server')).toBe('Something new from the server')
  })
})
