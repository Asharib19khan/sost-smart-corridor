import { useTranslation } from 'react-i18next'

// The mark: a seal ring around the Karakoram pass, crossed by the route with its three signed checkpoints
// (Kashgar, Khunjerab, Sost). Drawn on a 32-unit grid so it stays crisp from 16px to hero size.

export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={`shrink-0 ${className}`}>
      <circle cx="16" cy="16" r="14.25" fill="var(--color-accent)" />
      <circle cx="16" cy="16" r="11.6" fill="none" stroke="var(--color-canvas)" strokeOpacity=".35" strokeWidth=".9" strokeDasharray="1.4 1.6" />
      <path d="M6.6 21.4 12.6 11.2l3.4 5.6 3.1-4.4 6.3 9" fill="none" stroke="var(--color-canvas)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M7.4 24.2h17.2" stroke="var(--color-canvas)" strokeOpacity=".55" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="9.4" cy="24.2" r="1.35" fill="var(--color-canvas)" />
      <circle cx="16" cy="24.2" r="1.35" fill="var(--color-canvas)" />
      <circle cx="22.6" cy="24.2" r="1.35" fill="var(--color-canvas)" />
    </svg>
  )
}

/** Mark plus wordmark. `compact` hides the second line for tight headers. */
export function Logo({ compact = false, size = 28 }: { compact?: boolean; size?: number }) {
  const { t } = useTranslation()
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark size={size} />
      <span className="min-w-0 leading-none">
        <span className="block truncate text-[0.95rem] font-semibold tracking-tight">{t('common.appName')}</span>
        {!compact && <span className="mt-1 block truncate text-[0.7rem] font-medium tracking-wide text-muted">{t('common.route')}</span>}
      </span>
    </span>
  )
}
