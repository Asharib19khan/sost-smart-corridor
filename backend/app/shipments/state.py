"""Shipment state machine (contract: docs/CONTRACTS.md "State machine")."""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..core.db import Shipment

NEXT: dict[str, list[str]] = {
    "draft": ["paid"],
    "paid": ["sealed"],
    "sealed": ["departed_kashgar"],
    "departed_kashgar": ["crossed_khunjerab"],
    "crossed_khunjerab": ["arrived_sost"],
    "arrived_sost": ["cleared", "held"],
    "held": ["cleared"],
    "cleared": [],
}


def allowed_next(state: str) -> list[str]:
    return list(NEXT.get(state, []))


def check_transition(shipment: Shipment, to_state: str) -> None:
    """Raise 409 unless shipment.state -> to_state is allowed. Changes nothing."""
    nxt = allowed_next(shipment.state)
    if to_state not in nxt:
        step = " or ".join(nxt) if nxt else "none (this shipment is finished)"
        raise HTTPException(409, f"Shipment is {shipment.state}; next allowed step is {step}")


def transition(db: Session, shipment: Shipment, to_state: str) -> Shipment:
    """Move shipment to to_state or raise HTTPException(409). Caller commits."""
    check_transition(shipment, to_state)
    shipment.state = to_state
    db.flush()
    return shipment
