"""Database models for all modules. Works on SQLite (dev) and Postgres (Supabase later).

Money is integer minor units everywhere: *_fen for CNY (1/100 yuan), *_paisa for PKR.
"""

from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    text,
)
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from .config import settings


def now() -> datetime:
    return datetime.now(UTC)


def uid() -> str:
    return uuid4().hex


class UTCDateTime(TypeDecorator):
    """Timestamps are always UTC. SQLite drops the zone on read, so put it back: every API then emits '...+00:00'."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ANN001
        return value.astimezone(UTC) if value is not None and value.tzinfo else value

    def process_result_value(self, value, dialect):  # noqa: ANN001
        return value.replace(tzinfo=UTC) if value is not None and value.tzinfo is None else value


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    role: Mapped[str] = mapped_column(String(16))  # trader | seller | customs | admin | driver
    name: Mapped[str] = mapped_column(String(120))
    name_zh: Mapped[str | None] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(32), unique=True)
    cnic_hash: Mapped[str | None] = mapped_column(String(64), unique=True)  # sha256 for dup check
    pin_hash: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | locked | pending
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class DeviceKey(Base):
    __tablename__ = "device_keys"
    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # key fingerprint
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    public_key: Mapped[str] = mapped_column(String(64))  # base64url raw 32 bytes
    label: Mapped[str] = mapped_column(String(80), default="browser")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Seller(Base):
    __tablename__ = "sellers"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    shop_name_zh: Mapped[str] = mapped_column(String(160))
    shop_name_en: Mapped[str] = mapped_column(String(160))
    market: Mapped[str] = mapped_column(String(120), default="Kashgar")
    link_token: Mapped[str] = mapped_column(String(48), unique=True, default=uid)


class Shipment(Base):
    __tablename__ = "shipments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    ref: Mapped[str] = mapped_column(String(20), unique=True)  # human ref e.g. SSC-24-0007
    trader_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    state: Mapped[str] = mapped_column(String(24), default="draft")
    seal_payload: Mapped[str | None] = mapped_column(Text)  # compact string encoded into QR
    manifest_hash: Mapped[str | None] = mapped_column(String(64))
    risk_score: Mapped[int | None] = mapped_column(Integer)
    risk_reasons: Mapped[list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, onupdate=now)


class Receipt(Base):
    __tablename__ = "receipts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"))
    seller_id: Mapped[str | None] = mapped_column(ForeignKey("sellers.id"))
    image_path: Mapped[str] = mapped_column(String(300))
    image_sha256: Mapped[str] = mapped_column(String(64))
    ocr_text: Mapped[str | None] = mapped_column(Text)
    reader: Mapped[str | None] = mapped_column(String(32))
    total_fen: Mapped[int | None] = mapped_column(Integer)  # receipt grand total as printed
    status: Mapped[str] = mapped_column(String(16), default="processing")  # processing | done | failed
    flags: Mapped[list | None] = mapped_column(JSON)  # e.g. ["sum_mismatch", "injection_text"]
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class ManifestLine(Base):
    __tablename__ = "manifest_lines"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"))
    receipt_id: Mapped[str | None] = mapped_column(ForeignKey("receipts.id"))
    line_no: Mapped[int] = mapped_column(Integer)
    item_zh: Mapped[str] = mapped_column(String(200))
    item_en: Mapped[str] = mapped_column(String(200))
    item_ur: Mapped[str] = mapped_column(String(200))
    hs_code: Mapped[str] = mapped_column(String(8))
    hs_confidence: Mapped[int] = mapped_column(Integer)  # 0-100
    qty: Mapped[int] = mapped_column(Integer)
    unit: Mapped[str] = mapped_column(String(16), default="pcs")
    unit_price_fen: Mapped[int] = mapped_column(Integer)
    total_fen: Mapped[int] = mapped_column(Integer)
    value_flag: Mapped[str | None] = mapped_column(String(200))  # reason text if outlier
    edited: Mapped[bool] = mapped_column(Boolean, default=False)


class Event(Base):
    """Hash-chained, signed events. Same envelope as the future IoT e-seal."""

    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("shipment_id", "seq"), UniqueConstraint("nonce"))
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"))
    seq: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict] = mapped_column(JSON)
    lat: Mapped[float | None] = mapped_column(Float)  # informational; signed copy lives in envelope
    lng: Mapped[float | None] = mapped_column(Float)
    envelope: Mapped[dict] = mapped_column(JSON)  # exact signed envelope
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))
    signature: Mapped[str] = mapped_column(String(100))
    signer_key_id: Mapped[str] = mapped_column(String(16))
    server_sig: Mapped[str] = mapped_column(String(100))  # server counter-sig over hash+received_at
    nonce: Mapped[str] = mapped_column(String(64))
    signed_at: Mapped[str] = mapped_column(String(40))  # device clock, ISO, inside envelope
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)  # received_at
    flags: Mapped[list | None] = mapped_column(JSON)  # e.g. ["outside_geofence"]


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    owner_id: Mapped[str | None] = mapped_column(String(32))  # user/seller id; null for system
    kind: Mapped[str] = mapped_column(String(24))  # wallet | seller_payable | duty_payable | sandbox_funding
    currency: Mapped[str] = mapped_column(String(3))  # CNY | PKR


class LedgerTxn(Base):
    __tablename__ = "ledger_txns"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(24))  # topup | seller_payment | duty | fx
    memo: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    txn_id: Mapped[str] = mapped_column(ForeignKey("ledger_txns.id"))
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"))
    shipment_id: Mapped[str | None] = mapped_column(ForeignKey("shipments.id"))
    debit: Mapped[int] = mapped_column(Integer, default=0)  # minor units
    credit: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3))
    ref_line_id: Mapped[str | None] = mapped_column(ForeignKey("manifest_lines.id"))


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"))
    seller_id: Mapped[str] = mapped_column(ForeignKey("sellers.id"))
    amount_fen: Mapped[int] = mapped_column(Integer)
    txn_id: Mapped[str] = mapped_column(ForeignKey("ledger_txns.id"))
    seller_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class CustomsDecision(Base):
    __tablename__ = "customs_decisions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"))
    officer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(16))  # approve | hold | request_docs
    reason: Mapped[str] = mapped_column(String(400), default="")
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class TrustScore(Base):
    __tablename__ = "trust_scores"
    trader_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    score: Mapped[int] = mapped_column(Integer, default=50)
    reasons: Mapped[list] = mapped_column(JSON, default=list)  # [{delta, reason, at, shipment_ref}]
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, onupdate=now)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_id: Mapped[str | None] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str | None] = mapped_column(String(64))
    detail: Mapped[dict | None] = mapped_column(JSON)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class OtpCode(Base):
    __tablename__ = "otp_codes"
    phone: Mapped[str] = mapped_column(String(32), primary_key=True)
    code_hash: Mapped[str] = mapped_column(String(100))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256 of token
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class ValueBand(Base):
    """Reference unit-price band per HS code (hand-built; editable by admin)."""

    __tablename__ = "value_bands"
    hs_code: Mapped[str] = mapped_column(String(8), primary_key=True)
    description_en: Mapped[str] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(16), default="pcs")
    min_fen: Mapped[int] = mapped_column(Integer)
    max_fen: Mapped[int] = mapped_column(Integer)
    duty_pct: Mapped[int] = mapped_column(Integer)  # indicative customs duty, whole percent
    sales_tax_pct: Mapped[int] = mapped_column(Integer, default=18)


connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.execute("PRAGMA journal_mode=WAL")
        cur.close()


APPEND_ONLY_SQLITE = [
    "CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log "
    "BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
    "CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log "
    "BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END",
]


APPEND_ONLY_POSTGRES = [
    "CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$ "
    "BEGIN RAISE EXCEPTION 'audit_log is append-only'; END; $$ LANGUAGE plpgsql",
    "DROP TRIGGER IF EXISTS audit_no_mod ON audit_log",
    "CREATE TRIGGER audit_no_mod BEFORE UPDATE OR DELETE ON audit_log "
    "FOR EACH ROW EXECUTE FUNCTION audit_log_append_only()",
]


def _postgres_hardening(conn) -> None:  # noqa: ANN001
    """Supabase exposes tables over a public REST API. Row-level security with NO policies means the publishable key
    can read nothing; this server connects as the owner role, which bypasses RLS."""
    for stmt in APPEND_ONLY_POSTGRES:
        conn.execute(text(stmt))
    for table in Base.metadata.tables:
        conn.execute(text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))


def init_db() -> None:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    if settings.database_url.startswith("sqlite"):
        from pathlib import Path

        Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    if settings.database_url.startswith("sqlite"):
        with engine.begin() as conn:
            for stmt in APPEND_ONLY_SQLITE:
                conn.execute(text(stmt))
    elif engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            _postgres_hardening(conn)


def get_db() -> Iterator[Session]:
    with SessionLocal() as db:
        yield db
