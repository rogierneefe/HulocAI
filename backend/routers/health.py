"""GET /api/health — system health and status endpoint."""
import logging

from fastapi import APIRouter, Request

from backend.config import settings
from backend.schemas import HealthResponse
from backend.services.model_manager import get_available_resources, get_active_tasks, get_cpu_model, get_llm_client, get_whisper_client

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    """Return a comprehensive health and status report."""
    environment = getattr(request.app.state, "environment_mode", settings.ENVIRONMENT_MODE)

    llm_client = get_llm_client()
    whisper = get_whisper_client()

    ollama_ok = await llm_client.check_connection()
    whisper_ok = await whisper.check_connection()

    available_models: list[str] = []
    if ollama_ok:
        try:
            available_models = await llm_client.list_models()
        except Exception:
            available_models = []

    resources = get_available_resources()
    active_tasks = get_active_tasks()
    cpu = get_cpu_model()

    if ollama_ok and whisper_ok:
        status = "healthy"
    elif ollama_ok or whisper_ok:
        status = "degraded"
    else:
        status = "unhealthy"

    return HealthResponse(
        status=status,
        environment=environment,
        ollama_connected=ollama_ok,
        whisper_connected=whisper_ok,
        available_models=available_models,
        system_ram_total_gb=resources["total_gb"],
        system_ram_available_gb=resources["available_gb"],
        system_ram_used_pct=resources["used_pct"],
        quality_mode_available=resources["quality_mode_available"],
        active_tasks=active_tasks,
        cpu_model=cpu,
        terms_version=settings.TERMS_VERSION,
        onboarding_version=settings.ONBOARDING_VERSION,
    )
