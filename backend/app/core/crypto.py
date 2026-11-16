"""Ed25519 helpers. Signatures are over the UTF-8 bytes of the lowercase hex hash string.

Keys and signatures travel as base64url without padding.
"""

import base64
import hashlib

from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

from .config import BACKEND_DIR, settings


def b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64u_dec(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def key_fingerprint(public_key_b64u: str) -> str:
    """Short id for a public key: first 16 hex chars of sha256(raw key)."""
    return hashlib.sha256(b64u_dec(public_key_b64u)).hexdigest()[:16]


def verify(public_key_b64u: str, hash_hex: str, signature_b64u: str) -> bool:
    try:
        VerifyKey(b64u_dec(public_key_b64u)).verify(hash_hex.encode(), b64u_dec(signature_b64u))
        return True
    except (BadSignatureError, ValueError, TypeError):
        return False


def sign_with(signing_key: SigningKey, hash_hex: str) -> str:
    return b64u(signing_key.sign(hash_hex.encode()).signature)


_server_key: SigningKey | None = None


def server_key() -> SigningKey:
    """Server key for chain-head/timestamp counter-signatures. Persisted in data/ for dev."""
    global _server_key
    if _server_key is None:
        if settings.server_signing_seed:
            _server_key = SigningKey(b64u_dec(settings.server_signing_seed))
        else:
            path = BACKEND_DIR / "data" / "server_key.seed"
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_text(b64u(bytes(SigningKey.generate())))
            _server_key = SigningKey(b64u_dec(path.read_text().strip()))
    return _server_key


def server_public_key() -> str:
    return b64u(bytes(server_key().verify_key))
