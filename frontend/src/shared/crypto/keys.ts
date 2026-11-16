// Device-held Ed25519 keys. The private seed is created here and never sent to the server.
// Stored in IndexedDB per user id. Signatures are over UTF-8 bytes of the hex hash (same as backend).
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
  seed: Uint8Array
  publicKey: string
  keyId: string
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
  if (existing) return { key: existing, created: false }
  const seed = ed.utils.randomSecretKey()
  const publicKey = await publicKeyFromSeed(seed)
  const key: DeviceKey = { userId, seed, publicKey, keyId: fingerprint(publicKey) }
  await (await dbp()).put('keys', key)
  return { key, created: true }
}

export async function deleteKey(userId: string): Promise<void> {
  await (await dbp()).delete('keys', userId)
}
