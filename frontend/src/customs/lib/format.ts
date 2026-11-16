export const fen = (v: number | null | undefined) =>
  v == null ? '—' : `¥${(v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const paisa = (v: number | null | undefined) =>
  v == null ? '—' : `Rs ${(v / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

export function when(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Seconds between the signer's clock and the server's receipt time. */
export function lagSeconds(signed?: string | null, received?: string | null): number | null {
  if (!signed || !received) return null
  const a = Date.parse(signed)
  const b = Date.parse(received)
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 1000)
}

export function lag(s: number | null): string {
  if (s == null) return ''
  const a = Math.abs(s)
  const txt = a < 90 ? `${a}s` : a < 5400 ? `${Math.round(a / 60)} min` : `${Math.round(a / 3600)} h`
  return s < 0 ? `signed ${txt} after receipt` : `+${txt}`
}
