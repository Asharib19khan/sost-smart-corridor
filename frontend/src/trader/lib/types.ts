import type { Json } from '../../shared/crypto/canonical'

export type ShipmentState = 'draft' | 'paid' | 'sealed' | 'departed_kashgar' | 'crossed_khunjerab' | 'arrived_sost' | 'cleared' | 'held'
export interface Risk { score: number; band: string; reasons: string[] }
export interface ShipmentSummary { id: string; ref: string; state: ShipmentState; total_fen?: number; risk?: Risk; created_at?: string }
export interface ShipmentDetail extends ShipmentSummary {
  trader: { id: string; name: string }
  seal: string | null
  lines: ManifestLine[]
  receipts: { id: string; status: string; seller_id: string | null }[]
  payments: { id?: string; amount_fen?: number; seller_id?: string }[]
  events: unknown[]
  allowed_next: string[]
}
export interface ManifestLine {
  id: string; receipt_id: string; line_no: number; item_zh: string; item_en: string; item_ur: string
  hs_code: string; hs_confidence: number; qty: number; unit: string; unit_price_fen: number; total_fen: number
  value_flag: string | null
}
export interface Receipt { id: string; status: string; reader: string | null; flags: string[]; total_fen: number | null; error: string | null; lines: ManifestLine[] }
export interface Seller { id: string; shop_name_zh: string; shop_name_en: string; market: string }
export type ManifestDoc = { [k: string]: Json } & { line_hashes: string[]; total_fen: number; lines: Json[] }
export interface Manifest { canonical: ManifestDoc; manifest_hash: string }
export interface Step {
  seq: number; type: string; ok: boolean; problem: string | null; signed_at: string; received_at: string
  signer: { name: string; role: string; key_id: string; revoked: boolean }
  lat: number | null; lng: number | null; flags: string[]; payload: { [k: string]: Json }
  hash?: string; signature?: string
}
export interface VerifyReport {
  shipment: { id: string; ref: string; state: string; trader_name: string }
  overall: { ok: boolean; message: string }
  chain: { ok: boolean; broken_at: number | null; head_hash: string; steps: Step[] }
}

/** hs_confidence may arrive as 0–1 or 0–100; normalise to percent. */
export const pct = (c: number) => Math.round(c <= 1 ? c * 100 : c)
