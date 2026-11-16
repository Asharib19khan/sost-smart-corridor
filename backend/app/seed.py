"""Seed demo data. Each module may define app/<module>/seed.py with `def seed(db): ...` (idempotent).
Run: uv run python -m app.seed
"""
import importlib

from .core.db import SessionLocal, init_db

ORDER = ["auth", "ocr", "seller", "shipments", "ledger", "trust", "demo"]


def main() -> None:
    init_db()
    with SessionLocal() as db:
        for name in ORDER:
            try:
                mod = importlib.import_module(f"app.{name}.seed")
            except ModuleNotFoundError:
                continue
            mod.seed(db)
            db.commit()
            print(f"seeded {name}")


if __name__ == "__main__":
    main()
