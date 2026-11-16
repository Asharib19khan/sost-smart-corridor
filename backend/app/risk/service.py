"""Explainable risk score. Fixed weights (PLAN §1 row 11); bands green <30, amber 30-59, red >=60."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.db import Event, ManifestLine, Payment, Shipment
from ..integrity import manifest as mf
from ..integrity import service as integrity
from ..trust import service as trust

W_INTEGRITY, W_PAYMENT, W_VALUE_LINE, W_VALUE_MAX, W_GEOFENCE, W_NEW, W_TRUSTED = 60, 25, 15, 30, 15, 10, -15


def yuan(fen: int) -> str:
    w, f = divmod(abs(fen), 100)
    return f"¥{w:,}" if f == 0 else f"¥{w:,}.{f:02d}"


def payment_mismatch(db: Session, shipment: Shipment) -> tuple[int, int, int]:
    """(paid_fen, declared_fen, pct) — pct = |paid − declared| / declared, whole percent (rounded)."""
    paid = int(db.scalar(select(func.coalesce(func.sum(Payment.amount_fen), 0))
                         .where(Payment.shipment_id == shipment.id)) or 0)
    declared = int(db.scalar(select(func.coalesce(func.sum(ManifestLine.total_fen), 0))
                             .where(ManifestLine.shipment_id == shipment.id)) or 0)
    pct = 0 if declared == 0 else (abs(paid - declared) * 100 + declared // 2) // declared
    return paid, declared, pct


def band(score: int) -> str:
    return "green" if score < 30 else "amber" if score < 60 else "red"


def compute(db: Session, shipment: Shipment) -> tuple[int, str, list[str]]:
    items: list[tuple[int, str]] = []

    chain = integrity.verify_chain(db, shipment.id)
    sealed = db.scalars(select(Event).where(Event.shipment_id == shipment.id, Event.type == "manifest_sealed")
                        .order_by(Event.seq.desc()).limit(1)).first()
    diffs = mf.compare_to_sealed(db, shipment, sealed.envelope.get("payload") or {}) if sealed else []
    if not chain["ok"]:
        step = next(s for s in chain["steps"] if not s["ok"])
        items.append((W_INTEGRITY, f"Integrity broken at step {step['seq'] + 1}: {step['problem']}."))
    elif diffs:
        d = diffs[0]
        where = f"line {d['line_no']}" if d["line_no"] else "the manifest"
        items.append((W_INTEGRITY, f"Manifest changed after sealing ({where}: {d['problem'].lower()})."))

    paid, declared, pct = payment_mismatch(db, shipment)
    if paid > 0 and declared > 0 and abs(paid - declared) * 100 > 2 * declared:
        items.append((W_PAYMENT, f"Paid {yuan(paid)} but declared {yuan(declared)} ({pct}% gap)."))

    flagged = list(db.scalars(select(ManifestLine).where(
        ManifestLine.shipment_id == shipment.id, ManifestLine.value_flag.is_not(None)).order_by(ManifestLine.line_no)))
    if flagged:
        w = min(W_VALUE_MAX, W_VALUE_LINE * len(flagged))
        nos = ", ".join(str(ln.line_no) for ln in flagged)
        items.append((w, f"{len(flagged)} line(s) priced outside the usual value band (line {nos}): "
                         f"{flagged[0].value_flag}."))

    cps = db.scalars(select(Event).where(Event.shipment_id == shipment.id, Event.type == "checkpoint"))
    off = [e for e in cps if e.flags and "outside_geofence" in e.flags]
    if off:
        name = (off[0].payload or {}).get("checkpoint", "a checkpoint")
        items.append((W_GEOFENCE, f"Location at {name} did not match the expected place (consistency signal)."))

    cleared = int(db.scalar(select(func.count()).select_from(Shipment).where(
        Shipment.trader_id == shipment.trader_id, Shipment.state == "cleared")) or 0)
    if cleared < 3:
        items.append((W_NEW, f"New trader: {cleared} cleared shipment(s) so far, fewer than 3."))

    ts = trust.score_of(db, shipment.trader_id)
    if ts > 80:
        items.append((W_TRUSTED, f"Trusted trader (trust score {ts}) lowers risk."))

    score = max(0, min(100, sum(w for w, _ in items)))
    items.sort(key=lambda x: -x[0])
    return score, band(score), [r for _, r in items[:3]]
