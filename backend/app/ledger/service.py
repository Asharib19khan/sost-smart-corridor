"""Double-entry sandbox ledger. All amounts are integer minor units (fen for CNY, paisa for PKR).

Sign convention
---------------
Every txn has >= 2 entries; per currency, sum(debit) == sum(credit) (enforced by post_txn).
Accounts are liabilities of the sandbox operator, so:
    balance(account) = sum(credit) - sum(debit)
- Top-up:   debit sandbox_funding,  credit trader wallet   (wallet goes up)
- Payment:  debit trader wallet CNY, credit seller_payable (wallet down, seller owed)
- Duty:     debit trader wallet PKR, credit duty_payable   (wallet down, duty owed to state)
sandbox_funding therefore runs negative: it is the source of all sandbox money.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.db import Account, LedgerEntry, LedgerTxn

CURRENCIES = ("CNY", "PKR")
SYMBOL = {"CNY": "¥", "PKR": "Rs "}


class UnbalancedTxn(ValueError):
    pass


def fmt(amount_minor: int, currency: str) -> str:
    sign = "-" if amount_minor < 0 else ""
    a = abs(amount_minor)
    whole, frac = divmod(a, 100)
    s = f"{whole:,}" if frac == 0 else f"{whole:,}.{frac:02d}"
    return f"{sign}{SYMBOL[currency]}{s}"


def get_account(db: Session, kind: str, currency: str, owner_id: str | None = None) -> Account:
    """Get-or-create. kinds: wallet (owner=trader), seller_payable (owner=seller, CNY),
    duty_payable (system, PKR), sandbox_funding (system, per currency)."""
    acct = db.scalars(select(Account).where(
        Account.kind == kind, Account.currency == currency,
        Account.owner_id.is_(None) if owner_id is None else Account.owner_id == owner_id,
    )).first()
    if acct is None:
        acct = Account(kind=kind, currency=currency, owner_id=owner_id)
        db.add(acct)
        db.flush()
    return acct


def wallet(db: Session, trader_id: str, currency: str) -> Account:
    return get_account(db, "wallet", currency, trader_id)


def balance(db: Session, account: Account) -> int:
    row = db.execute(select(func.coalesce(func.sum(LedgerEntry.credit), 0),
                            func.coalesce(func.sum(LedgerEntry.debit), 0))
                     .where(LedgerEntry.account_id == account.id)).one()
    return int(row[0]) - int(row[1])


def post_txn(db: Session, kind: str, memo: str, entries: list[dict]) -> LedgerTxn:
    """entries: [{account, debit?, credit?, shipment_id?, ref_line_id?}]. Caller commits.
    Raises UnbalancedTxn unless debits == credits for every currency."""
    if len(entries) < 2:
        raise UnbalancedTxn("A transaction needs at least two entries.")
    totals: dict[str, int] = {}
    for e in entries:
        d, c = int(e.get("debit", 0)), int(e.get("credit", 0))
        if d < 0 or c < 0 or (d == 0) == (c == 0):
            raise UnbalancedTxn("Each entry must have exactly one positive debit or credit.")
        cur = e["account"].currency
        totals[cur] = totals.get(cur, 0) + d - c
    bad = {k: v for k, v in totals.items() if v != 0}
    if bad:
        raise UnbalancedTxn(f"Debits do not equal credits: {bad}")
    txn = LedgerTxn(kind=kind, memo=memo[:200])
    db.add(txn)
    db.flush()
    for e in entries:
        db.add(LedgerEntry(txn_id=txn.id, account_id=e["account"].id, currency=e["account"].currency,
                           debit=int(e.get("debit", 0)), credit=int(e.get("credit", 0)),
                           shipment_id=e.get("shipment_id"), ref_line_id=e.get("ref_line_id")))
    db.flush()
    return txn


def topup(db: Session, trader_id: str, currency: str, amount_minor: int, memo: str | None = None) -> LedgerTxn:
    w = wallet(db, trader_id, currency)
    src = get_account(db, "sandbox_funding", currency)
    return post_txn(db, "topup", memo or f"Sandbox top-up {fmt(amount_minor, currency)} (not real money)", [
        {"account": src, "debit": amount_minor},
        {"account": w, "credit": amount_minor},
    ])


def duty_paid_total(db: Session, trader_id: str) -> int:
    w = wallet(db, trader_id, "PKR")
    return int(db.scalar(select(func.coalesce(func.sum(LedgerEntry.debit), 0)).join(
        LedgerTxn, LedgerTxn.id == LedgerEntry.txn_id).where(
        LedgerEntry.account_id == w.id, LedgerTxn.kind == "duty")) or 0)
