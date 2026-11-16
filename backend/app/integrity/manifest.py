"""Canonical manifest. The trader signs manifest_hash; per-line hashes let verify name the exact edited line.

The browser builds the SAME document from GET /shipments/{id}/manifest (field `canonical`),
so trader app, seller page and verify page all hash identical bytes.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.canonical import canonical_hash
from ..core.db import ManifestLine, Shipment

LINE_FIELDS = ("line_no", "item_zh", "item_en", "hs_code", "qty", "unit", "unit_price_fen", "total_fen")


def line_doc(line: ManifestLine) -> dict:
    return {f: getattr(line, f) for f in LINE_FIELDS}


def manifest_doc(db: Session, shipment: Shipment) -> dict:
    lines = list(db.scalars(
        select(ManifestLine).where(ManifestLine.shipment_id == shipment.id).order_by(ManifestLine.line_no)
    ))
    docs = [line_doc(ln) for ln in lines]
    return {
        "v": 1,
        "shipment_id": shipment.id,
        "ref": shipment.ref,
        "trader_id": shipment.trader_id,
        "currency": "CNY",
        "lines": docs,
        "line_hashes": [canonical_hash(d) for d in docs],
        "total_fen": sum(d["total_fen"] for d in docs),
    }


def manifest_hash(doc: dict) -> str:
    return canonical_hash(doc)


def compare_to_sealed(db: Session, shipment: Shipment, sealed_payload: dict) -> list[dict]:
    """Return per-line differences between current DB lines and what was sealed."""
    current = manifest_doc(db, shipment)
    sealed_hashes: list[str] = sealed_payload.get("line_hashes", [])
    problems = []
    for i in range(max(len(sealed_hashes), len(current["line_hashes"]))):
        a = sealed_hashes[i] if i < len(sealed_hashes) else None
        b = current["line_hashes"][i] if i < len(current["line_hashes"]) else None
        if a != b:
            ln = current["lines"][i] if i < len(current["lines"]) else None
            problems.append({
                "line_no": i + 1,
                "problem": "Line was deleted after sealing" if b is None
                else "Line was added after sealing" if a is None
                else "Line was edited after sealing",
                "current": ln,
            })
    if not problems and manifest_hash(current) != sealed_payload.get("manifest_hash"):
        problems.append({"line_no": None, "problem": "Manifest header changed after sealing", "current": None})
    return problems
