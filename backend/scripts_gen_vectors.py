import json, sys
sys.path.insert(0, "backend")
from app.core.canonical import canonicalize, canonical_hash
from nacl.signing import SigningKey
from app.core.crypto import b64u, sign_with
cases = [
  {"b": 2, "a": 1},
  {"z": {"y": [3, 2, {"k": "v"}], "x": None}, "é": True, "a": False},
  {"item_zh": "女士手提包", "item_ur": "خواتین کا ہینڈ بیگ", "qty": 120, "unit_price_fen": 3550},
  {"emoji": "\U0001F600", "é": 1, "€": 2, "דּ": 3},
  {"neg": -42, "big": 9007199254740991, "s": "quote\" back\ nl\n tab\t ctl\u0001"},
]
sk = SigningKey(bytes(range(32)))
out = {"signing_seed_b64u": b64u(bytes(range(32))), "public_key_b64u": b64u(bytes(sk.verify_key)), "cases": []}
for c in cases:
    h = canonical_hash(c)
    out["cases"].append({"input": c, "canonical": canonicalize(c).decode(), "sha256": h, "signature_b64u": sign_with(sk, h)})
json.dump(out, open("docs/test_vectors.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("ok")
