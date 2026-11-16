import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, setSession } from '../../shared/api'
import { fen } from '../lib/money'
import { useSession } from '../lib/session'
import type { ShipmentSummary } from '../lib/types'
import { Button, ErrorBox, Loading, RiskDot, Shell, StateLabel, errText, useLoad } from '../lib/ui'

export default function Home() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const s = useSession()
  const list = useLoad(() => api<ShipmentSummary[]>('/shipments'), [])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const isTrader = s?.user.role === 'trader'

  const create = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await api<{ id: string }>('/shipments', { method: 'POST' })
      nav(`s/${r.id}`)
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Shell
      title={<>{t('trader.home.hello')}<span className="block text-lg font-normal text-muted">{s?.user.name}</span></>}
      aside={<button className="min-h-12 px-3 text-sm text-muted" onClick={() => setSession(null)}>{t('trader.home.logout')}</button>}
    >
      {isTrader && <Button busy={busy} onClick={() => void create()}>{t('trader.home.new')}</Button>}
      {err && <ErrorBox message={err} />}

      <div className="mt-10 flex items-baseline justify-between border-b border-fg pb-2">
        <h2 className="text-lg font-semibold">{isTrader ? t('trader.home.mine') : t('trader.home.assigned')}</h2>
        {isTrader && <Link to="wallet" className="flex min-h-12 items-center text-accent">{t('trader.home.wallet')}</Link>}
      </div>
      {list.loading && !list.data ? <Loading /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : !list.data?.length ? (
        <p className="py-8 text-muted">{isTrader ? t('trader.home.empty') : t('trader.home.emptyDriver')}</p>
      ) : (
        <ul>
          {list.data.map((sh) => (
            <li key={sh.id} className="border-b border-line">
              <Link to={`s/${sh.id}`} className="flex min-h-16 items-center justify-between gap-3 py-3 hover:bg-sunken">
                <span className="min-w-0">
                  <span className="block font-mono text-[0.95rem]" dir="ltr">{sh.ref}</span>
                  <StateLabel state={sh.state} />
                </span>
                <span className="text-end">
                  <span className="block font-semibold tabular-nums" dir="ltr">{fen(sh.total_fen)}</span>
                  <RiskDot band={sh.risk?.band} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  )
}
