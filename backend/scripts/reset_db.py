"""Wipe the configured database (SQLite or Postgres/Supabase) and reseed the demo data.

Run from backend/:  uv run python scripts/reset_db.py --yes

Drops every app table, recreates them (with the append-only trigger and RLS on Postgres), then runs
the normal seed. Uploaded receipt images are removed too. The server signing key (data/server_key.seed)
is kept, so printed QR seals from other demos still verify against the same server key.
"""

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.main  # noqa: E402,F401  (imports every module, so all tables are in the metadata)
from app import seed  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.db import Base, engine  # noqa: E402


def target() -> str:
    url = engine.url
    return f"{url.get_backend_name()} {url.host or url.database}"  # never print the password


def main() -> None:
    print(f"Database: {target()}")
    if "--yes" not in sys.argv:
        print("This deletes ALL data in that database. Re-run with --yes to continue.")
        sys.exit(1)
    Base.metadata.drop_all(engine)
    print("dropped all tables")
    if settings.upload_dir.exists():
        shutil.rmtree(settings.upload_dir)
    seed.main()  # recreates tables, triggers and RLS, then seeds
    print("done: fresh demo data")


if __name__ == "__main__":
    main()
