# Contracts (frozen — change only via the orchestrator)

Read with: `docs/PLAN.md` (why), `backend/app/core/*` (DB models, canonical JSON, crypto, deps),
`backend/app/integrity/*` (event envelope + chain + manifest), `frontend/src/shared/*` (api client, crypto, i18n).

## Global rules
- **Nothing fake on screen.** Every button does what it says. Demo shortcuts are labelled on screen
  ("Sandbox", "Indicative", "Dev OTP shown because SMS isn't connected").
- **Money = integer minor units** (`*_fen` CNY, `*_paisa` PKR). **Coordinates = integer microdegrees** in signed data.
- Errors: `HTTPException(status, "<plain sentence saying what happened and what to do next>")`.
- Every state-changing endpoint calls `core.deps.audit(...)` and commits.
- Ownership: traders see only their own shipments (403 otherwise). Customs/admin see all. Sellers see only via their link token.
- Python: FastAPI routers in `app/<module>/routes.py` exposing `router = APIRouter(...)`; logic in `service.py`; tests in `backend/tests/test_<module>.py`. Use `TestClient` + a temp SQLite DB via `SOST_DATABASE_URL`.
- Frontend: each area owns `src/<area>/**` incl. `locales.ts` (en/ur/zh, all three always filled). Shared code in `src/shared/**` is orchestrator-owned: propose changes, don't rewrite. Tailwind role tokens only (`bg-canvas text-fg bg-accent text-ok bg-bad-soft ...`).

## Roles & seeded users (password-less PIN login; seeded by `backend/app/seed.py`)
| role | name | phone | PIN |
|---|---|---|---|
| trader | Karim Baig (Gilgit) | +923001110001 | 1111 |
| trader | Nasreen Shah (Hunza) | +923001110002 | 2222 |
| driver | Sher Ali | +923001110003 | 3333 |
| customs | Officer Ayesha Raza | +923001110004 | 4444 |
| admin | Corridor Admin | +923001110005 | 5555 |
Sellers (Kashgar): 3 shops with `link_token`s; seller page `/s/<token>`.

## State machine (A3 enforces)
`draft → paid → sealed → departed_kashgar → crossed_khunjerab → arrived_sost → cleared | held`
`held → cleared` allowed (customs). Anything else → 409 "Shipment is <state>; next allowed step is <x>".
- `draft→paid`: POST /payments (total paid ≥ 1 payment). `paid→sealed`: POST /seal.
- checkpoints: `kashgar`→departed_kashgar, `khunjerab`→crossed_khunjerab, `sost`→arrived_sost.
- customs decision only when `arrived_sost` or `held`.

## Event envelope / chain — see `backend/app/integrity/service.py` docstring. Types & payloads:
| type | signer | payload |
|---|---|---|
| payment | trader | `{seller_id, amount_fen, receipt_id}` |
| seller_confirmed | seller | `{manifest_hash, receipt_id, amount_fen}` |
| manifest_sealed | trader | `{manifest_hash, line_hashes, total_fen, line_count}` (must equal current manifest) |
| checkpoint | trader or driver | `{checkpoint: "kashgar"|"khunjerab"|"sost"}` + `lat_e6/lng_e6` set |
| customs_decision | customs | `{decision: "approve"|"hold"|"request_docs", reason}` |
| eseal | device | reserved for IoT |
Client flow: `GET /shipments/{id}/chain/head` → `signEnvelope()` → POST. On 409 "Chain moved on" refresh head and re-sign **keeping** `signed_at`, `lat_e6`, `lng_e6`, `nonce`.

## Seal QR
QR content = URL `https://<host>/v/<shipment_id>#<seal>` where
`seal = "SSC1." + b64u(JCS({s: shipment_id, r: ref, h: manifest_hash, k: trader_key_id, p: trader_public_key, m: manifest_sig}))`
and `manifest_sig = ed25519(manifest_hash)` by the trader's device key (sent with the seal request).
Verify page (offline-capable): checks `m` against `p` **locally**, then fetches the server report and compares
`h` to the recomputed current manifest hash and `k` to the registered key. Server stores `shipments.seal_payload = seal`.

