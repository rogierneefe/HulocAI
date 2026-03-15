"""POST /api/translate — text translation endpoint."""
import logging
import time

from fastapi import APIRouter, HTTPException, Request

from backend.database import log_audit
from backend.schemas import TranslateRequest, TranslateResponse
from backend.services.model_manager import LLMConnectionError, LLMTaskContext, get_llm_client, get_model

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_CHARS = {"fast": 4_000, "quality": 20_000}

_LANG_NAMES: dict[str, str] = {
    "nl": "Dutch", "en": "English", "fr": "French", "de": "German",
    "es": "Spanish", "it": "Italian", "pt": "Portuguese", "pl": "Polish",
    "tr": "Turkish", "ar": "Arabic", "zh": "Chinese", "ja": "Japanese",
}


def _build_prompts(
    text: str, source: str | None, target: str, tone: str
) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) with target language baked into both."""
    src_name = _LANG_NAMES.get(source, source) if source else None
    tgt_name = _LANG_NAMES.get(target, target)
    src_clause = f" from {src_name}" if src_name else ""
    tone_part = "formal" if tone == "formal" else "informal"

    system = (
        f"You are a translation engine. "
        f"You output ONLY {tgt_name} text. "
        f"Never respond in any other language. "
        f"Never add explanations, labels, or comments — only the translated text."
    )
    user = (
        f"Translate the text below{src_clause} to {tgt_name}. Tone: {tone_part}.\n\n"
        f"{text}"
    )
    return system, user


def _get_user_id(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/translate", response_model=TranslateResponse)
async def translate(request: Request, body: TranslateRequest) -> TranslateResponse:
    """Translate text using an LLM."""
    quality = body.quality.value
    max_chars = _MAX_CHARS.get(quality, 4_000)

    if len(body.text) > max_chars:
        raise HTTPException(
            status_code=422,
            detail=f"Tekst te lang voor {quality}-modus (max {max_chars} tekens)",
        )

    model = get_model("translate", quality)
    system_prompt, prompt = _build_prompts(
        body.text, body.source_language, body.target_language, body.tone
    )
    user_id = _get_user_id(request)

    start = time.monotonic()
    success = True
    error_msg: str | None = None
    translation = ""

    try:
        llm_client = get_llm_client()
        async with LLMTaskContext("translate", quality):
            result = await llm_client.generate(
                model=model,
                prompt=prompt,
                system=system_prompt,
                stream=False,
            )
            translation = result  # type: ignore[assignment]
    except MemoryError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except LLMConnectionError:
        success = False
        raise HTTPException(status_code=503, detail="LLM backend is niet bereikbaar")
    except Exception as exc:
        success = False
        error_msg = str(exc)
        logger.error("Translate error: %s", exc)
        raise HTTPException(status_code=500, detail="Vertalen mislukt")
    finally:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        await log_audit(
            action="translate",
            user_identifier=user_id,
            model_used=model,
            quality_mode=quality,
            input_length=len(body.text),
            output_length=len(translation),
            processing_time_ms=elapsed_ms,
            success=success,
            error_message=error_msg,
        )

    return TranslateResponse(
        translation=translation,
        detected_language=body.source_language,
        model_used=model,
    )
