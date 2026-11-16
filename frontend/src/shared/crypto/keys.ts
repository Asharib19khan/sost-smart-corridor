// Device-held Ed25519 keys. Where the browser supports it (all current Chrome, Safari, Firefox, Edge), the key is
// created by WebCrypto as NON-EXTRACTABLE: the page can ask the browser to sign, but no script, including an
// injected one, can read the private key. Older browsers fall back to a seed kept in IndexedDB.
// Signatures are over UTF-8 bytes of the hex hash (same as backend). Ed25519 is deterministic, so both paths
// produce identical signatures for the same key.
import * as ed from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { openDB } from 'idb'

export function b64u(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64uDec(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function fingerprint(publicKeyB64u: string): string {
  return bytesToHex(sha256(b64uDec(publicKeyB64u))).slice(0, 16)
}

export async function publicKeyFromSeed(seed: Uint8Array): Promise<string> {
  return b64u(await ed.getPublicKeyAsync(seed))
}

export async function signHash(seed: Uint8Array, hashHex: string): Promise<string> {
  return b64u(await ed.signAsync(new TextEncoder().encode(hashHex), seed))
}

export async function verifyHash(publicKeyB64u: string, hashHex: string, sigB64u: string): Promise<boolean> {
  try {
    return await ed.verifyAsync(b64uDec(sigB64u), new TextEncoder().encode(hashHex), b64uDec(publicKeyB64u))
  } catch {
    return false
  }
}

export interface DeviceKey {
  userId: string
  /** Non-extractable WebCrypto private key (preferred). */
  priv?: CryptoKey
  /** Legacy / fallback raw seed, only on browsers without WebCrypto Ed25519. */
  seed?: Uint8Array
  publicKey: string
  keyId: string
}

let webCryptoEd25519: Promise<boolean> | null = null
/** Feature-detect once: generate and sign with a throwaway non-extractable key. */
export function hasWebCryptoEd25519(): Promise<boolean> {
  webCryptoEd25519 ??= (async () => {
    try {
      const k = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair
      await crypto.subtle.sign({ name: 'Ed25519' }, k.privateKey, new Uint8Array([1]))
      return true
    } catch { return false }
  })()
  return webCryptoEd25519
}

/** Sign a hex hash with a device key, whichever kind it is. */
export async function signWith(key: DeviceKey, hashHex: string): Promise<string> {
  if (key.priv) return b64u(new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key.priv, new TextEncoder().encode(hashHex))))
  if (key.seed) return signHash(key.seed, hashHex)
  throw new Error('This device key cannot sign. Sign in again to create a new one.')
}

const dbp = () =>
  openDB('sost-keys', 1, {
    upgrade(db) {
      db.createObjectStore('keys', { keyPath: 'userId' })
    },
  })

export async function loadKey(userId: string): Promise<DeviceKey | undefined> {
  return (await dbp()).get('keys', userId)
}

/** Returns the existing key for this user on this device, or creates one. Caller registers it via POST /keys. */
export async function getOrCreateKey(userId: string): Promise<{ key: DeviceKey; created: boolean }> {
  const existing = await loadKey(userId)
  const strong = await hasWebCryptoEd25519()
  // A raw seed on a browser that can hold a non-extractable key is upgraded: the seed is deleted from this
  // device and a new key is registered. Old signatures still verify (the server keeps every public key).
  if (existing && !(existing.seed && strong)) return { key: existing, created: false }
  let key: DeviceKey
  if (strong) {
    const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair
    const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
    key = { userId, priv: pair.privateKey, publicKey, keyId: fingerprint(publicKey) }
  } else {
    const seed = ed.utils.randomSecretKey()
    const publicKey = await publicKeyFromSeed(seed)
    key = { userId, seed, publicKey, keyId: fingerprint(publicKey) }
  }
  await (await dbp()).put('keys', key) // a CryptoKey is stored by structured clone and stays non-extractable
  return { key, created: true }
}

export async function deleteKey(userId: string): Promise<void> {
  await (await dbp()).delete('keys', userId)
}
