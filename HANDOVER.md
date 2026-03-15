# Overdracht capsule — AI Toolkit Mac/LM Studio integratie

**Datum**: 2026-03-14
**Status**: Plan goedgekeurd, implementatie nog niet gestart.

---

## Project context

Lokale web-app "AI Toolkit" voor zakelijke medewerkers. Vier AI-functies (transcribeer, samenvatten, vertalen, chat) volledig lokaal via Ollama + Whisper.cpp.

**Productiedoel**: HP EliteBook 640 G10 (Windows 11), i5-1350P, 16 GB RAM, geen dedicated GPU
**Ontwikkelomgeving**: Mac (Apple Silicon) met LM Studio + mlx-whisper

**Project root**: `/Users/rogierneefe/CascadeProjects/LocalAI/HulocAI`

---

## Huidige staat (wat is al klaar)

### Fase 1 — volledig gebouwd en getest ✅

Alle bestanden zijn aangemaakt en de app draait. De health endpoint (`GET /api/health`) geeft een geldige JSON-response terug. Status is "unhealthy" omdat Ollama/Whisper niet lokaal draaien op Mac — dat is verwacht gedrag.

**Backend:**
- `backend/main.py` — FastAPI factory, lifespan, CORS, static files
- `backend/config.py` — pydantic-settings, OTAP-profielen (zie inhoud hieronder)
- `backend/schemas.py` — alle Pydantic v2 request/response modellen
- `backend/database.py` — aiosqlite, log_audit()
- `backend/services/ollama_client.py` — Ollama native REST wrapper
- `backend/services/whisper_client.py` — HTTP client voor whisper.cpp server (poort 8178)
- `backend/services/model_manager.py` — semaphores, LLMTaskContext, WhisperTaskContext
- `backend/services/environment.py` — Windows Sandbox detectie
- `backend/routers/health.py`, `summarize.py`, `translate.py`, `chat.py`, `transcribe.py`, `admin.py`
- `backend/middleware/auth.py`, `security.py`

**Frontend:** Vanilla JS SPA, ES modules, no build step
**Config:** `config/models.json`, `config/prompts/*.txt`, `config/terms.md`
**Docker:** `docker-compose.yml`, `Dockerfile`
**Windows Sandbox:** `sandbox/ai-toolkit.wsb`, `scripts/sandbox-setup.ps1`

---

## Wat er nog gedaan moet worden (goedgekeurde taak)

### Mac/LM Studio integratie — plan goedgekeurd ("ja"), implementatie niet gestart

**Doel**: De app lokaal op Mac kunnen draaien met:
- **LLM**: LM Studio (OpenAI-compatibele API, poort 1234) — laadt één model tegelijk
- **Whisper**: mlx-whisper Python library (Metal GPU, geen HTTP server)
- **Model selectie**: `"auto"` — client vraagt `/v1/models` op en pakt het eerste geladen model
- **Geen breaking changes** voor de Windows-target (Ollama/whisper.cpp blijft standaard)

---

## Exacte implementatiestappen

### Stap 1: `backend/config.py` — nieuwe settings toevoegen

Voeg toe aan de `Settings` klasse (na `RAM_HEADROOM_GB`):

```python
# Backend selection
LLM_BACKEND: str = "ollama"          # "ollama" | "lmstudio"
LMSTUDIO_URL: str = "http://localhost:1234"
WHISPER_BACKEND: str = "whisper_cpp" # "whisper_cpp" | "local"
MLX_WHISPER_MODEL: str = "mlx-community/whisper-large-v3-turbo"
```

---

### Stap 2: `backend/services/lmstudio_client.py` — NIEUW bestand

OpenAI-compatibele client met dezelfde interface als `ollama_client`. Methoden:

- `check_connection() -> bool` — GET `/v1/models`, return True als 200
- `list_models() -> list[str]` — GET `/v1/models`, return `[m["id"] for m in data["data"]]`
- `_get_active_model() -> str` — roept `list_models()` aan, pakt `models[0]`, raise `LMStudioConnectionError` als leeg
- `generate(model, prompt, system, stream=False) -> str` — POST `/v1/chat/completions` non-streaming, messages=[system, user], return `choices[0].message.content`
- `chat(model, messages) -> AsyncGenerator[str, None]` — POST `/v1/chat/completions` met `stream=True`, parse SSE `data:` lijnen, yield `delta.content`
- `pull_model(model) -> None` — stub, raise `NotImplementedError("LM Studio beheert modellen zelf")`
- `delete_model(model) -> None` — zelfde stub

