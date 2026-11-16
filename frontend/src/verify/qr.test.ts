// The seal QR must round-trip through the same decoder the camera scanner uses (jsQR),
// at a realistic payload size (shipment id, hashes, public key, signature).
import { describe, expect, it } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { b64u } from '../shared/crypto/keys'

function realisticSeal(): string {
  const rnd = (n: number) => b64u(crypto.getRandomValues(new Uint8Array(n)))
  const body = { h: 'a'.repeat(64), k: 'b'.repeat(16), m: rnd(64), p: rnd(32), r: 'SSC-2611-0001', s: '1fca4d9bdc03428f8c70d7743b6ff401' }
  return `SSC1.${b64u(new TextEncoder().encode(JSON.stringify(body)))}`
}

function decode(text: string, scale: number): string | null {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const quiet = 4
  const px = (n + quiet * 2) * scale
  const rgba = new Uint8ClampedArray(px * px * 4).fill(255)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.modules.get(x, y))
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + quiet) * scale + dy) * px + (x + quiet) * scale + dx) * 4
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0
          }
  return jsQR(rgba, px, px)?.data ?? null
}

describe('seal QR', () => {
  const url = `https://corridor.example/v/1fca4d9bdc03428f8c70d7743b6ff401#${realisticSeal()}`
  it('is a payload a phone camera can resolve (not absurdly dense)', () => {
    expect(url.length).toBeLessThan(700)
    const version = (QRCode.create(url, { errorCorrectionLevel: 'M' }) as unknown as { version: number }).version
    expect(version).toBeLessThanOrEqual(20)
  })
  it('round-trips through jsQR at 4 and 8 px per module', () => {
    expect(decode(url, 8)).toBe(url)
    expect(decode(url, 4)).toBe(url)
  })
})
