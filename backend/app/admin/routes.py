"""Admin: audit log, users + keys, key revoke, and the Tamper lab.

The Tamper lab deliberately bypasses every service and writes RAW SQL, simulating an attacker
with database access. Verification must catch each attack.
"""

import json
from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.db import AuditLog, DeviceKey, Shipment, User, get_db
from ..core.deps import audit, require_role
from ..keys.routes import key_out, revoke_key
from .models import TamperSnapshot

router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_role("admin")


@router.get("/audit")
def audit_rows(limit: int = 100, _: User = Depends(admin_only), db: Session = Depends(get_db)) -> list[dict]:
    limit = max(1, min(limit, 1000))
    rows = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit))
    return [{"id": r.id, "actor_id": r.actor_id, "action": r.action, "target": r.target, "detail": r.detail,
             "ip": r.ip, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.get("/users")
def users(_: User = Depends(admin_only), db: Session = Depends(get_db)) -> list[dict]:
    out = []
    for u in db.scalars(select(User).order_by(User.created_at)):
        keys = db.scalars(select(DeviceKey).where(DeviceKey.user_id == u.id).order_by(DeviceKey.created_at))
        out.append({"id": u.id, "role": u.role, "name": u.name, "phone": u.phone, "status": u.status,
                    "locked_until": u.locked_until.isoformat() if u.locked_until else None,
                    "keys": [key_out(k) for k in keys]})
    return out


@router.post("/keys/{key_id}/revoke")
def admin_revoke(key_id: str, request: Request, user: User = Depends(admin_only),
                 db: Session = Depends(get_db)) -> dict:
    return revoke_key(db, request, user, key_id)


# ---------------- Tamper lab ----------------
class TamperIn(BaseModel):
    action: Literal["edit_line_price", "edit_line_qty", "delete_event", "swap_events", "edit_event_payload"]
    shipment_id: str
    line_no: int | None = None
    seq: int | None = None
    value: Any = None
    field: str | None = None  # edit_event_payload: which payload key (default: first key)


class RestoreIn(BaseModel):
    shipment_id: str


def _plain(v: Any) -> Any:
    if isinstance(v, datetime | date):
        return v.isoformat()
    if isinstance(v, dict | list):
        return json.dumps(v)
    return v


def _rows(db: Session, table: str, shipment_id: str) -> list[dict]:
    res = db.execute(text(f"SELECT * FROM {table} WHERE shipment_id = :s"), {"s": shipment_id})  # noqa: S608
    return [{k: _plain(v) for k, v in r.items()} for r in res.mappings()]


def _need(v: Any, what: str) -> Any:
    if v is None:
        raise HTTPException(400, f"Give {what} for this attack.")
    return v


def _int(v: Any, what: str) -> int:
    try:
        return int(_need(v, what))
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, f"{what} must be a whole number.") from exc


def _check(rowcount: int, what: str) -> None:
    if rowcount == 0:
        raise HTTPException(404, f"Nothing to tamper: {what} not found on this shipment.")


@router.post("/tamper")
def tamper(body: TamperIn, request: Request, user: User = Depends(admin_only),
           db: Session = Depends(get_db)) -> dict:
    sid = body.shipment_id
    if db.get(Shipment, sid) is None:
        raise HTTPException(404, "Shipment not found. Pick a shipment from the list.")
    snap = db.get(TamperSnapshot, sid)
    if snap is None:
        db.add(TamperSnapshot(shipment_id=sid, lines=_rows(db, "manifest_lines", sid),
                              events=_rows(db, "events", sid)))
        db.flush()
    p: dict[str, Any] = {"s": sid}
    try:
        if body.action in ("edit_line_price", "edit_line_qty"):
            p |= {"n": _int(body.line_no, "line_no"), "v": _int(body.value, "value")}
            sql = ("UPDATE manifest_lines SET unit_price_fen = :v, total_fen = qty * :v "
                   "WHERE shipment_id = :s AND line_no = :n") if body.action == "edit_line_price" else \
                  ("UPDATE manifest_lines SET qty = :v, total_fen = :v * unit_price_fen "
                   "WHERE shipment_id = :s AND line_no = :n")
            _check(db.execute(text(sql), p).rowcount, f"line {p['n']}")
        elif body.action == "delete_event":
            p["q"] = _int(body.seq, "seq")
            _check(db.execute(text("DELETE FROM events WHERE shipment_id = :s AND seq = :q"), p).rowcount,
                   f"step seq {p['q']}")
        elif body.action == "swap_events":
            a, b = _int(body.seq, "seq"), _int(body.value, "value (the other seq)")
            p |= {"a": a, "b": b, "t": -999999}
            _check(db.execute(text("UPDATE events SET seq = :t WHERE shipment_id = :s AND seq = :a"), p).rowcount,
                   f"step seq {a}")
            _check(db.execute(text("UPDATE events SET seq = :a WHERE shipment_id = :s AND seq = :b"), p).rowcount,
                   f"step seq {b}")
            db.execute(text("UPDATE events SET seq = :b WHERE shipment_id = :s AND seq = :t"), p)
        else:  # edit_event_payload
            p["q"] = _int(body.seq, "seq")
            row = db.execute(text("SELECT id, envelope, payload FROM events WHERE shipment_id = :s AND seq = :q"),
                             p).mappings().first()
            _check(0 if row is None else 1, f"step seq {p['q']}")
            env = row["envelope"] if isinstance(row["envelope"], dict) else json.loads(row["envelope"])
            payload = env.get("payload") or {}
            field = body.field or (sorted(payload)[0] if payload else None)
            if field is None:
                raise HTTPException(400, "This step has an empty payload; pick another step.")
            payload[field] = _need(body.value, "value")
            env["payload"] = payload
            db.execute(text("UPDATE events SET envelope = :e, payload = :p WHERE id = :i"),
                       {"e": json.dumps(env), "p": json.dumps(payload), "i": row["id"]})
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "The database refused this edit (another record depends on it). "
                                 "Try a different attack.") from exc
    audit(db, request, user.id, f"tamper.{body.action}", sid,
          {"line_no": body.line_no, "seq": body.seq, "value": body.value, "field": body.field})
    db.commit()
    return {"ok": True, "action": body.action, "shipment_id": sid,
            "note": "Raw SQL write that bypassed the API. Open the verify page to see if it is caught."}


