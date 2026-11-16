"""Wallet, sandbox top-up, seller payment and duty endpoints. All money here is SANDBOX money."""

from datetime import UTC, datetime, timedelta

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..core.db import (
    LedgerEntry,
    LedgerTxn,
    ManifestLine,
    Payment,
    Receipt,
    Seller,
    Shipment,
    User,
    ValueBand,
    get_db,
)
from ..core.deps import audit, require_role
from ..integrity import service as integrity
from ..trust import service as trust
from . import service as ledger

router = APIRouter(tags=["ledger"])
trader_only = require_role("trader")

TOPUP_MAX = {"CNY": 50_000_00, "PKR": 500_000_00}  # per request
BALANCE_MAX = {"CNY": 200_000_00, "PKR": 2_000_000_00}  # wallet ceiling
DEFAULT_DUTY_PCT, DEFAULT_ST_PCT = 20, 18
LOCK_AFTER, LOCK_MINUTES = 5, 15


def _owned(db: Session, shipment_id: str, user: User) -> Shipment:
    s = db.get(Shipment, shipment_id)
    if s is None:
        raise HTTPException(404, "Shipment not found.")
    if s.trader_id != user.id:
        raise HTTPException(403, "This shipment belongs to another trader.")
    return s


@router.get("/wallet")
def get_wallet(user: User = Depends(trader_only), db: Session = Depends(get_db)) -> dict:
    accts = {c: ledger.wallet(db, user.id, c) for c in ledger.CURRENCIES}
    ids = [a.id for a in accts.values()]
    rows = db.execute(
        select(LedgerEntry, LedgerTxn, Shipment.ref)
        .join(LedgerTxn, LedgerTxn.id == LedgerEntry.txn_id)
        .outerjoin(Shipment, Shipment.id == LedgerEntry.shipment_id)
        .where(LedgerEntry.account_id.in_(ids))
        .order_by(LedgerTxn.created_at.desc())
        .limit(30)
    ).all()
    entries = [
        {"txn_id": t.id, "kind": t.kind, "memo": t.memo, "at": t.created_at.isoformat(),
         "currency": e.currency, "amount_minor": e.credit - e.debit, "shipment_ref": ref}
        for e, t, ref in rows
    ]
    out = {
        "sandbox": True,
        "label": "Sandbox money for the demo. Not real yuan or rupees.",
        "balances": {c: ledger.balance(db, a) for c, a in accts.items()},
        "credit_limit_paisa": trust.credit_limit_paisa(trust.score_of(db, user.id)),
        "duty_paid_paisa": ledger.duty_paid_total(db, user.id),
        "entries": entries,
    }
    db.commit()
    return out


class TopupIn(BaseModel):
    currency: str
    amount_minor: int = Field(gt=0)


@router.post("/wallet/topup")
def wallet_topup(body: TopupIn, request: Request, user: User = Depends(trader_only),
                 db: Session = Depends(get_db)) -> dict:
    cur = body.currency.upper()
    if cur not in ledger.CURRENCIES:
        raise HTTPException(400, "Currency must be CNY or PKR.")
    if body.amount_minor > TOPUP_MAX[cur]:
        raise HTTPException(400, f"Sandbox top-up is capped at {ledger.fmt(TOPUP_MAX[cur], cur)} per request.")
    w = ledger.wallet(db, user.id, cur)
    if ledger.balance(db, w) + body.amount_minor > BALANCE_MAX[cur]:
        raise HTTPException(400, f"Sandbox wallet ceiling is {ledger.fmt(BALANCE_MAX[cur], cur)}. "
                                 "Spend some before topping up again.")
    txn = ledger.topup(db, user.id, cur, body.amount_minor)
    audit(db, request, user.id, "wallet.topup", txn.id, {"currency": cur, "amount_minor": body.amount_minor})
    bal = ledger.balance(db, w)
    db.commit()
    return {"txn_id": txn.id, "balance": bal, "sandbox": True}


class PaymentIn(BaseModel):
    shipment_id: str
    seller_id: str
    amount_fen: int = Field(gt=0)
    pin: str
    envelope: dict
    signature: str


