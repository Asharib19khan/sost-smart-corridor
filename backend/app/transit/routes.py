"""Transit checkpoints: signed checkpoint events, geofence + clock-skew flags (never block)."""

import math
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..core.db import User, get_db
from ..core.deps import audit, require_role
from ..shipments import service as svc
from ..shipments.state import check_transition, transition

router = APIRouter(tags=["transit"])

# name -> (lat, lng, radius_km, state_to)
CHECKPOINTS = {
    "kashgar": (39.47, 75.99, 40.0, "departed_kashgar"),
    "khunjerab": (36.85, 75.43, 15.0, "crossed_khunjerab"),
    "sost": (36.69, 74.82, 10.0, "arrived_sost"),
}


class EventIn(BaseModel):
    envelope: dict
    signature: str


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def clock_skewed(signed_at: str, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    try:
        t = datetime.fromisoformat(signed_at.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return True
    if t.tzinfo is None:
        t = t.replace(tzinfo=UTC)
    return t > now + timedelta(minutes=5) or t < now - timedelta(days=7)


def checkpoint_flags(name: str, lat_e6: int, lng_e6: int, signed_at: str) -> list[str]:
    lat, lng, radius, _ = CHECKPOINTS[name]
    flags = []
    if haversine_km(lat_e6 / 1e6, lng_e6 / 1e6, lat, lng) > radius:
        flags.append("outside_geofence")
    if clock_skewed(signed_at):
        flags.append("clock_skew")
    return flags


@router.post("/shipments/{shipment_id}/events")
def post_checkpoint(shipment_id: str, body: EventIn, request: Request,
                    user: User = Depends(require_role("trader", "driver")), db: Session = Depends(get_db)) -> dict:
    sh = svc.load_for(db, shipment_id, user)
    env = body.envelope
    svc.check_envelope(env, sh, "checkpoint")
    name = env["payload"].get("checkpoint")
    if name not in CHECKPOINTS or set(env["payload"]) != {"checkpoint"}:
        raise HTTPException(400, "Checkpoint must be one of kashgar, khunjerab or sost.")
    lat_e6, lng_e6 = env.get("lat_e6"), env.get("lng_e6")
    if not isinstance(lat_e6, int) or not isinstance(lng_e6, int) or isinstance(lat_e6, bool):
        raise HTTPException(400, "Location is required for a checkpoint. Turn on location and try again.")
    to_state = CHECKPOINTS[name][3]
    check_transition(sh, to_state)
    flags = checkpoint_flags(name, lat_e6, lng_e6, str(env.get("signed_at")))
    ev = svc.append_or_http(db, env, body.signature, expected_signer_user=user.id, flags=flags)
    transition(db, sh, to_state)
    svc.recompute_risk(db, sh)
    audit(db, request, user.id, "transit.checkpoint", sh.id, {"checkpoint": name, "seq": ev.seq, "flags": flags})
    db.commit()
    return {"seq": ev.seq, "type": ev.type, "hash": ev.hash, "state": sh.state, "flags": flags,
            "lat": ev.lat, "lng": ev.lng, "signed_at": ev.signed_at,
            "received_at": ev.created_at.isoformat()}
