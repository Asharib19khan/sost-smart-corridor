import { useSyncExternalStore } from 'react'
import { getSession, type Session } from '../../shared/api'

let cache: { raw: string | null; s: Session | null } = { raw: null, s: null }
function snapshot(): Session | null {
  let raw: string | null = null
  try { raw = localStorage.getItem('sost.tokens') } catch { /* ignore */ }
  if (raw !== cache.raw) cache = { raw, s: getSession() }
  return cache.s
}
function subscribe(cb: () => void) {
  window.addEventListener('sost-session', cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener('sost-session', cb); window.removeEventListener('storage', cb) }
}
export const useSession = () => useSyncExternalStore(subscribe, snapshot)

export function homeFor(role: Session['user']['role']): string {
  return role === 'customs' ? '/c' : role === 'admin' ? '/admin' : '/t'
}
