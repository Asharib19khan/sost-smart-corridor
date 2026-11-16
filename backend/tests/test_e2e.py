"""Full judge story through the real API: scan → pay → seller counter-sign → seal → 3 checkpoints →
customs approve → trust up; then attacks: tamper, replay, cross-trader access, revoked key.
Only the AI reader is stubbed (deterministic, no CLI quota)."""

import os
import tempfile
import time
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="sost_e2e_")
# Set SOST_E2E_DATABASE_URL to run the same story against Postgres/Supabase.
os.environ["SOST_DATABASE_URL"] = os.environ.get("SOST_E2E_DATABASE_URL") or f"sqlite:///{Path(_tmp, 'e2e.db').as_posix()}"
os.environ["SOST_UPLOAD_DIR"] = str(Path(_tmp, "uploads"))

import base64
import json
import secrets
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from nacl.signing import SigningKey

from app.core.canonical import canonical_hash
from app.core.crypto import b64u, b64u_dec, key_fingerprint, verify
from app.main import app
from app.ocr import readers

RECEIPT = Path(__file__).resolve().parents[2] / "demo" / "receipts" / "r3.png"

FAKE_LINES = [  # what the AI read from r3 in a live run
    ("手机快充充电器", 500, "个", 1200), ("蓝牙耳机", 400, "副", 80), ("手机保护壳", 1000, "个", 250),
    ("LED灯泡", 600, "只", 450), ("LED灯带", 200, "卷", 1800),
]
FAKE_INFO = {
    "手机快充充电器": ("Fast phone charger", "موبائل چارجر", "85044090", 90),
    "蓝牙耳机": ("Bluetooth earphones", "بلوٹوتھ ایئرفون", "85183000", 88),
    "手机保护壳": ("Phone case", "موبائل کور", "39269099", 75),
    "LED灯泡": ("LED bulb", "ایل ای ڈی بلب", "85395200", 92),
    "LED灯带": ("LED strip", "ایل ای ڈی پٹی", "94054090", 50),
}


@pytest.fixture(scope="module")
def c(monkeypatch_module):
    def fake_read(_path):
        lines = [readers.RawLine(item_zh=z, qty=q, unit=u, unit_price_fen=p, total_fen=q * p) for z, q, u, p in FAKE_LINES]
        return readers.RawReceipt(seller_name_zh="喀什鑫达通讯配件批发", date="2026-11-14", lines=lines,
                                  total_fen=sum(ln.total_fen for ln in lines), raw_text="...", suspicious_text=[]), "claude_cli"

    def fake_translate(items, _codes):
        return [readers.ItemInfo(item_en=FAKE_INFO[i][0], item_ur=FAKE_INFO[i][1], hs_code=FAKE_INFO[i][2],
                                 hs_confidence=FAKE_INFO[i][3]) for i in items]

    monkeypatch_module.setattr(readers, "read_receipt", fake_read)
    monkeypatch_module.setattr(readers, "translate_items", fake_translate)
    from app.seed import main as seed_main
    with TestClient(app) as client:
        seed_main()
        yield client


@pytest.fixture(scope="module")
def monkeypatch_module():
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


class Actor:
    def __init__(self, c, phone=None, pin=None, token=None):
        self.c = c
        self.sk = SigningKey.generate()
        self.pub = b64u(bytes(self.sk.verify_key))
        self.kid = key_fingerprint(self.pub)
        self.h = {}
        if phone:
            r = c.post("/auth/login", json={"phone": phone, "pin": pin})
            assert r.status_code == 200, r.text
            self.user = r.json()["user"]
            self.h = {"Authorization": f"Bearer {r.json()['access']}"}
            r = c.post("/keys", json={"public_key": self.pub, "label": "test"}, headers=self.h)
            assert r.status_code in (200, 201), r.text

    def envelope(self, sid, head, typ, payload, lat=None, lng=None, nonce=None):
        env = {"v": 1, "shipment_id": sid, "seq": head["seq"], "type": typ, "payload": payload,
               "lat_e6": lat, "lng_e6": lng,
               "signed_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
               "nonce": nonce or b64u(secrets.token_bytes(18)), "prev_hash": head["prev_hash"],
               "signer_key_id": self.kid}
        return env, b64u(self.sk.sign(canonical_hash(env).encode()).signature)

    def head(self, sid):
        r = self.c.get(f"/shipments/{sid}/chain/head", headers=self.h)
        assert r.status_code == 200, r.text
        return r.json()


