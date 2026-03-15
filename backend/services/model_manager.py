"""Model selection, resource guard, and RAM management."""
import asyncio
import json
import logging
from pathlib import Path
from typing import Any

import psutil

from backend.config import settings


# ── Shared exception base classes ─────────────────────────────────────────────

class LLMConnectionError(Exception):
    """Base class for all LLM backend connection errors."""


class WhisperBackendError(Exception):
    """Base class for all Whisper backend errors."""

logger = logging.getLogger(__name__)

_models_config: dict[str, Any] = {}

# Semaphores for resource guarding (max 1 of each type concurrently)
_llm_semaphore = asyncio.Semaphore(1)
_whisper_semaphore = asyncio.Semaphore(1)

# Track active task names for status reporting
_active_llm_task: str | None = None
_active_whisper_task: str | None = None


def load_models_config(path: str = "config/models.json") -> None:
    """Load the model manifest from disk."""
    global _models_config
    config_path = Path(path)
    if config_path.exists():
        _models_config = json.loads(config_path.read_text(encoding="utf-8"))
        logger.info("Model config loaded from %s", path)
    else:
        logger.warning("models.json not found at %s — using defaults", path)
        _models_config = {}


def get_model(function: str, quality_mode: str) -> str:
    """
    Return the model name for a given function and quality mode.
    Falls back to fast model if quality model is unavailable.
    """
    functions = _models_config.get("functions", {})
    func_config = functions.get(function, {})
    entry = func_config.get(quality_mode) or func_config.get("fast", {})
    return entry.get("model", "qwen2.5:1.5b")


def get_whisper_model(quality_mode: str) -> str:
    """Return 'base' or 'small' depending on quality mode."""
    whisper = _models_config.get("whisper", {})
    entry = whisper.get(quality_mode, whisper.get("fast", {}))
    return entry.get("model", "base")


def get_available_resources() -> dict[str, Any]:
    """Return current RAM info via psutil."""
    vm = psutil.virtual_memory()
    total_gb = vm.total / (1024 ** 3)
    available_gb = vm.available / (1024 ** 3)
    used_pct = vm.percent
    headroom_ok = available_gb >= settings.RAM_HEADROOM_GB
    return {
        "total_gb": round(total_gb, 2),
        "available_gb": round(available_gb, 2),
        "used_pct": round(used_pct, 1),
        "quality_mode_available": headroom_ok,
    }


def get_active_tasks() -> dict[str, str | None]:
    """Return currently active task names."""
    return {"llm": _active_llm_task, "whisper": _active_whisper_task}


def check_ram_for_quality() -> tuple[bool, str | None]:
    """
    Check whether enough RAM is available for a quality-mode request.
    Returns (ok, error_message).
    """
    resources = get_available_resources()
    if not resources["quality_mode_available"]:
        return (
            False,
            f"Onvoldoende geheugen — gebruik de snelle modus "
            f"({resources['available_gb']:.1f} GB beschikbaar, "
            f"{settings.RAM_HEADROOM_GB} GB vereist)",
        )
    return True, None


class LLMTaskContext:
    """Async context manager that acquires the LLM semaphore and tracks task name."""

    def __init__(self, task_name: str, quality_mode: str) -> None:
        self._task_name = task_name
        self._quality_mode = quality_mode

    async def __aenter__(self) -> "LLMTaskContext":
        global _active_llm_task
        if self._quality_mode == "quality":
            ok, err = check_ram_for_quality()
            if not ok:
                raise MemoryError(err)
            # Also block if Whisper quality is active
            if _active_whisper_task:
                raise MemoryError(
                    "Wachtrij — Whisper is bezig. Probeer het straks opnieuw."
                )
        await _llm_semaphore.acquire()
        _active_llm_task = self._task_name
        return self

    async def __aexit__(self, *_) -> None:
        global _active_llm_task
        _llm_semaphore.release()
        _active_llm_task = None


class WhisperTaskContext:
    """Async context manager that acquires the Whisper semaphore."""

    def __init__(self, quality_mode: str) -> None:
        self._quality_mode = quality_mode

    async def __aenter__(self) -> "WhisperTaskContext":
        global _active_whisper_task
        if self._quality_mode == "quality":
            ok, err = check_ram_for_quality()
            if not ok:
                raise MemoryError(err)
            if _active_llm_task:
                raise MemoryError(
                    "Wachtrij — een LLM taak is bezig. Probeer het straks opnieuw."
                )
        await _whisper_semaphore.acquire()
        _active_whisper_task = "transcribe"
        return self

    async def __aexit__(self, *_) -> None:
        global _active_whisper_task
        _whisper_semaphore.release()
        _active_whisper_task = None


def get_llm_client():
    """Return the active LLM client based on LLM_BACKEND setting."""
    if settings.LLM_BACKEND == "lmstudio":
        from backend.services.lmstudio_client import lmstudio_client
        return lmstudio_client
    from backend.services.ollama_client import ollama_client
    return ollama_client


def get_whisper_client():
    """Return the active Whisper client based on WHISPER_BACKEND setting."""
    if settings.WHISPER_BACKEND == "local":
        from backend.services.local_whisper import local_whisper_client
        return local_whisper_client
    if settings.WHISPER_BACKEND == "faster_whisper":
        from backend.services.faster_whisper_client import faster_whisper_client
        return faster_whisper_client
    from backend.services.whisper_client import whisper_client
    return whisper_client


def get_cpu_model() -> str:
    """Attempt to return a human-readable CPU model string."""
    try:
        import platform
        if platform.system() == "Windows":
            import subprocess
            result = subprocess.run(
                ["wmic", "cpu", "get", "Name", "/value"],
                capture_output=True, text=True, timeout=5,
            )
            for line in result.stdout.splitlines():
                if line.startswith("Name="):
                    return line.split("=", 1)[1].strip()
        elif platform.system() == "Darwin":
            import subprocess
            result = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=5,
            )
            return result.stdout.strip()
        else:
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return "Unknown CPU"
