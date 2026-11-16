import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { api } from '../../shared/api'
import { signHash } from '../../shared/crypto/keys'
import { ensureKey, signAndPost } from '../lib/device'
import { useSession } from '../lib/session'
import { short } from '../lib/money'
import type { Manifest, ShipmentDetail } from '../lib/types'

// navigator.clipboard only exists on https/localhost; phones on the LAN demo use plain http, so fall back to execCommand.
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  try { return document.execCommand('copy') } catch { return false } finally { ta.remove() }
}
import { Button, ErrorBox, LinkButton, Loading, Mono, Notice, Shell, errText, useLoad } from '../lib/ui'

/** Seal = sign the exact manifest hash. After this, changing any line breaks the seal. */
export default function Seal() {
  const { id } = useParams()
  const { t } = useTranslation()
  const sess = useSession()
  const ship = useLoad(() => api<ShipmentDetail>(`/shipments/${id}`), [id])
  const man = useLoad(() => api<Manifest>(`/shipments/${id}/manifest`), [id])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [png, setPng] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const seal = ship.data?.seal ?? null
  // VITE_PUBLIC_ORIGIN lets a laptop on localhost still print QR codes that visitors' phones can open.
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  const origin = (local && (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/, '')) || location.origin
  const url = seal ? `${origin}/v/${id}#${seal}` : null

  useEffect(() => { if (url) void QRCode.toDataURL(url, { margin: 1, width: 300, errorCorrectionLevel: 'M' }).then(setPng) }, [url])

  const doSeal = async () => {
    if (!sess || !man.data) return
    setBusy(true); setErr(null)
    try {
      const key = await ensureKey(sess.user.id)
      const c = man.data.canonical
      await signAndPost({
        key, shipmentId: id!, type: 'manifest_sealed', path: `/shipments/${id}/seal`,
        payload: { manifest_hash: man.data.manifest_hash, line_hashes: c.line_hashes, total_fen: c.total_fen, line_count: c.lines.length },
        extra: async () => ({ manifest_signature: await signHash(key.seed, man.data!.manifest_hash) }),
      })
      await ship.reload()
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Shell back={`/t/s/${id}`} title={t('trader.seal.title')}>
      {ship.loading && !ship.data ? <Loading /> : ship.error ? <ErrorBox message={ship.error} onRetry={ship.reload} /> : (
        <>
          {man.data && <p className="mb-4 text-muted">{t('trader.seal.hash')}: <Mono>{short(man.data.manifest_hash, 16)}</Mono></p>}
          {seal ? (
            <>
              <Notice tone="ok" title={t('trader.seal.done')}>{t('trader.seal.doneNote')}</Notice>
              {png && <img src={png} alt={t('trader.seal.qrAlt')} width={300} height={300} className="mx-auto my-6 border border-line bg-surface p-2" />}
              {url && (
                <p className="text-center">
                  <button type="button" className="min-h-11 px-4 text-sm font-semibold text-accent underline"
                    onClick={() => void copyText(url).then(setCopied)}>
                    {copied ? t('trader.seal.copied') : t('trader.seal.copy')}
                  </button>
                </p>
              )}
              <div className="mt-6"><LinkButton to={`/t/s/${id}/track`}>{t('trader.hub.do.track')}</LinkButton></div>
            </>
          ) : ship.data?.state === 'paid' ? (
            <>
              <p className="mb-4">{t('trader.seal.intro')}</p>
              <Button busy={busy} disabled={!man.data} onClick={() => void doSeal()}>{t('trader.seal.cta')}</Button>
              {err && <ErrorBox message={err} />}
            </>
          ) : <Notice tone="warn" title={t('trader.seal.notReady')}>{t('trader.seal.notReadyNote')}</Notice>}
        </>
      )}
    </Shell>
  )
}
