// Public verify page: /v (scan or paste) and /v/:id#SSC1.… (the QR target). No login.
// The seal signature is checked on THIS device first; the server report is then compared to it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import jsQR from 'jsqr'
import { api } from '../shared/api'
import { b64uDec, verifyHash } from '../shared/crypto/keys'
import { Button, ErrorBox, Field, Loading, Mono, Notice, Shell, errText } from '../trader/lib/ui'
import { short } from '../trader/lib/money'
import type { VerifyReport } from '../trader/lib/types'

interface Seal { s: string; r: string; h: string; k: string; p: string; m: string }
interface Report extends VerifyReport { manifest: { sealed_hash: string | null; current_hash: string | null; ok: boolean; problems: { line_no: number; problem: string }[] } }

function parseSeal(hash: string): Seal | null {
  try {
    const body = hash.replace(/^#/, '').replace(/^SSC1\./, '')
    return JSON.parse(new TextDecoder().decode(b64uDec(body))) as Seal
  } catch { return null }
}

function Result({ id, hash }: { id: string; hash: string }) {
  const { t } = useTranslation()
  const [rep, setRep] = useState<Report | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [local, setLocal] = useState<boolean | null>(null)
  const [keyOk, setKeyOk] = useState<boolean | null>(null)
  const seal = parseSeal(hash)

  useEffect(() => {
    let live = true
    void (async () => {
      if (seal) setLocal(await verifyHash(seal.p, seal.h, seal.m))
      try {
        const r = await api<Report>(`/verify/${encodeURIComponent(id)}`, { auth: false })
        if (!live) return
        setRep(r)
        if (seal) {
          try {
            const k = await api<{ public_key: string; revoked_at: string | null }>(`/keys/${seal.k}/public`, { auth: false })
            if (live) setKeyOk(k.public_key === seal.p && !k.revoked_at)
          } catch { if (live) setKeyOk(false) }
        }
      } catch (e) { if (live) setErr(errText(e)) }
    })()
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hash])

  const sealMatches = rep && seal ? rep.manifest.current_hash === seal.h : null
  const all = !!rep?.overall.ok && local === true && sealMatches === true && keyOk === true
  const Check = ({ ok, label, pending }: { ok: boolean | null; label: string; pending?: boolean }) => (
    <li className="flex items-start gap-3 border-b border-line py-3">
      <span aria-hidden className={`mt-0.5 font-bold ${ok === null ? 'text-muted' : ok ? 'text-ok' : 'text-bad'}`}>{ok === null ? '…' : ok ? '✓' : '✗'}</span>
      <span className={pending ? 'text-muted' : ''}>{label}</span>
    </li>
  )
  return (
    <Shell back="/v" title={t('verify.title')}>
      {err ? <ErrorBox message={err} /> : !rep ? <Loading /> : (
        <>
          <Notice tone={all ? 'ok' : 'bad'} title={all ? t('verify.allOk') : rep.overall.ok ? t('verify.partial') : rep.overall.message}>
            <span className="font-mono" dir="ltr">{rep.shipment.ref}</span> · {rep.shipment.trader_name} · {t(`common.state.${rep.shipment.state}`, { defaultValue: rep.shipment.state })}
          </Notice>
          <ul>
            <Check ok={seal ? local : false} label={seal ? t('verify.localSig') : t('verify.noSeal')} />
            <Check ok={keyOk} label={t('verify.keyReg')} />
            <Check ok={sealMatches} label={t('verify.matchesNow')} />
            <Check ok={rep.manifest.ok} label={rep.manifest.ok ? t('verify.manifestOk') : t('verify.manifestBad', { n: rep.manifest.problems.map((p) => p.line_no).join(', ') })} />
            <Check ok={rep.chain.ok} label={rep.chain.ok ? t('verify.chainOk', { n: rep.chain.steps.length }) : t('verify.chainBad', { n: rep.chain.broken_at })} />
          </ul>
          {!rep.overall.ok && <p className="mt-3 font-semibold text-bad">{rep.overall.message}</p>}
          {seal && <p className="mt-4 text-sm text-muted">{t('verify.sealed')}: <Mono>{short(seal.h, 16)}</Mono></p>}
          <h2 className="mt-8 border-b border-fg pb-2 text-lg font-semibold">{t('verify.history')}</h2>
          <ul>
            {rep.chain.steps.map((s) => (
              <li key={s.seq} className="border-b border-line py-3 text-sm">
                <span className={s.ok ? 'text-ok' : 'font-semibold text-bad'}>{s.ok ? '✓' : '✗'}</span>{' '}
                <span className="font-medium">{s.seq}. {s.type}{typeof s.payload?.checkpoint === 'string' ? ` · ${s.payload.checkpoint}` : ''}</span>
                <span className="block text-muted" dir="ltr">{s.signer.name} ({s.signer.role}) · {new Date(s.signed_at).toLocaleString()}</span>
                {s.problem && <span className="block text-bad">{s.problem}</span>}
                {s.flags?.map((f) => <span key={f} className="block text-warn">{f}</span>)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  )
}

function ResultRoute() {
  const { id = '' } = useParams()
  return <Result id={id} hash={location.hash} />
}

function Entry() {
  const { t } = useTranslation()
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [cam, setCam] = useState(false)
  const video = useRef<HTMLVideoElement>(null)

  const go = useCallback((raw: string) => {
    try {
      const u = new URL(raw.trim())
      const m = u.pathname.match(/\/v\/([^/]+)/)
      if (!m || !u.hash) throw new Error('x')
      nav(`/v/${m[1]}${u.hash}`)
    } catch { setErr(t('verify.badCode')) }
  }, [nav, t])

  useEffect(() => {
    if (!cam) return
    let stream: MediaStream | undefined
    let raf = 0
    let stop = false
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        const v = video.current!
        v.srcObject = stream
        await v.play()
        const c = document.createElement('canvas')
        const loop = () => {
          if (stop) return
          if (v.videoWidth) {
            c.width = v.videoWidth; c.height = v.videoHeight
            const g = c.getContext('2d', { willReadFrequently: true })!
            g.drawImage(v, 0, 0)
            const im = g.getImageData(0, 0, c.width, c.height)
            const r = jsQR(im.data, im.width, im.height)
            if (r?.data) { stop = true; setCam(false); go(r.data); return }
          }
          raf = requestAnimationFrame(loop)
        }
        loop()
      } catch { setErr(t('verify.noCamera')); setCam(false) }
    })()
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((x) => x.stop()) }
  }, [cam, go, t])

  return (
    <Shell title={t('verify.entryTitle')}>
      <p className="mb-6 text-muted">{t('verify.entryIntro')}</p>
      {cam ? (
        <>
          <video ref={video} muted playsInline className="aspect-square w-full rounded-md bg-fg object-cover" />
          <div className="mt-3"><Button kind="secondary" onClick={() => setCam(false)}>{t('verify.stopCamera')}</Button></div>
        </>
      ) : <Button onClick={() => { setErr(null); setCam(true) }}>{t('verify.scan')}</Button>}
      <div className="mt-8">
        <Field label={t('verify.paste')} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} placeholder="https://…/v/…#SSC1…" />
        <Button kind="secondary" disabled={!text.trim()} onClick={() => go(text)}>{t('verify.check')}</Button>
      </div>
      {err && <ErrorBox message={err} />}
    </Shell>
  )
}

export default function VerifyApp() {
  return <Routes><Route index element={<Entry />} /><Route path=":id" element={<ResultRoute />} /></Routes>
}
