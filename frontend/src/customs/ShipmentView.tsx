import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { api, API_BASE, downloadJson, getSession } from '../shared/api'
import { fen, paisa, when, lag, lagSeconds } from './lib/format'
import { checkStep, type LocalCheck } from './lib/stepCheck'
import type { Duty, Line, ShipmentDetail, Step, VerifyReport } from './lib/types'
import { useAsync } from './lib/useAsync'
import { Empty, ErrorBox, Loading, Pill, RiskBadge, Section } from './lib/ui'
import DecisionPanel from './DecisionPanel'
import { localizeServerText } from '../shared/serverText'

export default function ShipmentView() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const ship = useAsync(() => api<ShipmentDetail>(`/shipments/${encodeURIComponent(id)}`), `s:${id}`)
  const ver = useAsync(() => api<VerifyReport>(`/verify/${encodeURIComponent(id)}`, { auth: false }), `v:${id}`)
  const duty = useAsync(() => api<Duty>(`/shipments/${encodeURIComponent(id)}/duty`), `d:${id}`)

  const reloadAll = async () => {
    await Promise.all([ship.reload(), ver.reload(), duty.reload()])
  }

  if (!ship.data && ship.loading) return <Loading />
  if (!ship.data) return <ErrorBox message={ship.error ?? t('customs.ship.notFound')} onRetry={() => void ship.reload()} />
  const s = ship.data
  const problems = new Map((ver.data?.manifest.problems ?? []).map((p) => [p.line_no, p.problem]))
  const steps = ver.data?.chain.steps ?? s.events ?? []

  return (
    <>
      <div className="mb-3 text-xs text-muted">
        <Link to="/c" className="underline">{t('customs.ui.navQueue')}</Link> / <span className="mono">{s.ref}</span>
      </div>
      <IntegrityBanner report={ver.data} error={ver.error} loading={ver.loading} onRetry={() => void ver.reload()} />

      <div className="mt-4 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
        <span className="text-muted">{t('customs.queue.ref')}</span><span className="mono">{s.ref}</span>
        <span className="text-muted">{t('customs.queue.trader')}</span><span>{s.trader?.name}</span>
        <span className="text-muted">{t('customs.queue.state')}</span><span>{t(`common.state.${s.state}`, { defaultValue: s.state })}</span>
        <span className="text-muted">{t('customs.ship.created')}</span><span className="mono">{when(s.created_at)}</span>
      </div>

      <div className="grid gap-x-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Section title={t('customs.ship.manifest')} aside={ver.data?.manifest.current_hash ? <span className="mono">{ver.data.manifest.current_hash.slice(0, 16)}…</span> : null}>
            <ManifestTable lines={s.lines} problems={problems} />
          </Section>
          <Section title={t('customs.ship.chain')} aside={t('customs.ship.browserCheckNote')}>
            <ChainTable steps={steps} />
          </Section>
          <Section title={t('customs.ship.payments')}>
            <Payments rows={s.payments} steps={steps} />
          </Section>
          <Section title={t('customs.ship.receipts')}>
            <Receipts receipts={s.receipts} />
          </Section>
        </div>
        <aside className="min-w-0">
          <Section title={t('customs.ship.decision')}>
            <DecisionPanel shipment={s} onDone={reloadAll} />
          </Section>
          <Section title={t('customs.ship.risk')}>
            {s.risk ? (
              <div className="text-sm">
                <RiskBadge score={s.risk.score} band={s.risk.band} />
                <ol className="mt-2 list-decimal ps-5">
                  {s.risk.reasons.slice(0, 3).map((r) => <li key={r}>{localizeServerText(t, r)}</li>)}
                </ol>
                {s.risk.reasons.length === 0 ? <p className="mt-2 text-muted">{t('customs.ship.noReasons')}</p> : null}
              </div>
            ) : <Empty>{t('customs.ship.noRisk')}</Empty>}
          </Section>
          <Section title={t('customs.ship.duty')} aside={duty.data?.fx_label}>
            {duty.error ? <ErrorBox message={duty.error} onRetry={() => void duty.reload()} /> : null}
            {!duty.data && duty.loading ? <Loading /> : null}
            {duty.data ? <DutyTable d={duty.data} /> : null}
            {duty.data ? <GdButton id={id} ref_={s.ref} /> : null}
          </Section>
        </aside>
      </div>
    </>
  )
}

