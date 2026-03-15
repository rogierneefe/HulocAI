"""POST /api/summarize — text summarization endpoint."""
import logging
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from backend.database import log_audit
from backend.schemas import SummarizeRequest, SummarizeResponse
from backend.services.model_manager import LLMConnectionError, LLMTaskContext, get_llm_client, get_model

logger = logging.getLogger(__name__)

router = APIRouter()

_PROMPT_PATH = Path("config/prompts/summarize.txt")

# Max chars per quality mode (fast: ~2K tokens, quality: ~12K tokens)
_MAX_CHARS = {"fast": 8_000, "quality": 50_000}

# Token estimator: ~0.25 factor for NL/EN text
_CHARS_PER_TOKEN = 4


def _load_system_prompt() -> str:
    if _PROMPT_PATH.exists():
        return _PROMPT_PATH.read_text(encoding="utf-8").strip()
    return "Je bent een zakelijke assistent die teksten samenvat."


def _build_prompt(text: str, length: str, style: str) -> str:
    length_map = {
        "short": "Geef een zeer korte samenvatting (1-3 zinnen).",
        "medium": "Geef een beknopte samenvatting (4-8 zinnen).",
        "long": "Geef een uitgebreide samenvatting met alle belangrijke punten.",
    }
    style_map = {
        "prose": "Schrijf in lopende tekst.",
        "bullets": "Gebruik een opsomming met bullet points.",
        "action_items": "Lijst alle actiepunten op als genummerde lijst.",
    }
    instructions = f"{length_map.get(length, '')} {style_map.get(style, '')}"
    return f"{instructions}\n\nTekst om samen te vatten:\n\n{text}"


def _get_user_id(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(request: Request, body: SummarizeRequest) -> SummarizeResponse:
    """Summarize a text using an LLM."""
    quality = body.quality.value
    max_chars = _MAX_CHARS.get(quality, 8_000)

    if len(body.text) > max_chars:
        raise HTTPException(
            status_code=422,
            detail=f"Tekst te lang voor {quality}-modus (max {max_chars} tekens)",
        )

    model = get_model("summarize", quality)
    system_prompt = _load_system_prompt()
    prompt = _build_prompt(body.text, body.length, body.style)
    user_id = _get_user_id(request)

    start = time.monotonic()
    success = True
    error_msg: str | None = None
    summary = ""

    try:
        llm_client = get_llm_client()
        async with LLMTaskContext("summarize", quality):
            result = await llm_client.generate(
                model=model,
                prompt=prompt,
                system=system_prompt,
                stream=False,
            )
            summary = result  # type: ignore[assignment]
    except MemoryError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except LLMConnectionError as exc:
        success = False
        error_msg = str(exc)
        raise HTTPException(status_code=503, detail="LLM backend is niet bereikbaar")
    except Exception as exc:
        success = False
        error_msg = str(exc)
        logger.error("Summarize error: %s", exc)
        raise HTTPException(status_code=500, detail="Samenvatten mislukt")
    finally:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        await log_audit(
            action="summarize",
            user_identifier=user_id,
            model_used=model,
            quality_mode=quality,
            input_length=len(body.text),
            output_length=len(summary),
            processing_time_ms=elapsed_ms,
            success=success,
            error_message=error_msg,
        )

    return SummarizeResponse(
        summary=summary,
        model_used=model,
        processing_time_ms=elapsed_ms,
    )
