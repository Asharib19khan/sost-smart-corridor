import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../shared/api'
import { fen, paisa } from '../lib/money'
import { useSession } from '../lib/session'
import { Button, ErrorBox, Loading, Notice, Row, Shell, errText, useLoad } from '../lib/ui'
import { when } from '../../customs/lib/format'

interface WalletT {
  label: string; balances: { CNY: number; PKR: number }; credit_limit_paisa: number; duty_paid_paisa: number
  entries: { txn_id: string; kind: string; memo: string; at: string; currency: string; amount_minor: number; shipment_ref: string | null }[]
}
interface TrustReason { delta: number; reason: string; at?: string; shipment_ref?: string | null }
interface Trust { score: number; reasons: TrustReason[]; credit_limit_paisa: number; formula: string }
interface Duty { fx_label: string; total_paisa: number; lines: { line_no: number; hs_code: string; item_en?: string; value_paisa: number; duty_pct: number; duty_paisa: number; sales_tax_pct: number; sales_tax_paisa: number }[] }

export function Wallet() {
  const { t } = useTranslation()
  const s = useSession()
  const w = useLoad(() => api<WalletT>('/wallet'), [])
  const tr = useLoad(() => api<Trust>(`/trust/${s?.user.id}`), [s?.user.id])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const topup = async (currency: 'CNY' | 'PKR', amount: number) => {
    setBusy(currency); setErr(null)
    try { await api('/wallet/topup', { body: { currency, amount_minor: amount } }); await w.reload() } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }
  return (
    <Shell back="/t" title={t('trader.wallet.title')}>
      <Notice tone="info" title={t('trader.pay.sandbox')}>{w.data?.label ?? t('trader.pay.sandboxNote')}</Notice>
      {w.loading && !w.data ? <Loading /> : w.error ? <ErrorBox message={w.error} onRetry={w.reload} /> : w.data && (
        <>
          <Row label="CNY"><span dir="ltr">{fen(w.data.balances.CNY)}</span></Row>
          <Row label="PKR"><span dir="ltr">{paisa(w.data.balances.PKR)}</span></Row>
          <Row label={t('trader.wallet.credit')}><span dir="ltr">{paisa(w.data.credit_limit_paisa)}</span></Row>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Button kind="secondary" busy={busy === 'CNY'} onClick={() => void topup('CNY', 5_000_000)}>{t('trader.wallet.addCny')}</Button>
            <Button kind="secondary" busy={busy === 'PKR'} onClick={() => void topup('PKR', 50_000_000)}>{t('trader.wallet.addPkr')}</Button>
          </div>
          {err && <ErrorBox message={err} />}
          {tr.data && (
            <div className="mt-8">
              <h2 className="border-b border-fg pb-2 text-lg font-semibold">{t('trader.wallet.trust', { score: tr.data.score })}</h2>
              <p className="py-2 text-sm text-muted" dir="ltr">{tr.data.formula}</p>
              <ul className="text-sm">{tr.data.reasons.map((r, i) => (
                <li key={`${r.at ?? i}-${i}`} className="flex items-baseline justify-between gap-3 border-b border-line py-2">
                  <span className="min-w-0">{r.reason}{r.shipment_ref && !r.reason.includes(r.shipment_ref) ? <span className="text-muted" dir="ltr"> · {r.shipment_ref}</span> : null}</span>
                  <span dir="ltr" className={`shrink-0 font-semibold tabular-nums ${r.delta >= 0 ? 'text-ok' : 'text-bad'}`}>{r.delta >= 0 ? '+' : '−'}{Math.abs(r.delta)}</span>
                </li>
              ))}</ul>
            </div>
          )}
          <h2 className="mt-8 border-b border-fg pb-2 text-lg font-semibold">{t('trader.wallet.history')}</h2>
          {!w.data.entries.length ? <p className="py-6 text-muted">{t('trader.wallet.none')}</p> : (
            <ul>{w.data.entries.map((e, i) => (
              <li key={`${e.txn_id}${i}`} className="flex items-baseline justify-between gap-3 border-b border-line py-3 text-sm">
                <span className="min-w-0"><span className="block font-medium">{e.memo || e.kind}</span><span className="text-muted" dir="ltr">{when(e.at)}{e.shipment_ref ? ` · ${e.shipment_ref}` : ''}</span></span>
                <span dir="ltr" className={`tabular-nums ${e.amount_minor < 0 ? 'text-bad' : 'text-ok'}`}>{e.currency === 'CNY' ? fen(e.amount_minor) : paisa(e.amount_minor)}</span>
              </li>
            ))}</ul>
          )}
        </>
      )}
    </Shell>
  )
}

export function DutyScreen() {
  const { id } = useParams()
  const { t } = useTranslation()
  const d = useLoad(() => api<Duty>(`/shipments/${id}/duty`), [id])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const pay = async () => {
    setBusy(true); setErr(null)
    try { await api(`/shipments/${id}/duty/pay`, { method: 'POST' }); setDone(true) } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Shell back={`/t/s/${id}`} title={t('trader.duty.title')}>
      {d.loading && !d.data ? <Loading /> : d.error ? <ErrorBox message={d.error} onRetry={d.reload} /> : d.data && (
        <>
          <Notice tone="info" title={t('trader.duty.indicative')}>{d.data.fx_label}</Notice>
          <ul>{d.data.lines.map((l) => (
            <li key={l.line_no} className="flex justify-between gap-4 border-b border-line py-3 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{l.item_en || `#${l.line_no}`}</span>
                <span className="block text-muted" dir="ltr">HS {l.hs_code} · {t('trader.duty.on', { value: paisa(l.value_paisa) })}</span>
                <span className="block text-muted" dir="ltr">{t('trader.duty.split', { duty: paisa(l.duty_paisa), dp: l.duty_pct, tax: paisa(l.sales_tax_paisa), tp: l.sales_tax_pct })}</span>
              </span>
              <span dir="ltr" className="shrink-0 font-semibold tabular-nums">{paisa(l.duty_paisa + l.sales_tax_paisa)}</span>
            </li>
          ))}</ul>
          <div className="flex items-baseline justify-between py-4 text-lg font-semibold"><span>{t('trader.duty.total')}</span><span dir="ltr">{paisa(d.data.total_paisa)}</span></div>
          {done ? <Notice tone="ok" title={t('trader.duty.paid')} /> : <Button busy={busy} onClick={() => void pay()}>{t('trader.duty.pay')}</Button>}
          {err && <ErrorBox message={err} />}
        </>
      )}
    </Shell>
  )
}
