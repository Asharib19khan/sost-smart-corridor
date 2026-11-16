import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../shared/api'
import { fen } from '../lib/money'
import type { ShipmentDetail } from '../lib/types'
import { CheckIcon, ChevronEnd, ErrorBox, LinkButton, Loading, Notice, RiskDot, Row, Shell, StateLabel, useLoad } from '../lib/ui'
import { localizeServerText } from '../../shared/serverText'

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
            <ul className="mt-4 text-sm text-muted">{s.risk.reasons.map((r) => <li key={r} className="py-1">{localizeServerText(t, r)}</li>)}</ul>
          ) : null}
          <Steps s={s} current={act?.key} />
        </>
      )}
    </Shell>
  )
}

const ORDER = ['draft', 'paid', 'sealed', 'departed_kashgar', 'crossed_khunjerab', 'arrived_sost', 'cleared']
const STEPS = ['scan', 'review', 'pay', 'seal', 'track'] as const

/** The journey as a checklist: done steps are ticked, the next one is marked, every step stays reachable. */
function Steps({ s, current }: { s: ShipmentDetail; current?: string }) {
  const { t } = useTranslation()
  const at = s.state === 'held' ? ORDER.indexOf('arrived_sost') : ORDER.indexOf(s.state)
  const done: Record<(typeof STEPS)[number], boolean> = {
    scan: s.receipts.some((r) => r.status === 'done'),
    review: at >= 1,
    pay: s.payments.length > 0,
    seal: at >= 2,
    track: at >= 5,
  }
  return (
    <nav aria-label={t('trader.hub.title')} className="mt-10">
      <ol>
        {STEPS.map((k, i) => {
          const isCur = current === k
          return (
            <li key={k} className="relative">
              {i < STEPS.length - 1 && <span aria-hidden className={`absolute start-[11px] top-9 h-[calc(100%-1.5rem)] w-px ${done[k] ? 'bg-accent' : 'bg-line'}`} />}
              <Link to={k} aria-current={isCur ? 'step' : undefined}
                className="group flex min-h-14 items-center gap-4 rounded-md pe-2 hover:bg-sunken">
                <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${done[k] ? 'border-accent bg-accent text-accent-fg' : isCur ? 'border-accent bg-surface' : 'border-line bg-canvas'}`}>
                  {done[k] ? <CheckIcon className="size-3.5" /> : isCur ? <span className="size-2 rounded-full bg-accent" /> : null}
                </span>
                <span className={`flex-1 ${isCur ? 'font-semibold text-fg' : done[k] ? 'text-fg' : 'text-muted'}`}>{t(`trader.hub.link.${k}`)}</span>
                <ChevronEnd className="text-muted transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Link>
            </li>
          )
        })}
      </ol>
      <Link to="duty" className="mt-4 flex min-h-12 items-center justify-between border-t border-line pt-1 text-accent">
        {t('trader.hub.link.duty')}<ChevronEnd />
      </Link>
    </nav>
  )
}
