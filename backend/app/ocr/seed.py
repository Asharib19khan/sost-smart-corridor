"""Value bands for goods common in Kashgar -> Sost trade.

Prices are typical wholesale unit prices in fen (1/100 CNY) at Kashgar markets.
duty_pct / sales_tax_pct are INDICATIVE, NOT LEGAL ADVICE; check the current Pakistan Customs Tariff.
PCT codes are real 8-digit headings where we are confident; descriptions say what we map to them.
"""

from sqlalchemy.orm import Session

from ..core.db import ValueBand

# (hs_code, description_en, unit, min_fen, max_fen, duty_pct, sales_tax_pct)
BANDS = [
    ("61091000", "T-shirts, cotton, knitted", "pcs", 800, 6000, 20, 18),
    ("62034200", "Men's trousers/jeans, cotton", "pcs", 2500, 15000, 20, 18),
    ("62044200", "Women's dresses, cotton", "pcs", 3000, 20000, 20, 18),
    ("62019300", "Jackets/anoraks, synthetic fibre", "pcs", 6000, 40000, 20, 18),
    ("61103000", "Sweaters/pullovers, synthetic", "pcs", 2500, 15000, 20, 18),
    ("62171000", "Scarves, gloves, clothing accessories", "pcs", 500, 5000, 20, 18),
    ("64041900", "Sports shoes, textile uppers", "pair", 3000, 25000, 20, 18),
    ("64039900", "Leather shoes", "pair", 6000, 40000, 20, 18),
    ("64029900", "Plastic/rubber footwear, slippers", "pair", 500, 4000, 20, 18),
    ("42022200", "Handbags, textile/plastic outer", "pcs", 2500, 12000, 20, 18),
    ("42021200", "Suitcases/backpacks, plastic/textile", "pcs", 4000, 30000, 20, 18),
    ("42033000", "Leather belts", "pcs", 1000, 8000, 20, 18),
    ("39269099", "Phone cases and other plastic articles", "pcs", 200, 3000, 20, 18),
    ("85044090", "Phone chargers / power adapters", "pcs", 800, 8000, 11, 18),
    ("85076000", "Power banks (lithium-ion)", "pcs", 2500, 20000, 11, 18),
    ("85444290", "USB/charging cables", "pcs", 200, 2500, 11, 18),
    ("85183000", "Earphones / headphones", "pcs", 500, 15000, 11, 18),
    ("85395000", "LED lamps and bulbs", "pcs", 300, 5000, 11, 18),
    ("94054000", "LED lights / light fittings", "pcs", 1500, 20000, 20, 18),
    ("85167100", "Electric kettles / coffee makers", "pcs", 3000, 20000, 20, 18),
    ("85094000", "Blenders / food grinders", "pcs", 5000, 30000, 20, 18),
    ("73239300", "Stainless steel kitchenware", "pcs", 500, 10000, 20, 18),
    ("76151000", "Aluminium cookware", "pcs", 1500, 15000, 20, 18),
    ("69120000", "Ceramic tableware", "pcs", 300, 5000, 20, 18),
    ("39241000", "Plastic tableware and kitchenware", "pcs", 100, 3000, 20, 18),
    ("39249000", "Plastic household goods (buckets, baskets)", "pcs", 200, 4000, 20, 18),
    ("95030090", "Toys", "pcs", 300, 15000, 20, 18),
    ("54075200", "Synthetic woven fabric, dyed", "m", 500, 4000, 16, 18),
    ("52083200", "Cotton woven fabric, dyed", "m", 600, 5000, 16, 18),
    ("63014000", "Blankets, synthetic fibre", "pcs", 3000, 25000, 20, 18),
    ("63026000", "Towels, cotton terry", "pcs", 300, 3000, 20, 18),
    ("08062000", "Raisins / dried grapes", "kg", 1500, 8000, 20, 18),
    ("08134000", "Dried apricots and other dried fruit", "kg", 2000, 12000, 20, 18),
    ("08025100", "Pistachios / walnuts in shell", "kg", 4000, 20000, 20, 18),
    ("09023000", "Black tea, packed", "kg", 3000, 30000, 20, 18),
    ("33049900", "Cosmetics / skin care preparations", "pcs", 500, 15000, 20, 18),
    ("87089900", "Motor vehicle spare parts", "pcs", 1000, 50000, 35, 18),
    ("84212300", "Oil/fuel filters for engines", "pcs", 500, 6000, 20, 18),
    ("82055900", "Hand tools", "pcs", 500, 10000, 11, 18),
    ("84672100", "Electric drills", "pcs", 8000, 50000, 11, 18),
    ("90041000", "Sunglasses", "pcs", 300, 6000, 20, 18),
    ("91021100", "Wrist watches, quartz", "pcs", 1000, 30000, 20, 18),
    ("73181500", "Bolts, screws, hardware fasteners", "kg", 800, 4000, 11, 18),
    ("83014000", "Locks and padlocks", "pcs", 500, 6000, 20, 18),
    # HS 2022 codes. The receipt reader assigns these; the older entries above (8539.50, 9405.40, 0813.40,
    # 6404.19) predate the 2022 split and stay only so existing shipments still resolve.
    ("85395200", "LED lamps and bulbs", "pcs", 300, 5000, 11, 18),
    ("94054200", "LED lights / light fittings", "pcs", 1500, 20000, 20, 18),
    ("08131000", "Dried apricots", "kg", 2000, 12000, 20, 18),
    ("08134090", "Dried fruit, other", "kg", 1500, 15000, 20, 18),
    ("42029200", "Bags and cases, textile/plastic outer", "pcs", 2500, 30000, 20, 18),
    ("61119000", "Babies' garments, knitted", "pcs", 800, 6000, 20, 18),
    ("64041100", "Sports footwear, textile uppers", "pair", 3000, 25000, 20, 18),
]


def seed(db: Session) -> None:
    for code, desc, unit, lo, hi, duty, st in BANDS:
        row = db.get(ValueBand, code)
        if row is None:
            db.add(ValueBand(hs_code=code, description_en=desc, unit=unit, min_fen=lo, max_fen=hi,
                             duty_pct=duty, sales_tax_pct=st))
