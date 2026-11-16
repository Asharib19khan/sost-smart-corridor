"""Trader trust score (0-100, start 50) with every change stored with its reason."""

from datetime import UTC, datetime

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..core.db import TrustScore

START = 50
FORMULA = "(score − 60) × Rs 2,000, max Rs 100,000"


def get(db: Session, trader_id: str) -> TrustScore:
    ts = db.get(TrustScore, trader_id)
    if ts is None:
        ts = TrustScore(trader_id=trader_id, score=START, reasons=[])
        db.add(ts)
        db.flush()
    return ts


def apply(db: Session, trader_id: str, delta: int, reason: str, shipment_ref: str | None = None) -> TrustScore:
    """Append {delta, reason, at, shipment_ref}; clamp 0-100. Caller commits."""
    ts = get(db, trader_id)
    ts.score = max(0, min(100, ts.score + int(delta)))
    ts.reasons = [*(ts.reasons or []), {"delta": int(delta), "reason": reason,
                                        "at": datetime.now(UTC).isoformat(), "shipment_ref": shipment_ref}]
    flag_modified(ts, "reasons")
    db.flush()
    return ts


def credit_limit_paisa(score: int) -> int:
    """max(0, (score − 60) × Rs 2,000), capped at Rs 100,000. Returned in paisa."""
    return min(max(0, (score - 60) * 2_000_00), 100_000_00)


def score_of(db: Session, trader_id: str) -> int:
    ts = db.get(TrustScore, trader_id)
    return START if ts is None else ts.score
