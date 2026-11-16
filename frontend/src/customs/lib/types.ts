export interface Step {
  seq: number
  type: string
  ok: boolean
  problem: string | null
  signed_at: string | null
  received_at: string | null
  signer: { name: string; role: string; key_id: string; revoked: boolean } | null
  lat: number | null
  lng: number | null
  flags: string[] | null
  payload: Record<string, unknown> | null
  /** Not in the frozen contract; used for the in-browser signature check when the server includes them. */
  envelope?: Record<string, unknown>
  signature?: string
  hash?: string
}

export interface VerifyReport {
  shipment: { id: string; ref: string; state: string; trader_name: string }
  seal: string | null
  overall: { ok: boolean; message: string }
  manifest: {
    sealed_hash: string | null
    current_hash: string | null
    ok: boolean
    problems: { line_no: number; problem: string; current?: unknown }[]
  }
  chain: { ok: boolean; broken_at: number | null; head_hash: string; steps: Step[] }
}

export interface Risk {
  score: number
  band: string
  reasons: string[]
}

export interface QueueRow {
  id: string
  ref: string
  trader: string | { id?: string; name: string }
  state: string
  risk: Risk
  integrity_ok: boolean
  arrived_at: string | null
}

export interface Line {
  id: string
  receipt_id: string | null
  line_no: number
  item_zh: string | null
  item_en: string | null
  item_ur?: string | null
  hs_code: string | null
  hs_confidence?: number | null
  qty: number
  unit: string | null
  unit_price_fen: number
  total_fen: number
  value_flag: string | null
}

export interface ShipmentDetail {
  id: string
  ref: string
  state: string
  trader: { id: string; name: string }
  created_at: string
  seal: string | null
  risk: Risk | null
  lines: Line[]
  receipts: { id: string; status: string; seller_id: string | null }[]
  payments: Record<string, unknown>[]
  events: Step[]
  allowed_next: string[]
}

export interface Duty {
  fx_cny_pkr: number | string
  fx_label: string
  lines: { line_no: number; hs_code: string; value_paisa: number; duty_pct: number; duty_paisa: number; sales_tax_paisa: number }[]
  total_paisa: number
  psw_record?: Record<string, unknown>
}

export interface PublicKey {
  id: string
  public_key: string
  revoked_at: string | null
  owner: { name: string; role: string }
}

export const traderName = (t: QueueRow['trader']) => (typeof t === 'string' ? t : (t?.name ?? '—'))
