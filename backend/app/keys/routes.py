from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.crypto import b64u_dec, key_fingerprint
from ..core.db import DeviceKey, User, get_db
from ..core.deps import audit, current_user

router = APIRouter(prefix="/keys", tags=["keys"])


class KeyIn(BaseModel):
    public_key: str
    label: str = "browser"


def key_out(k: DeviceKey) -> dict:
    return {"id": k.id, "public_key": k.public_key, "label": k.label,
            "created_at": k.created_at.isoformat() if k.created_at else None,
            "revoked_at": k.revoked_at.isoformat() if k.revoked_at else None}


@router.post("")
def register(body: KeyIn, request: Request, user: User = Depends(current_user),
             db: Session = Depends(get_db)) -> dict:
    try:
        raw = b64u_dec(body.public_key)
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, "Public key is not valid base64url. Generate a new device key.") from exc
    if len(raw) != 32:
        raise HTTPException(400, "Public key must be a 32-byte Ed25519 key. Generate a new device key.")
    kid = key_fingerprint(body.public_key)
    existing = db.get(DeviceKey, kid)
    if existing is not None:
        if existing.user_id != user.id:
            raise HTTPException(409, "This key is registered to another account. Generate a new device key.")
        if existing.revoked_at is not None:
            raise HTTPException(409, "This key was revoked. Generate a new device key and register it.")
        return {"id": kid}
    db.add(DeviceKey(id=kid, user_id=user.id, public_key=body.public_key, label=(body.label or "browser")[:80]))
    audit(db, request, user.id, "keys.register", kid, {"label": body.label})
    db.commit()
    return {"id": kid}


@router.get("")
def mine(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.scalars(select(DeviceKey).where(DeviceKey.user_id == user.id).order_by(DeviceKey.created_at))
    return [key_out(k) for k in rows]


def revoke_key(db: Session, request: Request, actor: User, key_id: str) -> dict:
    key = db.get(DeviceKey, key_id)
    if key is None:
        raise HTTPException(404, "Key not found. Check the key id.")
    if key.user_id != actor.id and actor.role != "admin":
        raise HTTPException(403, "You can only revoke your own keys.")
    if key.revoked_at is None:
        key.revoked_at = datetime.now(UTC)
        audit(db, request, actor.id, "keys.revoke", key_id, {"owner": key.user_id})
        db.commit()
    return {"id": key.id, "revoked": True, "revoked_at": key.revoked_at.isoformat()}


@router.delete("/{key_id}")
def revoke(key_id: str, request: Request, user: User = Depends(current_user),
           db: Session = Depends(get_db)) -> dict:
    return revoke_key(db, request, user, key_id)


@router.get("/{key_id}/public")
def public(key_id: str, db: Session = Depends(get_db)) -> dict:
    key = db.get(DeviceKey, key_id)
    if key is None:
        raise HTTPException(404, "Key not found. It was never registered on this server.")
    owner = db.get(User, key.user_id)
    return {"id": key.id, "public_key": key.public_key,
            "revoked_at": key.revoked_at.isoformat() if key.revoked_at else None,
            "owner": {"name": owner.name if owner else None, "role": owner.role if owner else None}}