Wanneer `model == "auto"` → roep `_get_active_model()` aan om het echte model ID te bepalen.

Exception klasse: `LMStudioConnectionError(Exception)`.

---

### Stap 3: `backend/services/local_whisper.py` — NIEUW bestand

mlx-whisper wrapper met dezelfde interface als `whisper_client`.

- `check_connection() -> bool` — probeer `import mlx_whisper`, return True als succesvol
- `transcribe(audio_bytes, filename, language, model_size) -> TranscribeResponse` — schrijf bytes naar `tempfile.NamedTemporaryFile`, roep `mlx_whisper.transcribe(path, path_or_hf_repo=settings.MLX_WHISPER_MODEL, language=language)` aan, verwijder tempfile, return `TranscribeResponse(text=..., language=..., duration_seconds=..., segments=...)`

⚠️ `mlx_whisper.transcribe()` is blocking/sync — draai via `asyncio.get_event_loop().run_in_executor(None, ...)` om de event loop niet te blokkeren.

Exception klasse: `LocalWhisperError(Exception)`.

---

### Stap 4: `backend/services/model_manager.py` — factory functies toevoegen

Voeg onderaan toe (na `get_cpu_model()`):

```python
def get_llm_client():
    """Return the active LLM client based on LLM_BACKEND setting."""
    if settings.LLM_BACKEND == "lmstudio":
        from backend.services.lmstudio_client import lmstudio_client
        return lmstudio_client
    from backend.services.ollama_client import ollama_client
    return ollama_client


def get_whisper_client():
    """Return the active Whisper client based on WHISPER_BACKEND setting."""
    if settings.WHISPER_BACKEND == "local":
        from backend.services.local_whisper import local_whisper_client
        return local_whisper_client
    from backend.services.whisper_client import whisper_client
    return whisper_client
```

---

### Stap 5: Routers updaten

Alle routers gebruiken nu hardcoded imports. Vervang per router:

**`backend/routers/chat.py`** — regel 13:
```python
# Oud:
from backend.services.ollama_client import OllamaConnectionError, ollama_client
# Nieuw:
from backend.services.model_manager import LLMTaskContext, get_llm_client, get_model
```
En in de `event_stream()` functie:
```python
llm_client = get_llm_client()
async with LLMTaskContext("chat", quality):
    async for token in llm_client.chat(model=model, messages=messages):
```
Vervang ook de `OllamaConnectionError` catch door een generic `Exception` check of importeer beide fouttypes.

**`backend/routers/summarize.py`** — regel 11:
```python
# Oud:
from backend.services.ollama_client import OllamaConnectionError, ollama_client
# Nieuw:
from backend.services.model_manager import LLMTaskContext, get_llm_client, get_model
```
In de handler:
```python
llm_client = get_llm_client()
async with LLMTaskContext("summarize", quality):
    result = await llm_client.generate(model=model, prompt=prompt, system=system_prompt, stream=False)
```

**`backend/routers/translate.py`** — zelfde patroon als summarize.

**`backend/routers/transcribe.py`** — regel 11:
```python
# Oud:
from backend.services.whisper_client import WhisperConnectionError, whisper_client
# Nieuw:
from backend.services.model_manager import WhisperTaskContext, get_whisper_client, get_whisper_model
```
In de handler:
```python
whisper = get_whisper_client()
async with WhisperTaskContext(quality_val):
    result = await whisper.transcribe(audio_bytes=audio_bytes, filename=filename, language=language, model_size=model_size)
```

**`backend/routers/health.py`** — regels 9-10:
```python
# Oud:
from backend.services.ollama_client import ollama_client
from backend.services.whisper_client import whisper_client
# Nieuw:
from backend.services.model_manager import get_llm_client, get_whisper_client
```
In de handler:
```python
llm_client = get_llm_client()
whisper = get_whisper_client()
ollama_ok = await llm_client.check_connection()
whisper_ok = await whisper.check_connection()
available_models = await llm_client.list_models() if ollama_ok else []
```
Let op: de HealthResponse heeft `ollama_connected` veld — die naam mag blijven, semantisch klopt het nog.

**`backend/routers/admin.py`** — bevat ook directe `ollama_client` referenties voor model pull/delete/list. Vervang die ook via factory.

