from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from ..core.db import Base, now


class TamperSnapshot(Base):
    """Raw rows of a shipment's lines + events, taken before the first tamper-lab attack."""

    __tablename__ = "tamper_snapshots"
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"), primary_key=True)
    lines: Mapped[list] = mapped_column(JSON)
    events: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
