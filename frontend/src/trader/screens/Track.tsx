import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../../shared/api'
import { newNonce, isoNow } from '../../shared/crypto/envelope'
import { ensureKey } from '../lib/device'
import { dropQueued, enqueue, flushQueue, listQueued, postCheckpoint, type QueuedCheckpoint } from '../lib/queue'
import { useSession } from '../lib/session'
import type { ShipmentDetail, Step } from '../lib/types'
import { CheckIcon, Button, ErrorBox, Loading, Notice, Shell, errText, useLoad } from '../lib/ui'
import { when } from '../../customs/lib/format'

const POINTS = ['kashgar', 'khunjerab', 'sost'] as const
// Labelled demo coordinates (inside each geofence) for presenting on a laptop with no GPS at the border.
const DEMO: Record<string, [number, number]> = { kashgar: [39.47, 75.99], khunjerab: [36.85, 75.43], sost: [36.69, 74.82] }

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('nogeo'))
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 })
  })
}

/** Record a checkpoint with this phone's real GPS fix. No signal? It is queued here and sent when you are back online. */
export default function Track() {
  const { id } = useParams()
  const { t } = useTranslation()
  const sess = useSession()
  const ship = useLoad(() => api<ShipmentDetail>(`/shipments/${id}`), [id])
  const [queued, setQueued] = useState<QueuedCheckpoint[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)

  const refreshQ = async () => setQueued(await listQueued(id))
  useEffect(() => {
    void refreshQ()
    const on = () => { void flushQueue().then(() => { void refreshQ(); void ship.reload() }) }
    window.addEventListener('online', on); window.addEventListener('sost-queue', refreshQ as EventListener)
    return () => { window.removeEventListener('online', on); window.removeEventListener('sost-queue', refreshQ as EventListener) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const mark = async (cp: string) => {
    if (!sess) return
    setBusy(cp); setErr(null); setMsg(null)
    try {
      await ensureKey(sess.user.id)
      let lat: number, lng: number
      if (demo) [lat, lng] = DEMO[cp]
      else {
        try { const p = await getPosition(); lat = p.coords.latitude; lng = p.coords.longitude } catch { throw new Error(t('trader.track.noGps')) }
      }
      const q: QueuedCheckpoint = { id: crypto.randomUUID(), userId: sess.user.id, shipmentId: id!, checkpoint: cp, lat_e6: Math.round(lat * 1e6), lng_e6: Math.round(lng * 1e6), signed_at: isoNow(), nonce: newNonce() }
      try {
        await postCheckpoint(q)
        setMsg(t('trader.track.sent'))
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) { await enqueue(q); setMsg(t('trader.track.queued')); return } else throw e
      }
      await ship.reload()
    } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }

  const events = ((ship.data?.events ?? []) as Step[]).filter((e) => e.type === 'checkpoint')
  const next = ship.data?.allowed_next ?? []
  return (
    <Shell back={`/t/s/${id}`} title={t('trader.track.title')}>
      {ship.loading && !ship.data ? <Loading /> : ship.error && !ship.data ? <ErrorBox message={ship.error} onRetry={ship.reload} /> : (
        <>
          <p className="mb-4 text-muted">{t('trader.track.intro')}</p>
          <div className="space-y-3">
            {POINTS.map((p) => {
              const done = events.some((e) => e.payload?.checkpoint === p)
              return <Button key={p} kind={done ? 'secondary' : 'primary'} busy={busy === p} disabled={!!busy || done || !next.some((n) => n.includes(p) || (p === 'kashgar' && n === 'departed_kashgar') || (p === 'khunjerab' && n === 'crossed_khunjerab') || (p === 'sost' && n === 'arrived_sost'))} onClick={() => void mark(p)}>{done ? <span className="inline-flex items-center gap-2"><CheckIcon className="text-ok" />{t(`trader.track.at.${p}`)}</span> : t(`trader.track.at.${p}`)}</Button>
            })}
          </div>
          <label className="mt-4 flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="size-5" />{t('trader.track.demoLoc')}</label>
          {demo && <p className="text-sm text-warn">{t('trader.track.demoNote')}</p>}
          {err && <ErrorBox message={err} />}
          {msg && <Notice tone="ok" title={msg} />}
          {queued.length > 0 && (
            <Notice tone="warn" title={t('trader.track.waiting', { n: queued.length })} action={<div className="flex gap-4"><Button kind="quiet" onClick={() => void flushQueue().then(() => { void refreshQ(); void ship.reload() })}>{t('trader.track.sendNow')}</Button><Button kind="quiet" onClick={() => void dropQueued(queued[0].id)}>{t('trader.track.discard')}</Button></div>}>
              {queued.map((q) => <p key={q.id}>{t(`trader.track.at.${q.checkpoint}`)}{q.lastError ? ` — ${q.lastError}` : ''}</p>)}
            </Notice>
          )}
          <h2 className="mt-8 border-b border-fg pb-2 text-lg font-semibold">{t('trader.track.log')}</h2>
          {!events.length ? <p className="py-6 text-muted">{t('trader.track.none')}</p> : (
            <ul>{events.map((e) => (
              <li key={e.seq} className="border-b border-line py-3">
                <p className="font-semibold">{t(`trader.track.at.${String(e.payload?.checkpoint)}`)}</p>
                <p className="text-sm text-muted" dir="ltr">{when(e.signed_at)} · {e.lat?.toFixed(4)}, {e.lng?.toFixed(4)}</p>
                {e.flags?.includes('outside_geofence') && <p className="text-sm font-semibold text-warn">{t('trader.track.outside')}</p>}
              </li>
            ))}</ul>
          )}
        </>
      )}
    </Shell>
  )
}