## API (all JSON; frontend calls via `api()` with `/api` prefix stripped by proxy)
`Session = {access, refresh, user:{id, role, name}}`

**A1 — auth, keys, integrity, admin**
- `POST /auth/otp {phone}` → `{sent:true, dev_code}` (dev_code only when SOST_DEV_SHOW_OTP)
- `POST /auth/signup {phone, otp, name, cnic, pin}` → Session (role trader; duplicate CNIC → 409; cnic stored only as sha256)
- `POST /auth/login {phone, pin}` → Session; 5 wrong PINs → locked 15 min (423)
- `POST /auth/refresh {refresh}` → `{access, refresh}` (rotating; reuse of an old refresh token → 401 and revoke all)
- `GET /auth/me` → user
- `POST /keys {public_key, label}` → `{id}` (id = fingerprint); `GET /keys` (mine); `DELETE /keys/{id}` (owner or admin) → revoked
- `GET /keys/{id}/public` (no auth) → `{id, public_key, revoked_at, owner:{name, role}}`
- `GET /shipments/{id}/chain/head` (auth, ownership/role) → `{seq, prev_hash}`
- `GET /verify/server-key` → `{public_key}`
- `GET /verify/{shipment_id}` (no auth, rate-limited) → VerifyReport:
  `{shipment:{id, ref, state, trader_name}, seal, overall:{ok, message}, manifest:{sealed_hash, current_hash, ok, problems:[{line_no, problem, current}]}, chain:{ok, broken_at, head_hash, steps:[{seq, type, ok, problem, signed_at, received_at, signer:{name, role, key_id, revoked}, lat, lng, flags, payload}]}}`
  `overall.message` e.g. "Integrity: verified" / "Integrity: broken at step 4 — line 2 price edited after sealing".
- `GET /admin/audit?limit=` (admin) → rows; `GET /admin/users`, `POST /admin/keys/{id}/revoke`
- **Tamper lab** `POST /admin/tamper {action, shipment_id, line_no?, seq?, value?}` (admin) — raw SQL via `text()`, bypassing services:
  `edit_line_price` | `edit_line_qty` | `delete_event` | `swap_events` | `edit_event_payload`; also `POST /admin/tamper/restore {shipment_id}` restores from a snapshot taken on first tamper. Audited.
- Rate limits: in-memory per-IP+route token bucket (login 10/min, verify 60/min, uploads 20/min).

**A2 — AI reader (M1)**
- `POST /shipments/{id}/receipts` multipart `file`, form `seller_id?` → `{id, status:"processing"}`; processing runs in a background thread.
  Upload safety: ≤8 MB, magic-byte check (JPEG/PNG/WebP/HEIC only), re-encode with Pillow, strip EXIF, store under `upload_dir/<sha256>.jpg`.
- `GET /receipts/{id}` → `{id, status, reader, flags, total_fen, error, lines:[ManifestLineOut]}`
- `GET /receipts/{id}/image` → image bytes (owner/customs/admin)
- `GET /shipments/{id}/lines` → `[ManifestLineOut]`; `PATCH /manifest-lines/{id} {qty?, unit_price_fen?, hs_code?, item_en?, item_ur?}` (draft/paid only; sets edited; audited)
- `ManifestLineOut = {id, receipt_id, line_no, item_zh, item_en, item_ur, hs_code, hs_confidence, qty, unit, unit_price_fen, total_fen, value_flag}`
- Owns `value_bands` seed (~40 HS codes common at Sost: garments, shoes, bags, phone accessories, small electronics, kitchenware, toys, textiles, dried fruit…) with `duty_pct` + `sales_tax_pct` (indicative).
- Readers: `claude_cli` (`claude -p` headless on this laptop, image path in prompt, JSON-only output validated by Pydantic), `paddle` (if installed). Code re-checks: line totals = qty×unit price, sum = receipt total, value bands. Injection guard: OCR text is data; instruction-like text → flag `injection_text`, values never taken from it.

