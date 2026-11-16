// Money is integer minor units everywhere. Format only at the edge.
export function fen(v: number | null | undefined): string {
  if (v == null) return '—'
  const a = Math.abs(v)
  const s = `¥${Math.floor(a / 100).toLocaleString('en-US')}.${String(a % 100).padStart(2, '0')}`
  return v < 0 ? `−${s}` : s
}

export function paisa(v: number | null | undefined): string {
  if (v == null) return '—'
  const rs = Math.round(v / 100)
  return `${rs < 0 ? '−' : ''}Rs ${Math.abs(rs).toLocaleString('en-US')}`
}

/** "1,234.50" yuan text → fen; null if not a number. */
export function parseYuan(s: string): number | null {
  const t = s.replace(/[,¥\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null
  const [a, b = ''] = t.split('.')
  return Number(a) * 100 + Number(b.padEnd(2, '0'))
}

export const short = (h?: string | null, n = 10) => (h ? (h.length > n + 6 ? `${h.slice(0, n)}…${h.slice(-4)}` : h) : '—')