def _check_pin(db: Session, user: User, pin: str) -> None:
    """Same lockout counters as login: 5 wrong -> locked 15 min (423). Commits failures."""
    t = datetime.now(UTC)
    lu = user.locked_until
    if lu is not None and lu.tzinfo is None:
        lu = lu.replace(tzinfo=UTC)
    if lu is not None and lu > t:
        mins = max(1, int((lu - t).total_seconds() // 60) + 1)
        raise HTTPException(423, f"Too many wrong PINs. Try again in {mins} minutes.")
    if user.pin_hash and bcrypt.checkpw(pin.encode(), user.pin_hash.encode()):
        user.failed_logins = 0
        user.locked_until = None
        return
    user.failed_logins = (user.failed_logins or 0) + 1
    if user.failed_logins >= LOCK_AFTER:
        user.locked_until = t + timedelta(minutes=LOCK_MINUTES)
        user.failed_logins = 0
        db.commit()
        raise HTTPException(423, f"Too many wrong PINs. Payments are locked for {LOCK_MINUTES} minutes.")
    left = LOCK_AFTER - user.failed_logins
    db.commit()
    raise HTTPException(401, f"Wrong PIN. {left} tries left before a {LOCK_MINUTES}-minute lock.")


def _to_paid(db: Session, s: Shipment) -> None:
    try:
        from ..shipments.state import transition
    except ImportError:
        if s.state != "draft":
            raise HTTPException(409, f"Shipment is {s.state}; payment is only taken while it is a draft.") from None
        s.state = "paid"
        return
    transition(db, s, "paid")


@router.post("/payments")
def create_payment(body: PaymentIn, request: Request, user: User = Depends(trader_only),
                   db: Session = Depends(get_db)) -> dict:
    s = _owned(db, body.shipment_id, user)
    seller = db.get(Seller, body.seller_id)
    if seller is None:
        raise HTTPException(404, "Seller not found.")
    _check_pin(db, user, body.pin)
    if s.state != "draft":
        raise HTTPException(409, f"Shipment is {s.state}; payment is only taken while it is a draft.")
    w = ledger.wallet(db, user.id, "CNY")
    have = ledger.balance(db, w)
    if have < body.amount_fen:
        raise HTTPException(402, f"Not enough sandbox yuan: you have {ledger.fmt(have, 'CNY')}, "
                                 f"need {ledger.fmt(body.amount_fen, 'CNY')}. Top up in Wallet.")
    env = body.envelope
    p = env.get("payload") if isinstance(env.get("payload"), dict) else {}
    if (env.get("type") != "payment" or env.get("shipment_id") != s.id
            or p.get("seller_id") != body.seller_id or p.get("amount_fen") != body.amount_fen):
        raise HTTPException(400, "The signed payment does not match this payment (type, shipment, seller "
                                 "or amount). Sign again.")
    if p.get("receipt_id") is not None:
        r = db.get(Receipt, p["receipt_id"])
        if r is None or r.shipment_id != s.id:
            raise HTTPException(400, "The signed receipt is not on this shipment. Pick the right receipt.")
    try:
        ev = integrity.append_event(db, env, body.signature, expected_signer_user=user.id)
    except integrity.ChainError as exc:
        db.rollback()
        raise HTTPException(exc.status, exc.message) from exc
    txn = ledger.post_txn(db, "seller_payment", f"Sandbox payment to {seller.shop_name_en} for {s.ref}", [
        {"account": w, "debit": body.amount_fen, "shipment_id": s.id},
        {"account": ledger.get_account(db, "seller_payable", "CNY", seller.id),
         "credit": body.amount_fen, "shipment_id": s.id},
    ])
    pay = Payment(shipment_id=s.id, seller_id=seller.id, amount_fen=body.amount_fen, txn_id=txn.id)
    db.add(pay)
    _to_paid(db, s)
    db.flush()
    audit(db, request, user.id, "payment.create", s.id,
          {"payment_id": pay.id, "amount_fen": body.amount_fen, "event_id": ev.id})
    db.commit()
    return {"payment_id": pay.id, "txn_id": txn.id, "event_seq": ev.seq, "state": s.state, "sandbox": True}


# FY2026-27 tariff structure (National Tariff Policy 2025-30, second year): customs duty slabs 0/5/10/15
# (old 20 -> 15, 16 -> 15, 11 -> 10, 3 -> 5); Additional Customs Duty 2% on the top slab, 0% below it;
# Regulatory Duty capped at 20% but item-specific, so 0 here until set per HS code; sales tax 18% on value
# plus all duties; advance income tax at import on the duty-paid value. INDICATIVE, labelled on screen.
CD_FY27 = {20: 15, 16: 15, 11: 10, 3: 5}


def _cd_pct(seed_pct: int) -> int:
    return min(15, CD_FY27.get(seed_pct, seed_pct))


def _pct(x: int, pct: float) -> int:
    return int((x * round(pct * 100) + 5000) // 10000)  # half-up, pct may have a decimal


def duty_breakdown(db: Session, s: Shipment) -> dict:
    """Integer maths in paisa. value = total_fen × rate (half-up); CD, ACD, RD on value; sales tax on value
    plus all duties; advance income tax on the duty-and-tax-paid value. Each rounded half-up to the paisa."""
    rate_x100 = round(settings.fx_cny_pkr * 100)
    lines_out, total = [], 0
    lines = db.scalars(select(ManifestLine).where(ManifestLine.shipment_id == s.id).order_by(ManifestLine.line_no))
    for ln in lines:
        band = db.get(ValueBand, ln.hs_code)
        cd_pct = _cd_pct(band.duty_pct if band else DEFAULT_DUTY_PCT)
        acd_pct = 2 if cd_pct >= 15 else 0
        rd_pct = 0
        st_pct = band.sales_tax_pct if band else DEFAULT_ST_PCT
        wht_pct = settings.import_wht_pct
        value = (ln.total_fen * rate_x100 + 50) // 100
        cd, acd, rd = _pct(value, cd_pct), _pct(value, acd_pct), _pct(value, rd_pct)
        st = _pct(value + cd + acd + rd, st_pct)
        wht = _pct(value + cd + acd + rd + st, wht_pct)
        line_total = cd + acd + rd + st + wht
        total += line_total
        lines_out.append({
            "line_no": ln.line_no, "hs_code": ln.hs_code, "item_en": ln.item_en, "value_fen": ln.total_fen,
            "value_paisa": value,
            "duty_pct": cd_pct, "duty_paisa": cd,
            "acd_pct": acd_pct, "acd_paisa": acd,
            "rd_pct": rd_pct, "rd_paisa": rd,
            "sales_tax_pct": st_pct, "sales_tax_paisa": st,
            "wht_pct": wht_pct, "wht_paisa": wht,
            "total_paisa": line_total,
            "rate_label": f"Band rate for {band.description_en}" if band else "default rate, no band",
        })
    rate = f"{rate_x100 // 100}.{rate_x100 % 100:02d}"
    return {
        "shipment_id": s.id,
        "fx_cny_pkr": settings.fx_cny_pkr,
        "fx_label": f"Fixed sandbox rate ¥1 = Rs {rate}",
        "lines": lines_out,
        "total_paisa": total,
        "psw_record": {
            "document": "Goods Declaration (pre-payment draft)",
            "declaration_type": "Import - Home Consumption",
            "collectorate": "Sost (Khunjerab border)",
            "importer_ref": s.trader_id,
            "shipment_ref": s.ref,
            "currency": "PKR",
            "exchange_rate": rate,
            "assessable_value_paisa": sum(x["value_paisa"] for x in lines_out),
            "items": [{"item_no": x["line_no"], "hs_code": x["hs_code"], "description": x["item_en"],
                       "assessable_value_paisa": x["value_paisa"], "customs_duty_paisa": x["duty_paisa"],
                       "sales_tax_paisa": x["sales_tax_paisa"]} for x in lines_out],
            "total_duty_and_taxes_paisa": total,
            "status": "ready_for_psw",
            "note": "Not submitted: no live PSW access",
        },
    }


def _duty_txn(db: Session, s: Shipment) -> LedgerTxn | None:
    return db.scalars(select(LedgerTxn).join(LedgerEntry, LedgerEntry.txn_id == LedgerTxn.id)
                      .where(LedgerTxn.kind == "duty", LedgerEntry.shipment_id == s.id).limit(1)).first()


@router.get("/shipments/{shipment_id}/duty")
def get_duty(shipment_id: str, user: User = Depends(require_role("trader", "customs", "admin")),
             db: Session = Depends(get_db)) -> dict:
    s = db.get(Shipment, shipment_id)
    if s is None:
        raise HTTPException(404, "Shipment not found.")
    if user.role == "trader" and s.trader_id != user.id:
        raise HTTPException(403, "This shipment belongs to another trader.")
    out = duty_breakdown(db, s)
    txn = _duty_txn(db, s)
    out["paid"] = txn is not None
    out["paid_txn_id"] = txn.id if txn else None
    return out


@router.post("/shipments/{shipment_id}/duty/pay")
def pay_duty(shipment_id: str, request: Request, user: User = Depends(trader_only),
             db: Session = Depends(get_db)) -> dict:
    s = _owned(db, shipment_id, user)
    existing = _duty_txn(db, s)
    if existing is not None:
        return {"txn_id": existing.id, "already_paid": True, "sandbox": True}
    total = duty_breakdown(db, s)["total_paisa"]
    if total <= 0:
        raise HTTPException(400, "No duty is due: the manifest has no lines yet.")
    w = ledger.wallet(db, user.id, "PKR")
    have = ledger.balance(db, w)
    if have < total:
        raise HTTPException(402, f"Not enough sandbox rupees: you have {ledger.fmt(have, 'PKR')}, "
                                 f"need {ledger.fmt(total, 'PKR')}. Top up in Wallet.")
    txn = ledger.post_txn(db, "duty", f"Sandbox duty and sales tax for {s.ref}", [
        {"account": w, "debit": total, "shipment_id": s.id},
        {"account": ledger.get_account(db, "duty_payable", "PKR"), "credit": total, "shipment_id": s.id},
    ])
    audit(db, request, user.id, "duty.pay", s.id, {"txn_id": txn.id, "total_paisa": total})
    db.commit()
    return {"txn_id": txn.id, "already_paid": False, "total_paisa": total, "sandbox": True}
