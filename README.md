# Sost Smart Corridor (working name)

Prototype for the 17 Nov 2026 demo: a Pakistani trader buys in Kashgar and trucks goods over Khunjerab to the Sost dry port.
The phone app reads the receipt, translates it, suggests HS codes, takes sandbox payment, seals the manifest with a key
that never leaves the phone, and records signed GPS checkpoints. Customs sees one integrity banner and can re-verify
every signature in the browser. Anyone can scan the seal QR with no login.

Nothing on screen is hard-coded to look like it works. Where something is a demo stand-in (sandbox money, fixed FX rate,
dev OTP, demo GPS location) the screen says so.

## Run it

```powershell
.\dev.ps1 -Seed          # reset DB + seed users/sellers/wallets, start API :8000 and web :5173
cd backend; uv run python scripts/seed_demo.py   # optional: two real shipments waiting at Sost (uses the AI reader)
```

Needs: Python 3.13 + uv, Node 20+ + pnpm, and the `claude` CLI logged in (receipt reading uses `claude -p`, model
`sonnet`, no API key). Set `SOST_OCR_READER=paddle` to use PaddleOCR instead if installed.

| who | phone | PIN | where |
|---|---|---|---|
| Karim (trader) | +923001110001 | 1111 | /t |
| Nasreen (trader) | +923001110002 | 2222 | /t |
| Sher Ali (driver) | +923001110003 | 3333 | /t |
| Officer Ayesha (customs) | +923001110004 | 4444 | /c |
| Admin | +923001110005 | 5555 | /admin |
| Seller shops | no login | link | /s/kashgar-bazaar-01 … 03 |
| Anyone | no login | QR | /v |

## Check it

```powershell
cd backend;  uv run pytest -q          # 10 tests incl. the full judge story + attacks (AI reader stubbed)
cd frontend; pnpm exec tsc --noEmit -p tsconfig.app.json; pnpm exec vitest run; pnpm build
```

Layout: `backend/app/<module>/` (routes + service), `frontend/src/<area>/`, contracts in `docs/CONTRACTS.md`,
reasoning in `docs/PLAN.md`, sourced facts in `docs/research/FACTS.md`, demo receipts in `demo/receipts/`.
