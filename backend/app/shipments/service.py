"""Shared shipment helpers used by shipments, transit, seller and customs routes."""

from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.db import CustomsDecision, DeviceKey, Event, ManifestLine, Payment, Receipt, Shipment, User
from ..integrity.manifest import compare_to_sealed, manifest_doc, manifest_hash
from ..integrity.service import ChainError, append_event, verify_chain
from .state import allowed_next


def next_ref(db: Session) -> str:
    prefix = f"SSC-{datetime.now(UTC):%y%m}-"
    n = db.scalar(select(func.count()).select_from(Shipment).where(Shipment.ref.like(prefix + "%"))) or 0
    while True:
        n += 1
        ref = f"{prefix}{n:04d}"
        if db.scalar(select(Shipment.id).where(Shipment.ref == ref)) is None:
            return ref


def load_for(db: Session, shipment_id: str, user: User) -> Shipment:
    """Load a shipment the user may see: its owner trader, or customs/admin/driver."""
    sh = db.get(Shipment, shipment_id)
    if sh is None:
        raise HTTPException(404, "Shipment not found. Check the link or reference.")
    if user.role == "trader" and sh.trader_id != user.id:
        raise HTTPException(403, "This shipment belongs to another trader.")
    if user.role not in ("trader", "customs", "admin", "driver"):
        raise HTTPException(403, "Your role cannot view this shipment.")
    return sh


def append_or_http(db: Session, envelope: dict, signature: str, **kw) -> Event:
    try:
        return append_event(db, envelope, signature, **kw)
    except ChainError as exc:
        raise HTTPException(exc.status, exc.message) from exc


def check_envelope(envelope: dict, shipment: Shipment, typ: str) -> None:
    if not isinstance(envelope, dict) or envelope.get("type") != typ:
        raise HTTPException(400, f"Envelope type must be {typ}. Sign the right step and try again.")
    if envelope.get("shipment_id") != shipment.id:
        raise HTTPException(400, "Envelope is for a different shipment. Sign it for this shipment.")
    if not isinstance(envelope.get("payload"), dict):
        raise HTTPException(400, "Envelope payload must be an object.")


def band_for(score: int | None) -> str | None:
    if score is None:
        return None
    return "red" if score >= 60 else "amber" if score >= 30 else "green"


def recompute_risk(db: Session, shipment: Shipment) -> None:
    """Store risk via A4's risk.service.compute when that module is available."""
    try:
        from ..risk.service import compute
    except ImportError:
        return
    score, _band, reasons = compute(db, shipment)
    shipment.risk_score = int(score)
    shipment.risk_reasons = list(reasons)
    db.flush()


def risk_out(sh: Shipment) -> dict:
    return {"score": sh.risk_score, "band": band_for(sh.risk_score), "reasons": sh.risk_reasons or []}


def current_manifest(db: Session, sh: Shipment) -> dict:
    doc = manifest_doc(db, sh)
    return {"canonical": doc, "manifest_hash": manifest_hash(doc)}


def sealed_payload(db: Session, sh: Shipment) -> dict | None:
    ev = db.scalars(select(Event).where(Event.shipment_id == sh.id, Event.type == "manifest_sealed")
                    .order_by(Event.seq.desc()).limit(1)).first()
    return (ev.envelope or {}).get("payload") if ev else None


def integrity(db: Session, sh: Shipment) -> dict:
    chain = verify_chain(db, sh.id)
    sealed = sealed_payload(db, sh)
    problems = compare_to_sealed(db, sh, sealed) if sealed else []
    return {"ok": chain["ok"] and not problems, "chain": chain, "manifest_problems": problems}


def total_fen(db: Session, sh: Shipment) -> int:
    return db.scalar(select(func.coalesce(func.sum(ManifestLine.total_fen), 0))
                     .where(ManifestLine.shipment_id == sh.id)) or 0


def summary(db: Session, sh: Shipment) -> dict:
    trader = db.get(User, sh.trader_id)
    return {"id": sh.id, "ref": sh.ref, "state": sh.state,
            "trader": {"id": sh.trader_id, "name": trader.name if trader else None},
            "created_at": sh.created_at.isoformat() if sh.created_at else None,
            "total_fen": total_fen(db, sh), "risk": risk_out(sh), "sealed": sh.seal_payload is not None}


LINE_OUT = ("id", "receipt_id", "line_no", "item_zh", "item_en", "item_ur", "hs_code", "hs_confidence",
            "qty", "unit", "unit_price_fen", "total_fen", "value_flag")


def steps(db: Session, sh: Shipment) -> list[dict]:
    by_seq = {s["seq"]: s for s in verify_chain(db, sh.id)["steps"]}
    out = []
    for ev in db.scalars(select(Event).where(Event.shipment_id == sh.id).order_by(Event.seq)):
        key = db.get(DeviceKey, ev.signer_key_id)
        owner = db.get(User, key.user_id) if key else None
        st = by_seq.get(ev.seq, {"ok": False, "problem": "Step is missing or out of order"})
        out.append({
            "seq": ev.seq, "type": ev.type, "ok": st["ok"], "problem": st["problem"],
            "signed_at": ev.signed_at, "received_at": ev.created_at.isoformat() if ev.created_at else None,
            "signer": {"name": owner.name if owner else None, "role": owner.role if owner else None,
                       "key_id": ev.signer_key_id, "revoked": bool(key and key.revoked_at)},
            "lat": ev.lat, "lng": ev.lng, "flags": ev.flags or [], "payload": ev.payload,
        })
    return out


def detail(db: Session, sh: Shipment) -> dict:
    base = summary(db, sh)
    lines = db.scalars(select(ManifestLine).where(ManifestLine.shipment_id == sh.id).order_by(ManifestLine.line_no))
    receipts = db.scalars(select(Receipt).where(Receipt.shipment_id == sh.id).order_by(Receipt.created_at))
    payments = db.scalars(select(Payment).where(Payment.shipment_id == sh.id).order_by(Payment.created_at))
    decisions = db.scalars(select(CustomsDecision).where(CustomsDecision.shipment_id == sh.id)
                           .order_by(CustomsDecision.created_at))
    base.update({
        "seal": sh.seal_payload,
        "manifest_hash": sh.manifest_hash,
        "lines": [{f: getattr(ln, f) for f in LINE_OUT} for ln in lines],
        "receipts": [{"id": r.id, "status": r.status, "seller_id": r.seller_id} for r in receipts],
        "payments": [{"id": p.id, "seller_id": p.seller_id, "amount_fen": p.amount_fen,
                      "seller_confirmed": p.seller_confirmed,
                      "created_at": p.created_at.isoformat() if p.created_at else None} for p in payments],
        "decisions": [{"decision": d.decision, "reason": d.reason, "officer_id": d.officer_id,
                       "created_at": d.created_at.isoformat() if d.created_at else None} for d in decisions],
        "events": steps(db, sh),
        "allowed_next": allowed_next(sh.state),
    })
    return base
