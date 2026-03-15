"""Async Ollama REST API wrapper."""
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import httpx

from backend.config import settings
from backend.services.model_manager import LLMConnectionError

logger = logging.getLogger(__name__)

GENERATE_TIMEOUT = 120.0
HEALTH_TIMEOUT = 10.0


class OllamaConnectionError(LLMConnectionError):
    """Raised when the Ollama service is unreachable."""


class OllamaClient:
    """Async HTTP client for the Ollama REST API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.OLLAMA_URL).rstrip("/")

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _client(self, timeout: float = GENERATE_TIMEOUT) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self._base_url, timeout=timeout)

    # ── Public API ────────────────────────────────────────────────────────────

    async def check_connection(self) -> bool:
        """Return True if Ollama is reachable."""
        try:
            async with self._client(HEALTH_TIMEOUT) as c:
                r = await c.get("/api/tags")
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        """Return a list of installed model names."""
        try:
            async with self._client(HEALTH_TIMEOUT) as c:
                r = await c.get("/api/tags")
                r.raise_for_status()
                data = r.json()
                return [m["name"] for m in data.get("models", [])]
        except Exception as exc:
            raise OllamaConnectionError(f"Cannot list models: {exc}") from exc

    async def generate(
        self,
        model: str,
        prompt: str,
        system: str | None = None,
        stream: bool = False,
    ) -> str | AsyncGenerator[str, None]:
        """
        Non-streaming: return the complete response as a string.
        Streaming: return an AsyncGenerator yielding text chunks.
        """
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": stream,
        }
        if system:
            payload["system"] = system

        if not stream:
            return await self._generate_blocking(payload)
        return self._generate_streaming(payload)

    async def _generate_blocking(self, payload: dict) -> str:
        try:
            async with self._client() as c:
                r = await c.post("/api/generate", json=payload)
                r.raise_for_status()
                return r.json().get("response", "")
        except httpx.ConnectError as exc:
            raise OllamaConnectionError(str(exc)) from exc

    async def _generate_streaming(self, payload: dict) -> AsyncGenerator[str, None]:
        try:
            async with self._client() as c:
                async with c.stream("POST", "/api/generate", json=payload) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if line:
                            data = json.loads(line)
                            if token := data.get("response"):
                                yield token
                            if data.get("done"):
                                break
        except httpx.ConnectError as exc:
            raise OllamaConnectionError(str(exc)) from exc

    async def chat(
        self,
        model: str,
        messages: list[dict],
        stream: bool = True,
    ) -> AsyncGenerator[str, None]:
        """Streaming chat completion — yields text tokens."""
        payload = {"model": model, "messages": messages, "stream": stream}
        try:
            async with self._client() as c:
                async with c.stream("POST", "/api/chat", json=payload) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if line:
                            data = json.loads(line)
                            token = data.get("message", {}).get("content", "")
                            if token:
                                yield token
                            if data.get("done"):
                                break
        except httpx.ConnectError as exc:
            raise OllamaConnectionError(str(exc)) from exc

    async def pull_model(self, name: str) -> AsyncGenerator[str, None]:
        """Stream pull progress for use in admin routes."""
        payload = {"name": name, "stream": True}
        try:
            async with self._client(timeout=3600) as c:
                async with c.stream("POST", "/api/pull", json=payload) as r:
                    r.raise_for_status()
                    async for line in r.aiter_lines():
                        if line:
                            yield line
        except httpx.ConnectError as exc:
            raise OllamaConnectionError(str(exc)) from exc

    async def delete_model(self, name: str) -> bool:
        """Delete a model from Ollama. Returns True on success."""
        try:
            async with self._client(HEALTH_TIMEOUT) as c:
                r = await c.request("DELETE", "/api/delete", json={"name": name})
                return r.status_code == 200
        except Exception:
            return False


ollama_client = OllamaClient()
