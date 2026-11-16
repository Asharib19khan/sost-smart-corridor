import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, setSession, type Session } from '../../shared/api'
import { ensureKey, reRegister } from '../lib/device'
import { homeFor } from '../lib/session'
import { Button, ErrorBox, Field, Mono, Notice, PinPad, Shell, errText } from '../lib/ui'

const DEMO = [
  { name: 'Karim Baig', role: 'trader', phone: '+923001110001', pin: '1111' },
  { name: 'Nasreen Shah', role: 'trader', phone: '+923001110002', pin: '2222' },
  { name: 'Sher Ali', role: 'driver', phone: '+923001110003', pin: '3333' },
  { name: 'Officer Ayesha Raza', role: 'customs', phone: '+923001110004', pin: '4444' },
  { name: 'Corridor Admin', role: 'admin', phone: '+923001110005', pin: '5555' },
]

export default function Login() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  return (
    <Shell title={mode === 'login' ? t('trader.login.title') : t('trader.signup.title')}>
      {mode === 'login' ? <PinLogin /> : <SignUp />}
      <div className="mt-8 border-t border-line pt-4">
        <Button kind="quiet" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? t('trader.signup.cta') : t('trader.signup.haveAccount')}
        </Button>
      </div>
    </Shell>
  )
}

/** After any successful auth: store session, make sure this device has a registered key, route by role. */
function useFinish() {
  const nav = useNavigate()
  const [keyError, setKeyError] = useState<string | null>(null)
  const [pending, setPending] = useState<Session | null>(null)
  const [busy, setBusy] = useState(false)
  const finish = async (s: Session, again = false) => {
    setSession(s)
    setBusy(true)
    try {
      if (again) await reRegister(s.user.id)
      else await ensureKey(s.user.id)
      nav(homeFor(s.user.role), { replace: true })
    } catch (e) {
      setPending(s)
      setKeyError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return { finish, keyError, pending, busy }
}

function KeyTrouble({ message, onAgain, busy }: { message: string; onAgain: () => void; busy: boolean }) {
  const { t } = useTranslation()
  return <Notice tone="bad" title={t('trader.key.failed')} action={<Button kind="secondary" busy={busy} onClick={onAgain}>{t('trader.key.again')}</Button>}>{message}</Notice>
}

function PinLogin() {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const f = useFinish()

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const s = await api<Session>('/auth/login', { body: { phone: phone.trim(), pin }, auth: false })
      await f.finish(s)
    } catch (e) {
      setErr(errText(e))
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Field label={t('trader.login.phone')} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92300…" />
      <PinPad label={t('trader.login.pin')} value={pin} onChange={setPin} />
      {err && <ErrorBox message={err} />}
      {f.keyError && f.pending && <KeyTrouble message={f.keyError} busy={f.busy} onAgain={() => void f.finish(f.pending!, true)} />}
      <div className="mt-6"><Button busy={busy || f.busy} disabled={!phone || pin.length < 4} onClick={() => void submit()}>{t('trader.login.signIn')}</Button></div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold">{t('trader.login.demo')}</h2>
        <p className="mb-2 text-sm text-muted">{t('trader.login.demoNote')}</p>
        <ul className="border-t border-line">
          {DEMO.map((d) => (
            <li key={d.phone}>
              <button onClick={() => { setPhone(d.phone); setPin(d.pin) }} className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-line text-start hover:bg-sunken">
                <span><span className="block font-medium">{d.name}</span><span className="text-sm text-muted">{t(`trader.role.${d.role}`)}</span></span>
                <Mono>{d.phone}</Mono>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function SignUp() {
  const { t } = useTranslation()
  const [step, setStep] = useState<'phone' | 'details'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [dev, setDev] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [cnic, setCnic] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const f = useFinish()

  const sendOtp = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await api<{ sent: boolean; dev_code?: string }>('/auth/otp', { body: { phone: phone.trim() }, auth: false })
      setDev(r.dev_code ?? null)
      setStep('details')
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }
  const create = async () => {
    setBusy(true); setErr(null)
    try {
      const s = await api<Session>('/auth/signup', { body: { phone: phone.trim(), otp, name: name.trim(), cnic: cnic.trim(), pin }, auth: false })
      await f.finish(s)
    } catch (e) { setErr(errText(e)) } finally { setBusy(false) }
  }

  if (step === 'phone') return (
    <>
      <p className="mb-6 text-muted">{t('trader.signup.intro')}</p>
      <Field label={t('trader.login.phone')} type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92300…" />
      {err && <ErrorBox message={err} />}
      <Button busy={busy} disabled={phone.trim().length < 10} onClick={() => void sendOtp()}>{t('trader.signup.sendCode')}</Button>
    </>
  )
  return (
    <>
      {dev && <Notice tone="info" title={t('trader.signup.devTitle')}>{t('trader.signup.devCode')} <Mono>{dev}</Mono></Notice>}
      <Field label={t('trader.signup.code')} inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
      <Field label={t('trader.signup.name')} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label={t('trader.signup.cnic')} inputMode="numeric" dir="ltr" placeholder="12345-1234567-1" value={cnic} onChange={(e) => setCnic(e.target.value)} hint={t('trader.signup.cnicHint')} />
      <PinPad label={t('trader.signup.pin')} value={pin} onChange={setPin} />
      {err && <ErrorBox message={err} />}
      {f.keyError && f.pending && <KeyTrouble message={f.keyError} busy={f.busy} onAgain={() => void f.finish(f.pending!, true)} />}
      <div className="mt-6"><Button busy={busy || f.busy} disabled={!otp || !name || !cnic || pin.length < 4} onClick={() => void create()}>{t('trader.signup.create')}</Button></div>
    </>
  )
}
