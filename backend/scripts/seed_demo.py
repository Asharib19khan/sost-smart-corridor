"""Seed demo shipments through the REAL API (real OCR, real Ed25519 signatures, real hash chain).

Run with the API up:   uv run python scripts/seed_demo.py [--base http://localhost:8000]
Creates two shipments waiting at Sost for the customs officer:
  A  Karim   r1 (clean garments)                       -> expected green
  B  Nasreen r4 (printed total != line sum) + off-route checkpoint -> expected amber/red
Receipts are read by the same AI reader the app uses (a few small CLI calls). Safe to re-run on a fresh DB only.
"""

import argparse
import secrets
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
from nacl.signing import SigningKey

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.canonical import canonical_hash  # noqa: E402
from app.core.crypto import b64u, key_fingerprint  # noqa: E402
from app.core.db import Seller, SessionLocal  # noqa: E402

RECEIPTS = Path(__file__).resolve().parents[2] / "demo" / "receipts"
KEYS = Path(__file__).resolve().parents[1] / "data" / "demo_keys"


class Actor:
    def __init__(self, base: str, phone: str, pin: str):
        self.c = httpx.Client(base_url=base, timeout=180)
        r = self.c.post("/auth/login", json={"phone": phone, "pin": pin})
        r.raise_for_status()
        self.user = r.json()["user"]
        self.h = {"Authorization": f"Bearer {r.json()['access']}"}
        self.sk = SigningKey.generate()
        self.pub = b64u(bytes(self.sk.verify_key))
        self.kid = key_fingerprint(self.pub)
        self.c.post("/keys", json={"public_key": self.pub, "label": "demo seed"}, headers=self.h).raise_for_status()

    def sign(self, sid, typ, payload, lat=None, lng=None, head=None):
        head = head or self.c.get(f"/shipments/{sid}/chain/head", headers=self.h).json()
        env = {"v": 1, "shipment_id": sid, "seq": head["seq"], "type": typ, "payload": payload, "lat_e6": lat,
               "lng_e6": lng, "signed_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "nonce": b64u(secrets.token_bytes(18)), "prev_hash": head["prev_hash"], "signer_key_id": self.kid}
        return env, b64u(self.sk.sign(canonical_hash(env).encode()).signature)


def ok(r: httpx.Response) -> dict:
    if r.status_code >= 400:
        raise SystemExit(f"{r.request.method} {r.request.url.path} -> {r.status_code}: {r.text}")
    return r.json()


def build(base: str, who: Actor, seller_idx: int, receipt: str, pin: str, geo: list[tuple[str, float, float]]) -> str:
    c, h = who.c, who.h
    sid = ok(c.post("/shipments", headers=h))["id"]
    seller = ok(c.get("/sellers", headers=h))[seller_idx]
    with open(RECEIPTS / receipt, "rb") as f:
        rid = ok(c.post(f"/shipments/{sid}/receipts", headers=h, files={"file": (receipt, f, "image/png")},
                        data={"seller_id": seller["id"]}))["id"]
    for _ in range(90):
        rec = ok(c.get(f"/receipts/{rid}", headers=h))
        if rec["status"] not in ("processing", "queued"):
            break
        time.sleep(2)
    if rec["status"] != "done":
        raise SystemExit(f"receipt {receipt} failed: {rec.get('error')}")
    print(f"  {receipt}: read {len(rec['lines'])} lines, total {rec['total_fen']/100:.2f} CNY, flags {rec['flags']}")
    # The trader pays what the receipt says it costs (its printed total), like in real life.
    total = rec["total_fen"]
    env, sig = who.sign(sid, "payment", {"seller_id": seller["id"], "amount_fen": total, "receipt_id": rid})
    ok(c.post("/payments", headers=h, json={"shipment_id": sid, "seller_id": seller["id"], "amount_fen": total,
                                            "pin": pin, "envelope": env, "signature": sig}))
    # Seller counter-signs from the link (own key, kept only in this process)
    with SessionLocal() as db:
        token = db.get(Seller, seller["id"]).link_token
    sk = SigningKey.generate()
    spub = b64u(bytes(sk.verify_key))
    ok(c.post(f"/seller-link/{token}/key", json={"public_key": spub}))
    page = ok(c.get(f"/seller-link/{token}"))
    item = next(p for p in page["pending"] if p["shipment_id"] == sid)
    seller_actor = Actor.__new__(Actor)
    seller_actor.sk, seller_actor.pub, seller_actor.kid = sk, spub, key_fingerprint(spub)
    seller_actor.c, seller_actor.h = c, {}
    env, sig = seller_actor.sign(sid, "seller_confirmed", {"manifest_hash": item["manifest"]["manifest_hash"],
                                                          "receipt_id": rid, "amount_fen": item["amount_fen"]},
                                 head=item["chain_head"])
    ok(c.post(f"/seller-link/{token}/confirm", json={"envelope": env, "signature": sig}))
    # Seal
    man = ok(c.get(f"/shipments/{sid}/manifest", headers=h))
    payload = {"manifest_hash": man["manifest_hash"], "line_hashes": man["canonical"]["line_hashes"],
               "total_fen": man["canonical"]["total_fen"], "line_count": len(man["canonical"]["lines"])}
    env, sig = who.sign(sid, "manifest_sealed", payload)
    msig = b64u(who.sk.sign(man["manifest_hash"].encode()).signature)
    ok(c.post(f"/shipments/{sid}/seal", headers=h, json={"envelope": env, "signature": sig, "manifest_signature": msig}))
    for cp, lat, lng in geo:
        env, sig = who.sign(sid, "checkpoint", {"checkpoint": cp}, round(lat * 1e6), round(lng * 1e6))
        ok(c.post(f"/shipments/{sid}/events", headers=h, json={"envelope": env, "signature": sig}))
        time.sleep(1.1)
    d = ok(c.get(f"/shipments/{sid}", headers=h))
    print(f"  {d['ref']}: state={d['state']} risk={d['risk']['score']} {d['risk']['band']}")
    return sid


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8000")
    a = ap.parse_args()
    print("A: Karim, clean garments")
    build(a.base, Actor(a.base, "+923001110001", "1111"), 1, "r1.png", "1111",
          [("kashgar", 39.47, 75.99), ("khunjerab", 36.85, 75.43), ("sost", 36.69, 74.82)])
    print("B: Nasreen, mismatched receipt + off-route checkpoint")
    build(a.base, Actor(a.base, "+923001110002", "2222"), 2, "r4.png", "2222",
          [("kashgar", 39.47, 75.99), ("khunjerab", 36.40, 75.10), ("sost", 36.69, 74.82)])
    print("done. Log in as customs (+923001110004 / 4444) to see the queue.")


if __name__ == "__main__":
    main()
