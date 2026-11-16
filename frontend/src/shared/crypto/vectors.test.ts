import { describe, expect, it } from 'vitest'
import vectors from '../../../../docs/test_vectors.json'
import { canonicalString, canonicalHash, type Json } from './canonical'
import { b64uDec, publicKeyFromSeed, signHash, verifyHash } from './keys'

describe('canonical JSON + Ed25519 match the Python backend', () => {
  it('derives the same public key', async () => {
    expect(await publicKeyFromSeed(b64uDec(vectors.signing_seed_b64u))).toBe(vectors.public_key_b64u)
  })
  for (const c of vectors.cases) {
    it(`case ${c.canonical.slice(0, 40)}`, async () => {
      expect(canonicalString(c.input as unknown as Json)).toBe(c.canonical)
      expect(canonicalHash(c.input as unknown as Json)).toBe(c.sha256)
      expect(await signHash(b64uDec(vectors.signing_seed_b64u), c.sha256)).toBe(c.signature_b64u)
      expect(await verifyHash(vectors.public_key_b64u, c.sha256, c.signature_b64u)).toBe(true)
    })
  }
})
