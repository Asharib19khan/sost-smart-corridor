# Demo script (about 5 minutes)

Before: `.\dev.ps1 -Seed`, then `cd backend; uv run python scripts/seed_demo.py`. Open three browser windows:
phone-size (trader), laptop (customs), phone-size (public verify). Language: English; flip to Urdu once to show RTL.

## 1. The problem (20 s)
Karim buys phone accessories in Kashgar. He has a paper receipt in Mandarin. Today that paper is the only record,
and nobody on the Pakistani side can trust it.

## 2. Trader, on a phone (90 s) — Karim `+923001110001` / `1111`
1. Start a new shipment -> Scan -> pick "Ali Phone Accessories" -> upload `demo/receipts/r3.png`.
2. ~15 s later: 5 lines, ¥15,120. Say: "a real read, not a fixture".
3. Review: three-language names, HS codes with confidence. Point at the earphones at ¥0.80, flagged as possible
   under-invoicing. (Tap Edit to show a correction is possible and recorded.)
4. Pay -> PIN 1111 -> pay. Sandbox money, labelled.
5. **Seller (second phone or tab):** `/s/kashgar-bazaar-03` opens in Mandarin; confirm. Say: "the shop signs with its own key".
6. Seal -> QR appears. Track -> tick "demo location" (say it is demo) -> three checkpoints.

## 3. Customs, on the laptop (60 s) — Officer `+923001110004` / `4444`
1. Queue is sorted by risk. Open Nasreen's shipment (amber 50): receipt total ¥15,350 vs manifest ¥14,350,
   Khunjerab checkpoint outside the geofence, new trader.
2. One banner: "Integrity: verified". Every chain row says "Signature valid" in **this browser**, not the server's word.
3. Open Karim's shipment, write a reason, Approve. State -> Cleared, trust score rises.

## 4. The attack (60 s) — Admin `+923001110005` / `5555` -> /admin
1. Scan or open the sealed shipment's QR on the third window: all green.
2. Tamper lab: pick it, "Change a line price", line 2, value 500, Run attack. The database is edited behind the app's back.
3. Refresh the public page: "Integrity: broken at step 3 — line 2 was edited after sealing". The seal signature itself is
   still valid; the manifest no longer matches. Click Restore; it is green again.
4. Audit log shows the attack. The log table refuses edits and deletes.

## 5. Close (30 s)
Free to verify, paid to move money. Same signed event later comes from a hardware seal. One desk at Sost, one season.

## If something fails
- Receipt read slow: seeded shipments (A/B) already show everything from step 3 on.
- No camera on the verify page: paste the seal link into the box.
- Locked out (6 wrong PINs): `.\dev.ps1 -Seed`.
