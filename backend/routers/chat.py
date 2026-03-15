"""POST /api/chat — streaming chat via Server-Sent Events."""
import json
import logging
import time
from collections.abc import AsyncGenerator
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from backend.database import log_audit
from backend.schemas import ChatRequest
from backend.services.model_manager import LLMConnectionError, LLMTaskContext, get_llm_client, get_model

logger = logging.getLogger(__name__)

router = APIRouter()

_PROMPT_PATH = Path("config/prompts/chat.txt")

_MAX_CHARS = {"fast": 2_000, "quality": 8_000}


def _load_system_prompt() -> str:
    if _PROMPT_PATH.exists():
        return _PROMPT_PATH.read_text(encoding="utf-8").strip()
    return "Je bent een behulpzame AI-assistent voor zakelijk gebruik."


def _get_user_id(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _thinking_filter(
    source: AsyncGenerator[str, None],
) -> AsyncGenerator[tuple[str, str], None]:
    """Strip <think>...</think> blocks from a token stream.

    Yields (event_type, content) tuples where event_type is one of:
      'token'          — regular output to display
      'thinking_start' — model started a thinking block
      'thinking_end'   — model finished the thinking block
    """
    OPEN = "<think>"
    CLOSE = "</think>"
    buf = ""
    in_think = False

    async for chunk in source:
        buf += chunk
        # Process the buffer in a loop until no more complete tags are found.
        while True:
            if not in_think:
                idx = buf.find(OPEN)
                if idx == -1:
                    # No opening tag yet; flush everything except a potential partial match.
                    safe = len(buf) - (len(OPEN) - 1)
                    if safe > 0:
                        yield "token", buf[:safe]
                        buf = buf[safe:]
                    break
                else:
                    if idx > 0:
                        yield "token", buf[:idx]
                    buf = buf[idx + len(OPEN):]
                    in_think = True
                    yield "thinking_start", ""
            else:
                idx = buf.find(CLOSE)
                if idx == -1:
                    # Still inside think block; discard, keep potential partial match.
                    buf = buf[-(len(CLOSE) - 1):]
                    break
                else:
                    buf = buf[idx + len(CLOSE):].lstrip("\n")
                    in_think = False
                    yield "thinking_end", ""
                    # Continue loop to check for more tags in remaining buf.

    # Flush anything left.
    if buf and not in_think:
        yield "token", buf


@router.post("/chat")
async def chat(request: Request, body: ChatRequest) -> StreamingResponse:
    """Stream a chat response via SSE."""
    quality = body.quality.value

    # Validate last user message length
    user_messages = [m for m in body.messages if m.role == "user"]
    if user_messages:
        last = user_messages[-1].content
        max_chars = _MAX_CHARS.get(quality, 2_000)
        if len(last) > max_chars:
            raise HTTPException(
                status_code=422,
                detail=f"Bericht te lang voor {quality}-modus (max {max_chars} tekens)",
            )

    model = get_model("chat", quality)
    system_prompt = body.system_prompt or _load_system_prompt()
    user_id = _get_user_id(request)

    # Build messages list.
    # Qwen3 thinking is controlled via /think or /no_think at the start of
    # the LAST user message (not the system prompt). Without /no_think,
    # Qwen3 defaults to thinking ON regardless of enable_thinking.
    control = "/think" if body.enable_thinking else "/no_think"
    messages = [{"role": "system", "content": system_prompt}]
    for i, m in enumerate(body.messages):
        content = m.content
        if m.role == "user" and i == len(body.messages) - 1:
            content = f"{control}\n{content}"
        messages.append({"role": m.role, "content": content})

    async def event_stream():
        start = time.monotonic()
        total_tokens = 0
        success = True
        error_msg: str | None = None

        try:
            llm_client = get_llm_client()
            async with LLMTaskContext("chat", quality):
                raw_stream = llm_client.chat(model=model, messages=messages)
                # Always filter <think> blocks — Qwen3 may think regardless of
                # /no_think prefix (LM Studio controls it internally).
                # When enable_thinking=False we silently discard thinking content;
                # the user never sees it but response tokens are always clean.
                async for evt_type, content in _thinking_filter(raw_stream):
                    if evt_type == "thinking_start":
                        if body.enable_thinking:
                            yield f"data: {json.dumps({'thinking': True})}\n\n"
                    elif evt_type == "thinking_end":
                        if body.enable_thinking:
                            yield f"data: {json.dumps({'thinking': False})}\n\n"
                    elif content:
                        total_tokens += len(content)
                        yield f"data: {json.dumps({'token': content})}\n\n"
                yield f"data: {json.dumps({'done': True, 'model': model})}\n\n"
        except MemoryError as exc:
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"
            success = False
            error_msg = str(exc)
        except LLMConnectionError:
            yield f"data: {json.dumps({'error': 'LLM backend is niet bereikbaar'})}\n\n"
            success = False
            error_msg = "LLM connection error"
        except Exception as exc:
            logger.error("Chat stream error: %s", exc)
            yield f"data: {json.dumps({'error': 'Chat mislukt'})}\n\n"
            success = False
            error_msg = str(exc)
        finally:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            input_len = sum(len(m.content) for m in body.messages)
            await log_audit(
                action="chat",
                user_identifier=user_id,
                model_used=model,
                quality_mode=quality,
                input_length=input_len,
                output_length=total_tokens,
                processing_time_ms=elapsed_ms,
                success=success,
                error_message=error_msg,
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
