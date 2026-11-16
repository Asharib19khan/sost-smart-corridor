import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../shared/api'
import { when } from './lib/format'
import { traderName, type QueueRow } from './lib/types'
import { useAsync } from './lib/useAsync'
import { Empty, ErrorBox, Loading, Pill, RiskBadge } from './lib/ui'

const REFRESH_MS = 10_000

export default function Queue() {
  const { t } = useTranslation()
  const q = useAsync(() => api<QueueRow[]>('/customs/queue'), 'queue')
  const [lastAt, setLastAt] = useState<Date | null>(null)
  const { reload } = q

  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, REFRESH_MS)
    return () => clearInterval(iv)
  }, [reload])
  useEffect(() => {
    if (q.data) setLastAt(new Date())
  }, [q.data])

  // Broken integrity first (a raw DB edit does not update the stored score), then highest risk.
  const rows = useMemo(() => [...(q.data ?? [])].sort((a, b) =>
    Number(a.integrity_ok) - Number(b.integrity_ok) || (b.risk.score ?? 0) - (a.risk.score ?? 0)), [q.data])

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-base font-semibold">{t('customs.queue.title')}</h1>
        <span className="text-xs text-muted">
          {t('customs.queue.autoRefresh')}
          {lastAt ? ` · ${t('customs.queue.updated', { time: lastAt.toLocaleTimeString('en-GB') })}` : ''}
        </span>
        <button className="btn ms-auto" onClick={() => void reload()} disabled={q.loading} aria-busy={q.loading}>
          {t('customs.queue.refresh')}
        </button>
      </div>
      {q.error ? <ErrorBox message={q.error} onRetry={() => void reload()} /> : null}
      {!q.data && q.loading ? <Loading /> : null}
      {q.data && rows.length === 0 ? <div className="mt-3"><Empty>{t('customs.queue.empty')}</Empty></div> : null}
      {rows.length > 0 ? (
        <div className="tbl-wrap mt-3">
          <table className="tbl" data-testid="queue">
            <thead>
              <tr>
                <th>{t('customs.queue.risk')}</th>
                <th>{t('customs.queue.ref')}</th>
                <th>{t('customs.queue.trader')}</th>
                <th>{t('customs.queue.state')}</th>
                <th>{t('customs.queue.integrity')}</th>
                <th>{t('customs.queue.reason')}</th>
                <th>{t('customs.queue.arrived')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><RiskBadge score={r.risk.score} band={r.risk.band} /></td>
                  <td className="mono">
                    <Link className="text-accent underline" to={`/c/s/${r.id}`}>{r.ref}</Link>
                  </td>
                  <td>{traderName(r.trader)}</td>
                  <td>{t(`common.state.${r.state}`, { defaultValue: r.state })}</td>
                  <td>
                    <Pill ok={r.integrity_ok}>{r.integrity_ok ? t('customs.integrity.verified') : t('customs.integrity.brokenShort')}</Pill>
                  </td>
                  <td className="max-w-[28rem]">{r.risk.reasons[0] ?? <span className="text-muted">—</span>}</td>
                  <td className="num">{when(r.arrived_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  )
}
