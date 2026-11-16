import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../shared/api'
import { fen } from '../lib/money'
import type { Receipt, Seller, ShipmentDetail } from '../lib/types'
import { Button, ErrorBox, LinkButton, Loading, Notice, Shell, errText, useLoad } from '../lib/ui'

/** Upload a receipt photo; the server reads it in the background. We poll until it is done. */
export default function Scan() {
  const { id } = useParams()
  const { t } = useTranslation()
  const ship = useLoad(() => api<ShipmentDetail>(`/shipments/${id}`), [id])
  const sellers = useLoad(() => api<Seller[]>('/sellers'), [])
  const [sellerId, setSellerId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [active, setActive] = useState<Receipt | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const poll = (rid: string) => {
    const tick = async () => {
      try {
        const r = await api<Receipt>(`/receipts/${rid}`)
        setActive(r)
        if (r.status === 'processing' || r.status === 'queued') timer.current = window.setTimeout(() => void tick(), 2000)
        else void ship.reload()
      } catch (e) { setErr(errText(e)) }
    }
    void tick()
  }

  const upload = async () => {
    if (!file) return
    setBusy(true); setErr(null); setActive(null)
    try {
      const form = new FormData()
      form.append('file', file)
      if (sellerId) form.append('seller_id', sellerId)
      const r = await api<{ id: string }>(`/shipments/${id}/receipts`, { form, timeoutMs: 60000 })
      setFile(null)
      poll(r.id)
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  const working = active && (active.status === 'processing' || active.status === 'queued')
  return (
    <Shell back={`/t/s/${id}`} title={t('trader.scan.title')}>
      <p className="mb-6 text-muted">{t('trader.scan.intro')}</p>
      <label className="mb-4 block">
        <span className="mb-1 block text-sm font-medium">{t('trader.scan.seller')}</span>
        <select className="min-h-12 w-full rounded-md border border-line bg-surface px-3" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
          <option value="">{t('trader.scan.sellerNone')}</option>
          {sellers.data?.map((s) => <option key={s.id} value={s.id}>{s.shop_name_en} · {s.shop_name_zh} — {s.market}</option>)}
        </select>
      </label>
      <label className="mb-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-fg bg-surface px-4 text-center">
        <span className="font-semibold">{file ? file.name : t('trader.scan.pick')}</span>
        <span className="text-sm text-muted">{t('trader.scan.formats')}</span>
        <input data-testid="receipt-file" type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <Button busy={busy} disabled={!file || !!working} onClick={() => void upload()}>{t('trader.scan.upload')}</Button>
      {err && <ErrorBox message={err} />}

      {working && <Notice tone="info" title={t('trader.scan.reading')}>{t('trader.scan.readingNote')}</Notice>}
      {active?.status === 'failed' && <ErrorBox message={active.error ?? t('trader.scan.failed')} />}
      {active && !working && active.status !== 'failed' && (
        <Notice tone="ok" title={t('trader.scan.done', { n: active.lines.length, total: fen(active.total_fen) })}>
          {active.flags.length ? <ul className="mt-1 list-disc ps-5">{active.flags.map((f) => <li key={f}>{t(`trader.flag.${f}`, { defaultValue: f })}</li>)}</ul> : null}
        </Notice>
      )}

      <h2 className="mt-10 border-b border-fg pb-2 text-lg font-semibold">{t('trader.scan.onFile')}</h2>
      {ship.loading && !ship.data ? <Loading /> : !ship.data?.receipts.length ? <p className="py-6 text-muted">{t('trader.scan.none')}</p> : (
        <ul>{ship.data.receipts.map((r, i) => (
          <li key={r.id} className="flex min-h-12 items-center justify-between border-b border-line py-2">
            <span>{t('trader.scan.receiptN', { n: i + 1 })}</span><span className="text-muted">{r.status}</span>
          </li>
        ))}</ul>
      )}
      {!!ship.data?.lines.length && <div className="mt-6"><LinkButton to={`/t/s/${id}/review`}>{t('trader.scan.next')}</LinkButton></div>}
    </Shell>
  )
}
