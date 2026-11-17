// Seller page: /s/:token. No login. The shop checks the goods list and counter-signs with a key kept on this phone.
import { useState } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../shared/api'
import { fen } from '../trader/lib/money'
import { ensureKey, isKeyProblem, reRegister, signAndPost } from '../trader/lib/device'
import { Button, CheckIcon, ErrorBox, Loading, Notice, Row, Shell, errText, useLoad } from '../trader/lib/ui'

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
  const [errFor, setErrFor] = useState<string | null>(null)
  // A seller confirms a payment, so shipments the trader has not paid yet are not waiting on them.
  const waiting = link.data?.pending.filter((p) => !p.confirmed && p.amount_fen > 0) ?? []
  const earlier = link.data?.pending.filter((p) => p.confirmed) ?? []


  const confirm = async (p: Pending) => {
    setBusy(p.shipment_id); setErr(null); setDone(null); setErrFor(p.shipment_id)
    try {
      const uid = `seller:${token}`
      const register = (k: { publicKey: string }) => api(`/seller-link/${token}/key`, { body: { public_key: k.publicKey }, auth: false })
      const send = (key: Awaited<ReturnType<typeof ensureKey>>) => signAndPost({
        key, shipmentId: p.shipment_id, type: 'seller_confirmed', path: `/seller-link/${token}/confirm`, auth: false,
        payload: { manifest_hash: p.manifest.manifest_hash, receipt_id: p.receipt_ids[0] ?? '', amount_fen: p.amount_fen },
        head: async () => {
          const l = await api<Link>(`/seller-link/${token}`, { auth: false })
          return l.pending.find((x) => x.shipment_id === p.shipment_id)!.chain_head
        },
      })
      try {
        await send(await ensureKey(uid, register))
      } catch (e) {
        // The key saved on this phone is unknown to the server (e.g. demo data reset): make a new one and retry once.
        if (!isKeyProblem(e)) throw e
        await send(await reRegister(uid, register))
      }
      setDone(p.ref)
      await link.reload()
    } catch (e) { setErr(errText(e)) } finally { setBusy(null) }
  }

  return (
    <Shell title={link.data ? <ShopName s={link.data.seller} zhFirst={i18n.language === 'zh'} /> : t('seller.title')}>
      {link.loading && !link.data ? <Loading /> : link.error ? <ErrorBox message={link.error} onRetry={link.reload} /> : link.data && (
        <>
          {waiting.length > 0 && <p className="mb-6 text-muted">{t('seller.intro')}</p>}
          {done && <Notice tone="ok" title={t('seller.thanks', { ref: done })} />}
          {!waiting.length && <p className="py-6 text-muted">{t('seller.none')}</p>}
          {waiting.map((p) => (
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
              <Button busy={busy === p.shipment_id} disabled={!!busy} onClick={() => void confirm(p)}>{t('seller.confirm')}</Button>
              {err && errFor === p.shipment_id && <ErrorBox message={err} />}
            </section>
          ))}
          {earlier.length > 0 && (
            <details className="mb-8 border-t border-line pt-2">
              <summary className="flex min-h-12 cursor-pointer items-center font-medium">{t('seller.earlier', { n: earlier.length })}</summary>
              <ul>
                {earlier.map((p) => (
                  <li key={p.shipment_id} className="flex items-center justify-between gap-3 border-b border-line py-3 text-sm">
                    <span className="flex items-center gap-2"><CheckIcon className="text-ok" /><span dir="ltr" className="font-mono">{p.ref}</span><span className="text-muted">{p.trader_name}</span></span>
                    <span dir="ltr" className="tabular-nums">{fen(p.amount_fen)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-sm text-muted">{t('seller.keyNote')}</p>
        </>
      )}
    </Shell>
  )
}

export default function SellerApp() {
  return <Routes><Route path=":token" element={<SellerPage />} /><Route path="*" element={<p className="p-6">404</p>} /></Routes>
}

/** The shop's name in the page's language, with the other script underneath. */
function ShopName({ s, zhFirst }: { s: { shop_name_zh: string; shop_name_en: string }; zhFirst: boolean }) {
  const zh = <span lang="zh">{s.shop_name_zh}</span>
  const en = <span lang="en" dir="ltr">{s.shop_name_en}</span>
  return (
    <>
      {zhFirst ? zh : en}
      <span className="mt-1 block text-base font-normal tracking-normal text-muted">{zhFirst ? en : zh}</span>
    </>
  )
}
