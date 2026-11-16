"""Shipments: create/list/detail, canonical manifest, seal + seal QR."""

import io

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.canonical import canonicalize
from ..core.crypto import b64u, verify
from ..core.db import DeviceKey, Shipment, User, get_db
from ..core.deps import audit, current_user, require_role
from . import service as svc
from .state import check_transition, transition

router = APIRouter(tags=["shipments"])

DEFAULT_ORIGIN = "http://localhost:5173"


class SealIn(BaseModel):
    envelope: dict
    signature: str
    manifest_signature: str


def _origin(request: Request) -> str:
    return (request.headers.get("origin") or DEFAULT_ORIGIN).rstrip("/")


@router.post("/shipments")
def create_shipment(request: Request, user: User = Depends(require_role("trader")),
                    db: Session = Depends(get_db)) -> dict:
    sh = Shipment(ref=svc.next_ref(db), trader_id=user.id, state="draft")
    db.add(sh)
    db.flush()
    svc.recompute_risk(db, sh)
    audit(db, request, user.id, "shipment.create", sh.id, {"ref": sh.ref})
    db.commit()
    return {"id": sh.id, "ref": sh.ref, "state": sh.state}


@router.get("/shipments")
def list_shipments(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    q = select(Shipment).order_by(Shipment.created_at.desc())
    if user.role == "trader":
        q = q.where(Shipment.trader_id == user.id)
    elif user.role not in ("customs", "admin", "driver"):
        raise HTTPException(403, "Your role cannot list shipments.")
    return [svc.summary(db, sh) for sh in db.scalars(q)]


@router.get("/shipments/{shipment_id}")
def get_shipment(shipment_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return svc.detail(db, svc.load_for(db, shipment_id, user))


@router.get("/shipments/{shipment_id}/manifest")
def get_manifest(shipment_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    return svc.current_manifest(db, svc.load_for(db, shipment_id, user))


def make_seal(sh: Shipment, key: DeviceKey, mhash: str, manifest_sig: str) -> str:
    doc = {"s": sh.id, "r": sh.ref, "h": mhash, "k": key.id, "p": key.public_key, "m": manifest_sig}
    return "SSC1." + b64u(canonicalize(doc))


@router.post("/shipments/{shipment_id}/seal")
def seal_shipment(shipment_id: str, body: SealIn, request: Request,
                  user: User = Depends(require_role("trader")), db: Session = Depends(get_db)) -> dict:
    sh = svc.load_for(db, shipment_id, user)
    check_transition(sh, "sealed")
    svc.check_envelope(body.envelope, sh, "manifest_sealed")
    cur = svc.current_manifest(db, sh)
    doc = cur["canonical"]
    expected = {"manifest_hash": cur["manifest_hash"], "line_hashes": doc["line_hashes"],
                "total_fen": doc["total_fen"], "line_count": len(doc["lines"])}
    if not doc["lines"]:
        raise HTTPException(409, "The manifest has no lines. Scan a receipt before sealing.")
    if body.envelope["payload"] != expected:
        raise HTTPException(409, "Manifest changed since you reviewed it. Review and seal again.")
    key = db.get(DeviceKey, body.envelope.get("signer_key_id"))
    if key is None or key.user_id != user.id or key.revoked_at is not None:
        raise HTTPException(403, "Sign with your own registered, active device key.")
    if not verify(key.public_key, cur["manifest_hash"], body.manifest_signature):
        raise HTTPException(400, "Manifest signature does not match the manifest hash. Sign again.")
    ev = svc.append_or_http(db, body.envelope, body.signature, expected_signer_user=user.id)
    seal = make_seal(sh, key, cur["manifest_hash"], body.manifest_signature)
    sh.seal_payload = seal
    sh.manifest_hash = cur["manifest_hash"]
    transition(db, sh, "sealed")
    svc.recompute_risk(db, sh)
    audit(db, request, user.id, "shipment.seal", sh.id, {"event_seq": ev.seq, "manifest_hash": sh.manifest_hash})
    db.commit()
    return {"seal": seal, "qr_url": f"{_origin(request)}/v/{sh.id}#{seal}"}


@router.get("/shipments/{shipment_id}/seal.png")
def seal_png(shipment_id: str, request: Request, db: Session = Depends(get_db)) -> Response:
    """Public: the QR only carries the shipment id and public seal data (no secrets)."""
    sh = db.get(Shipment, shipment_id)
    if sh is None or not sh.seal_payload:
        raise HTTPException(404, "This shipment has not been sealed yet. Seal it first.")
    img = qrcode.make(f"{_origin(request)}/v/{sh.id}#{sh.seal_payload}",
                      error_correction=qrcode.constants.ERROR_CORRECT_M)
    buf = io.BytesIO()
    img.save(buf)
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "no-store"})
