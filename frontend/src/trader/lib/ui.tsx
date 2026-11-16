// Small shared UI for the trader + seller areas. Role tokens only.
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LANGS } from '../../shared/i18n'
import { ApiError } from '../../shared/api'

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)
  const reload = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const d = await run()
      if (my === seq.current) setData(d)
    } catch (e) {
      if (my === seq.current) setError(errText(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [run])
  useEffect(() => { void reload() }, [reload])
  return { data, error, loading, reload, setData }
}

export const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e))

export function LangSwitch() {
  const { i18n, t } = useTranslation()
  return (
    <div role="group" aria-label={t('common.language')} className="flex">
      {LANGS.map((l) => (
        <button
          key={l.code}
          lang={l.code}
          onClick={() => void i18n.changeLanguage(l.code)}
          aria-pressed={i18n.language === l.code}
          className={`min-h-12 px-3 text-sm leading-none ${i18n.language === l.code ? 'text-fg font-semibold underline underline-offset-8 decoration-2 decoration-accent' : 'text-muted'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

export function Shell({ title, back, children, aside }: { title?: ReactNode; back?: string; children: ReactNode; aside?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-2 border-b border-line px-4">
        {back ? (
          <Link to={back} className="flex min-h-12 items-center text-sm text-accent">
            <Chevron /> <span className="ms-1">{t('trader.back')}</span>
          </Link>
        ) : (
          <span className="text-sm font-semibold tracking-tight">{t('common.appName')}</span>
        )}
        <div className="flex items-center">{aside}<LangSwitch /></div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
        {title && <h1 className="mb-6 text-[1.75rem] font-semibold leading-tight tracking-tight text-balance">{title}</h1>}
        {children}
      </main>
    </div>
  )
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="rtl:rotate-180">
      <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

export function Button({ kind = 'primary', busy, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'secondary' | 'quiet'; busy?: boolean }) {
  const base = 'min-h-14 w-full px-5 text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const k = kind === 'primary'
    ? 'bg-accent text-accent-fg hover:bg-fg rounded-md'
    : kind === 'secondary'
      ? 'border border-fg text-fg hover:bg-sunken rounded-md'
      : 'text-accent underline underline-offset-4 min-h-12 w-auto px-0 font-medium'
  return (
    <button className={`${base} ${k} ${className}`} disabled={busy || rest.disabled} aria-busy={busy} {...rest}>
      {busy ? <Dots /> : children}
    </button>
  )
}

export function LinkButton({ to, children }: { to: string; children: ReactNode }) {
  return <Link to={to} className="flex min-h-14 w-full items-center justify-center rounded-md bg-accent px-5 text-base font-semibold text-accent-fg hover:bg-fg">{children}</Link>
}

function Dots() {
  return <span className="inline-flex gap-1" aria-label="…">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-current" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation()
  return <p role="status" className="py-10 text-muted">{label ?? t('common.loading')}</p>
}

export function Notice({ tone = 'warn', title, children, action }: { tone?: 'ok' | 'warn' | 'bad' | 'info'; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const c = { ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', info: 'bg-sunken text-fg' }[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`my-4 rounded-md px-4 py-3 ${c}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className="text-[0.95rem] text-fg">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return <Notice tone="bad" title={message} action={onRetry && <Button kind="quiet" onClick={onRetry}>{t('common.retry')}</Button>} />
}

export function Mono({ children, title }: { children: ReactNode; title?: string }) {
  return <span dir="ltr" title={title} className="font-mono text-[0.85em] tracking-tight break-all">{children}</span>
}

const STATE_TONE: Record<string, string> = {
  draft: 'text-muted', paid: 'text-accent', sealed: 'text-accent', departed_kashgar: 'text-warn',
  crossed_khunjerab: 'text-warn', arrived_sost: 'text-warn', cleared: 'text-ok', held: 'text-bad',
}
export function StateLabel({ state }: { state: string }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${STATE_TONE[state] ?? 'text-muted'}`}>
      <span className="size-2 rounded-full bg-current" aria-hidden />
      {t(`common.state.${state}`, { defaultValue: state })}
    </span>
  )
}

export function RiskDot({ band }: { band?: string }) {
  const { t } = useTranslation()
  if (!band) return null
  const tone = /high|red/i.test(band) ? 'bg-bad' : /med|amber|yellow/i.test(band) ? 'bg-warn' : 'bg-ok'
  return <span className="inline-flex items-center gap-1.5 text-xs text-muted"><span className={`size-2.5 rounded-full ${tone}`} aria-hidden />{t('trader.risk')}: {band}</span>
}

/** Row in a hairline-divided list. */
export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3">
      <span className="text-muted">{label}</span>
      <span className="text-end font-medium">{children}</span>
    </div>
  )
}

export function PinPad({ value, onChange, length = 4, label }: { value: string; onChange: (v: string) => void; length?: number; label: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
  return (
    <div dir="ltr">
      <p className="mb-3 text-center text-muted">{label}</p>
      <div className="mb-4 flex justify-center gap-4" aria-live="polite" aria-label={`${value.length} / ${length}`}>
        {Array.from({ length }, (_, i) => <span key={i} className={`size-3.5 rounded-full border-2 border-fg ${i < value.length ? 'bg-fg' : ''}`} />)}
      </div>
      <div className="mx-auto grid max-w-xs grid-cols-3 gap-px bg-line">
        {keys.map((k, i) => k === '' ? <span key={i} className="bg-canvas" /> : (
          <button
            key={i}
            type="button"
            aria-label={k === '⌫' ? 'Delete' : k}
            onClick={() => onChange(k === '⌫' ? value.slice(0, -1) : (value + k).slice(0, length))}
            className="min-h-16 bg-canvas text-2xl font-medium hover:bg-sunken active:bg-line"
          >
            {k === '⌫' ? <svg width="24" height="24" viewBox="0 0 24 24" className="mx-auto" aria-hidden><path d="M9 6h11v12H9l-6-6z M12 9l6 6 M18 9l-6 6" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg> : k}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Field({ label, hint, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input className="min-h-12 w-full rounded-md border border-line bg-surface px-3 text-base focus:border-accent" {...rest} />
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  )
}
