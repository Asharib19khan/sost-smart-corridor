import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../shared/api'
import { fen, paisa } from '../lib/money'
import { useSession } from '../lib/session'
import { ensureKey, signAndPost } from '../lib/device'
import type { ManifestLine, Seller, ShipmentDetail } from '../lib/types'
import { CheckIcon, ErrorBox, Button, LinkButton, Loading, Notice, PinPad, Row, Shell, errText, useLoad } from '../lib/ui'

interface Wallet { balances: { CNY: number; PKR: number }; label: string }

/** One payment per receipt, signed on this device and confirmed with the PIN. Sandbox money, labelled. */
export default function Pay() {
  const { id } = useParams()
  const { t } = useTranslation()
  const sess = useSession()
  const ship = useLoad(() => api<ShipmentDetail>(`/shipments/${id}`), [id])
  const wallet = useLoad(() => api<Wallet>('/wallet'), [])
  const sellers = useLoad(() => api<Seller[]>('/sellers'), [])
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [short, setShort] = useState(false)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const rows = useMemo(() => {
    const s = ship.data
    if (!s) return []
    return s.receipts.map((r) => {
      const amount = (s.lines as ManifestLine[]).filter((l) => l.receipt_id === r.id).reduce((a, l) => a + l.total_fen, 0)
      const pay = s.payments.find((p) => p.seller_id === r.seller_id && p.amount_fen === amount)
      return { ...r, amount, paid: !!pay, confirmed: !!pay?.seller_confirmed }
    }).filter((r) => r.amount > 0)
  }, [ship.data])

  const pay = async (r: (typeof rows)[number]) => {
    if (!sess || !r.seller_id) return
    setBusy(r.id); setErr(null); setShort(false); setOkMsg(null)
    try {
      const key = await ensureKey(sess.user.id)
      await signAndPost({
        key, shipmentId: id!, type: 'payment', path: '/payments',
        payload: { seller_id: r.seller_id, amount_fen: r.amount, receipt_id: r.id },
        extra: () => ({ shipment_id: id, seller_id: r.seller_id, amount_fen: r.amount, pin }),
      })
      setPin(''); setOkMsg(t('trader.pay.ok'))
      await Promise.all([ship.reload(), wallet.reload()])
    } catch (e) {
      const m = errText(e)
      setErr(m); setShort(/not enough|insufficient/i.test(m))
    } finally { setBusy(null) }
  }
  const sellerName = (sid: string | null) => sellers.data?.find((s) => s.id === sid)?.shop_name_en ?? '—'

  return (
    <Shell back={`/t/s/${id}`} title={t('trader.pay.title')}>
      <Notice tone="info" title={t('trader.pay.sandbox')}>{t('trader.pay.sandboxNote')}</Notice>
      {ship.loading && !ship.data ? <Loading /> : ship.error ? <ErrorBox message={ship.error} onRetry={ship.reload} /> : (
        <>
          <Row label={t('trader.pay.balance')}><span dir="ltr">{wallet.data ? fen(wallet.data.balances.CNY) : '…'}</span></Row>
          {!rows.length && <p className="py-6 text-muted">{t('trader.pay.none')}</p>}
          <PinPad label={t('trader.pay.pin')} value={pin} onChange={setPin} />
          <ul className="mt-6">
            {rows.map((r) => (
              <li key={r.id} className="border-b border-line py-4">
                <div className="mb-3 flex items-baseline justify-between"><span className="font-semibold">{sellerName(r.seller_id)}</span><span dir="ltr" className="font-semibold tabular-nums">{fen(r.amount)}</span></div>
                {r.paid ? <><p className="flex items-center gap-1.5 font-semibold text-ok"><CheckIcon />{t('trader.pay.paid')}</p>
                  <p className={`mt-1 flex items-start gap-1.5 text-sm ${r.confirmed ? 'text-ok' : 'text-warn'}`}>{r.confirmed && <CheckIcon className="mt-0.5" />}{t(r.confirmed ? 'trader.pay.sellerOk' : 'trader.pay.sellerWait')}</p></>
                  : !r.seller_id ? <p className="text-warn">{t('trader.pay.noSeller')}</p>
                    : <Button busy={busy === r.id} disabled={pin.length < 4 || !!busy} onClick={() => void pay(r)}>{t('trader.pay.send', { amount: fen(r.amount) })}</Button>}
              </li>
            ))}
          </ul>
          {err && <ErrorBox message={err} />}
          {short && <p><Link to="/t/wallet" className="text-accent underline">{t('trader.pay.topup')}</Link></p>}
          {okMsg && <Notice tone="ok" title={okMsg} />}
          {ship.data && ['paid', 'sealed'].includes(ship.data.state) && <div className="mt-6"><LinkButton to={`/t/s/${id}/seal`}>{t('trader.pay.next')}</LinkButton></div>}
          <p className="mt-6 text-sm text-muted">{t('trader.pay.dutyNote', { amount: paisa(wallet.data?.balances.PKR) })}</p>
        </>
      )}
    </Shell>
  )
}
