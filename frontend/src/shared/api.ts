// Single API client. Base is /api (proxied to FastAPI in dev; VITE_API_BASE in prod).
// Errors carry the server's plain-language `detail` so every screen can say what to do next.

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const TOKENS = 'sost.tokens'

export interface Session {
  access: string
  refresh: string
  user: { id: string; role: 'trader' | 'seller' | 'customs' | 'admin' | 'driver'; name: string }
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKENS)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function setSession(s: Session | null): void {
  try {
    if (s) localStorage.setItem(TOKENS, JSON.stringify(s))
    else localStorage.removeItem(TOKENS)
  } catch {
    /* storage unavailable: session lives only in memory for this tab */
  }
  window.dispatchEvent(new Event('sost-session'))
}

async function refresh(s: Session): Promise<Session | null> {
  const r = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: s.refresh }),
  })
  if (!r.ok) return null
  const next = { ...s, ...(await r.json()) } as Session
  setSession(next)
  return next
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData; auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { method = opts.body || opts.form ? 'POST' : 'GET', auth = true, timeoutMs = 30000 } = opts
  const go = async (s: Session | null) => {
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (auth && s) headers.Authorization = `Bearer ${s.access}`
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), timeoutMs)
    try {
      return await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
        signal: ctl.signal,
      })
    } catch (e) {
      throw new ApiError(0, (e as Error).name === 'AbortError'
        ? 'The server took too long. Check your connection and try again.'
        : 'No connection. Your work is kept; try again when you have signal.')
    } finally {
      clearTimeout(t)
    }
  }
  let s = getSession()
  let r = await go(s)
  if (r.status === 401 && auth && s) {
    s = await refresh(s)
    if (s) r = await go(s)
    else setSession(null)
  }
  if (!r.ok) {
    let msg = `Request failed (${r.status}).`
    try {
      const j = await r.json()
      msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(r.status, msg)
  }
  return (r.status === 204 ? undefined : await r.json()) as T
}
