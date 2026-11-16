# Sost Smart Corridor — Build Plan v2 (fixes to blueprint v1)

Date: 2026-11-16 · Demo: 2026-11-17 · Builder: Claude (orchestrator) + subagents

Blueprint v1 stays the source of truth for features. This file records what changed, why, and who builds what.

---

## 1. Fixes to blueprint v1

| # | Gap in v1 | Fix in v2 |
|---|-----------|-----------|
| 1 | "Private key never leaves the device", yet signing is server-side until Week 1 | Ed25519 keys are generated **in the browser** from day one (`@noble/ed25519`, stored in IndexedDB as non-exported material). The server stores only public keys. The server has its **own** key, used only for timestamp counter-signatures. |
| 2 | The verify page trusts the server's database | The **seal QR carries** `{shipment_id, manifest_hash, trader_sig, trader_pubkey_fpr}` (compact, base64url). The verify page checks the signature **client-side**, then compares against the server's chain. A rewritten database is caught even if the server is compromised. |
| 3 | Whoever holds the DB can recompute the whole chain | Every event is signed by the actor's device key (not the server), and the **chain head is re-signed by the server key and published** at `/verify/head` after each event. Rewriting history needs the trader's private key. |
| 4 | Seller counter-signing promised, but built in Week 4 | Built now: the seller page `/s/{token}` (Mandarin) generates its own key, signs `manifest_hash + amount`, and the event is chained. |
| 5 | Tamper demo needs the admin module, which is deferred | A dedicated **"Tamper lab"** screen (admin role, red banner "bypasses API — simulates DB attacker") runs a raw SQL `UPDATE` / `DELETE` / reorder. Honest and real. |
| 6 | Khunjerab has little or no signal | Checkpoints are **signed offline** on the phone, queued in IndexedDB, and synced later. `signed_at` (device) and `received_at` (server) are both stored; the nonce prevents replay. |
| 7 | GPS sold as proof | Renamed "location consistency signal". It feeds the risk score, it doesn't decide anything. Hardware e-seal = proof (next phase). |
| 8 | PaddleOCR is fragile on handwritten receipts and heavy to install | **Two readers behind one interface**: vision LLM (Claude, forced JSON schema) primary, PaddleOCR fallback/cross-check. If both agree → high confidence. All values re-checked by code (line sums, totals, value bands). |
| 9 | Data model gaps | Added `sellers`, `payments`, `ledger_txns` (debits = credits enforced), `customs_decisions`, `checkpoints_ref`, `credit_limits`. `events.signer_key_id` covers customs decisions too. |
| 10 | "Credit limit unlocks" undefined | Rule: credit limit = `max(0, (trust − 60) × 2,000 PKR)`, capped at 100,000 PKR. Shown with its formula on screen. |
| 11 | Risk score weights undefined | Fixed, explainable weights: integrity broken +60, payment mismatch >2% +25, value-band outlier +15 per line (max 30), location inconsistency +15, new trader +10, trust >80 −15. Bands: 0–29 green, 30–59 amber, 60+ red. Top 3 reasons shown. |
| 12 | Trust score is easy to game | Gains only come from **customs-cleared** shipments (signed decision), so a trader can't farm their own score. Every change is stored with its reason. |
| 13 | No "why" in the pitch | Problem slide: under-invoicing, clearance delays, cash-carrying risk on the Khunjerab route. Numbers must be **sourced** (research agent); unsourced numbers are left out. |
| 14 | Payments regulation not addressed | Pitch line: sandbox ledger only. Production needs a licensed partner (bank / EMI under SBP rules); CNY settlement goes through a correspondent bank, not Raast (Raast is PKR-only). |
| 15 | Live demo risk | Pre-seeded shipments in every state, a recorded backup video, and a local backend fallback on the laptop. |
| 16 | No database tooling on this laptop (no Postgres/Docker) | SQLAlchemy over **Postgres (Supabase, if credentials are available) or SQLite** with the same code. Append-only audit is enforced by triggers on both. |

---

## 2. Architecture (unchanged shape, sharper edges)

- **Backend:** FastAPI + Pydantic v2 + SQLAlchemy 2, `uv`-managed, Python 3.13. Server-side signature checks with PyNaCl.
- **Frontend:** React + Vite + TypeScript + Tailwind, PWA (vite-plugin-pwa), i18next (ur RTL / en / zh), `@noble/ed25519`, `qrcode` + `jsQR` for scanning, Leaflet.
- **Canonical form:** RFC 8785 JSON Canonicalisation (JCS) on both sides. One shared test vector file proves Python and JS produce the same hash.
- **Event envelope** (also the format for the future IoT e-seal):
  `{v, shipment_id, seq, type, payload, lat, lng, signed_at, nonce, prev_hash, signer_key_id}` → `hash = sha256(JCS(envelope))`, `sig = ed25519(hash)`.

