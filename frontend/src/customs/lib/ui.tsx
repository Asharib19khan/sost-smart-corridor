import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, NavLink, useLocation } from 'react-router-dom'
import { setSession } from '../../shared/api'
import { LANGS } from '../../shared/i18n'
import { useSession } from './session'
import { Logo } from '../../shared/Logo'

type Role = 'customs' | 'admin'

/** Renders children only for a signed-in user with one of `roles`; otherwise sends them to /login. */
export function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const s = useSession()
  const loc = useLocation()
  const { t } = useTranslation()
  if (!s) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (!roles.includes(s.user.role as Role))
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="text-lg font-semibold">{t('customs.ui.noAccessTitle')}</h1>
        <p className="mt-2 text-sm text-muted">{t('customs.ui.noAccess', { name: s.user.name, role: s.user.role })}</p>
        <button className="btn mt-4" onClick={() => setSession(null)}>
          {t('customs.ui.switchUser')}
        </button>
      </main>
    )
  return <>{children}</>
}

export function LangSwitch({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation()
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className="sr-only">{t('common.language')}</span>
      <select
        className="rounded border border-line bg-surface px-2 py-1 text-sm"
        value={i18n.language}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        aria-label={t('common.language')}
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Laptop-tool chrome shared by /c and /admin. */
export function ToolShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const s = useSession()
  const nav = 'px-2 py-1 rounded text-sm hover:bg-sunken'
  const active = ({ isActive }: { isActive: boolean }) => `${nav} ${isActive ? 'font-semibold text-fg' : 'text-muted'}`
  return (
    <div className="tool min-h-screen bg-canvas text-fg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <Link to="/c" aria-label={t('common.appName')} className="me-2">
            <Logo size={26} />
          </Link>
          <nav className="flex gap-1">
            <NavLink to="/c" end className={active}>
              {t('customs.ui.navQueue')}
            </NavLink>
            {s?.user.role === 'admin' ? (
              <NavLink to="/admin" className={active}>
                {t('customs.ui.navAdmin')}
              </NavLink>
            ) : null}
            <NavLink to="/v" className={active}>
              {t('customs.ui.navVerify')}
            </NavLink>
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            {s ? (
              <span className="text-muted">
                {s.user.name} · {s.user.role}
              </span>
            ) : null}
            <LangSwitch />
            {s ? (
              <button className="text-sm text-muted underline" onClick={() => setSession(null)}>
                {t('customs.ui.signOut')}
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="page-enter mx-auto max-w-[1400px] px-4 py-4">{children}</main>
    </div>
  )
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" className="py-3">
      <span className="sr-only">{label ?? t('common.loading')}</span>
      {[72, 55, 64].map((w) => <span key={w} aria-hidden className="skeleton my-3 h-3.5 rounded" style={{ width: `${w}%` }} />)}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="my-3 rounded border border-bad bg-bad-soft px-3 py-2 text-sm text-bad">
      <span>{message}</span>
      {onRetry ? (
        <button className="ms-3 underline" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{children}</p>
}

export function RiskBadge({ score, band }: { score: number; band: string }) {
  const { t } = useTranslation()
  const tone =
    band === 'red' || band === 'high'
      ? 'bg-bad-soft text-bad border-bad'
      : band === 'amber' || band === 'medium'
        ? 'bg-warn-soft text-warn border-warn'
        : 'bg-ok-soft text-ok border-ok'
  return (
    <span className={`inline-flex min-w-16 items-center justify-between gap-2 rounded border px-1.5 py-0.5 text-xs font-medium ${tone}`}>
      <span>{t(`common.band.${band}`, { defaultValue: band })}</span>
      <span className="font-mono tabular-nums">{score}</span>
    </span>
  )
}

export function Pill({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  const tone = ok === null ? 'text-muted border-line' : ok ? 'text-ok border-ok bg-ok-soft' : 'text-bad border-bad bg-bad-soft'
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${tone}`}>{children}</span>
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline gap-3 border-b border-line pb-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
        {aside ? <div className="ms-auto text-xs text-muted">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}
