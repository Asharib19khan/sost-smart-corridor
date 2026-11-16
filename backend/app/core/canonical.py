"""RFC 8785-style JSON canonicalisation (JCS) + SHA-256.

Must match frontend/src/shared/crypto/canonical.ts byte for byte; see docs/test_vectors.json.
Rules: object keys sorted by UTF-16 code units, no whitespace, UTF-8 output,
numbers: integers as-is; non-integer floats are FORBIDDEN in signed payloads
(money is stored as integer minor units: fen / paisa) so float formatting never differs.
"""

import hashlib
import json
from typing import Any


def _check(value: Any) -> None:
    if isinstance(value, float):
        raise ValueError("floats not allowed in canonical payloads; use integer minor units")
    if isinstance(value, dict):
        for k, v in value.items():
            if not isinstance(k, str):
                raise ValueError("object keys must be strings")
            _check(v)
    elif isinstance(value, list):
        for v in value:
            _check(v)


def _sort_key(k: str) -> list[int]:
    return list(k.encode("utf-16-be"))


def _ser(value: Any) -> str:
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda kv: _sort_key(kv[0]))
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + _ser(v) for k, v in items) + "}"
    if isinstance(value, list):
        return "[" + ",".join(_ser(v) for v in value) + "]"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    if isinstance(value, int):
        return str(value)
    return json.dumps(value, ensure_ascii=False)


def canonicalize(value: Any) -> bytes:
    _check(value)
    return _ser(value).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_hash(value: Any) -> str:
    return sha256_hex(canonicalize(value))
