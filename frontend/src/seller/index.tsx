// Seller page: /s/:token. No login. The shop checks the goods list and counter-signs with a key kept on this phone.
import { useEffect, useState } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../shared/api'
import { fen } from '../trader/lib/money'
import { ensureKey, signAndPost } from '../trader/lib/device'
import { Button, ErrorBox, Loading, Notice, Row, Shell, errText, useLoad } from '../trader/lib/ui'

interface Pending {
  shipment_id: string; ref: string; trader_name: string | null; amount_fen: number; confirmed: boolean; receipt_ids: string[]
  manifest: { manifest_hash: string; canonical: { lines: { line_no: number; item_zh: string; item_en: string; qty: number; unit: string; unit_price_fen: number; total_fen: number }[] } }
  chain_head: { seq: number; prev_hash: string }
}
interface Link { seller: { shop_name_zh: string; shop_name_en: string; market: string }; pending: Pending[] }

function SellerPage() {
  const { token } = useParams()
  const { t, i18n } = useTranslation()
  const link = useLoad(() => api<Link>(`/seller-link/${token}`, { auth: false }), [token])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // The shop speaks Mandarin first; keep their own choice if they made one.
  useEffect(() => {
    try { if (!localStorage.getItem('sost.lang')) void i18n.changeLanguage('zh') } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const confirm = async (p: Pending) => {
    setBusy(p.shipment_id); setErr(null); setDone(null)
    try {
      const uid = `seller:${token}`
      const key = await ensureKey(uid, (k) => api(`/seller-link/${token}/key`, { body: { public_key: k.publicKey }, auth: false }))
      await signAndPost({
        key, shipmentId: p.shipment_id, type: 'seller_confirmed', path: `/seller-link/${token}/confirm`, auth: false,
        payload: { manifest_hash: p.manifest.manifest_hash, receipt_id: p.receipt_ids[0] ?? '', amount_fen: p.amount_fen },
        head: async () => {
          const l = await api<Link>(`/seller-link/${token}`, { auth: false })
          return l.pending.find((x) => x.shipment_id === p.shipment_id)!.chain_head
        },
      })
      setDone(p.ref)
      await link.reload()
    } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }

  return (
    <Shell title={link.data ? <span lang="zh">{link.data.seller.shop_name_zh}</span> : t('seller.title')}>
      {link.loading && !link.data ? <Loading /> : link.error ? <ErrorBox message={link.error} onRetry={link.reload} /> : link.data && (
        <>
          <p className="mb-6 text-muted">{t('seller.intro')}</p>
          {!link.data.pending.length && <p className="py-6 text-muted">{t('seller.none')}</p>}
          {link.data.pending.map((p) => (
            <section key={p.shipment_id} className="mb-8 border-t-2 border-fg pt-4">
              <Row label={t('seller.buyer')}>{p.trader_name}</Row>
              <Row label={t('seller.ref')}><span dir="ltr" className="font-mono">{p.ref}</span></Row>
              <Row label={t('seller.paid')}><span dir="ltr">{fen(p.amount_fen)}</span></Row>
              <ul className="my-4">
                {p.manifest.canonical.lines.map((l) => (
                  <li key={l.line_no} className="flex justify-between gap-3 border-b border-line py-2 text-sm">
                    <span><span lang="zh" className="font-medium">{l.item_zh}</span><span className="block text-muted">{l.item_en}</span></span>
                    <span dir="ltr" className="text-end tabular-nums">{l.qty} {l.unit} × {fen(l.unit_price_fen)}<span className="block font-semibold">{fen(l.total_fen)}</span></span>
                  </li>
                ))}
              </ul>
              {p.confirmed ? <Notice tone="ok" title={t('seller.confirmed')} /> : <Button busy={busy === p.shipment_id} onClick={() => void confirm(p)}>{t('seller.confirm')}</Button>}
            </section>
          ))}
          {err && <ErrorBox message={err} />}
          {done && <Notice tone="ok" title={t('seller.thanks', { ref: done })} />}
          <p className="text-sm text-muted">{t('seller.keyNote')}</p>
        </>
      )}
    </Shell>
  )
}

export default function SellerApp() {
  return <Routes><Route path=":token" element={<SellerPage />} /><Route path="*" element={<p className="p-6">404</p>} /></Routes>
}
