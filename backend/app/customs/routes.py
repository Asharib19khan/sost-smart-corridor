"""Customs queue, shipment view and signed decisions."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.db import CustomsDecision, Event, ManifestLine, Shipment, User, get_db
from ..core.deps import audit, require_role
from ..integrity.manifest import compare_to_sealed
from ..integrity.service import prime_chains, verify_chain
from ..shipments import service as svc
from ..shipments.state import transition

router = APIRouter(tags=["customs"])

DECISIONS = {"approve", "hold", "request_docs"}


class DecisionIn(BaseModel):
    envelope: dict
    signature: str


def _arrived_at(db: Session, sh: Shipment) -> str | None:
    ev = db.scalars(select(Event).where(Event.shipment_id == sh.id, Event.type == "checkpoint")
                    .order_by(Event.seq.desc())).first()
    if ev and (ev.payload or {}).get("checkpoint") == "sost":
        return ev.created_at.isoformat()
    return None


@router.get("/customs/queue")
def queue(_: User = Depends(require_role("customs", "admin")), db: Session = Depends(get_db)) -> list[dict]:
    ships = list(db.scalars(select(Shipment).where(Shipment.state != "draft")))
    ids = [sh.id for sh in ships]
    events = prime_chains(db, ids)  # every chain verified from one events query
    traders = {u.id: u for u in db.scalars(select(User).where(User.id.in_({sh.trader_id for sh in ships})))}
    totals = dict(db.execute(select(ManifestLine.shipment_id, func.coalesce(func.sum(ManifestLine.total_fen), 0))
                             .where(ManifestLine.shipment_id.in_(ids)).group_by(ManifestLine.shipment_id)).all())
    rows = []
    for sh in ships:
        evs = events.get(sh.id, [])
        sealed = next((e for e in reversed(evs) if e.type == "manifest_sealed"), None)
        payload = (sealed.envelope or {}).get("payload") if sealed else None  # same rule as svc.integrity
        problems = compare_to_sealed(db, sh, payload) if payload else []
        last_cp = next((e for e in reversed(evs) if e.type == "checkpoint"), None)
        arrived = last_cp.created_at.isoformat() if last_cp and (last_cp.payload or {}).get("checkpoint") == "sost"             else None
        trader = traders.get(sh.trader_id)
        rows.append({"id": sh.id, "ref": sh.ref, "state": sh.state,
                     "trader": {"id": sh.trader_id, "name": trader.name if trader else None},
                     "risk": svc.risk_out(sh), "integrity_ok": verify_chain(db, sh.id)["ok"] and not problems,
                     "arrived_at": arrived, "total_fen": int(totals.get(sh.id, 0))})
    # Broken integrity always comes first: the stored score is not updated by a raw database edit.
    rows.sort(key=lambda r: (r["integrity_ok"], r["risk"]["score"] is None, -(r["risk"]["score"] or 0)))
    return rows


@router.get("/customs/shipments/{shipment_id}")
def customs_shipment(shipment_id: str, user: User = Depends(require_role("customs", "admin")),
                     db: Session = Depends(get_db)) -> dict:
    sh = svc.load_for(db, shipment_id, user)
    out = svc.detail(db, sh)
    out["integrity"] = svc.integrity(db, sh)
    out["arrived_at"] = _arrived_at(db, sh)
    return out


def _is_clean(db: Session, shipment_id: str) -> bool:
    return db.scalar(select(CustomsDecision.id).where(CustomsDecision.shipment_id == shipment_id,
                                                      CustomsDecision.decision == "hold")) is None


def _clean_streak(db: Session, trader_id: str) -> int:
    """Consecutive clean approvals (no hold on that shipment) among this trader's latest decisions."""
    rows = db.execute(
        select(CustomsDecision.decision, CustomsDecision.shipment_id)
        .join(Shipment, Shipment.id == CustomsDecision.shipment_id)
        .where(Shipment.trader_id == trader_id, CustomsDecision.decision != "request_docs")
        .order_by(CustomsDecision.created_at.desc())
    ).all()
    n = 0
    for decision, sid in rows:
        if decision != "approve" or not _is_clean(db, sid):
            break
        n += 1
    return n


def _trust(db: Session, trader_id: str, delta: int, reason: str, ref: str) -> None:
    try:
        from ..trust.service import apply
    except ImportError:
        return
    apply(db, trader_id, delta, reason, ref)


@router.post("/customs/{shipment_id}/decision")
def decide(shipment_id: str, body: DecisionIn, request: Request,
           user: User = Depends(require_role("customs")), db: Session = Depends(get_db)) -> dict:
    sh = svc.load_for(db, shipment_id, user)
    env = body.envelope
    svc.check_envelope(env, sh, "customs_decision")
    decision = env["payload"].get("decision")
    reason = env["payload"].get("reason")
    if decision not in DECISIONS or not isinstance(reason, str) or set(env["payload"]) != {"decision", "reason"}:
        raise HTTPException(400, "Decision must be approve, hold or request_docs, with a reason.")
    if decision == "hold" and not reason.strip():
        raise HTTPException(400, "Write the reason for the hold so the trader knows what to fix.")
    if sh.state not in ("arrived_sost", "held"):
        raise HTTPException(409, f"Shipment is {sh.state}; customs can decide only after it arrives at Sost.")
    if decision == "hold" and sh.state == "held":
        raise HTTPException(409, "Shipment is already held; next allowed step is cleared.")
    ev = svc.append_or_http(db, env, body.signature, expected_signer_user=user.id)
    if decision == "approve":
        transition(db, sh, "cleared")
    elif decision == "hold":
        transition(db, sh, "held")
    db.add(CustomsDecision(shipment_id=sh.id, officer_id=user.id, decision=decision, reason=reason,
                           event_id=ev.id))
    db.flush()
    trust: list[dict] = []
    if decision == "approve" and _is_clean(db, sh.id):
        trust.append({"delta": 5, "reason": f"Clean shipment {sh.ref} cleared"})
        streak = _clean_streak(db, sh.trader_id)
        if streak >= 3 and streak % 3 == 0:
            trust.append({"delta": 3, "reason": "3 clean shipments in a row"})
    elif decision == "hold":
        trust.append({"delta": -15, "reason": f"Shipment {sh.ref} held: {reason}"})
    for t in trust:
        _trust(db, sh.trader_id, t["delta"], t["reason"], sh.ref)
    svc.recompute_risk(db, sh)
    audit(db, request, user.id, "customs.decision", sh.id, {"decision": decision, "reason": reason, "seq": ev.seq})
    db.commit()
    return {"state": sh.state, "seq": ev.seq, "decision": decision, "trust": trust}
