"""M2 integrity: signed, hash-chained event log. Every module writes through append_event().

Envelope (v1), identical for browser-signed events and the future IoT e-seal:
    {
      "v": 1,
      "shipment_id": str,
      "seq": int,                 # 0-based, contiguous
      "type": str,                # see EVENT_TYPES
      "payload": dict,            # integers/strings only (money in minor units)
      "lat_e6": int | None,       # microdegrees
      "lng_e6": int | None,
      "signed_at": str,           # device ISO-8601 UTC, e.g. 2026-11-16T09:12:03Z
      "nonce": str,               # 16+ random bytes, base64url; globally unique (replay guard)
      "prev_hash": str,           # hash of event seq-1, or GENESIS for seq 0
      "signer_key_id": str        # fingerprint of a registered, unrevoked device key
    }
    hash = sha256_hex(JCS(envelope)); signature = ed25519(hash.encode()) by signer.
    server_sig = ed25519_server(f"{hash}|{received_at_iso}") — proves when the server saw it.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.canonical import canonical_hash
from ..core.crypto import server_key, sign_with, verify
from ..core.db import DeviceKey, Event, Shipment

GENESIS = "0" * 64

EVENT_TYPES = {
    "manifest_sealed",      # payload: {manifest_hash, line_count, total_fen}
    "seller_confirmed",     # payload: {manifest_hash, receipt_id, amount_fen}
    "payment",              # payload: {payment_id, seller_id, amount_fen}
    "checkpoint",           # payload: {checkpoint: kashgar|khunjerab|sost, state_to}
    "customs_decision",     # payload: {decision, reason}
    "eseal",                # future IoT e-seal reading, same envelope
}


class ChainError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def head(db: Session, shipment_id: str) -> tuple[int, str]:
    """Next seq and prev_hash the client must sign over."""
    last = db.scalars(
        select(Event).where(Event.shipment_id == shipment_id).order_by(Event.seq.desc()).limit(1)
    ).first()
    return (0, GENESIS) if last is None else (last.seq + 1, last.hash)


def append_event(db: Session, envelope: dict, signature: str, *, expected_signer_user: str | None = None,
                 flags: list[str] | None = None) -> Event:
    """Validate and append a client-signed envelope. Caller commits.

    Raises ChainError(409) if prev_hash/seq is stale (client should refresh head and re-sign,
    keeping its original signed_at/lat/lng), 400 for malformed, 401/403 for key problems.
    """
    required = {"v", "shipment_id", "seq", "type", "payload", "lat_e6", "lng_e6",
                "signed_at", "nonce", "prev_hash", "signer_key_id"}
    if set(envelope) != required:
        raise ChainError(400, f"Envelope fields must be exactly {sorted(required)}")
    if envelope["v"] != 1 or envelope["type"] not in EVENT_TYPES:
        raise ChainError(400, "Unknown envelope version or event type")
    if not isinstance(envelope["nonce"], str) or len(envelope["nonce"]) < 16:
        raise ChainError(400, "Nonce too short")
    if db.get(Shipment, envelope["shipment_id"]) is None:
        raise ChainError(404, "Shipment not found")

    key = db.get(DeviceKey, envelope["signer_key_id"])
    if key is None:
        raise ChainError(401, "Signing key is not registered. Register this device again.")
    if key.revoked_at is not None:
        raise ChainError(403, "This device key was revoked. New signatures are refused.")
    if expected_signer_user is not None and key.user_id != expected_signer_user:
        raise ChainError(403, "This key belongs to another user.")

    if db.scalar(select(Event.id).where(Event.nonce == envelope["nonce"])) is not None:
        raise ChainError(409, "Replay detected: this signed event was already submitted.")

    seq, prev = head(db, envelope["shipment_id"])
    if envelope["seq"] != seq or envelope["prev_hash"] != prev:
        raise ChainError(409, "Chain moved on. Refresh the chain head and sign again.")

    try:
        h = canonical_hash(envelope)
    except ValueError as exc:
        raise ChainError(400, str(exc)) from exc
    if not verify(key.public_key, h, signature):
        raise ChainError(400, "Signature does not match the event.")

    received = datetime.now(UTC)
    ev = Event(
        shipment_id=envelope["shipment_id"], seq=seq, type=envelope["type"], payload=envelope["payload"],
        lat=envelope["lat_e6"] / 1e6 if envelope["lat_e6"] is not None else None,
        lng=envelope["lng_e6"] / 1e6 if envelope["lng_e6"] is not None else None,
        envelope=envelope, prev_hash=prev, hash=h, signature=signature, signer_key_id=key.id,
        server_sig=sign_with(server_key(), f"{h}|{received.isoformat()}"), nonce=envelope["nonce"],
        signed_at=envelope["signed_at"], created_at=received, flags=flags or None,
    )
    db.add(ev)
    db.flush()
    return ev


@dataclass
class StepResult:
    seq: int
    type: str
    ok: bool
    problem: str | None  # plain-language reason when not ok


def verify_chain(db: Session, shipment_id: str) -> dict:
    """Recompute every hash/signature from stored envelopes.

    Also checks that the denormalised columns (payload, type) still match the signed envelope,
    so a DB edit of either is caught. Returns {ok, broken_at, steps:[...]}.
    """
    events = list(db.scalars(select(Event).where(Event.shipment_id == shipment_id).order_by(Event.seq)))
    steps: list[StepResult] = []
    prev = GENESIS
    broken_at: int | None = None
    for expected_seq, ev in enumerate(events):
        problem = None
        env = ev.envelope or {}
        key = db.get(DeviceKey, ev.signer_key_id)
        if ev.seq != expected_seq:
            problem = f"Step {expected_seq + 1} is missing or out of order"
        elif env.get("prev_hash") != prev or ev.prev_hash != prev:
            problem = "Link to the previous step is broken (a step was deleted, reordered or edited)"
        elif ev.payload != env.get("payload") or ev.type != env.get("type"):
            problem = "Stored record was changed after it was signed"
        else:
            try:
                recomputed = canonical_hash(env)
            except ValueError:
                recomputed = None
            if recomputed != ev.hash:
                problem = "Signed contents were edited (hash no longer matches)"
            elif key is None or not verify(key.public_key, ev.hash, ev.signature):
                problem = "Signature is not valid for this step"
        ok = problem is None
        if not ok and broken_at is None:
            broken_at = expected_seq
        steps.append(StepResult(seq=expected_seq, type=ev.type, ok=ok, problem=problem))
        prev = ev.hash
    return {
        "ok": broken_at is None,
        "broken_at": broken_at,
        "head_hash": prev,
        "steps": [s.__dict__ for s in steps],
    }