---

### Stap 6: `requirements.txt` — voeg toe

```
mlx-whisper>=0.4.0
```

(mlx-whisper installeert automatisch mlx als dependency op Apple Silicon)

---

### Stap 7: `config/models.mac.json` — NIEUW bestand

```json
{
  "version": "1.0",
  "target_hardware": {
    "description": "Mac met LM Studio en mlx-whisper"
  },
  "functions": {
    "summarize": {
      "fast":    { "model": "auto", "min_ram_gb": 2, "context_length": 4096 },
      "quality": { "model": "auto", "min_ram_gb": 4, "context_length": 32768 }
    },
    "translate": {
      "fast":    { "model": "auto", "min_ram_gb": 2, "context_length": 4096 },
      "quality": { "model": "auto", "min_ram_gb": 4, "context_length": 32768 }
    },
    "chat": {
      "fast":    { "model": "auto", "min_ram_gb": 2, "context_length": 4096 },
      "quality": { "model": "auto", "min_ram_gb": 4, "context_length": 32768 }
    }
  },
  "whisper": {
    "fast":    { "model": "mlx-community/whisper-large-v3-turbo", "min_ram_gb": 2 },
    "quality": { "model": "mlx-community/whisper-large-v3-turbo", "min_ram_gb": 2 }
  },
  "resource_guard": {
    "max_concurrent_llm_requests": 1,
    "max_concurrent_whisper_requests": 1,
    "prevent_simultaneous_llm_and_whisper_quality": true,
    "ram_headroom_gb": 2
  }
}
```

---

### Stap 8: `.env.mac` — NIEUW bestand

```dotenv
# Mac ontwikkelomgeving — LM Studio + mlx-whisper
LLM_BACKEND=lmstudio
LMSTUDIO_URL=http://localhost:1234
WHISPER_BACKEND=local
MLX_WHISPER_MODEL=mlx-community/whisper-large-v3-turbo
ENVIRONMENT_MODE=development
ADMIN_TOKEN=dev-token
TERMS_VERSION=v1
ONBOARDING_VERSION=v1
MAX_UPLOAD_SIZE_MB=50
RATE_LIMIT_PER_MINUTE=30
RAM_HEADROOM_GB=2.0
```

Gebruik: `cp .env.mac .env` voordat je de server start op Mac.

---

## Hoe te starten na implementatie (Mac)

```bash
# 1. LM Studio open — laad een Qwen model, start de lokale server (poort 1234)
# 2. Installeer dependencies
python3 -m venv /tmp/ai-toolkit-venv
/tmp/ai-toolkit-venv/bin/pip install -r requirements.txt

# 3. Activeer Mac config
cp .env.mac .env

# 4. Start server
/tmp/ai-toolkit-venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8080

# 5. Test
curl http://localhost:8080/api/health
```

---

## Technische kanttekeningen

- `lmstudio_client` en `ollama_client` moeten dezelfde methode-signaturen hebben zodat de factory transparant werkt
- `chat()` in `lmstudio_client` moet dezelfde `AsyncGenerator[str, None]` interface bieden als `ollama_client.chat()`
- `local_whisper.py` is synchronous (mlx_whisper); gebruik `run_in_executor` voor async
- Foutafhandeling: routers vangen nu `OllamaConnectionError` — dat moet generiek worden (bijv. check op connection-type fout string, of gebruik een gemeenschappelijke basisklasse `LLMConnectionError`)
- De `admin.py` router bevat ook model pull/delete logica voor Ollama — maak dit conditioneel of gooi NotImplementedError voor LM Studio

---

## Volgorde van implementatie (aanbevolen)

1. `backend/config.py` — settings uitbreiden
2. `backend/services/lmstudio_client.py` — nieuw
3. `backend/services/local_whisper.py` — nieuw
4. `backend/services/model_manager.py` — factory functies
5. `backend/routers/health.py` — factory gebruiken
6. `backend/routers/summarize.py` — factory gebruiken
7. `backend/routers/translate.py` — factory gebruiken
8. `backend/routers/chat.py` — factory gebruiken
9. `backend/routers/transcribe.py` — factory gebruiken
10. `backend/routers/admin.py` — factory gebruiken (conditioneel)
11. `config/models.mac.json` — nieuw
12. `.env.mac` — nieuw
13. `requirements.txt` — mlx-whisper toevoegen