function IntegrityBanner({ report, error, loading, onRetry }: { report?: VerifyReport; error: string | null; loading: boolean; onRetry: () => void }) {
  const { t } = useTranslation()
  if (!report) {
    if (error) return <ErrorBox message={`${t('customs.integrity.unknown')} ${error}`} onRetry={onRetry} />
    return <div className="rounded border border-line bg-surface px-3 py-2 text-sm text-muted">{loading ? t('customs.integrity.checking') : ''}</div>
  }
  const ok = report.overall.ok
  return (
    <div
      role="status"
      data-testid="integrity-banner"
      className={`flex items-center gap-3 rounded border px-3 py-2 text-sm font-semibold ${ok ? 'border-ok bg-ok-soft text-ok' : 'border-bad bg-bad-soft text-bad'}`}
    >
      <span>{localizeServerText(t, report.overall.message)}</span>
      <button className="ms-auto text-xs font-normal underline" onClick={onRetry} disabled={loading}>
        {loading ? t('common.loading') : t('customs.integrity.recheck')}
      </button>
    </div>
  )
}

function ManifestTable({ lines, problems }: { lines: Line[]; problems: Map<number, string> }) {
  const { t } = useTranslation()
  if (!lines?.length) return <Empty>{t('customs.ship.noLines')}</Empty>
  const total = lines.reduce((a, l) => a + l.total_fen, 0)
  return (
    <div className="tbl-wrap">
      <table className="tbl" data-testid="manifest">
        <thead>
          <tr>
            <th>#</th><th>{t('customs.ship.item')}</th><th>HS</th><th className="num">{t('customs.ship.qty')}</th>
            <th className="num">{t('customs.ship.unitPrice')}</th><th className="num">{t('customs.ship.total')}</th><th>{t('customs.ship.flags')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const p = problems.get(l.line_no)
            return (
              <tr key={l.id} className={p ? 'row-bad' : ''}>
                <td className="num">{l.line_no}</td>
                <td>
                  <div className="zh" lang="zh">{l.item_zh ?? '—'}</div>
                  <div className="text-xs text-muted">{l.item_en}</div>
                  {p ? <div className="mt-1 text-xs font-semibold">{localizeServerText(t, p)}</div> : null}
                </td>
                <td className="mono">{l.hs_code ?? '—'}</td>
                <td className="num">{l.qty} {l.unit ?? ''}</td>
                <td className="num">{fen(l.unit_price_fen)}</td>
                <td className="num">{fen(l.total_fen)}</td>
                <td>{l.value_flag ? <Pill ok={false}>{localizeServerText(t, l.value_flag)}</Pill> : <span className="text-muted">—</span>}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr><td colSpan={5} className="text-end text-xs text-muted">{t('customs.ship.total')}</td><td className="num font-semibold">{fen(total)}</td><td /></tr>
        </tfoot>
      </table>
    </div>
  )
}

function ChainTable({ steps }: { steps: Step[] }) {
  const { t } = useTranslation()
  const [checks, setChecks] = useState<Record<number, LocalCheck>>({})
  const sig = steps.map((s) => `${s.seq}:${s.hash ?? ''}:${s.signature ?? ''}`).join('|')
  useEffect(() => {
    let live = true
    setChecks({})
    void Promise.all(steps.map(async (s) => [s.seq, await checkStep(s)] as const)).then((r) => {
      if (live) setChecks(Object.fromEntries(r))
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  if (!steps.length) return <Empty>{t('customs.ship.noSteps')}</Empty>
  return (
    <div className="tbl-wrap">
      <table className="tbl" data-testid="chain">
        <thead>
          <tr>
            <th>#</th><th>{t('customs.ship.step')}</th><th>{t('customs.ship.signer')}</th><th>{t('customs.ship.signedAt')}</th>
            <th>{t('customs.ship.receivedAt')}</th><th>{t('customs.ship.location')}</th><th>{t('customs.ship.server')}</th><th>{t('customs.ship.browser')}</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s) => {
            const c = checks[s.seq]
            return (
              <tr key={s.seq} className={s.ok ? '' : 'row-bad'}>
                <td className="num">{s.seq + 1}</td>
                <td>
                  <div className="font-medium">{t(`customs.step.${s.type}`, { defaultValue: s.type })}{s.payload && typeof s.payload.checkpoint === 'string' ? ` · ${t(`customs.step.${s.payload.checkpoint}`, { defaultValue: s.payload.checkpoint })}` : ''}{s.payload && typeof s.payload.decision === 'string' ? ` · ${t(`customs.step.${s.payload.decision}`, { defaultValue: s.payload.decision })}` : ''}</div>
                  {s.flags?.length ? <div className="mt-1 flex flex-wrap gap-1">{s.flags.map((f) => <Pill key={f} ok={false}>{f}</Pill>)}</div> : null}
                  {s.problem ? <div className="mt-1 text-xs font-semibold">{localizeServerText(t, s.problem)}</div> : null}
                </td>
                <td>
                  {s.signer ? <>{s.signer.name} <span className="text-xs text-muted">({s.signer.role})</span>{s.signer.revoked ? <> <Pill ok={false}>{t('customs.ship.revoked')}</Pill></> : null}</> : '—'}
                </td>
                <td className="num">{when(s.signed_at)}</td>
                <td className="num">{when(s.received_at)} <span className="text-xs text-muted">{lag(lagSeconds(s.signed_at, s.received_at))}</span></td>
                <td className="num">{s.lat != null && s.lng != null ? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : '—'}</td>
                <td className="whitespace-nowrap"><Pill ok={s.ok}>{s.ok ? 'ok' : t('customs.integrity.brokenShort')}</Pill></td>
                <td title={c?.note} className="whitespace-nowrap">
                  {c ? <Pill ok={c.state === 'na' ? null : c.state === 'ok'}>{c.state === 'ok' ? t('customs.ship.sigOk') : c.state === 'bad' ? t('customs.ship.sigBad') : t('customs.ship.sigNa')}</Pill> : <span className="text-xs text-muted">…</span>}
                  {c && c.state !== 'ok' ? <div className="mt-1 max-w-56 whitespace-normal text-xs text-muted">{c.note}</div> : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Payments({ rows, steps }: { rows: Record<string, unknown>[]; steps: Step[] }) {
  const { t } = useTranslation()
  const confirms = steps.filter((s) => s.type === 'seller_confirmed')
  if (!rows?.length) return <Empty>{t('customs.ship.noPayments')}</Empty>
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>{t('customs.ship.seller')}</th><th className="num">{t('customs.ship.amount')}</th><th>{t('customs.ship.paidAt')}</th><th>{t('customs.ship.sellerConfirm')}</th></tr></thead>
        <tbody>
          {rows.map((p, i) => {
            const amount = p.amount_fen as number | undefined
            const sellerName = (p.seller_name ?? (p.seller as { shop_name_en?: string } | undefined)?.shop_name_en ?? p.seller_id ?? '—') as string
            const receiptId = p.receipt_id as string | undefined
            const conf = confirms.find((c) => (receiptId && c.payload?.receipt_id === receiptId) || c.payload?.amount_fen === amount)
            return (
              <tr key={(p.id as string) ?? i}>
                <td>{sellerName}</td>
                <td className="num">{fen(amount)}</td>
                <td className="num">{when((p.created_at ?? p.paid_at) as string | undefined)}</td>
                <td>{conf ? <Pill ok={conf.ok}>{t('customs.ship.confirmedBy', { name: conf.signer?.name ?? '—' })}</Pill> : <Pill ok={false}>{t('customs.ship.notConfirmed')}</Pill>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Receipts({ receipts }: { receipts: ShipmentDetail['receipts'] }) {
  const { t } = useTranslation()
  if (!receipts?.length) return <Empty>{t('customs.ship.noReceipts')}</Empty>
  return <div className="flex flex-wrap gap-3">{receipts.map((r) => <ReceiptImage key={r.id} id={r.id} status={r.status} />)}</div>
}

function ReceiptImage({ id, status }: { id: string; status: string }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let obj: string | null = null
    let live = true
    const s = getSession()
    fetch(`${API_BASE}/receipts/${encodeURIComponent(id)}/image`, { headers: s ? { Authorization: `Bearer ${s.access}` } : {} })
      .then(async (r) => {
        if (!r.ok) {
          let msg = `Image could not be loaded (${r.status}).`
          try { const j = await r.json(); if (typeof j.detail === 'string') msg = j.detail } catch { /* not JSON */ }
          throw new Error(msg)
        }
        return r.blob()
      })
      .then((b) => { if (live) { obj = URL.createObjectURL(b); setUrl(obj) } })
      .catch((e: Error) => { if (live) setErr(e.message) })
    return () => { live = false; if (obj) URL.revokeObjectURL(obj) }
  }, [id])
  return (
    <figure className="w-48 rounded border border-line bg-surface p-1">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={t('customs.ship.receiptAlt', { id })} className="h-56 w-full object-contain" /></a>
      ) : (
        <div className="flex h-56 items-center justify-center p-2 text-center text-xs text-muted">{err ?? t('common.loading')}</div>
      )}
      <figcaption className="mt-1 flex justify-between text-xs text-muted"><span className="mono">{id.slice(0, 8)}</span><span>{status}</span></figcaption>
    </figure>
  )
}

function DutyTable({ d }: { d: Duty }) {
  const { t } = useTranslation()
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>#</th><th>HS</th><th className="num">{t('customs.ship.value')}</th><th className="num">{t('customs.ship.dutyCol')}</th><th className="num">{t('customs.ship.salesTax')}</th><th className="num">{t('customs.ship.wht')}</th></tr></thead>
        <tbody>
          {d.lines.map((l) => (
            <tr key={l.line_no}>
              <td className="num">{l.line_no}</td><td className="mono">{l.hs_code}</td><td className="num">{paisa(l.value_paisa)}</td>
              <td className="num">{paisa(l.duty_paisa + l.acd_paisa + l.rd_paisa)}<span className="block text-xs text-muted">CD {l.duty_pct}%{l.acd_pct ? ` · ACD ${l.acd_pct}%` : ''}{l.rd_pct ? ` · RD ${l.rd_pct}%` : ''}</span></td>
              <td className="num">{paisa(l.sales_tax_paisa)}</td><td className="num">{paisa(l.wht_paisa)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={5} className="text-end text-xs text-muted">{t('customs.ship.dutyTotal')}</td><td className="num font-semibold">{paisa(d.total_paisa)}</td></tr></tfoot>
      </table>
      <p className="px-2 py-1 text-xs text-muted">{t('customs.ship.fx', { rate: String(d.fx_cny_pkr) })}</p>
    </div>
  )
}

function GdButton({ id, ref_ }: { id: string; ref_: string }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const get = async () => {
    setBusy(true); setErr(null)
    try { downloadJson(`GD-${ref_}.json`, await api(`/shipments/${encodeURIComponent(id)}/declaration`)) }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="mt-3">
      <button className="btn" onClick={() => void get()} disabled={busy} aria-busy={busy}>{t('customs.ship.gd')}</button>
      <p className="mt-1 text-xs text-muted">{t('customs.ship.gdNote')}</p>
      {err ? <p className="mt-1 text-xs text-bad" role="alert">{err}</p> : null}
    </div>
  )
}
