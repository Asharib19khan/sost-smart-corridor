"""Traders start at 50. Nasreen's start is rebuilt from her history so the demo clear visibly raises credit.

Her score is derived only from recorded clearances: +5 per cleared shipment that exists in the DB,
+3 for three clean in a row (the live rules). Earlier clearances that pre-date this platform are
entered as one labelled reason ("pre-platform record, demo seed") so nothing claims to be live data.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import Shipment, TrustScore, User
from . import service

NASREEN_PHONE = "+923001110002"
TARGET = 78


def seed(db: Session) -> None:
    for u in db.scalars(select(User).where(User.role == "trader")):
        if db.get(TrustScore, u.id) is not None:
            continue
        service.get(db, u.id)
        if u.phone != NASREEN_PHONE:
            continue
        cleared = list(db.scalars(select(Shipment).where(
            Shipment.trader_id == u.id, Shipment.state == "cleared").order_by(Shipment.created_at)))
        score = service.START
        for i, s in enumerate(cleared):
            if score + 5 > TARGET:
                break
            service.apply(db, u.id, 5, "Cleared by customs with no issues", s.ref)
            score += 5
            if (i + 1) % 3 == 0 and score + 3 <= TARGET:
                service.apply(db, u.id, 3, "Bonus: three clean clearances in a row", s.ref)
                score += 3
        while score + 5 <= TARGET - 3:
            service.apply(db, u.id, 5, "Clean clearance (pre-platform record, demo seed)", None)
            score += 5
        if score < TARGET:
            service.apply(db, u.id, TARGET - score,
                          "Bonus: three clean clearances in a row (pre-platform record, demo seed)", None)
    db.flush()
