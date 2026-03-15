"""faster-whisper backend — CPU-gebaseerde transcriptie, werkt op Windows en Linux."""
import asyncio
import logging
import os
import tempfile
from functools import partial

from backend.config import settings
from backend.schemas import TranscribeResponse
from backend.services.model_manager import WhisperBackendError

logger = logging.getLogger(__name__)


class FasterWhisperError(WhisperBackendError):
    """Raised when faster-whisper transcription fails."""


class FasterWhisperClient:
    """Synchronous faster-whisper wrapped in asyncio executor."""

    def __init__(self) -> None:
        self._model = None
        self._model_size: str | None = None

    def _load_model(self, model_size: str):
        """Load (or reuse) the faster-whisper model. Blocking call."""
        if self._model is not None and self._model_size == model_size:
            return self._model
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as exc:
            raise FasterWhisperError(
                "faster-whisper is niet geïnstalleerd. Voer uit: pip install faster-whisper"
            ) from exc

        logger.info("faster-whisper model laden: %s (cpu)", model_size)
        self._model = WhisperModel(model_size, device="cpu", compute_type="int8")
        self._model_size = model_size
        return self._model

    async def check_connection(self) -> bool:
        """Return True als faster-whisper importeerbaar is."""
        try:
            import faster_whisper  # noqa: F401  # type: ignore
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
        """Transcribeer audio via faster-whisper op de CPU."""
        suffix = os.path.splitext(filename)[1] or ".wav"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        tmp.write(audio_bytes)
        tmp.flush()
        tmp.close()

        loop = asyncio.get_event_loop()
        try:
            result = await loop.run_in_executor(
                None,
                partial(self._run_transcribe, tmp.name, language, model_size),
            )
        except Exception as exc:
            raise FasterWhisperError(f"Transcriptie mislukt: {exc}") from exc
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass

        return result

    def _run_transcribe(
        self, path: str, language: str | None, model_size: str
    ) -> TranscribeResponse:
        """Blocking transcription call — uitgevoerd in executor thread."""
        model = self._load_model(model_size)
        kwargs: dict = {"beam_size": 5}
        if language:
            kwargs["language"] = language

        segments_iter, info = model.transcribe(path, **kwargs)
        segments = list(segments_iter)

        text = " ".join(s.text.strip() for s in segments).strip()
        duration = info.duration or 0.0
        detected_language = info.language or language or "unknown"

        return TranscribeResponse(
            text=text,
            language=detected_language,
            duration_seconds=float(duration),
            segments=[
                {"start": s.start, "end": s.end, "text": s.text.strip()}
                for s in segments
            ],
        )


faster_whisper_client = FasterWhisperClient()
