"""Pydantic v2 request/response models."""
from enum import Enum

from fastapi import UploadFile
from pydantic import BaseModel, Field


class QualityMode(str, Enum):
    FAST = "fast"
    QUALITY = "quality"


# ── Transcribe ────────────────────────────────────────────────────────────────

class TranscribeResponse(BaseModel):
    text: str
    language: str
    duration_seconds: float
    segments: list[dict] | None = None


# ── Summarize ─────────────────────────────────────────────────────────────────

class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    quality: QualityMode = QualityMode.FAST
    length: str = "medium"   # short | medium | long
    style: str = "prose"     # prose | bullets | action_items


class SummarizeResponse(BaseModel):
    summary: str
    model_used: str
    processing_time_ms: int


# ── Translate ─────────────────────────────────────────────────────────────────

class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1)
    source_language: str | None = None
    target_language: str = "en"
    quality: QualityMode = QualityMode.FAST
    tone: str = "formal"     # formal | informal


class TranslateResponse(BaseModel):
    translation: str
    detected_language: str | None
    model_used: str


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str   # user | assistant | system
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    quality: QualityMode = QualityMode.FAST
    system_prompt: str | None = None  # override, admin only
    enable_thinking: bool = False


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str                     # healthy | degraded | unhealthy
    environment: str
    ollama_connected: bool
    whisper_connected: bool
    available_models: list[str]
    system_ram_total_gb: float
    system_ram_available_gb: float
    system_ram_used_pct: float
    quality_mode_available: bool
    active_tasks: dict
    cpu_model: str
    terms_version: str
    onboarding_version: str
