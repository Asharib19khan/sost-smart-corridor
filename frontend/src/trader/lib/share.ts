// Links people open on another phone: the seal verify link and the seller's confirmation link.

/** The address other phones can reach. On a laptop serving localhost, VITE_PUBLIC_ORIGIN (set by dev.ps1 to the
 *  Wi-Fi address) is used so a QR code or shared link opens on a visitor's phone. */
export function publicOrigin(): string {
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  return (local && (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.replace(/\/$/, '')) || location.origin
}

/** navigator.clipboard only exists on https/localhost; phones on the LAN demo use plain http, so fall back. */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  try { return document.execCommand('copy') } catch { return false } finally { ta.remove() }
}

/** Open the phone's share sheet (WhatsApp, WeChat, SMS…). Without one, copy the message instead.
 *  Returns 'shared', 'copied', or 'failed'. A user closing the share sheet counts as shared. */
export async function shareLink(o: { title: string; text: string; url: string }): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try { await navigator.share(o); return 'shared' } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'shared'
    }
  }
  return (await copyText(`${o.text}\n${o.url}`)) ? 'copied' : 'failed'
}
