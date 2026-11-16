"""Chain head (for signing), server key, and the public VerifyReport."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.crypto import server_public_key
from ..core.db import DeviceKey, Event, Shipment, User, get_db
from ..core.deps import current_user
from ..core.ratelimit import rate_limit
from . import manifest as mf
from .service import head, verify_chain

router = APIRouter(tags=["integrity"])


def _iso(dt) -> str | None:  # noqa: ANN001
    return dt.isoformat() if dt is not None else None


@router.get("/shipments/{shipment_id}/chain/head")
def chain_head(shipment_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    shipment = db.get(Shipment, shipment_id)
    if shipment is None:
        raise HTTPException(404, "Shipment not found. Check the shipment id.")
    if user.role == "trader":
        if shipment.trader_id != user.id:
            raise HTTPException(403, "This shipment belongs to another trader.")
    elif user.role not in ("driver", "customs", "admin"):
        raise HTTPException(403, "Your role cannot sign events on this shipment.")
    seq, prev = head(db, shipment_id)
    return {"seq": seq, "prev_hash": prev}


@router.get("/verify/server-key")
def server_key() -> dict:
    return {"public_key": server_public_key()}


def build_report(db: Session, shipment: Shipment) -> dict:
    events = list(db.scalars(select(Event).where(Event.shipment_id == shipment.id).order_by(Event.seq)))
    chain = verify_chain(db, shipment.id)
    steps = []
    for ev, st in zip(events, chain["steps"], strict=True):
        key = db.get(DeviceKey, ev.signer_key_id)
        signer = db.get(User, key.user_id) if key else None
        steps.append({
            "seq": st["seq"], "type": ev.type, "ok": st["ok"], "problem": st["problem"],
            "signed_at": ev.signed_at, "received_at": _iso(ev.created_at),
            "signer": {"name": signer.name if signer else None, "role": signer.role if signer else None,
                       "key_id": ev.signer_key_id, "revoked": bool(key and key.revoked_at)},
            "lat": ev.lat, "lng": ev.lng, "flags": ev.flags or [], "payload": ev.payload,
            # So any browser can re-hash and re-verify the signature itself, without trusting this server.
            "envelope": ev.envelope, "signature": ev.signature, "hash": ev.hash,
        })

    sealed_ev = next((e for e in reversed(events) if e.type == "manifest_sealed"), None)
    current_hash = mf.manifest_hash(mf.manifest_doc(db, shipment))
    if sealed_ev is not None:
        sealed_payload = (sealed_ev.envelope or {}).get("payload") or {}
        problems = mf.compare_to_sealed(db, shipment, sealed_payload)
        manifest = {"sealed_hash": sealed_payload.get("manifest_hash"), "current_hash": current_hash,
                    "ok": not problems, "problems": problems}
    else:
        manifest = {"sealed_hash": None, "current_hash": current_hash, "ok": True, "problems": []}

    if not chain["ok"]:
        n = chain["broken_at"]
        overall = {"ok": False, "message": f"Integrity: broken at step {n + 1} — {steps[n]['problem']}"}
    elif not manifest["ok"]:
        p = manifest["problems"][0]
        what = f"line {p['line_no']} {p['problem'].removeprefix('Line ')}" if p["line_no"] \
            else p["problem"].lower()
        more = f" (+{len(manifest['problems']) - 1} more)" if len(manifest["problems"]) > 1 else ""
        overall = {"ok": False,
                   "message": f"Integrity: broken at step {sealed_ev.seq + 1} — {what}{more}"}
    elif sealed_ev is None:
        overall = {"ok": True, "message": "Not sealed yet: the manifest can still change. "
                                          f"{len(steps)} signed step(s) verified."}
    else:
        overall = {"ok": True, "message": "Integrity: verified"}

    trader = db.get(User, shipment.trader_id)
    return {
        "shipment": {"id": shipment.id, "ref": shipment.ref, "state": shipment.state,
                     "trader_name": trader.name if trader else None},
        "seal": shipment.seal_payload,
        "overall": overall,
        "manifest": manifest,
        "chain": {"ok": chain["ok"], "broken_at": chain["broken_at"], "head_hash": chain["head_hash"],
                  "steps": steps},
    }


@router.get("/verify/{shipment_id}", dependencies=[Depends(rate_limit("verify", 60))])
def verify(shipment_id: str, db: Session = Depends(get_db)) -> dict:
    shipment = db.get(Shipment, shipment_id)
    if shipment is None:
        raise HTTPException(404, "No shipment with this id. Check the QR code or link.")
    return build_report(db, shipment)