---

## 3. Agent distribution

Claude (main session) = **orchestrator + integrator**. Owns contracts, merges work, runs the end-to-end check. Subagents get isolated git worktrees and a written contract, never vague tasks.

### Phase 0 — Contracts (orchestrator, sequential, ~first block)
1. `git init`, repo layout, `docs/CONTRACTS.md`: DB schema, OpenAPI endpoint list, event envelope, JCS test vectors, i18n key list, state machine.
2. Backend skeleton + frontend skeleton that both boot. Everything later plugs into these.

### Phase 1 — Parallel build (5 agents, worktrees)

| Agent | Owns | Done when |
|---|---|---|
| **A1 Integrity & Auth** | `backend/app/{auth,keys,integrity,audit}` — seeded accounts + PIN/JWT (OTP stubbed to console in dev, labelled), key register/revoke, JCS, chain build/verify, server head-signing, nonce replay guard, lockout after 5 bad PINs, rate limits, audit triggers | pytest: tamper/delete/reorder/replay/revoked-key all detected at the right `seq`; Python↔JS vectors match |
| **A2 AI Reader** | `backend/app/ocr` — upload safety (magic bytes, size, re-encode via Pillow), vision-LLM + PaddleOCR readers, line parser, sum checks, translation (zh→en/ur), HS 8-digit suggestions with confidence, value-band table (~40 hand-built rows), prompt-injection guard | 5 printed receipts scan correctly; injected receipt flagged with values unchanged; `.exe` renamed to `.jpg` rejected |
| **A3 Transit, Ledger, Risk, Customs** | `backend/app/{shipments,transit,ledger,risk,customs,trust}` — state machine, geofences, double-entry ledger (CNY/PKR, fixed demo FX rate, labelled), payment↔manifest match, duty calculator (table of ~40 HS rates, labelled "indicative"), risk weights, trust and credit limit, customs decisions | pytest for every rule in §1 rows 10–12; illegal state jumps refused; trader A gets 403 on trader B's shipment |
| **A4 Trader + Seller frontend** | `frontend/src/{trader,seller,shared}` — browser keys, Home, Scan (camera + edge guide), Review (yellow low-confidence lines, one-tap fix), Pay (PIN), Seal (QR), Track (timeline + map, offline queue), Wallet/Trust; seller Mandarin page; ur/en/zh with RTL | Playwright happy path on a mobile viewport; offline checkpoint syncs after reconnect |
| **A5 Customs + Verify + Tamper lab** | `frontend/src/{customs,verify,admin}` — risk-sorted queue, shipment view, single integrity banner ("broken at step N"), approve/hold/request docs (signed), public verify (QR scan, client-side signature check), Tamper lab | Playwright: tamper → banner turns red at the exact line; QR verifies on a second device |

### Phase 2 — Parallel support (3 agents, start alongside Phase 1)

| Agent | Owns |
|---|---|
| **R1 Research** | Sourced facts for the pitch: Sost/Khunjerab trade volumes, clearance times, PCT (Pakistan 8-digit) code examples and duty rates for the ~40 demo items, SBP rules on outward CNY payments. Every number has a link. |
| **D1 Demo assets** | 5 realistic printable Chinese receipts (HTML → PDF, including one handwritten-style and one with hidden injection text), seed data script with shipments in every state. |
| **P1 Pitch** | Slides deck + 90-second script + backup video plan, built from R1's facts only. |

### Phase 3 — Hardening and review (sequential)
1. **Security review agent** — the `security-review` and `semgrep` skills over the whole repo, plus a `/code-review high` pass.
2. **QA agent** — runs the full test list (blueprint p.11) + Playwright on phone viewport, Chrome DevTools Lighthouse for PWA and headers.
3. **Orchestrator** — fixes, runs the 90-second demo end to end in a real browser 5 times, records the backup video.

### Phase 4 — Deploy
Render (API) + Vercel (frontend) over HTTPS **if you give me accounts/tokens**; otherwise a local run + `cloudflared` tunnel for HTTPS on phones. Local fallback is always ready.

---

## 4. Definition of done ("perfection" made testable)
- Every item on blueprint p.11's test list passes in CI (pytest + Playwright).
- No screen element without a working handler (a lint pass + click-through by the QA agent).
- Every demo-only shortcut (stubbed OTP, fixed FX rate, indicative duty) is **labelled on screen**.
- The 90-second demo runs 5 times in a row with no manual fixes.

---

## 5. What I need from you
1. **Anthropic API key** for the vision reader (or I run PaddleOCR only).
2. Optional: Supabase project URL/key (else SQLite), Render/Vercel accounts (else tunnel).
3. **Photos of real Chinese receipts**, if you have any. Printed fakes are the fallback.
4. Team name / pitch tone for slides.
