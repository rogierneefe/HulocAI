"""Async Whisper.cpp HTTP server client."""
import logging

import httpx

from backend.config import settings
from backend.schemas import TranscribeResponse
from backend.services.model_manager import WhisperBackendError

logger = logging.getLogger(__name__)

TRANSCRIBE_TIMEOUT = 300.0
HEALTH_TIMEOUT = 10.0

ALLOWED_MIME_TYPES = {
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/ogg",
    "audio/webm",
    "video/webm",
    "application/octet-stream",  # fallback for browser MediaRecorder
}


class WhisperConnectionError(WhisperBackendError):
    """Raised when the Whisper service is unreachable."""


class WhisperClient:
    """Async HTTP client for the whisper.cpp HTTP server."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.WHISPER_URL).rstrip("/")

    def _client(self, timeout: float = TRANSCRIBE_TIMEOUT) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self._base_url, timeout=timeout)

    async def check_connection(self) -> bool:
        """Return True if whisper.cpp server is reachable."""
        try:
            async with self._client(HEALTH_TIMEOUT) as c:
                r = await c.get("/")
                return r.status_code in (200, 404)  # 404 is fine — server is up
        except Exception:
            return False

    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        language: str | None = None,
        model_size: str = "base",
    ) -> TranscribeResponse:
        """
        Send audio to whisper.cpp HTTP server and return a TranscribeResponse.
        The server accepts multipart/form-data with field 'file'.
        """
        files = {"file": (filename, audio_bytes, "audio/wav")}
        data: dict = {}
        if language:
            data["language"] = language

        try:
            async with self._client() as c:
                r = await c.post("/inference", files=files, data=data)
                r.raise_for_status()
                result = r.json()
        except httpx.ConnectError as exc:
            raise WhisperConnectionError(str(exc)) from exc

        # whisper.cpp HTTP server returns {"text": "...", ...}
        text = result.get("text", "").strip()
        detected_language = result.get("language", language or "unknown")
        duration = result.get("duration", 0.0)
        segments = result.get("segments")

        return TranscribeResponse(
            text=text,
            language=detected_language,
            duration_seconds=float(duration),
            segments=segments,
        )


whisper_client = WhisperClient()
