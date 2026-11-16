import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_prefix="SOST_", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'sost.db').as_posix()}"
    # Empty means: use (or create) a random secret in data/jwt_secret. Never ship a fixed default:
    # the repo is public, and anyone who knows the secret can mint an admin token.
    jwt_secret: str = ""
    jwt_access_minutes: int = 15
    jwt_refresh_days: int = 7
    # Server Ed25519 key (base64 seed) for chain-head and timestamp counter-signatures.
    server_signing_seed: str | None = None
    upload_dir: Path = BACKEND_DIR / "data" / "uploads"
    max_upload_bytes: int = 8 * 1024 * 1024
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    # OCR reader: "claude_cli" (local `claude -p`), "paddle", or "auto" (claude then paddle)
    ocr_reader: str = "auto"
    claude_cli: str = "claude"
    claude_model: str = "sonnet"  # fast + cheap enough for OCR/translation
    ocr_timeout_s: int = 120
    # Demo FX rate CNY->PKR, labelled on screen as fixed sandbox rate.
    fx_cny_pkr: float = 39.0
    dev_show_otp: bool = True
    # Showcase features: the admin Tamper lab (raw database edits) and the demo-account list on sign-in.
    # Turn off for any real deployment.
    demo_mode: bool = True


def _jwt_secret(configured: str) -> str:
    weak = {"", "dev-only-change-me-dev-only-change-me", "change-me", "secret"}
    if configured not in weak:
        if len(configured) < 32:
            raise RuntimeError("SOST_JWT_SECRET must be at least 32 characters.")
        return configured
    path = BACKEND_DIR / "data" / "jwt_secret"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48))
    return path.read_text().strip()


settings = Settings()
settings.jwt_secret = _jwt_secret(settings.jwt_secret)
