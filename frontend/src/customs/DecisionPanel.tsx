import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, getSession } from '../shared/api'
import { isoNow, newNonce, signEnvelope } from '../shared/crypto/envelope'
import { ensureDeviceKey } from './lib/useDeviceKey'
import type { ShipmentDetail } from './lib/types'
import { ErrorBox } from './lib/ui'

type Decision = 'approve' | 'hold' | 'request_docs'

/** Officer signs the decision with this browser's key; the server only verifies and records it. */
export default function DecisionPanel({ shipment, onDone }: { shipment: ShipmentDetail; onDone: () => Promise<void> | void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<Decision | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const open = shipment.state === 'arrived_sost' || shipment.state === 'held'

  const decide = async (decision: Decision) => {
    setErr(null); setOk(false)
    if (!reason.trim()) { setErr(t('customs.decide.reasonNeeded')); return }
    const user = getSession()?.user
    if (!user) return
    setBusy(decision)
    try {
      const key = await ensureDeviceKey(user.id, 'Customs console')
      const fixed = { signed_at: isoNow(), nonce: newNonce() }
      for (let attempt = 0; ; attempt++) {
        const head = await api<{ seq: number; prev_hash: string }>(`/shipments/${shipment.id}/chain/head`)
        const { envelope, signature } = await signEnvelope(key, head, {
          shipment_id: shipment.id, type: 'customs_decision', payload: { decision, reason: reason.trim() },
          lat_e6: null, lng_e6: null, ...fixed,
        })
        try {
          await api(`/customs/${shipment.id}/decision`, { body: { envelope, signature } })
          break
        } catch (e) {
          if (attempt < 3 && /chain moved on/i.test((e as Error).message)) continue
          throw e
        }
      }
      setOk(true); setReason('')
      await onDone()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(null) }
  }

  if (!open) return <p className="text-sm text-muted">{t('customs.decide.closed')} ({t('customs.decide.current')}: {t(`common.state.${shipment.state}`, { defaultValue: shipment.state })})</p>
  return (
    <div className="text-sm">
      <label className="block">
        <span className="text-muted">{t('customs.decide.reason')}</span>
        <textarea className="field mt-1 w-full" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!!busy} onClick={() => void decide('approve')}>{busy === 'approve' ? t('customs.decide.signing') : t('customs.decide.approve')}</button>
        <button className="btn btn-bad" disabled={!!busy} onClick={() => void decide('hold')}>{busy === 'hold' ? t('customs.decide.signing') : t('customs.decide.hold')}</button>
        <button className="btn" disabled={!!busy} onClick={() => void decide('request_docs')}>{t('customs.decide.docs')}</button>
      </div>
      {err ? <ErrorBox message={err} /> : null}
      {ok ? <p role="status" className="mt-2 text-ok">{t('customs.decide.done')}</p> : null}
    </div>
  )
}
