"""mlx-whisper local transcription wrapper (Apple Silicon / Metal GPU)."""
import asyncio
import logging
import tempfile
import os

from backend.config import settings
from backend.schemas import TranscribeResponse
from backend.services.model_manager import WhisperBackendError

logger = logging.getLogger(__name__)


class LocalWhisperError(WhisperBackendError):
    """Raised when mlx-whisper is unavailable or transcription fails."""


class LocalWhisperClient:
    """Synchronous mlx-whisper wrapped in async via run_in_executor."""

    async def check_connection(self) -> bool:
        """Return True if mlx_whisper can be imported (library is installed)."""
        try:
            import mlx_whisper  # noqa: F401
            return True
        except ImportError:
            return False

    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.wav",
        language: str | None = None,
        model_size: str = "base",
    ) -> TranscribeResponse:
        """
        Transcribe audio using mlx-whisper on Apple Silicon.
        Runs blocking mlx_whisper.transcribe() in a thread executor.
        """
        try:
            import mlx_whisper
        except ImportError as exc:
            raise LocalWhisperError(
                "mlx-whisper is niet geïnstalleerd. "
                "Voer uit: pip install mlx-whisper"
            ) from exc

        suffix = os.path.splitext(filename)[-1] or ".wav"

        def _run() -> dict:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = tmp.name
            try:
                kwargs: dict = {"path_or_hf_repo": settings.MLX_WHISPER_MODEL}
                if language:
                    kwargs["language"] = language
                return mlx_whisper.transcribe(tmp_path, **kwargs)
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, _run)
        except Exception as exc:
            raise LocalWhisperError(f"Transcriptie mislukt: {exc}") from exc

        text = (result.get("text") or "").strip()
        detected_language = result.get("language") or language or "unknown"
        segments = result.get("segments")

        # Derive duration from last segment end time if available
        duration = 0.0
        if segments:
            try:
                duration = float(segments[-1].get("end", 0.0))
            except (TypeError, ValueError):
                duration = 0.0

        return TranscribeResponse(
            text=text,
            language=detected_language,
            duration_seconds=duration,
            segments=segments,
        )


local_whisper_client = LocalWhisperClient()
