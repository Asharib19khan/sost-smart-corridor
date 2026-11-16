"""Seed the 5 demo users from docs/CONTRACTS.md (idempotent)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import User
from .service import hash_secret

USERS = [
    ("trader", "Karim Baig (Gilgit)", "+923001110001", "1111"),
    ("trader", "Nasreen Shah (Hunza)", "+923001110002", "2222"),
    ("driver", "Sher Ali", "+923001110003", "3333"),
    ("customs", "Officer Ayesha Raza", "+923001110004", "4444"),
    ("admin", "Corridor Admin", "+923001110005", "5555"),
]


def seed(db: Session) -> None:
    for role, name, phone, pin in USERS:
        if db.scalar(select(User.id).where(User.phone == phone)):
            continue
        db.add(User(role=role, name=name, phone=phone, pin_hash=hash_secret(pin)))
    db.flush()
