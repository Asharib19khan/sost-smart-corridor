import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../shared/api'
import { fen } from '../lib/money'
import type { ShipmentDetail } from '../lib/types'
import { ErrorBox, LinkButton, Loading, Notice, RiskDot, Row, Shell, StateLabel, useLoad } from '../lib/ui'

/** The single next step, derived from the server's allowed_next plus what is on file. */
export function nextAction(s: ShipmentDetail): { key: string; to: string } | null {
  const next = s.allowed_next ?? []
  if (s.state === 'draft' || next.includes('paid')) {
    if (!s.receipts.length) return { key: 'scan', to: 'scan' }
    if (s.receipts.some((r) => r.status !== 'done' && r.status !== 'failed') || !s.lines.length) return { key: 'scan', to: 'scan' }
    return { key: 'review', to: 'review' }
  }
  if (next.includes('sealed')) return { key: 'seal', to: 'seal' }
  if (next.some((n) => ['departed_kashgar', 'crossed_khunjerab', 'arrived_sost'].includes(n))) return { key: 'track', to: 'track' }
  return null
}

export default function Hub() {
  const { id } = useParams()
  const { t } = useTranslation()
  const q = useLoad(() => api<ShipmentDetail>(`/shipments/${id}`), [id])
  const s = q.data
  const act = s && nextAction(s)

  return (
    <Shell back="/t" title={s ? <span className="font-mono" dir="ltr">{s.ref}</span> : t('trader.hub.title')}>
      {q.loading && !s ? <Loading /> : q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : s && (
        <>
          <div className="mb-8 flex items-center justify-between">
            <StateLabel state={s.state} />
            <RiskDot band={s.risk?.band} />
          </div>
          {act ? (
            <>
              <p className="mb-3 text-muted">{t('trader.hub.next')}</p>
              <LinkButton to={act.to}>{t(`trader.hub.do.${act.key}`)}</LinkButton>
            </>
          ) : (
            <Notice tone={s.state === 'held' ? 'bad' : s.state === 'cleared' ? 'ok' : 'info'} title={t(`trader.hub.end.${s.state}`, { defaultValue: t('trader.hub.end.other') })} />
          )}
          <div className="mt-10">
            <Row label={t('trader.hub.receipts')}>{s.receipts.length}</Row>
            <Row label={t('trader.hub.lines')}>{s.lines.length}</Row>
            <Row label={t('trader.hub.total')}><span dir="ltr">{fen(s.lines.reduce((a, l) => a + l.total_fen, 0))}</span></Row>
          </div>
          {s.risk?.reasons?.length ? (
            <ul className="mt-4 text-sm text-muted">{s.risk.reasons.map((r) => <li key={r} className="py-1">{r}</li>)}</ul>
          ) : null}
          <nav className="mt-8 grid grid-cols-2 gap-x-6 text-accent sm:grid-cols-3">
            {(['scan', 'review', 'pay', 'seal', 'track'] as const).map((k) => (
              <Link key={k} to={k} className="flex min-h-12 items-center border-b border-line">{t(`trader.hub.link.${k}`)}</Link>
            ))}
            <Link to="duty" className="flex min-h-12 items-center border-b border-line">{t('trader.hub.link.duty')}</Link>
          </nav>
        </>
      )}
    </Shell>
  )
}
