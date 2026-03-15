"""POST /api/transcribe — audio transcription endpoint."""
import logging
import time

from fastapi import APIRouter, Form, HTTPException, Request, UploadFile

from backend.config import settings
from backend.database import log_audit
from backend.schemas import QualityMode, TranscribeResponse
from backend.services.model_manager import WhisperBackendError, WhisperTaskContext, get_whisper_client, get_whisper_model

logger = logging.getLogger(__name__)

router = APIRouter()

_ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".ogg", ".webm"}
_ALLOWED_CONTENT_TYPES = {
    "audio/wav", "audio/wave", "audio/x-wav",
    "audio/mpeg", "audio/mp3",
    "audio/mp4", "audio/m4a",
    "audio/ogg",
    "audio/webm", "video/webm",
    "application/octet-stream",
}


def _get_user_id(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    request: Request,
    audio: UploadFile,
    language: str | None = Form(default=None),
    quality: QualityMode = Form(default=QualityMode.FAST),
) -> TranscribeResponse:
    """Transcribe an uploaded audio file using whisper.cpp."""
    # Validate content type
    content_type = audio.content_type or ""
    if content_type not in _ALLOWED_CONTENT_TYPES:
        suffix = "." + (audio.filename or "").rsplit(".", 1)[-1].lower()
        if suffix not in _ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=422,
                detail=f"Niet-ondersteund bestandstype: {content_type}",
            )

    # Read and validate file size
    audio_bytes = await audio.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(audio_bytes) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Bestand te groot (max {settings.MAX_UPLOAD_SIZE_MB} MB)",
        )

    quality_val = quality.value
    model_size = get_whisper_model(quality_val)
    user_id = _get_user_id(request)
    filename = audio.filename or "audio.wav"

    start = time.monotonic()
    success = True
    error_msg: str | None = None
    result = None

    try:
        whisper = get_whisper_client()
        async with WhisperTaskContext(quality_val):
            result = await whisper.transcribe(
                audio_bytes=audio_bytes,
                filename=filename,
                language=language,
                model_size=model_size,
            )
    except MemoryError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except WhisperBackendError:
        success = False
        raise HTTPException(status_code=503, detail="Whisper backend is niet bereikbaar")
    except Exception as exc:
        success = False
        error_msg = str(exc)
        logger.error("Transcribe error: %s", exc)
        raise HTTPException(status_code=500, detail="Transcriberen mislukt")
    finally:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        await log_audit(
            action="transcribe",
            user_identifier=user_id,
            model_used=f"whisper-{model_size}",
            quality_mode=quality_val,
            input_length=len(audio_bytes),
            output_length=len(result.text) if result else 0,
            processing_time_ms=elapsed_ms,
            success=success,
            error_message=error_msg,
        )

    return result  # type: ignore[return-value]
