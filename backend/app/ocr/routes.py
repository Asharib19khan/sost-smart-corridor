from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.db import ManifestLine, Receipt, Seller, Shipment, User, get_db
from ..core.deps import audit, current_user
from . import service

router = APIRouter(tags=["ocr"])


def _shipment_for_view(db: Session, shipment_id: str, user: User) -> Shipment:
    s = db.get(Shipment, shipment_id)
    if s is None:
        raise HTTPException(404, "Shipment not found. Check the link and try again.")
    if user.role in ("customs", "admin"):
        return s
    if user.role == "trader" and s.trader_id == user.id:
        return s
    raise HTTPException(403, "This shipment belongs to another trader.")


def _owned(db: Session, shipment_id: str, user: User, states: tuple[str, ...]) -> Shipment:
    s = db.get(Shipment, shipment_id)
    if s is None:
        raise HTTPException(404, "Shipment not found. Check the link and try again.")
    if user.role != "trader" or s.trader_id != user.id:
        raise HTTPException(403, "Only the trader who owns this shipment can change it.")
    if s.state not in states:
        raise HTTPException(409, f"Shipment is {s.state}; receipts and lines can only change while it is {' or '.join(states)}.")
    return s


@router.post("/shipments/{shipment_id}/receipts")
async def upload_receipt(shipment_id: str, request: Request, file: UploadFile = File(...),
                         seller_id: str | None = Form(None), user: User = Depends(current_user),
                         db: Session = Depends(get_db)) -> dict:
    _owned(db, shipment_id, user, ("draft",))
    if seller_id and db.get(Seller, seller_id) is None:
        raise HTTPException(404, "Seller not found. Pick the shop from the list.")
    data = await file.read(settings.max_upload_bytes + 1)
    try:
        path, sha = service.store_upload(data)
    except service.UploadRejected as exc:
        raise HTTPException(exc.status, exc.message) from exc
    r = Receipt(shipment_id=shipment_id, seller_id=seller_id or None, image_path=str(path),
                image_sha256=sha, status="processing")
    db.add(r)
    db.flush()
    audit(db, request, user.id, "receipt.upload", r.id, {"shipment_id": shipment_id, "sha256": sha})
    db.commit()
    service.start_processing(r.id)
    return {"id": r.id, "status": r.status}


def _receipt(db: Session, receipt_id: str, user: User) -> Receipt:
    r = db.get(Receipt, receipt_id)
    if r is None:
        raise HTTPException(404, "Receipt not found.")
    _shipment_for_view(db, r.shipment_id, user)
    return r


@router.get("/receipts/{receipt_id}")
def get_receipt(receipt_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    r = _receipt(db, receipt_id, user)
    lines = db.scalars(select(ManifestLine).where(ManifestLine.receipt_id == r.id)
                       .order_by(ManifestLine.line_no)).all()
    return {"id": r.id, "status": r.status, "reader": r.reader, "flags": r.flags or [],
            "total_fen": r.total_fen, "error": r.error, "lines": [service.line_out(ln) for ln in lines]}


@router.get("/receipts/{receipt_id}/image")
def get_receipt_image(receipt_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _receipt(db, receipt_id, user)
    p = Path(r.image_path)
    if not p.exists():
        raise HTTPException(404, "The receipt photo is no longer stored on this server.")
    return FileResponse(p, media_type="image/jpeg")


@router.get("/shipments/{shipment_id}/lines")
def get_lines(shipment_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    _shipment_for_view(db, shipment_id, user)
    lines = db.scalars(select(ManifestLine).where(ManifestLine.shipment_id == shipment_id)
                       .order_by(ManifestLine.line_no)).all()
    return [service.line_out(ln) for ln in lines]


class LinePatch(BaseModel):
    qty: int | None = Field(None, ge=0, le=10_000_000)
    unit_price_fen: int | None = Field(None, ge=0, le=10_000_000_000)
    hs_code: str | None = Field(None, pattern=r"^\d{8}$")
    item_en: str | None = Field(None, min_length=1, max_length=200)
    item_ur: str | None = Field(None, min_length=1, max_length=200)


@router.patch("/manifest-lines/{line_id}")
def patch_line(line_id: str, body: LinePatch, request: Request, user: User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    ln = db.get(ManifestLine, line_id)
    if ln is None:
        raise HTTPException(404, "Manifest line not found.")
    _owned(db, ln.shipment_id, user, ("draft", "paid"))
    changes = body.model_dump(exclude_none=True)
    before = {k: getattr(ln, k) for k in changes}
    for k, v in changes.items():
        setattr(ln, k, v)
    if "hs_code" in changes:
        ln.hs_confidence = 100
    ln.total_fen = ln.qty * ln.unit_price_fen
    ln.value_flag = service.line_value_flag(db, ln.hs_code, ln.qty, ln.unit_price_fen, ln.total_fen)
    ln.edited = True
    audit(db, request, user.id, "manifest_line.edit", ln.id, {"before": before, "after": changes})
    db.commit()
    return service.line_out(ln)