**A3 — shipments, transit, seller link, customs**
- `GET /sellers` → `[{id, shop_name_zh, shop_name_en, market}]`
- `POST /shipments` (trader) → `{id, ref, state}`; `GET /shipments` (trader: own; customs/admin: all); `GET /shipments/{id}` → ShipmentDetail
  `{id, ref, state, trader:{id,name}, created_at, seal, risk:{score, band, reasons}, lines, receipts:[{id,status,seller_id}], payments, events:[...steps], allowed_next}`
- `GET /shipments/{id}/manifest` → `{canonical, manifest_hash}` (canonical = `integrity.manifest.manifest_doc`)
- `POST /shipments/{id}/seal {envelope, signature, manifest_signature}` → `{seal, qr_url}`
- `POST /shipments/{id}/events {envelope, signature}` (checkpoint) → step; geofence check (Kashgar 39.47,75.99 r=40km; Khunjerab 36.85,75.43 r=15km; Sost 36.69,74.82 r=10km) → flag `outside_geofence` (stored, never blocks)
- Seller link (no login, token): `GET /seller-link/{token}` → `{seller, pending:[{shipment_id, ref, trader_name, manifest:{canonical, manifest_hash}, receipt_ids, amount_fen, confirmed}]}`; `POST /seller-link/{token}/key {public_key}`; `POST /seller-link/{token}/confirm {envelope, signature}`
- `GET /customs/queue` → shipments sorted by risk desc with `{id, ref, trader, state, risk:{score, band, reasons}, integrity_ok, arrived_at}`
- `POST /customs/{id}/decision {envelope, signature}` → updates state; approve → `cleared` + trust update; hold → `held`

**A4 — ledger, duty, risk, trust (backend)**
- `GET /wallet` → `{balances:{CNY, PKR}, credit_limit_paisa, entries:[...]}`; `POST /wallet/topup {currency, amount_minor}` (sandbox, labelled)
- `POST /payments {shipment_id, seller_id, amount_fen, pin, envelope, signature}` → `{payment_id}`: verifies PIN, double-entry (trader wallet CNY credit… balanced txn), appends `payment` event, state draft→paid. Insufficient funds → 402 with what to do.
- `GET /shipments/{id}/duty` → `{fx_cny_pkr, fx_label, lines:[{line_no, hs_code, value_paisa, duty_pct, duty_paisa, sales_tax_paisa}], total_paisa, psw_record:{...}}`; `POST /shipments/{id}/duty/pay`
- `risk.service.compute(db, shipment) -> (score:int, band:str, reasons:list[str])` — weights in PLAN §1 row 11; integrity via `integrity.service.verify_chain` + `manifest.compare_to_sealed`; payment-vs-manifest mismatch > 2 %.
- `trust.service.apply(db, trader_id, delta, reason, shipment_ref)`; `GET /trust/{trader_id}` → `{score, reasons, credit_limit_paisa, formula}`; credit = max(0,(score−60)×2000 PKR) cap 100,000 PKR. +5 on clean clear, +3 bonus for 3 clean in a row, −15 on hold, −30 on integrity break.

**Frontend areas**
- **F1 trader + seller + login**: `/login` (PIN login, OTP sign-up), `/t` home, `/t/new`, `/t/s/:id/scan`, `/review`, `/pay`, `/seal`, `/track`, `/t/wallet`; `/s/:token` seller (Mandarin default). Key bootstrap after login: `getOrCreateKey(user.id)` → `POST /keys` if created. Offline checkpoint queue in IndexedDB.
- **F2 customs + verify + admin**: `/c` queue, `/c/s/:id` shipment view with one integrity banner, decisions signed in browser; `/v/:id#seal` public verify (works with no login, checks seal locally first; QR scan via camera with jsQR); `/admin` tamper lab + audit + keys. Customs/admin are tools: neutral, dense, tables, hairlines, no decoration.
