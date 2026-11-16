// Front page: what this is, the tamper moment as a live demo, the journey, and a way in for each role.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../shared/api'
import { Logo } from '../shared/Logo'
import { CheckIcon, ChevronEnd, CrossIcon, LangSwitch, useLoad } from '../trader/lib/ui'

type Phase = 'sealed' | 'broken' | 'restored'
const PHASES: Phase[] = ['sealed', 'broken', 'restored']

function useReducedMotion() {
  const [r, setR] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setR(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return r
}

/** The product in five seconds: a sealed manifest is edited behind the app's back, the check names the line. */
function TamperDemo() {
  const { t } = useTranslation()
  const reduced = useReducedMotion()
  const [i, setI] = useState(0)
  useEffect(() => {
    if (reduced) return
    const id = setInterval(() => setI((n) => (n + 1) % PHASES.length), 2600)
    return () => clearInterval(id)
  }, [reduced])
  const phase: Phase = reduced ? 'broken' : PHASES[i]
  const bad = phase === 'broken'
  const rows: [string, string, string, string][] = [
    [t('home.demo.line1'), '500', '¥12.00', '¥6,000.00'],
    [t('home.demo.line2'), '400', bad ? '¥9.90' : '¥0.80', bad ? '¥3,960.00' : '¥320.00'],
    [t('home.demo.line3'), '200', '¥18.00', '¥3,600.00'],
  ]
  return (
    <figure className="demo-card w-full max-w-md rounded-xl bg-surface text-fg shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)]" aria-label={t('home.demoCaption')}>
      <div className={`flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold transition-colors duration-500 ${bad ? 'bg-bad-soft text-bad' : 'bg-ok-soft text-ok'}`} aria-live="polite">
        <span key={phase} className="demo-flip inline-flex">{bad ? <CrossIcon /> : <CheckIcon />}</span>
        <span key={`t-${phase}`} className="demo-flip">{t(`home.demo.${phase}`)}</span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([name, qty, unit, total], n) => {
            const hit = bad && n === 1
            return (
              <tr key={n} className={`border-t border-line transition-colors duration-500 ${hit ? 'bg-bad-soft/70' : ''}`}>
                <td className="py-2.5 ps-4 text-[0.82rem] text-muted tabular-nums">{n + 1}</td>
                <td className="py-2.5 ps-3 font-medium">{name}</td>
                <td dir="ltr" className="py-2.5 ps-2 text-end text-muted tabular-nums">{qty} × <span className={hit ? 'demo-hit font-semibold text-bad' : ''}>{unit}</span></td>
                <td dir="ltr" className={`py-2.5 pe-4 ps-3 text-end font-semibold tabular-nums ${hit ? 'text-bad' : ''}`}>{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <figcaption className="rounded-b-xl border-t border-line px-4 py-3 text-[0.8rem] leading-snug text-muted">{t('home.demoCaption')}</figcaption>
    </figure>
  )
}

function Mountains() {
  return (
    <svg aria-hidden viewBox="0 0 1440 220" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full sm:h-56">
      <path className="ridge ridge-far" d="M0 150 120 92l90 46 130-88 110 70 120-60 140 92 110-52 150 74 120-90 140 84 110-40 100 60v132H0Z" fill="#fff" fillOpacity=".06" />
      <path className="ridge ridge-near" d="M0 190 160 120l110 52 150-92 120 84 150-56 130 74 160-112 140 96 120-48 100 52 100-36v188H0Z" fill="#fff" fillOpacity=".09" />
      <path d="M0 220h1440" stroke="var(--color-canvas)" strokeWidth="2" />
    </svg>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const demo = useLoad(() => api<{ demo?: boolean }>('/health', { auth: false }), []).data?.demo ?? false
  const steps = ['scan', 'pay', 'seal', 'track', 'clear'] as const
  const roles = [
    { k: 'trader', to: '/login' },
    ...(demo ? [{ k: 'seller', to: '/s/kashgar-bazaar-01' }] : []),
    { k: 'customs', to: '/login' },
    { k: 'verify', to: '/v' },
  ] as const
  const trust = t('home.trust', { returnObjects: true }) as [string, string][]
  const shots = [
    ['phone-review', 'review'], ['phone-seal', 'seal'], ['phone-seller', 'seller'], ['phone-urdu', 'urdu'], ['verify-broken', 'broken'],
  ] as const

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <section className="hero relative overflow-hidden text-[#f4f1ea]">
        <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6 [&_button]:text-[#d7e8e5] [&_[aria-pressed=true]]:!text-white">
          <span className="[&_.text-muted]:!text-[#b7d5d1]"><Logo /></span>
          <LangSwitch />
        </header>
        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 px-4 pb-40 pt-10 sm:px-6 sm:pb-56 sm:pt-16 lg:grid-cols-[1.1fr_1fr]">
          <div className="rise">
            <h1 className="max-w-[13em] text-[2.2rem] font-semibold leading-[1.08] tracking-[-0.02em] text-balance sm:text-[3.4rem]">{t('home.title')}</h1>
            <p className="mt-5 max-w-[56ch] text-[1.05rem] leading-relaxed text-[#d7e8e5]">{t('home.lead')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#try" className="press inline-flex min-h-12 items-center rounded-md bg-[#f4f1ea] px-6 font-semibold text-accent hover:bg-white">{t('home.tryIt')}</a>
              <Link to="/v" className="press inline-flex min-h-12 items-center rounded-md border border-[#f4f1ea]/50 px-6 font-semibold hover:bg-white/10">{t('home.checkSeal')}</Link>
            </div>
          </div>
          <div className="rise rise-2 flex justify-center lg:justify-end"><TamperDemo /></div>
        </div>
        <Mountains />
      </section>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        <section className="py-16 sm:py-20" aria-labelledby="journey">
          <h2 id="journey" className="text-[1.6rem] font-semibold tracking-tight sm:text-[2rem]">{t('home.journeyTitle')}</h2>
          <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((k, n) => {
              const [name, text] = t(`home.steps.${k}`, { returnObjects: true }) as [string, string]
              return (
                <li key={k} className="relative border-t-2 border-fg pt-4">
                  <span className="block text-sm font-semibold text-accent tabular-nums">{n + 1}</span>
                  <h3 className="mt-1 text-lg font-semibold">{name}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{text}</p>
                </li>
              )
            })}
          </ol>
        </section>

        <section id="try" className="scroll-mt-6 border-t border-line py-16 sm:py-20" aria-labelledby="roles">
          <h2 id="roles" className="text-[1.6rem] font-semibold tracking-tight sm:text-[2rem]">{t('home.rolesTitle')}</h2>
          <ul className="mt-8 border-t border-fg">
            {roles.map(({ k, to }) => {
              const [name, text, hint] = t(`home.roles.${k}`, { returnObjects: true }) as [string, string, string]
              return (
                <li key={k}>
                  <Link to={to} className="group grid min-h-20 grid-cols-[1fr_auto] items-center gap-x-6 border-b border-line py-5 transition-colors hover:bg-sunken/60 sm:grid-cols-[14rem_1fr_auto] sm:px-2">
                    <span className="col-start-1 row-start-1 text-lg font-semibold">{name}</span>
                    <span className="col-span-2 col-start-1 row-start-2 mt-1 text-[0.95rem] text-muted sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mt-0">{text}<span dir="ltr" className="mt-1 block text-[0.8rem] text-muted/80 tabular-nums">{hint}</span></span>
                    <ChevronEnd className="col-start-2 row-start-1 text-accent transition-transform duration-200 group-hover:translate-x-1 sm:col-start-3 rtl:group-hover:-translate-x-1" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="border-t border-line py-16 sm:py-20" aria-labelledby="shots">
          <h2 id="shots" className="text-[1.6rem] font-semibold tracking-tight sm:text-[2rem]">{t('home.shotsTitle')}</h2>
          <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
            {shots.map(([file, k]) => (
              <figure key={file} className="w-[15rem] shrink-0 snap-start">
                <img src={`/shots/${file}.webp`} alt={t(`home.shots.${k}`)} width={390} height={844} loading="lazy"
                  className="aspect-[390/844] w-full rounded-xl border border-line bg-surface object-cover object-top shadow-[0_12px_30px_-18px_rgb(0_0_0/0.35)]" />
                <figcaption className="mt-3 text-sm text-muted">{t(`home.shots.${k}`)}</figcaption>
              </figure>
            ))}
          </div>
          <figure className="mt-10">
            <img src="/shots/customs.webp" alt={t('home.shots.customs')} width={1440} height={900} loading="lazy"
              className="w-full rounded-xl border border-line bg-surface shadow-[0_18px_40px_-24px_rgb(0_0_0/0.35)]" />
            <figcaption className="mt-3 text-sm text-muted">{t('home.shots.customs')}</figcaption>
          </figure>
        </section>

        <section className="border-t border-line py-16 sm:py-20" aria-labelledby="trust">
          <h2 id="trust" className="text-[1.6rem] font-semibold tracking-tight sm:text-[2rem]">{t('home.trustTitle')}</h2>
          <dl className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {trust.map(([h, p]) => (
              <div key={h} className="border-t border-line pt-4">
                <dt className="font-semibold">{h}</dt>
                <dd className="mt-1.5 leading-relaxed text-muted">{p}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <Logo compact size={22} />
          <p className="max-w-[60ch]">{t('home.foot')}</p>
        </div>
      </footer>
    </div>
  )
}