def _upsert(db: Session, table: str, rows: list[dict]) -> None:
    for r in rows:
        cols = list(r)
        exists = db.execute(text(f"SELECT 1 FROM {table} WHERE id = :id"), {"id": r["id"]}).first()  # noqa: S608
        if exists:
            sets = ", ".join(f"{c} = :{c}" for c in cols if c != "id")
            db.execute(text(f"UPDATE {table} SET {sets} WHERE id = :id"), r)  # noqa: S608
        else:
            db.execute(text(f"INSERT INTO {table} ({', '.join(cols)}) "  # noqa: S608
                            f"VALUES ({', '.join(':' + c for c in cols)})"), r)


@router.post("/tamper/restore")
def restore(body: RestoreIn, request: Request, user: User = Depends(admin_only),
            db: Session = Depends(get_db)) -> dict:
    snap = db.get(TamperSnapshot, body.shipment_id)
    if snap is None:
        raise HTTPException(404, "No snapshot for this shipment: it has not been tampered with.")
    sid = body.shipment_id
    # Move current seqs out of the way so the (shipment_id, seq) unique constraint can't collide.
    db.execute(text("UPDATE events SET seq = -1 - seq WHERE shipment_id = :s"), {"s": sid})
    _upsert(db, "events", snap.events)
    # Rows not in the snapshot (appended after the attack) are left with negative seqs; drop them.
    db.execute(text("DELETE FROM events WHERE shipment_id = :s AND seq < 0"), {"s": sid})
    _upsert(db, "manifest_lines", snap.lines)
    db.delete(snap)
    audit(db, request, user.id, "tamper.restore", sid)
    db.commit()
    return {"ok": True, "shipment_id": sid, "restored_lines": len(snap.lines), "restored_events": len(snap.events)}
