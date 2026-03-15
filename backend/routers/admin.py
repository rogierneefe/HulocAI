"""Admin routes — /api/admin/* (requires Bearer token)."""
import json
import logging
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from backend.config import settings
from backend.database import get_db
from backend.middleware.auth import require_admin
from backend.services.model_manager import (
    LLMConnectionError,
    get_available_resources,
    get_cpu_model,
    get_llm_client,
    get_whisper_client,
)

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_admin)])

_CONFIG_PATH = Path("config/models.json")


# ── Config ────────────────────────────────────────────────────────────────────

@router.get("/config")
async def get_config() -> dict:
    """Return the current application configuration (non-sensitive)."""
    return {
        "environment_mode": settings.ENVIRONMENT_MODE,
        "terms_version": settings.TERMS_VERSION,
        "onboarding_version": settings.ONBOARDING_VERSION,
        "rate_limit_per_minute": settings.RATE_LIMIT_PER_MINUTE,
        "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
        "ram_headroom_gb": settings.RAM_HEADROOM_GB,
        "ollama_url": settings.OLLAMA_URL,
        "whisper_url": settings.WHISPER_URL,
    }


@router.put("/config")
async def update_config(body: dict) -> dict:
    """Update writable configuration keys in the database."""
    allowed_keys = {
        "terms_version", "onboarding_version", "rate_limit_per_minute",
        "max_upload_size_mb", "ram_headroom_gb",
    }
    updates = {k: v for k, v in body.items() if k in allowed_keys}
    if not updates:
        raise HTTPException(status_code=422, detail="Geen geldige configuratiesleutels")

    async with aiosqlite.connect(settings.DB_PATH) as db:
        for key, value in updates.items():
            await db.execute(
                "INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)",
                (key, str(value)),
            )
        await db.commit()

    return {"updated": list(updates.keys())}


# ── Models ────────────────────────────────────────────────────────────────────

@router.get("/models")
async def list_models() -> dict:
    """List all available models from the active LLM backend."""
    try:
        llm_client = get_llm_client()
        models = await llm_client.list_models()
        return {"models": models}
    except LLMConnectionError:
        raise HTTPException(status_code=503, detail="LLM backend niet bereikbaar")


@router.post("/models/pull")
async def pull_model(body: dict) -> StreamingResponse:
    """Pull a new model (Ollama only — not supported for LM Studio)."""
    if settings.LLM_BACKEND != "ollama":
        raise HTTPException(
            status_code=501,
            detail="Model downloaden wordt niet ondersteund voor LM Studio. Beheer modellen in de LM Studio app.",
        )

    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Modelnaam vereist")

    async def progress_stream():
        try:
            llm_client = get_llm_client()
            async for line in llm_client.pull_model(name):
                yield f"data: {line}\n\n"
            yield "data: {\"status\": \"done\"}\n\n"
        except LLMConnectionError as exc:
            yield f"data: {{\"error\": \"{exc}\"}}\n\n"

    return StreamingResponse(progress_stream(), media_type="text/event-stream")


@router.delete("/models/{name:path}")
async def delete_model(name: str) -> dict:
    """Delete an installed model (Ollama only — not supported for LM Studio)."""
    if settings.LLM_BACKEND != "ollama":
        raise HTTPException(
            status_code=501,
            detail="Model verwijderen wordt niet ondersteund voor LM Studio. Beheer modellen in de LM Studio app.",
        )
    llm_client = get_llm_client()
    ok = await llm_client.delete_model(name)
    if not ok:
        raise HTTPException(status_code=500, detail="Model verwijderen mislukt")
    return {"deleted": name}


# ── Audit log ─────────────────────────────────────────────────────────────────

@router.get("/audit")
async def get_audit_log(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    action: str | None = Query(default=None),
) -> dict:
    """Return paginated audit log entries."""
    offset = (page - 1) * per_page
    where = "WHERE action = ?" if action else ""
    params = [action] if action else []

    async with aiosqlite.connect(settings.DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            f"SELECT COUNT(*) as cnt FROM audit_log {where}", params
        ) as cur:
            row = await cur.fetchone()
            total = row["cnt"] if row else 0

        async with db.execute(
            f"""SELECT id, timestamp, user_identifier, action, model_used,
                       quality_mode, input_length, output_length,
                       processing_time_ms, success, error_message
                FROM audit_log {where}
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?""",
            [*params, per_page, offset],
        ) as cur:
            rows = [dict(r) for r in await cur.fetchall()]

    return {"total": total, "page": page, "per_page": per_page, "items": rows}


# ── System info ───────────────────────────────────────────────────────────────

@router.get("/system")
async def system_info() -> dict:
    """Return system resource information."""
    import psutil
    import shutil

    resources = get_available_resources()
    disk = shutil.disk_usage(".")
    cpu_model = get_cpu_model()
    llm_client = get_llm_client()
    whisper = get_whisper_client()
    ollama_ok = await llm_client.check_connection()
    whisper_ok = await whisper.check_connection()

    return {
        "cpu_model": cpu_model,
        "cpu_count": psutil.cpu_count(),
        "cpu_percent": psutil.cpu_percent(interval=0.5),
        "ram": resources,
        "disk_total_gb": round(disk.total / 1024 ** 3, 2),
        "disk_free_gb": round(disk.free / 1024 ** 3, 2),
        "ollama_connected": ollama_ok,
        "whisper_connected": whisper_ok,
    }
