from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.db import User, get_db
from ..core.deps import current_user
from . import service

router = APIRouter(tags=["trust"])


@router.get("/trust/{trader_id}")
def get_trust(trader_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    if user.id != trader_id and user.role not in ("customs", "admin"):
        raise HTTPException(403, "You can only see your own trust score.")
    trader = db.get(User, trader_id)
    if trader is None or trader.role != "trader":
        raise HTTPException(404, "Trader not found.")
    ts = service.get(db, trader_id)
    db.commit()
    return {"trader_id": trader_id, "score": ts.score, "reasons": list(reversed(ts.reasons or [])),
            "credit_limit_paisa": service.credit_limit_paisa(ts.score), "formula": service.FORMULA}
