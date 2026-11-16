"""Sost Smart Corridor API. Each module exposes `router` in app/<module>/routes.py."""

import importlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.crypto import server_public_key
from .core.db import init_db

log = logging.getLogger("sost")

MODULES = ["auth", "keys", "integrity", "ocr", "shipments", "transit", "ledger",
           "risk", "customs", "trust", "seller", "admin"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Sost Smart Corridor API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https://.*\.(trycloudflare\.com|vercel\.app)",
    allow_credentials=False,  # tokens travel in headers, never cookies; no site gets ambient credentials
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    return resp


for name in MODULES:
    try:
        mod = importlib.import_module(f"app.{name}.routes")
    except ModuleNotFoundError as exc:
        if exc.name != f"app.{name}.routes" and exc.name != f"app.{name}":
            raise
        continue
    app.include_router(mod.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "server_public_key": server_public_key(), "demo": settings.demo_mode}
