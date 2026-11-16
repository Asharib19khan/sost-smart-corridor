"""Seller links a trader shares are signed and expire; raw shop tokens only work in demo mode."""

import os
import tempfile
import time
from pathlib import Path

# Never touch the configured (possibly live) database: use a throwaway SQLite file unless another test module
# already chose one.
_tmp = tempfile.mkdtemp(prefix="sost_links_")
os.environ.setdefault("SOST_DATABASE_URL", f"sqlite:///{Path(_tmp, 'links.db').as_posix()}")
os.environ.setdefault("SOST_UPLOAD_DIR", str(Path(_tmp, "uploads")))

import pytest  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.db import Seller, SessionLocal, init_db  # noqa: E402
from app.seed import main as seed_main  # noqa: E402
from app.seller.routes import _link_sig, _seller, signed_link_token  # noqa: E402


@pytest.fixture(scope="module")
def shop():
    init_db()
    with SessionLocal() as db:
        s = db.query(Seller).first()
        if s is None:
            seed_main()
            s = db.query(Seller).first()
        yield s.link_token


def test_signed_link_resolves(shop):
    with SessionLocal() as db:
        s = db.query(Seller).filter_by(link_token=shop).one()
        assert _seller(db, signed_link_token(s)).id == s.id


def test_forged_or_extended_link_is_refused(shop):
    with SessionLocal() as db:
        s = db.query(Seller).filter_by(link_token=shop).one()
        raw, exp, sig = signed_link_token(s).split(".")
        for bad in (f"{raw}.{int(exp) + 86400}.{sig}", f"{raw}.{exp}.{sig[:-2]}AA", f"other.{exp}.{sig}"):
            with pytest.raises(HTTPException) as e:
                _seller(db, bad)
            assert e.value.status_code == 404


def test_expired_link_says_so(shop):
    with SessionLocal() as db:
        past = int(time.time()) - 60
        with pytest.raises(HTTPException) as e:
            _seller(db, f"{shop}.{past}.{_link_sig(shop, past)}")
        assert e.value.status_code == 410


def test_raw_token_only_in_demo_mode(shop, monkeypatch):
    with SessionLocal() as db:
        monkeypatch.setattr(settings, "demo_mode", True)
        assert _seller(db, shop).link_token == shop
        monkeypatch.setattr(settings, "demo_mode", False)
        with pytest.raises(HTTPException) as e:
            _seller(db, shop)
        assert e.value.status_code == 404
