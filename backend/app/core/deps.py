"""Shared FastAPI dependencies: current user, role checks, audit helper."""

from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import AuditLog, User, get_db

bearer = HTTPBearer(auto_error=False)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(401, "Not signed in. Sign in again to continue.")
    try:
        claims = jwt.decode(creds.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(401, "Session expired. Refresh or sign in again.") from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Invalid session. Sign in again.") from exc
    if claims.get("typ") != "access":
        raise HTTPException(401, "Invalid session. Sign in again.")
    user = db.get(User, claims["sub"])
    if user is None or user.status != "active":
        raise HTTPException(401, "Account is not active. Contact the corridor admin.")
    return user


def require_role(*roles: str) -> Callable[..., User]:
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Your role cannot do this.")
        return user

    return dep


def audit(db: Session, request: Request | None, actor_id: str | None, action: str,
          target: str | None = None, detail: dict | None = None) -> None:
    """Append to audit_log. Caller commits."""
    ip = request.client.host if request and request.client else None
    db.add(AuditLog(actor_id=actor_id, action=action, target=target, detail=detail, ip=ip))