def test_full_story(c):
    karim = Actor(c, "+923001110001", "1111")
    nasreen = Actor(c, "+923001110002", "2222")
    driver = Actor(c, "+923001110003", "3333")
    officer = Actor(c, "+923001110004", "4444")
    admin = Actor(c, "+923001110005", "5555")

    # 1. Start consignment and scan receipt
    sh = c.post("/shipments", headers=karim.h).json()
    sid = sh["id"]
    seller = c.get("/sellers", headers=karim.h).json()[0]
    with open(RECEIPT, "rb") as f:
        r = c.post(f"/shipments/{sid}/receipts", headers=karim.h, files={"file": ("r3.png", f, "image/png")},
                   data={"seller_id": seller["id"]})
    assert r.status_code in (200, 201, 202), r.text
    rid = r.json()["id"]
    for _ in range(100):
        rec = c.get(f"/receipts/{rid}", headers=karim.h).json()
        if rec["status"] != "processing":
            break
        time.sleep(0.05)
    assert rec["status"] == "done", rec
    lines = c.get(f"/shipments/{sid}/lines", headers=karim.h).json()
    assert len(lines) == 5 and lines[0]["item_ur"]
    assert any(ln["value_flag"] for ln in lines), "¥0.80 earphones must be flagged as under-invoiced"

    # Renamed .exe rejected
    r = c.post(f"/shipments/{sid}/receipts", headers=karim.h,
               files={"file": ("receipt.jpg", b"MZ\x90\x00" + b"\x00" * 200, "image/jpeg")})
    assert r.status_code == 415, r.text

    # Other trader cannot read it
    assert c.get(f"/shipments/{sid}", headers=nasreen.h).status_code == 403

    # 2. Pay seller (sandbox) with signed payment
    total = sum(ln["total_fen"] for ln in lines)
    payload = {"seller_id": seller["id"], "amount_fen": total, "receipt_id": rid}
    env, sig = karim.envelope(sid, karim.head(sid), "payment", payload)
    r = c.post("/payments", headers=karim.h, json={"shipment_id": sid, "seller_id": seller["id"],
                                                    "amount_fen": total, "pin": "1111", "envelope": env, "signature": sig})
    assert r.status_code in (200, 201), r.text
    # Replay of the same signed event is refused
    r = c.post("/payments", headers=karim.h, json={"shipment_id": sid, "seller_id": seller["id"],
                                                    "amount_fen": total, "pin": "1111", "envelope": env, "signature": sig})
    assert r.status_code in (400, 409), r.text

    # 3. Seller counter-signs from the Mandarin link
    link = c.get("/sellers", headers=karim.h).json()[0]
    token = c.get("/admin/users", headers=admin.h).status_code  # admin reachable
    assert token == 200
    seller_actor = Actor(c)
    from app.core.db import Seller, SessionLocal
    with SessionLocal() as db:
        tok = db.get(Seller, link["id"]).link_token
    r = c.post(f"/seller-link/{tok}/key", json={"public_key": seller_actor.pub})
    assert r.status_code in (200, 201), r.text
    page = c.get(f"/seller-link/{tok}").json()
    item = next(p for p in page["pending"] if p["shipment_id"] == sid)
    assert canonical_hash(item["manifest"]["canonical"]) == item["manifest"]["manifest_hash"]
    head = item["chain_head"]
    env, sig = seller_actor.envelope(sid, head, "seller_confirmed",
                                     {"manifest_hash": item["manifest"]["manifest_hash"], "receipt_id": rid, "amount_fen": total})
    r = c.post(f"/seller-link/{tok}/confirm", json={"envelope": env, "signature": sig})
    assert r.status_code in (200, 201), r.text

    # 4. Seal
    man = c.get(f"/shipments/{sid}/manifest", headers=karim.h).json()
    assert canonical_hash(man["canonical"]) == man["manifest_hash"]
    mh = man["manifest_hash"]
    payload = {"manifest_hash": mh, "line_hashes": man["canonical"]["line_hashes"],
               "total_fen": man["canonical"]["total_fen"], "line_count": len(man["canonical"]["lines"])}
    env, sig = karim.envelope(sid, karim.head(sid), "manifest_sealed", payload)
    msig = b64u(karim.sk.sign(mh.encode()).signature)
    r = c.post(f"/shipments/{sid}/seal", headers=karim.h, json={"envelope": env, "signature": sig, "manifest_signature": msig})
    assert r.status_code in (200, 201), r.text
    seal = r.json()["seal"]
    body = seal.removeprefix("SSC1.")
    qr = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    assert qr["h"] == mh and verify(qr["p"], qr["h"], qr["m"])  # offline seal check

    # 5. Checkpoints (driver), Khunjerab logged slightly outside its zone → flagged, not blocked
    for cp, lat, lng in [("kashgar", 39470000, 75990000), ("khunjerab", 36400000, 75100000), ("sost", 36690000, 74820000)]:
        env, sig = driver.envelope(sid, driver.head(sid), "checkpoint", {"checkpoint": cp}, lat, lng)
        r = c.post(f"/shipments/{sid}/events", headers=driver.h, json={"envelope": env, "signature": sig})
        assert r.status_code in (200, 201), (cp, r.text)
    rep = c.get(f"/verify/{sid}").json()
    assert rep["overall"]["ok"], rep["overall"]
    assert any("outside_geofence" in (s.get("flags") or []) for s in rep["chain"]["steps"])

    # 6. Customs queue shows it with reasons; attack via tamper lab
    q = c.get("/customs/queue", headers=officer.h).json()
    row = next(x for x in q if x["id"] == sid)
    assert row["risk"]["reasons"], row
    r = c.post("/admin/tamper", headers=admin.h, json={"action": "edit_line_price", "shipment_id": sid,
                                                       "line_no": 2, "value": 9900})
    assert r.status_code == 200, r.text
    rep = c.get(f"/verify/{sid}").json()
    assert not rep["overall"]["ok"]
    assert rep["manifest"]["problems"][0]["line_no"] == 2, rep["manifest"]
    q = c.get("/customs/queue", headers=officer.h).json()
    assert not next(x for x in q if x["id"] == sid)["integrity_ok"]
    assert all(not x["integrity_ok"] for x in q[:q.index(next(x for x in q if x["id"] == sid)) + 1])  # broken first
    r = c.post("/admin/tamper", headers=admin.h, json={"action": "delete_event", "shipment_id": sid, "seq": 3})
    assert r.status_code == 200, r.text
    rep = c.get(f"/verify/{sid}").json()
    assert rep["chain"]["broken_at"] == 3, rep["chain"]
    assert c.post("/admin/tamper/restore", headers=admin.h, json={"shipment_id": sid}).status_code == 200
    assert c.get(f"/verify/{sid}").json()["overall"]["ok"]

    # 7. Customs approves (signed in browser by officer key); trust goes up
    before = c.get(f"/trust/{karim.user['id']}", headers=karim.h).json()["score"]
    env, sig = officer.envelope(sid, officer.head(sid), "customs_decision", {"decision": "approve", "reason": "Clean"})
    r = c.post(f"/customs/{sid}/decision", headers=officer.h, json={"envelope": env, "signature": sig})
    assert r.status_code in (200, 201), r.text
    assert c.get(f"/shipments/{sid}", headers=karim.h).json()["state"] == "cleared"
    after = c.get(f"/trust/{karim.user['id']}", headers=karim.h).json()
    assert after["score"] > before and after["reasons"]
    assert c.get("/wallet", headers=karim.h).status_code == 200
    assert c.get(f"/shipments/{sid}/duty", headers=karim.h).json()["total_paisa"] > 0
    gd = c.get(f"/shipments/{sid}/declaration", headers=officer.h).json()
    assert gd["customs_decision"]["decision"] == "approve" and gd["items"] and gd["items"][0]["quantity"]
    assert gd["total_duty_and_taxes_paisa"] > 0 and gd["integrity"]["sealed_manifest_hash"]
    assert c.get(f"/shipments/{sid}/declaration", headers=karim.h).status_code == 200
    assert c.get(f"/shipments/{sid}/declaration", headers=nasreen.h).status_code == 403

    # 8. Revoked key: old signatures still verify, new ones refused
    assert c.delete(f"/keys/{driver.kid}", headers=driver.h).status_code in (200, 204)
    assert c.get(f"/verify/{sid}").json()["overall"]["ok"]
    sh2 = c.post("/shipments", headers=karim.h).json()["id"]
    env, sig = driver.envelope(sh2, driver.head(sh2), "checkpoint", {"checkpoint": "kashgar"}, 39470000, 75990000)
    assert c.post(f"/shipments/{sh2}/events", headers=driver.h, json={"envelope": env, "signature": sig}).status_code in (403, 409)

    # 9. Five wrong PINs lock the account
    codes = [c.post("/auth/login", json={"phone": "+923001110002", "pin": "0000"}).status_code for _ in range(6)]
    assert 423 in codes and codes[-1] in (423, 429), codes
    assert b64u_dec(karim.pub)  # sanity
