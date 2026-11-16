// RFC 8785-style JSON canonicalisation + SHA-256. Must match backend/app/core/canonical.py.
// Floats are forbidden in signed payloads: money is integer minor units (fen / paisa),
// coordinates are integer microdegrees (lat_e6 / lng_e6).
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

function ser(v: Json): string {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('floats not allowed in canonical payloads')
    return String(v)
  }
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(ser).join(',') + ']'
  // JS string comparison is by UTF-16 code units, exactly what JCS requires.
  const keys = Object.keys(v).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + ser(v[k] as Json)).join(',') + '}'
}

export function canonicalize(v: Json): Uint8Array {
  return new TextEncoder().encode(ser(v))
}

export function canonicalString(v: Json): string {
  return ser(v)
}

export function canonicalHash(v: Json): string {
  return bytesToHex(sha256(canonicalize(v)))
}
