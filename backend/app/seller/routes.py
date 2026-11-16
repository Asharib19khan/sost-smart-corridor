"""Seller link (no login; the link token is the credential) + public seller list."""

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.crypto import b64u_dec, key_fingerprint
from ..core.db import (
    DeviceKey,
    Event,
    ManifestLine,
    Payment,
    Receipt,
    Seller,
    Shipment,
    User,
    get_db,
)
from ..core.deps import audit, current_user
from ..integrity.manifest import manifest_doc, manifest_hash
from ..integrity.service import GENESIS
from ..shipments import service as svc

router = APIRouter(tags=["seller"])


class KeyIn(BaseModel):
    public_key: str


class ConfirmIn(BaseModel):
    envelope: dict
    signature: str


def _seller(db: Session, token: str) -> Seller:
    s = db.scalar(select(Seller).where(Seller.link_token == token))
    if s is None:
        raise HTTPException(404, "This seller link is not valid. Ask the trader for a new link. "
                                 "此链接无效，请向商人索取新链接。")
    return s


def _seller_out(s: Seller) -> dict:
    return {"id": s.id, "shop_name_zh": s.shop_name_zh, "shop_name_en": s.shop_name_en, "market": s.market}


def _pending_ids(db: Session, s: Seller) -> list[str]:
    ids = set(db.scalars(select(Receipt.shipment_id).where(Receipt.seller_id == s.id)))
    ids |= set(db.scalars(select(Payment.shipment_id).where(Payment.seller_id == s.id)))
    return sorted(ids)


@router.get("/sellers")
def list_sellers(_: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    return [_seller_out(s) for s in db.scalars(select(Seller).order_by(Seller.shop_name_en))]


@router.get("/seller-link/{token}")
def seller_link(token: str, db: Session = Depends(get_db)) -> dict:
    s = _seller(db, token)
    ids = _pending_ids(db, s)
    # One query per table for all of this shop's shipments (each round trip is slow on a remote DB).
    ships = {sh.id: sh for sh in db.scalars(select(Shipment).where(Shipment.id.in_(ids)))}
    traders = {u.id: u for u in db.scalars(select(User).where(User.id.in_({sh.trader_id for sh in ships.values()})))}
    pays: dict[str, list[Payment]] = defaultdict(list)
    for p in db.scalars(select(Payment).where(Payment.shipment_id.in_(ids), Payment.seller_id == s.id)):
        pays[p.shipment_id].append(p)
    receipts: dict[str, list[str]] = defaultdict(list)
    for sid, rid in db.execute(select(Receipt.shipment_id, Receipt.id)
                               .where(Receipt.shipment_id.in_(ids), Receipt.seller_id == s.id)):
        receipts[sid].append(rid)
    lines: dict[str, list[ManifestLine]] = defaultdict(list)
    for ln in db.scalars(select(ManifestLine).where(ManifestLine.shipment_id.in_(ids)).order_by(ManifestLine.line_no)):
        lines[ln.shipment_id].append(ln)
    heads: dict[str, tuple[int, str]] = {}
    for ev in db.scalars(select(Event).where(Event.shipment_id.in_(ids)).order_by(Event.seq)):
        heads[ev.shipment_id] = (ev.seq + 1, ev.hash)
    pending = []
    for sid in ids:
        sh = ships[sid]
        trader = traders.get(sh.trader_id)
        doc = manifest_doc(db, sh, lines[sid])
        seq, prev = heads.get(sid, (0, GENESIS))
        pending.append({
            "shipment_id": sid, "ref": sh.ref, "state": sh.state, "trader_name": trader.name if trader else None,
            "manifest": {"canonical": doc, "manifest_hash": manifest_hash(doc)},
            "receipt_ids": receipts[sid],
            "amount_fen": sum(p.amount_fen for p in pays[sid]),
            "confirmed": bool(pays[sid]) and all(p.seller_confirmed for p in pays[sid]),
            "chain_head": {"seq": seq, "prev_hash": prev},
        })
    key_ids = []
    if s.user_id:
        key_ids = list(db.scalars(select(DeviceKey.id).where(DeviceKey.user_id == s.user_id,
                                                             DeviceKey.revoked_at.is_(None))))
    return {"seller": _seller_out(s), "key_ids": key_ids, "pending": pending}


def _seller_user(db: Session, s: Seller) -> User:
    if s.user_id:
        return db.get(User, s.user_id)
    u = User(role="seller", name=s.shop_name_en, name_zh=s.shop_name_zh, phone=f"seller:{s.link_token}")
    db.add(u)
    db.flush()
    s.user_id = u.id
    return u


@router.post("/seller-link/{token}/key")
def seller_key(token: str, body: KeyIn, request: Request, db: Session = Depends(get_db)) -> dict:
    s = _seller(db, token)
    try:
        if len(b64u_dec(body.public_key)) != 32:
            raise ValueError
    except ValueError as exc:
        raise HTTPException(400, "Public key must be 32 bytes, base64url. 公钥格式错误。") from exc
    u = _seller_user(db, s)
    kid = key_fingerprint(body.public_key)
    existing = db.get(DeviceKey, kid)
    if existing is not None and existing.user_id != u.id:
        raise HTTPException(409, "This key is registered to someone else. Create a new key. 此密钥已被他人注册。")
    if existing is None:
        db.add(DeviceKey(id=kid, user_id=u.id, public_key=body.public_key, label="seller link"))
        audit(db, request, u.id, "seller.key", kid, {"seller_id": s.id})
    db.commit()
    return {"id": kid}


@router.post("/seller-link/{token}/confirm")
def seller_confirm(token: str, body: ConfirmIn, request: Request, db: Session = Depends(get_db)) -> dict:
    s = _seller(db, token)
    env = body.envelope
    sid = env.get("shipment_id") if isinstance(env, dict) else None
    if sid not in _pending_ids(db, s):
        raise HTTPException(404, "This shipment is not linked to your shop. 此货运与您的店铺无关。")
    sh = db.get(Shipment, sid)
    svc.check_envelope(env, sh, "seller_confirmed")
    if not s.user_id:
        raise HTTPException(401, "Register this phone's key first, then confirm. 请先注册本机密钥再确认。")
    cur = svc.current_manifest(db, sh)
    if env["payload"].get("manifest_hash") != cur["manifest_hash"]:
        raise HTTPException(409, "The goods list changed since you opened it. Reload and check it again. "
                                 "货物清单已更改，请刷新后重新核对。")
    ev = svc.append_or_http(db, env, body.signature, expected_signer_user=s.user_id)
    pays = list(db.scalars(select(Payment).where(Payment.shipment_id == sid, Payment.seller_id == s.id)))
    for p in pays:
        p.seller_confirmed = True
    svc.recompute_risk(db, sh)
    audit(db, request, s.user_id, "seller.confirm", sid, {"seq": ev.seq, "seller_id": s.id})
    db.commit()
    return {"seq": ev.seq, "confirmed": True, "payments_confirmed": len(pays)}
