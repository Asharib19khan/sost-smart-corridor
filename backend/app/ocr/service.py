"""M1 receipt -> manifest pipeline. The model only transcribes; code checks every number."""

from __future__ import annotations

import hashlib
import io
import logging
import re
import threading
from pathlib import Path

from PIL import Image, ImageOps
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core import db as dbmod
from ..core.config import settings
from ..core.db import ManifestLine, Receipt, ValueBand
from . import readers
from .readers import RawReceipt

log = logging.getLogger("sost.ocr")

INJECTION_RE = re.compile(
    r"ignore|disregard|instruction|system\s*prompt|override|declare\s+as|"
    r"忽略|无视|指令|提示词|系统提示|申报|改为",
    re.IGNORECASE,
)

_translate_cache: dict[str, readers.ItemInfo] = {}
_cache_lock = threading.Lock()


class UploadRejected(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def sniff(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"hevc"):
        return "heic"
    return None


def store_upload(data: bytes) -> tuple[Path, str]:
    """Validate, re-encode to clean JPEG (EXIF stripped, orientation applied). Returns (path, sha256)."""
    if len(data) > settings.max_upload_bytes:
        mb = settings.max_upload_bytes // (1024 * 1024)
        raise UploadRejected(413, f"This photo is larger than {mb} MB. Take it again at a lower resolution.")
    kind = sniff(data)
    if kind == "heic":
        raise UploadRejected(415, "HEIC photos are not supported yet. Set your camera to 'Most compatible' (JPEG) and try again.")
    if kind is None:
        raise UploadRejected(415, "This file is not a photo. Upload a JPEG, PNG or WebP picture of the receipt.")
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception as exc:
        raise UploadRejected(415, "This photo could not be opened. Take it again and upload a JPEG or PNG.") from exc
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    clean = buf.getvalue()
    sha = hashlib.sha256(clean).hexdigest()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    path = settings.upload_dir / f"{sha}.jpg"
    if not path.exists():
        path.write_bytes(clean)
    return path, sha


def prepare_image(src: Path) -> Path:
    """Orient, downscale to <=2000 px, autocontrast. Writes a sibling *_prep.jpg."""
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((2000, 2000))
        im = ImageOps.autocontrast(im, cutoff=1)
        out = src.with_name(src.stem + "_prep.jpg")
        im.save(out, "JPEG", quality=90)
    return out


def yuan(fen: int) -> str:
    return f"¥{fen / 100:.2f}"


def band_flag(band: ValueBand | None, unit_price_fen: int) -> str | None:
    if band is None:
        return None
    name = band.description_en.split(",")[0].lower()
    rng = f"{yuan(band.min_fen)}–{yuan(band.max_fen)}"
    if unit_price_fen < band.min_fen:
        return (f"Unit price {yuan(unit_price_fen)} is far below the usual {rng} for {name} "
                "(possible under-invoicing)")
    if unit_price_fen > band.max_fen:
        return f"Unit price {yuan(unit_price_fen)} is above the usual {rng} for {name} (check the price)"
    return None


def line_value_flag(db: Session, hs_code: str, qty: int, unit_price_fen: int, total_fen: int) -> str | None:
    reasons = []
    if abs(qty * unit_price_fen - total_fen) > 1:
        reasons.append(f"Line total {yuan(total_fen)} does not equal {qty} × {yuan(unit_price_fen)}")
    b = band_flag(db.get(ValueBand, hs_code), unit_price_fen)
    if b:
        reasons.append(b)
    return "; ".join(reasons)[:200] or None


def translate(db: Session, items: list[str]) -> dict[str, readers.ItemInfo]:
    with _cache_lock:
        missing = list(dict.fromkeys(i for i in items if i not in _translate_cache))
    if missing:
        bands = db.scalars(select(ValueBand)).all()
        infos = readers.translate_items(missing, [(b.hs_code, b.description_en) for b in bands])
        known = {b.hs_code for b in bands}
        with _cache_lock:
            for zh, info in zip(missing, infos, strict=True):
                if not re.fullmatch(r"\d{8}", info.hs_code):
                    info.hs_code, info.hs_confidence = "00000000", 0
                elif info.hs_code not in known:
                    info.hs_confidence = min(info.hs_confidence, 50)
                _translate_cache[zh] = info
    with _cache_lock:
        return {i: _translate_cache[i] for i in items}


def apply_reading(db: Session, receipt: Receipt, raw: RawReceipt, reader: str) -> None:
    flags: list[str] = []
    texts = [raw.raw_text, *raw.suspicious_text]
    if raw.suspicious_text or any(INJECTION_RE.search(t or "") for t in texts):
        flags.append("injection_text")
    if not raw.lines:
        flags.append("no_lines")
    line_sum = sum(ln.total_fen for ln in raw.lines)
    if raw.total_fen is not None and abs(line_sum - raw.total_fen) > 1:
        flags.append("sum_mismatch")
    if any(abs(ln.qty * ln.unit_price_fen - ln.total_fen) > 1 for ln in raw.lines):
        flags.append("line_mismatch")

    info = translate(db, [ln.item_zh for ln in raw.lines]) if raw.lines else {}
    start = db.scalar(select(func.coalesce(func.max(ManifestLine.line_no), 0))
                      .where(ManifestLine.shipment_id == receipt.shipment_id)) or 0
    for i, ln in enumerate(raw.lines, start=1):
        it = info[ln.item_zh]
        db.add(ManifestLine(
            shipment_id=receipt.shipment_id, receipt_id=receipt.id, line_no=start + i,
            item_zh=ln.item_zh, item_en=it.item_en, item_ur=it.item_ur, hs_code=it.hs_code,
            hs_confidence=it.hs_confidence, qty=ln.qty, unit=ln.unit or "pcs",
            unit_price_fen=ln.unit_price_fen, total_fen=ln.total_fen,
            value_flag=line_value_flag(db, it.hs_code, ln.qty, ln.unit_price_fen, ln.total_fen),
        ))
    receipt.flags = flags
    receipt.total_fen = raw.total_fen if raw.total_fen is not None else line_sum
    receipt.reader = reader
    receipt.ocr_text = raw.raw_text
    receipt.status = "done"


def process_receipt(receipt_id: str) -> None:
    """Background worker with its own DB session."""
    with dbmod.SessionLocal() as db:
        receipt = db.get(Receipt, receipt_id)
        if receipt is None:
            return
        try:
            prepped = prepare_image(Path(receipt.image_path))
            raw, reader = readers.read_receipt(prepped)
            apply_reading(db, receipt, raw, reader)
            db.commit()
        except Exception as exc:
            db.rollback()
            log.exception("receipt %s failed", receipt_id)
            receipt = db.get(Receipt, receipt_id)
            receipt.status = "failed"
            receipt.error = (str(exc) if isinstance(exc, readers.ReaderError)
                             else "Reading this receipt failed. Upload a clearer photo or enter the lines by hand.")
            db.commit()


def start_processing(receipt_id: str) -> threading.Thread:
    t = threading.Thread(target=process_receipt, args=(receipt_id,), daemon=True)
    t.start()
    return t


def line_out(ln: ManifestLine) -> dict:
    return {k: getattr(ln, k) for k in (
        "id", "receipt_id", "line_no", "item_zh", "item_en", "item_ur", "hs_code", "hs_confidence",
        "qty", "unit", "unit_price_fen", "total_fen", "value_flag")}
