from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_prefix="SOST_", extra="ignore")

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'sost.db').as_posix()}"
    jwt_secret: str = "dev-only-change-me-dev-only-change-me"
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


settings = Settings()
