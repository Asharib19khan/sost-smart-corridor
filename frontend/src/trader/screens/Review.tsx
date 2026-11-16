import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../shared/api'
import { fen, parseYuan } from '../lib/money'
import { pct, type ManifestLine, type ShipmentDetail } from '../lib/types'
import { Button, ErrorBox, LinkButton, Loading, Notice, Shell, errText, useLoad } from '../lib/ui'
import { localizeServerText } from '../../shared/serverText'

/** Every line the AI read, in three languages, with HS code and confidence. Fixing a line is a signed-off edit (audited). */
export default function Review() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const ship = useLoad(() => api<ShipmentDetail>(`/shipments/${id}`), [id])
  const lines = useLoad(() => api<ManifestLine[]>(`/shipments/${id}/lines`), [id])
  const [edit, setEdit] = useState<string | null>(null)
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [hs, setHs] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const editable = ship.data?.state === 'draft' || ship.data?.state === 'paid'
  const total = (lines.data ?? []).reduce((a, l) => a + l.total_fen, 0)

  const start = (l: ManifestLine) => { setEdit(l.id); setQty(String(l.qty)); setPrice((l.unit_price_fen / 100).toFixed(2)); setHs(l.hs_code); setErr(null) }
  const save = async (l: ManifestLine) => {
    const p = parseYuan(price)
    const q = Number(qty)
    if (p == null || !Number.isInteger(q) || q <= 0) { setErr(t('trader.review.badNumber')); return }
    setBusy(true); setErr(null)
    try {
      await api(`/manifest-lines/${l.id}`, { method: 'PATCH', body: { qty: q, unit_price_fen: p, hs_code: hs.trim() } })
      setEdit(null)
      await Promise.all([lines.reload(), ship.reload()])
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const name = (l: ManifestLine) => (i18n.language === 'ur' ? l.item_ur : i18n.language === 'zh' ? l.item_zh : l.item_en) || l.item_en || l.item_zh

  return (
    <Shell back={`/t/s/${id}`} title={t('trader.review.title')}>
      {lines.loading && !lines.data ? <Loading /> : lines.error ? <ErrorBox message={lines.error} onRetry={lines.reload} /> : !lines.data?.length ? (
        <Notice tone="info" title={t('trader.review.empty')} action={<LinkButton to={`/t/s/${id}/scan`}>{t('trader.hub.do.scan')}</LinkButton>} />
      ) : (
        <>
          <p className="mb-4 text-muted">{t('trader.review.intro')}</p>
          <ul>
            {lines.data.map((l) => (
              <li key={l.id} className="border-b border-line py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{name(l)}</p>
                    <p className="text-sm text-muted" lang="zh">{l.item_zh}</p>
                    <p className="mt-1 text-sm text-muted">HS <span dir="ltr" className="font-mono">{l.hs_code}</span> · {t('trader.review.confidence', { pct: pct(l.hs_confidence) })}</p>
                  </div>
                  <div className="text-end" dir="ltr">
                    <p className="font-semibold tabular-nums">{fen(l.total_fen)}</p>
                    <p className="text-sm text-muted tabular-nums">{l.qty} {l.unit} × {fen(l.unit_price_fen)}</p>
                  </div>
                </div>
                {l.value_flag && <Notice tone="warn" title={t('trader.review.valueFlag')}>{localizeServerText(t, l.value_flag)}</Notice>}
                {pct(l.hs_confidence) < 70 && <p className="mt-2 text-sm text-warn">{t('trader.review.lowConf')}</p>}
                {editable && edit !== l.id && <Button kind="quiet" onClick={() => start(l)}>{t('trader.review.edit')}</Button>}
                {edit === l.id && (
                  <div className="mt-3 grid grid-cols-3 gap-2" dir="ltr">
                    <label className="text-sm">{t('trader.review.qty')}<input inputMode="numeric" className="mt-1 min-h-12 w-full rounded-md border border-line bg-surface px-2" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
                    <label className="text-sm">{t('trader.review.price')}<input inputMode="decimal" className="mt-1 min-h-12 w-full rounded-md border border-line bg-surface px-2" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
                    <label className="text-sm">HS<input inputMode="numeric" className="mt-1 min-h-12 w-full rounded-md border border-line bg-surface px-2" value={hs} onChange={(e) => setHs(e.target.value)} /></label>
                    <div className="col-span-3 flex gap-2">
                      <Button busy={busy} onClick={() => void save(l)}>{t('trader.review.save')}</Button>
                      <Button kind="secondary" onClick={() => setEdit(null)}>{t('trader.review.cancel')}</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {err && <ErrorBox message={err} />}
          <div className="flex items-baseline justify-between py-4 text-lg font-semibold"><span>{t('trader.hub.total')}</span><span dir="ltr">{fen(total)}</span></div>
          <LinkButton to={`/t/s/${id}/pay`}>{t('trader.review.next')}</LinkButton>
        </>
      )}
    </Shell>
  )
}
