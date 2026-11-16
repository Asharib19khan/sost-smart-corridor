"""Idempotent sandbox top-up for seeded traders: ¥50,000 and Rs 500,000 (sandbox money)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import LedgerEntry, User
from . import service

START = {"CNY": 50_000_00, "PKR": 500_000_00}


def seed(db: Session) -> None:
    for u in db.scalars(select(User).where(User.role == "trader")):
        for cur, amt in START.items():
            w = service.wallet(db, u.id, cur)
            if db.scalar(select(LedgerEntry.id).where(LedgerEntry.account_id == w.id).limit(1)):
                continue
            service.topup(db, u.id, cur, amt, f"Opening sandbox balance {service.fmt(amt, cur)} (not real money)")
    db.flush()
