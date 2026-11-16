"""PIN + OTP auth, JWT access tokens, rotating hashed refresh tokens."""

import hashlib
import re
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.db import OtpCode, RefreshToken, User

OTP_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
PIN_MAX_FAILS = 5
LOCK_MINUTES = 15

PHONE_RE = re.compile(r"^\+?\d{10,15}$")


def aware(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; treat them as UTC."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def hash_secret(value: str) -> str:
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()


def check_secret(value: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(value.encode(), hashed.encode())
    except ValueError:
        return False


def normalise_phone(phone: str) -> str:
    p = re.sub(r"[\s().-]", "", phone or "")
    # Accept the ways people really type a Pakistani mobile: +92300…, 92300…, 0092300…, 0300…, 300…
    if p.startswith("0092"):
        p = "+" + p[2:]
    elif re.fullmatch(r"92\d{10}", p):
        p = "+" + p
    elif re.fullmatch(r"0\d{10}", p):
        p = "+92" + p[1:]
    elif re.fullmatch(r"3\d{9}", p):
        p = "+92" + p
    if not PHONE_RE.match(p):
        raise HTTPException(400, "Phone number looks wrong. Use the format +923001234567.")
    return p


def normalise_cnic(cnic: str) -> str:
    c = re.sub(r"[\s-]", "", cnic or "")
    if not re.fullmatch(r"\d{13}", c):
        raise HTTPException(400, "CNIC must be 13 digits, e.g. 35202-1234567-1.")
    return c


def cnic_hash(cnic: str) -> str:
    return hashlib.sha256(cnic.encode()).hexdigest()


def validate_pin(pin: str) -> str:
    if not re.fullmatch(r"\d{4,6}", pin or ""):
        raise HTTPException(400, "PIN must be 4 to 6 digits.")
    return pin


# ---------- OTP ----------
def issue_otp(db: Session, phone: str) -> str:
    code = f"{secrets.randbelow(10**6):06d}"
    row = db.get(OtpCode, phone)
    expires = datetime.now(UTC) + timedelta(minutes=OTP_MINUTES)
    if row is None:
        db.add(OtpCode(phone=phone, code_hash=hash_secret(code), expires_at=expires, attempts=0))
    else:
        row.code_hash, row.expires_at, row.attempts = hash_secret(code), expires, 0
    return code


def consume_otp(db: Session, phone: str, code: str) -> None:
    row = db.get(OtpCode, phone)
    if row is None:
        raise HTTPException(400, "No code was sent to this number. Request a new code.")
    if aware(row.expires_at) < datetime.now(UTC):
        raise HTTPException(400, "This code has expired. Request a new code.")
    if row.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(400, "Too many wrong codes. Request a new code.")
    if not check_secret(code or "", row.code_hash):
        row.attempts += 1
        db.commit()
        left = OTP_MAX_ATTEMPTS - row.attempts
        raise HTTPException(400, f"Wrong code. {left} tries left, then request a new code.")
    db.delete(row)


# ---------- tokens ----------
def access_token(user: User) -> str:
    now = datetime.now(UTC)
    claims = {"sub": user.id, "role": user.role, "typ": "access", "iat": now,
              "exp": now + timedelta(minutes=settings.jwt_access_minutes)}
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def _token_id(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_refresh(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(RefreshToken(id=_token_id(token), user_id=user.id,
                        expires_at=datetime.now(UTC) + timedelta(days=settings.jwt_refresh_days)))
    return token


def rotate_refresh(db: Session, token: str) -> tuple[User, str, str]:
    row = db.get(RefreshToken, _token_id(token or ""))
    if row is None:
        raise HTTPException(401, "Session not recognised. Sign in again.")
    if row.used:
        # Reuse of a rotated token: assume theft and end every session of this user.
        db.execute(update(RefreshToken).where(RefreshToken.user_id == row.user_id).values(used=True))
        db.commit()
        raise HTTPException(401, "This session was already used, so all your sessions were signed out. "
                                 "Sign in again.")
    if aware(row.expires_at) < datetime.now(UTC):
        raise HTTPException(401, "Session expired. Sign in again.")
    user = db.get(User, row.user_id)
    if user is None or user.status != "active":
        raise HTTPException(401, "Account is not active. Contact the corridor admin.")
    row.used = True
    return user, access_token(user), new_refresh(db, user)


def session(db: Session, user: User) -> dict:
    return {"access": access_token(user), "refresh": new_refresh(db, user),
            "user": {"id": user.id, "role": user.role, "name": user.name}}


# ---------- PIN login ----------
def login(db: Session, phone: str, pin: str) -> User:
    user = db.scalar(select(User).where(User.phone == phone))
    if user is None or not user.pin_hash:
        raise HTTPException(401, "Phone or PIN is wrong. Check both and try again.")
    now = datetime.now(UTC)
    locked = aware(user.locked_until)
    if locked and locked > now:
        mins = max(1, int((locked - now).total_seconds() // 60) + 1)
        raise HTTPException(423, f"Too many wrong PINs. This account is locked; try again in {mins} "
                                 f"minutes (after {locked:%H:%M} UTC).")
    if not check_secret(pin or "", user.pin_hash):
        user.failed_logins = (user.failed_logins or 0) + 1
        if user.failed_logins >= PIN_MAX_FAILS:
            user.failed_logins = 0
            user.locked_until = now + timedelta(minutes=LOCK_MINUTES)
            db.commit()
            raise HTTPException(423, f"Too many wrong PINs. This account is locked for {LOCK_MINUTES} "
                                     f"minutes; try again after {user.locked_until:%H:%M} UTC.")
        db.commit()
        left = PIN_MAX_FAILS - user.failed_logins
        raise HTTPException(401, f"Phone or PIN is wrong. {left} tries left before a "
                                 f"{LOCK_MINUTES}-minute lock.")
    if user.status != "active":
        raise HTTPException(403, "Account is not active. Contact the corridor admin.")
    user.failed_logins = 0
    user.locked_until = None
    return user
