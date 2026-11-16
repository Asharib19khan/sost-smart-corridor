from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.db import User, get_db
from ..core.deps import audit, current_user
from ..core.ratelimit import rate_limit
from . import service

router = APIRouter(prefix="/auth", tags=["auth"])


class OtpIn(BaseModel):
    phone: str


class SignupIn(BaseModel):
    phone: str
    otp: str
    name: str
    cnic: str
    pin: str


class LoginIn(BaseModel):
    phone: str
    pin: str


class RefreshIn(BaseModel):
    refresh: str


def user_out(u: User) -> dict:
    return {"id": u.id, "role": u.role, "name": u.name, "name_zh": u.name_zh, "phone": u.phone,
            "status": u.status}


@router.post("/otp", dependencies=[Depends(rate_limit("auth_otp", 5))])
def send_otp(body: OtpIn, request: Request, db: Session = Depends(get_db)) -> dict:
    phone = service.normalise_phone(body.phone)
    code = service.issue_otp(db, phone)
    audit(db, request, None, "auth.otp_sent", phone[-4:])
    db.commit()
    out: dict = {"sent": True}
    if settings.dev_show_otp:
        out["dev_code"] = code  # SMS gateway not connected; the UI labels this as a dev code.
    return out


@router.post("/signup", dependencies=[Depends(rate_limit("auth_signup", 10))])
def signup(body: SignupIn, request: Request, db: Session = Depends(get_db)) -> dict:
    phone = service.normalise_phone(body.phone)
    cnic = service.normalise_cnic(body.cnic)
    pin = service.validate_pin(body.pin)
    name = body.name.strip()
    if not 2 <= len(name) <= 120:
        raise HTTPException(400, "Enter your full name (2 to 120 characters).")
    if db.scalar(select(User.id).where(User.phone == phone)):
        raise HTTPException(409, "This phone number already has an account. Sign in with your PIN instead.")
    ch = service.cnic_hash(cnic)
    if db.scalar(select(User.id).where(User.cnic_hash == ch)):
        raise HTTPException(409, "An account with this CNIC already exists. Sign in with that account instead.")
    service.consume_otp(db, phone, body.otp)
    user = User(role="trader", name=name, phone=phone, cnic_hash=ch, pin_hash=service.hash_secret(pin))
    db.add(user)
    db.flush()
    audit(db, request, user.id, "auth.signup", user.id)
    out = service.session(db, user)
    db.commit()
    return out


@router.post("/login", dependencies=[Depends(rate_limit("auth_login", 10))])
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)) -> dict:
    phone = service.normalise_phone(body.phone)
    user = service.login(db, phone, body.pin)
    audit(db, request, user.id, "auth.login", user.id)
    out = service.session(db, user)
    db.commit()
    return out


@router.post("/refresh", dependencies=[Depends(rate_limit("auth_refresh", 30))])
def refresh(body: RefreshIn, db: Session = Depends(get_db)) -> dict:
    _, access, new = service.rotate_refresh(db, body.refresh)
    db.commit()
    return {"access": access, "refresh": new}


@router.get("/me")
def me(user: User = Depends(current_user)) -> dict:
    return user_out(user)
