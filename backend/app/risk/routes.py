from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.db import Shipment, User, get_db
from ..core.deps import current_user
from . import service

router = APIRouter(tags=["risk"])


@router.get("/shipments/{shipment_id}/risk")
def get_risk(shipment_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    s = db.get(Shipment, shipment_id)
    if s is None:
        raise HTTPException(404, "Shipment not found.")
    if s.trader_id != user.id and user.role not in ("customs", "admin"):
        raise HTTPException(403, "You can only see risk for your own shipments.")
    score, band, reasons = service.compute(db, s)
    s.risk_score, s.risk_reasons = score, reasons
    db.commit()
    return {"shipment_id": s.id, "score": score, "band": band, "reasons": reasons}
