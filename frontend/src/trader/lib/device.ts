// Device key bootstrap + signed POST with the contract's 409 "Chain moved on" retry.
import { api, ApiError } from '../../shared/api'
import { deleteKey, getOrCreateKey, type DeviceKey } from '../../shared/crypto/keys'
import { isoNow, newNonce, signEnvelope, type EventType } from '../../shared/crypto/envelope'
import type { Json } from '../../shared/crypto/canonical'

export function deviceLabel(): string {
  const ua = navigator.userAgent
  const m = ua.match(/Android[^;)]*;\s*([^;)]+)/)
  return (m ? m[1] : /iPhone/.test(ua) ? 'iPhone' : 'Browser').slice(0, 60)
}

type Register = (k: DeviceKey) => Promise<unknown>
const registerMine: Register = (k) => api('/keys', { body: { public_key: k.publicKey, label: deviceLabel() } })

/** Ensure this device holds a registered key for userId (POST only when newly created). */
export async function ensureKey(userId: string, register: Register = registerMine): Promise<DeviceKey> {
  const { key, created } = await getOrCreateKey(userId)
  if (created) {
    try {
      await register(key)
    } catch (e) {
      await deleteKey(userId) // never keep an unregistered key; next attempt registers afresh
      throw e
    }
  }
  return key
}

export async function reRegister(userId: string, register: Register = registerMine): Promise<DeviceKey> {
  await deleteKey(userId)
  return ensureKey(userId, register)
}

/** Server refused the signature because it doesn't know this key, or it was revoked. */
export function isKeyProblem(e: unknown): boolean {
  return e instanceof ApiError && [400, 401, 403, 404, 422].includes(e.status) && /key/i.test(e.message)
}

export interface SignFields { lat_e6?: number | null; lng_e6?: number | null; signed_at?: string; nonce?: string }
type Head = { seq: number; prev_hash: string }

/**
 * GET head → sign → POST. On 409 "Chain moved on": re-fetch head and re-sign,
 * KEEPING signed_at, lat_e6, lng_e6 and nonce.
 */
export async function signAndPost<T>(o: {
  key: DeviceKey
  shipmentId: string
  type: EventType
  payload: { [k: string]: Json }
  path: string
  extra?: (hash: string) => Promise<Record<string, unknown>> | Record<string, unknown>
  fields?: SignFields
  head?: () => Promise<Head>
  auth?: boolean
}): Promise<T> {
  const fixed = { signed_at: isoNow(), nonce: newNonce(), lat_e6: null, lng_e6: null, ...o.fields }
  const getHead = o.head ?? (() => api<Head>(`/shipments/${o.shipmentId}/chain/head`))
  for (let attempt = 0; ; attempt++) {
    const head = await getHead()
    const { envelope, signature, hash } = await signEnvelope(o.key, head, {
      shipment_id: o.shipmentId, type: o.type, payload: o.payload, ...fixed,
    })
    const extra = o.extra ? await o.extra(hash) : {}
    try {
      return await api<T>(o.path, { body: { ...extra, envelope, signature }, auth: o.auth ?? true })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /chain moved on/i.test(e.message) && attempt < 3) continue
      throw e
    }
  }
}
