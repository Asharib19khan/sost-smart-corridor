import { api } from '../../shared/api'
import { canonicalHash, type Json } from '../../shared/crypto/canonical'
import { verifyHash } from '../../shared/crypto/keys'
import type { PublicKey, Step } from './types'

export type LocalCheck = { state: 'ok' | 'bad' | 'na'; note: string }

const keyCache = new Map<string, Promise<PublicKey>>()
export function fetchPublicKey(id: string): Promise<PublicKey> {
  let p = keyCache.get(id)
  if (!p) {
    p = api<PublicKey>(`/keys/${encodeURIComponent(id)}/public`, { auth: false })
    p.catch(() => keyCache.delete(id))
    keyCache.set(id, p)
  }
  return p
}

/** Re-hash the signed envelope and check its Ed25519 signature against the registered public key, in this browser. */
export async function checkStep(step: Step): Promise<LocalCheck> {
  if (!step.envelope || !step.signature)
    return { state: 'na', note: 'Not checkable here: the server did not send the signed envelope for this step.' }
  const keyId = (step.envelope.signer_key_id as string | undefined) ?? step.signer?.key_id
  if (!keyId) return { state: 'bad', note: 'The envelope names no signing key.' }
  let hash: string
  try {
    hash = canonicalHash(step.envelope as Json)
  } catch {
    return { state: 'bad', note: 'The envelope contains a non-integer number, so it cannot be a valid signed record.' }
  }
  if (step.hash && step.hash !== hash) return { state: 'bad', note: 'The envelope no longer hashes to the stored hash.' }
  let key: PublicKey
  try {
    key = await fetchPublicKey(keyId)
  } catch (e) {
    return { state: 'na', note: `Key lookup failed: ${(e as Error).message}` }
  }
  const ok = await verifyHash(key.public_key, hash, step.signature)
  return ok
    ? { state: 'ok', note: `Signature valid for key ${keyId}` }
    : { state: 'bad', note: 'The signature does not match the envelope.' }
}
