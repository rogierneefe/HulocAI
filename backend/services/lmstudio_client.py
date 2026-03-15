"""Async LM Studio OpenAI-compatible API wrapper."""
import json
import logging
from collections.abc import AsyncGenerator

import httpx

from backend.config import settings
from backend.services.model_manager import LLMConnectionError

logger = logging.getLogger(__name__)

GENERATE_TIMEOUT = 120.0
HEALTH_TIMEOUT = 10.0


class LMStudioConnectionError(LLMConnectionError):
    """Raised when the LM Studio service is unreachable or has no model loaded."""


class LMStudioClient:
    """Async HTTP client for the LM Studio OpenAI-compatible REST API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.LMSTUDIO_URL).rstrip("/")

    def _client(self, timeout: float = GENERATE_TIMEOUT) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self._base_url, timeout=timeout)

    # ── Public API ────────────────────────────────────────────────────────────

    async def check_connection(self) -> bool:
        """Return True if LM Studio is reachable and has a model loaded."""
        try:
            async with self._client(HEALTH_TIMEOUT) as c:
                r = await c.get("/v1/models")
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        """Return a list of loaded model IDs."""
        try:
            async with self._client(HEALTH_TIMEOUT) as c:
                r = await c.get("/v1/models")
                r.raise_for_status()
                data = r.json()
                return [m["id"] for m in data.get("data", [])]
        except Exception as exc:
            raise LMStudioConnectionError(f"Cannot list models: {exc}") from exc

    async def _get_active_model(self) -> str:
        """Return the first loaded model ID, raise if none available."""
        models = await self.list_models()
        if not models:
            raise LMStudioConnectionError(
                "LM Studio heeft geen model geladen. Laad een model in LM Studio."
            )
        return models[0]

    async def generate(
        self,
        model: str,
        prompt: str,
        system: str | None = None,
        stream: bool = False,
    ) -> str:
        """Non-streaming chat completion — returns the full response string."""
        if model == "auto":
            model = await self._get_active_model()

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {"model": model, "messages": messages, "stream": False}

        try:
            async with self._client() as c:
                r = await c.post("/v1/chat/completions", json=payload)
                r.raise_for_status()
                data = r.json()
                return data["choices"][0]["message"]["content"]
        except httpx.ConnectError as exc:
            raise LMStudioConnectionError(str(exc)) from exc

    async def chat(
        self,
        model: str,
        messages: list[dict],
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Streaming chat completion — yields text tokens via SSE."""
        if model == "auto":
            model = await self._get_active_model()

        payload = {"model": model, "messages": messages, "stream": True}

        try:
            async with self._client() as c:
                async with c.stream("POST", "/v1/chat/completions", json=payload) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[len("data:"):].strip()
                        if raw == "[DONE]":
                            break
                        try:
                            data = json.loads(raw)
                            token = data["choices"][0]["delta"].get("content", "")
                            if token:
                                yield token
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
        except httpx.ConnectError as exc:
            raise LMStudioConnectionError(str(exc)) from exc

    async def pull_model(self, model: str) -> None:
        """Not supported — LM Studio manages models itself."""
        raise NotImplementedError("LM Studio beheert modellen zelf")

    async def delete_model(self, model: str) -> None:
        """Not supported — LM Studio manages models itself."""
        raise NotImplementedError("LM Studio beheert modellen zelf")


lmstudio_client = LMStudioClient()
