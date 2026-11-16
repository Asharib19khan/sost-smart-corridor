// Build and sign a chain event envelope (v1). See backend/app/integrity/service.py for the spec.
import { canonicalHash, type Json } from './canonical'
import { b64u, signHash, type DeviceKey } from './keys'

export type EventType = 'manifest_sealed' | 'seller_confirmed' | 'payment' | 'checkpoint' | 'customs_decision' | 'eseal'

export interface Envelope {
  v: 1
  shipment_id: string
  seq: number
  type: EventType
  payload: { [k: string]: Json }
  lat_e6: number | null
  lng_e6: number | null
  signed_at: string
  nonce: string
  prev_hash: string
  signer_key_id: string
}

export function newNonce(): string {
  return b64u(crypto.getRandomValues(new Uint8Array(18)))
}

export function isoNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export async function signEnvelope(
  key: DeviceKey,
  head: { seq: number; prev_hash: string },
  fields: Pick<Envelope, 'shipment_id' | 'type' | 'payload'> &
    Partial<Pick<Envelope, 'lat_e6' | 'lng_e6' | 'signed_at' | 'nonce'>>,
): Promise<{ envelope: Envelope; signature: string; hash: string }> {
  const envelope: Envelope = {
    v: 1,
    shipment_id: fields.shipment_id,
    seq: head.seq,
    type: fields.type,
    payload: fields.payload,
    lat_e6: fields.lat_e6 ?? null,
    lng_e6: fields.lng_e6 ?? null,
    signed_at: fields.signed_at ?? isoNow(),
    nonce: fields.nonce ?? newNonce(),
    prev_hash: head.prev_hash,
    signer_key_id: key.keyId,
  }
  const hash = canonicalHash(envelope as unknown as Json)
  return { envelope, signature: await signHash(key.seed, hash), hash }
}
