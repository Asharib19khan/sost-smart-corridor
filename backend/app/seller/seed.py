"""Seed three Kashgar shops with fixed link tokens (idempotent)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.db import Seller

SHOPS = [
    ("kashgar-bazaar-01", "喀什国际大巴扎 阿依古丽服装店", "Ayigul Garments, Kashgar International Grand Bazaar"),
    ("kashgar-bazaar-02", "喀什老城 古丽鞋包店", "Guli Shoes & Bags, Kashgar Old Town"),
    ("kashgar-bazaar-03", "喀什 艾力手机配件批发", "Ali Phone Accessories Wholesale, Kashgar"),
]


def seed(db: Session) -> None:
    for token, zh, en in SHOPS:
        if db.scalar(select(Seller.id).where(Seller.link_token == token)) is None:
            db.add(Seller(link_token=token, shop_name_zh=zh, shop_name_en=en, market="Kashgar"))
    db.flush()
