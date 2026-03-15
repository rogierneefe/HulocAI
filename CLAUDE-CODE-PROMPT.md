# CLAUDE CODE PROMPT — AI Toolkit

Je bouwt een complete lokale web-applicatie genaamd "AI Toolkit" voor zakelijke medewerkers. De app biedt vier AI-taalverwerkingsfuncties (transcriberen, samenvatten, vertalen, chatten) die volledig lokaal draaien via Ollama en Whisper.cpp. Geen data verlaat het systeem.

Bouw het project in drie fases. Voltooi elke fase volledig voordat je aan de volgende begint. Test na elke fase.

---

## DOELHARDWARE

De app draait op HP EliteBook 640 G10 werkstations met deze specs:

| Component | Specificatie |
|-----------|-------------|
| OS | Windows 11 Education 10.0.26100 |
| CPU | Intel i5-1350P (12 cores, 1.9 GHz base) |
| RAM | 16 GB fysiek |
| GPU | Intel Iris Xe (geïntegreerd, geen dedicated GPU) |
| Scherm | 14 inch |
| Architectuur | x64 |

**RAM-budget (16 GB totaal):**
- Windows 11 + achtergrondprocessen: ~5 GB
- Browser (frontend): ~0.5-1 GB
- FastAPI backend: ~0.3 GB
- Whisper.cpp: ~0.5-1.5 GB (afhankelijk van model)
- **Beschikbaar voor LLM: ~8-9 GB maximaal**

**Consequenties voor modelkeuze:**
- "Snel" modellen: ≤3B parameters (qwen2.5:1.5b of qwen2.5:3b) — past ruim
- "Kwaliteit" modellen: max 7B parameters (qwen2.5:7b of mistral:7b) — ~5 GB, past nét
- 14B+ modellen passen NIET — gebruik ze niet als default
- Whisper: "base" (snel) en "small" (kwaliteit) — NIET "large-v3" (te groot)
- Draai nooit Whisper en een LLM gelijktijdig op quality-mode — sequentieel verwerken

**Geen NVIDIA GPU:** Ollama gebruikt CPU-only inference via llama.cpp. De i5-1350P heeft AVX2 wat llama.cpp goed benut. Verwacht ~10-20 tokens/sec voor 3B modellen en ~3-8 tokens/sec voor 7B modellen.

**Docker Desktop overhead op Windows:** Docker Desktop + WSL2 claimt extra RAM (~1-2 GB). Overweeg voor deze hardware een native installatie (Python + Ollama direct op Windows) als alternatief voor Docker. De prompt ondersteunt beide.

---

## PROJECTSTRUCTUUR

Maak exact deze structuur aan:

```
ai-toolkit/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .env
├── README.md
├── CHANGELOG.md
├── requirements.txt
│
├── backend/
│   ├── __init__.py
│   ├── main.py                 # FastAPI entry point
│   ├── config.py               # Settings via pydantic-settings, env-detectie
│   ├── schemas.py              # Pydantic request/response models
│   ├── database.py             # SQLite via aiosqlite
│   │
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── transcribe.py       # POST /api/transcribe
│   │   ├── summarize.py        # POST /api/summarize
│   │   ├── translate.py        # POST /api/translate
│   │   ├── chat.py             # POST /api/chat (streaming SSE)
│   │   ├── admin.py            # /api/admin/* (beveiligd)
│   │   └── health.py           # GET /api/health
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── ollama_client.py    # Async Ollama REST wrapper
│   │   ├── whisper_client.py   # Whisper.cpp HTTP integratie
│   │   ├── model_manager.py    # Snel/kwaliteit model selectie
│   │   └── environment.py      # Windows Sandbox detectie
│   │
│   └── middleware/
│       ├── __init__.py
│       ├── security.py         # CSP headers, CORS, rate limiting
│       └── auth.py             # Admin authenticatie (bearer token)
│
├── frontend/
│   ├── index.html              # SPA entry point, laadt alle JS/CSS
│   │
│   ├── css/
│   │   ├── variables.css       # CSS custom properties (design tokens)
│   │   ├── layout.css          # App shell: sidebar, main area, responsive
│   │   └── components.css      # Buttons, inputs, cards, modals, toggles
│   │
│   ├── js/
│   │   ├── app.js              # SPA router, state machine, init flow
│   │   ├── api.js              # fetch() wrapper, SSE helper, error handling
│   │   ├── storage.js          # localStorage wrapper met versie-check
│   │   └── environment.js      # Env-badge rendering, mode checks
│   │
│   └── components/
│       ├── terms.js            # Gebruiksvoorwaarden scherm
│       ├── onboarding.js       # Introductie/video scherm
│       ├── transcribe.js       # Transcriptie UI
│       ├── summarize.js        # Samenvatting UI
│       ├── translate.js        # Vertaal UI
│       ├── chat.js             # Chat UI
│       ├── model-toggle.js     # Snel ↔ Kwaliteit toggle component
│       └── admin-panel.js      # Admin beheer paneel
│
├── config/
│   ├── models.json             # Model manifest
│   ├── terms.md                # Voorwaarden tekst (versie in frontmatter)
│   └── prompts/
│       ├── summarize.txt       # System prompt samenvatten
│       ├── translate.txt       # System prompt vertalen
│       └── chat.txt            # System prompt chat
│
├── scripts/
│   ├── setup.sh                # Eerste installatie (pull models, init db)
│   ├── setup.ps1               # Windows variant
│   ├── update.sh               # Update script
│   └── health-check.sh         # Monitoring script
│
└── data/                       # Persistent volume
    ├── app.db                  # SQLite (wordt aangemaakt door app)
    └── uploads/                # Tijdelijke bestanden
```

---

## FASE 1 — WERKENDE APP

### 1.1 Backend (FastAPI)

**`backend/main.py`**
- FastAPI app met lifespan handler
- Mount `frontend/` als static files op `/`
- Include alle routers onder `/api`
- Bij startup: init database, check Ollama verbinding, log environment mode
- CORS middleware: sta alleen localhost en intern netwerk toe

**`backend/config.py`**
- Gebruik pydantic-settings met `.env` bestand
- Settings:
  ```python
  OLLAMA_URL: str = "http://localhost:11434"
  OLLAMA_NUM_PARALLEL: int = 1           # max gelijktijdige requests (1 voor 16GB)
  OLLAMA_MAX_LOADED_MODELS: int = 1      # max modellen in RAM (1 voor 16GB)
  WHISPER_URL: str = "http://localhost:8178"
  ADMIN_TOKEN: str  # verplicht in productie
  ENVIRONMENT_MODE: str = "production"  # sandbox | production | development
  DB_PATH: str = "data/app.db"
  UPLOAD_DIR: str = "data/uploads"
  TERMS_VERSION: str = "v1"
  ONBOARDING_VERSION: str = "v1"
  MAX_UPLOAD_SIZE_MB: int = 50           # 50MB op 16GB systemen (was 100)
  RATE_LIMIT_PER_MINUTE: int = 30
  RAM_HEADROOM_GB: float = 2.0           # minimaal vrij te houden RAM
  ```

**`backend/database.py`**
- SQLite via aiosqlite
- Tabellen:
  ```sql
  CREATE TABLE IF NOT EXISTS terms_acceptance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_identifier TEXT NOT NULL,      -- browser fingerprint of IP
      terms_version TEXT NOT NULL,
      accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS onboarding_completion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_identifier TEXT NOT NULL,
      onboarding_version TEXT NOT NULL,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_identifier TEXT,
      action TEXT NOT NULL,           -- transcribe|summarize|translate|chat
      model_used TEXT,
      quality_mode TEXT,              -- fast|quality
      input_length INTEGER,
      output_length INTEGER,
      processing_time_ms INTEGER,
      success BOOLEAN DEFAULT TRUE,
      error_message TEXT
  );
  
  CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  ```

**`backend/schemas.py`**
- Pydantic v2 modellen:
  ```python
  class QualityMode(str, Enum):
      FAST = "fast"
      QUALITY = "quality"
  
  class TranscribeRequest:  # multipart form
      audio: UploadFile
      language: str | None = None  # auto-detect als None
      quality: QualityMode = QualityMode.FAST
  
  class TranscribeResponse:
      text: str
      language: str
      duration_seconds: float
      segments: list[dict] | None = None  # timestamps bij quality mode
  
  class SummarizeRequest:
      text: str
      quality: QualityMode = QualityMode.FAST
      length: str = "medium"       # short | medium | long
      style: str = "prose"         # prose | bullets | action_items
  
  class SummarizeResponse:
      summary: str
      model_used: str
      processing_time_ms: int
  
  class TranslateRequest:
      text: str
      source_language: str | None = None  # auto-detect
      target_language: str = "en"
      quality: QualityMode = QualityMode.FAST
      tone: str = "formal"         # formal | informal
  
  class TranslateResponse:
      translation: str
      detected_language: str | None
      model_used: str
  
  class ChatMessage:
      role: str                    # user | assistant | system
      content: str
  
  class ChatRequest:
      messages: list[ChatMessage]
      quality: QualityMode = QualityMode.FAST
      system_prompt: str | None = None  # override, alleen admin
  
  class HealthResponse:
      status: str                  # healthy | degraded | unhealthy
      environment: str
      ollama_connected: bool
      whisper_connected: bool
      available_models: list[str]
      system_ram_total_gb: float
      system_ram_available_gb: float
      system_ram_used_pct: float
      quality_mode_available: bool  # False als RAM < headroom
      active_tasks: dict            # {"llm": null|"summarize", "whisper": null|"transcribe"}
      cpu_model: str               # "Intel i5-1350P" etc.
  ```

**`backend/services/ollama_client.py`**
- Async HTTP client (httpx) naar Ollama REST API
- Methoden:
  - `generate(model, prompt, system, stream=False)` → str of AsyncGenerator
  - `chat(model, messages, stream=True)` → AsyncGenerator[str]
  - `list_models()` → list[str]
  - `check_connection()` → bool
  - `pull_model(name)` → AsyncGenerator[str] (voor admin)
- Timeout: 120 seconden voor generate, 10 seconden voor health checks
- Bij connection error: raise custom `OllamaConnectionError`

**`backend/services/whisper_client.py`**
- Async HTTP client naar whisper.cpp HTTP server
- Methoden:
  - `transcribe(audio_bytes, language=None, model_size="base")` → TranscribeResponse
  - `check_connection()` → bool
- Accepteer audio formaten: wav, mp3, m4a, ogg, webm
- Converteer naar wav (16kHz mono) via ffmpeg als nodig

**`backend/services/model_manager.py`**
- Lees `config/models.json` bij startup
- Methode `get_model(function, quality_mode)` → str
  - function: "summarize" | "translate" | "chat"
  - quality_mode: "fast" | "quality"
- Check of het gevraagde model beschikbaar is in Ollama
- Fallback naar fast model als quality model niet geladen is
- `get_whisper_model(quality_mode)` → str ("base"|"small")
- `get_available_resources()` → dict met RAM info via psutil
- **Resource guard (kritiek voor 16GB systemen):**
  - Gebruik `asyncio.Semaphore(1)` voor LLM-requests (max 1 tegelijk)
  - Gebruik `asyncio.Semaphore(1)` voor Whisper-requests (max 1 tegelijk)
  - Check `psutil.virtual_memory().available` vóór elke quality-request
  - Als beschikbaar RAM < `ram_headroom_gb` (2 GB): weiger quality-request, return error "Onvoldoende geheugen — gebruik de snelle modus"
  - Als Whisper quality bezig is: blokkeer LLM quality (en andersom) — voorkom dat beide tegelijk 5+ GB claimen
  - Laat fast-mode altijd door (kleine modellen passen altijd)

**`config/models.json`**
```json
{
  "version": "1.0",
  "target_hardware": {
    "description": "HP EliteBook 640 G10 — i5-1350P, 16GB RAM, Intel Iris Xe",
    "total_ram_gb": 16,
    "available_ram_gb": 9,
    "gpu": "none (integrated only)",
    "cpu_features": ["AVX2"]
  },
  "functions": {
    "summarize": {
      "fast":    { "model": "qwen2.5:1.5b", "min_ram_gb": 1.5, "context_length": 4096,  "expected_tokens_per_sec": 25 },
      "quality": { "model": "qwen2.5:7b",   "min_ram_gb": 5,   "context_length": 32768, "expected_tokens_per_sec": 5 }
    },
    "translate": {
      "fast":    { "model": "qwen2.5:1.5b", "min_ram_gb": 1.5, "context_length": 4096,  "expected_tokens_per_sec": 25 },
      "quality": { "model": "qwen2.5:7b",   "min_ram_gb": 5,   "context_length": 32768, "expected_tokens_per_sec": 5 }
    },
    "chat": {
      "fast":    { "model": "qwen2.5:3b",   "min_ram_gb": 2.5, "context_length": 4096,  "expected_tokens_per_sec": 15 },
      "quality": { "model": "qwen2.5:7b",   "min_ram_gb": 5,   "context_length": 32768, "expected_tokens_per_sec": 5 }
    }
  },
  "whisper": {
    "fast":    { "model": "base",  "min_ram_gb": 0.5 },
    "quality": { "model": "small", "min_ram_gb": 1.5 }
  },
  "resource_guard": {
    "max_concurrent_llm_requests": 1,
    "max_concurrent_whisper_requests": 1,
    "prevent_simultaneous_llm_and_whisper_quality": true,
    "ram_headroom_gb": 2
  }
}
```

**Let op de `resource_guard` sectie:** Op 16GB hardware kan de app niet meerdere zware taken tegelijk draaien. De backend moet een request queue implementeren die:
- Maximaal 1 LLM-request tegelijk verwerkt
- Maximaal 1 Whisper-request tegelijk verwerkt
- Voorkomt dat Whisper (quality) en LLM (quality) gelijktijdig draaien
- Altijd 2GB RAM headroom behoudt (anders wordt Windows instabiel)

**`config/prompts/summarize.txt`**
```
Je bent een zakelijke assistent die teksten samenvat. 
Schrijf in het Nederlands tenzij anders gevraagd.
Wees beknopt en feitelijk. Gebruik geen aannames.
Als er actiepunten in de tekst staan, noem deze expliciet.
```

**`config/prompts/translate.txt`**
```
Je bent een professionele vertaler.
Vertaal de tekst nauwkeurig naar de doeltaal.
Behoud de toon en stijl van het origineel.
Vertaal geen eigennamen, afkortingen of technische termen tenzij er een gangbare vertaling bestaat.
Bij formele toon: gebruik "u" in het Nederlands.
Bij informele toon: gebruik "je/jij" in het Nederlands.
```

**`config/prompts/chat.txt`**
```
Je bent een behulpzame AI-assistent voor zakelijk gebruik.
Antwoord in het Nederlands tenzij de gebruiker in een andere taal schrijft.
Wees professioneel, beknopt en feitelijk.
Als je iets niet zeker weet, zeg dat eerlijk.
Genereer geen code, scripts of technische instructies tenzij expliciet gevraagd.
```

**Router implementaties:**

`routers/transcribe.py`:
- POST `/api/transcribe` — multipart form met audio bestand
- Valideer bestandsgrootte (max uit config)
- Valideer MIME type
- Stuur door naar whisper_client
- Log in audit_log
- Return TranscribeResponse

`routers/summarize.py`:
- POST `/api/summarize` — JSON body
- Haal model op via model_manager
- Bouw prompt: system prompt uit config + instructie voor lengte/stijl + gebruikerstekst
- Call ollama_client.generate (niet-streaming voor samenvatting)
- Log in audit_log
- Return SummarizeResponse

`routers/translate.py`:
- POST `/api/translate` — JSON body
- Haal model op via model_manager
- Bouw prompt: system prompt + "Vertaal van {source} naar {target}. Toon: {tone}.\n\nTekst:\n{text}"
- Call ollama_client.generate
- Log in audit_log
- Return TranslateResponse

`routers/chat.py`:
- POST `/api/chat` — JSON body
- Haal model op via model_manager
- Streaming via Server-Sent Events (SSE)
- Gebruik `StreamingResponse` met `text/event-stream` content type
- Elke chunk: `data: {"token": "..."}\n\n`
- Einde: `data: {"done": true, "model": "..."}\n\n`
- Log in audit_log na afloop

`routers/health.py`:
- GET `/api/health`
- Check Ollama verbinding
- Check Whisper verbinding
- Lijst beschikbare modellen
- Systeem RAM info via psutil
- Return HealthResponse

`routers/admin.py`:
- Alle routes vereisen `Authorization: Bearer {ADMIN_TOKEN}` header
- GET `/api/admin/config` — lees huidige configuratie
- PUT `/api/admin/config` — update configuratie (terms_version, onboarding_version, etc.)
- GET `/api/admin/models` — lijst geïnstalleerde modellen
- POST `/api/admin/models/pull` — pull nieuw model (streaming progress)
- DELETE `/api/admin/models/{name}` — verwijder model
- GET `/api/admin/audit` — audit log met paginatie en filters
- GET `/api/admin/system` — systeem info (RAM, disk, GPU)

**`backend/middleware/security.py`**
- CSP header: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'`
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Rate limiting: slowapi met in-memory store, configureerbaar per minuut
- Request size limiet

**`backend/middleware/auth.py`**
- Dependency `require_admin` die Bearer token checkt tegen `ADMIN_TOKEN`
- In development mode: token check overslaan met warning in logs
- Return 401 bij ontbrekende/ongeldige token
- Return 403 bij production mode voor niet-admin routes die admin vereisen

### 1.2 Frontend (Vanilla JS)

**Ontwerpprincipes:**
- Donker kleurthema, zakelijk, rustig
- Geen framework, geen build stap, geen npm
- Alle JS als ES modules (`type="module"`)
- CSS custom properties voor theming
- Mobile-responsive (maar desktop is primair)

**`frontend/css/variables.css`**
```css
:root {
  --bg-primary: #0f1117;
  --bg-secondary: #1a1d27;
  --bg-tertiary: #242836;
  --bg-card: #1e2230;
  --bg-input: #161922;
  --text-primary: #e8eaf0;
  --text-secondary: #9499ac;
  --text-muted: #5d6272;
  --accent-primary: #4a9eed;
  --accent-secondary: #6ec8f5;
  --accent-fast: #f5a623;
  --accent-quality: #7c5cfc;
  --border-color: #2a2e3e;
  --success: #34d399;
  --warning: #fbbf24;
  --error: #f87171;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --font-sans: 'Segoe UI', system-ui, sans-serif;
  --font-mono: 'Cascadia Code', 'Consolas', monospace;
}
```

**`frontend/js/app.js`** — SPA State Machine:
```
States:
  TERMS     → toon voorwaarden scherm
  ONBOARDING → toon introductie/video scherm
  APP       → toon hoofdapplicatie

Bij laden:
  1. GET /api/health → bepaal environment mode
  2. Check localStorage: terms_accepted_version
     - Als niet geaccepteerd of versie verschilt → state = TERMS
  3. Check localStorage: onboarding_completed_version  
     - Als niet voltooid of versie verschilt → state = ONBOARDING
  4. Anders → state = APP

Navigatie in APP state:
  - Hash-based routing: #transcribe, #summarize, #translate, #chat, #admin
  - Sidebar met nav-items, active state volgt hash
  - Default route: #transcribe
```

**`frontend/components/terms.js`**
- Volledig scherm, gecentreerde kaart
- Laad voorwaarden-tekst van `/api/health` response of hardcoded
- Vier secties met iconen:
  1. 🔒 Privacy — lokale verwerking, geen data extern
  2. ⚠️ Gevoelige data — vermijd BSN, wachtwoorden, medisch
  3. 🤖 AI-disclaimer — AI maakt fouten, controleer altijd
  4. 📋 Verantwoord gebruik — professioneel, conform beleid
- Checkbox: "Ik heb de voorwaarden gelezen en ga akkoord"
- Knop "Ga verder" (disabled totdat checkbox aangevinkt)
- Bij acceptatie: sla `terms_accepted_version` op in localStorage + POST naar backend voor audit
- Versienummer komt uit config (via health endpoint)

**`frontend/components/onboarding.js`**
- Volledig scherm na terms-acceptatie
- Bovenaan: groot placeholder-vlak voor video (16:9 ratio, grijze achtergrond met play-icoon)
  - Tekst in placeholder: "Introductievideo volgt binnenkort"
- Daaronder: korte tekst-uitleg in stappen:
  1. "Kies een functie in het menu links"
  2. "Stel de kwaliteit in met de snel/kwaliteit toggle"
  3. "Voer tekst in of upload een bestand"
  4. "AI verwerkt alles lokaal — niets verlaat dit systeem"
- Knop: "Ik heb dit bekeken — ga verder"
- Bij klik: sla `onboarding_completed_version` op in localStorage + POST naar backend
- Als video-URL beschikbaar is in config: toon een echte `<video>` of `<iframe>` in plaats van placeholder

**`frontend/components/model-toggle.js`**
- Herbruikbaar component, wordt gebruikt in elke functie-pagina
- Simpele toggle/switch met twee standen:
  - Links: "⚡ Snel" (oranje accent)
  - Rechts: "🎯 Kwaliteit" (paars accent)
- Onder de toggle: korte beschrijving die verandert per stand
  - Snel: "Sneller resultaat (~15-25 tokens/sec), geschikt voor korte teksten"
  - Kwaliteit: "Nauwkeuriger (~3-8 tokens/sec), geschikt voor complexe teksten"
- **RAM-indicator:** Toon een compacte balk onder de toggle die beschikbaar RAM toont (via health endpoint)
  - Groen (>4 GB vrij): beide modi beschikbaar
  - Oranje (2-4 GB vrij): kwaliteit beschikbaar maar met waarschuwing
  - Rood (<2 GB vrij): kwaliteit uitgeschakeld, tooltip "Onvoldoende geheugen — sluit andere programma's"
- Als quality-model niet beschikbaar of onvoldoende RAM: disable kwaliteit-optie
- Als een andere quality-taak al bezig is (via status endpoint): toon "Wachtrij — een andere taak is bezig"
- Standaard: "Snel"
- Export functie `getQualityMode()` die "fast" of "quality" teruggeeft
- Refresh RAM-status elke 10 seconden via polling op `/api/health`

**`frontend/components/transcribe.js`**
- Twee invoermethoden:
  1. Upload knop: accepteer .wav, .mp3, .m4a, .ogg, .webm (max size uit config)
  2. Microfoon knop: MediaRecorder API, opname starten/stoppen
- Model-toggle component bovenaan
- Optionele taal-dropdown (auto-detect als standaard, plus NL, EN, FR, DE, ES)
- Grote "Transcribeer" knop
- Tijdens verwerking: loading spinner met "Bezig met transcriberen..."
- Resultaat: tekstveld met output, kopieer-knop
- "Gebruik als invoer voor samenvatten" knop → navigeer naar #summarize met tekst in state

**`frontend/components/summarize.js`**
- Invoer: groot tekstveld (min 5 regels) met placeholder "Plak hier je tekst..."
- Opties:
  - Model-toggle (snel/kwaliteit)
  - Lengte: drie knoppen (Kort / Middel / Lang)
  - Stijl: drie knoppen (Lopende tekst / Opsomming / Actiepunten)
- "Samenvatten" knop
- Tijdens verwerking: loading state
- Resultaat: output kaart met samenvatting, kopieer-knop
- Als er tekst via state binnenkomt (van transcribe): vul automatisch het tekstveld

**`frontend/components/translate.js`**
- Twee-koloms layout (side by side):
  - Links: brontekst (tekstveld) + taal-dropdown met auto-detect
  - Rechts: vertaling (read-only tekstveld) + doeltaal-dropdown
- Model-toggle bovenaan
- Toon-selector: Formeel / Informeel (twee knoppen)
- Swap-knop (↔) om bron en doel om te wisselen
- "Vertaal" knop
- Resultaat vult het rechterveld; kopieer-knop op het resultaat

**`frontend/components/chat.js`**
- Klassieke chat-interface:
  - Scrollbaar berichtengebied met gebruiker- en AI-berichten
  - Gebruikersberichten rechts (accent kleur), AI links (kaart achtergrond)
  - AI-berichten renderen Markdown (gebruik een simpele regex-based renderer voor **bold**, *italic*, `code`, code blocks, lijsten — geen externe library)
- Model-toggle bovenaan
- Invoerveld onderaan met verzend-knop
- Tijdens streaming: toon tokens real-time, disable invoerveld
- "Nieuw gesprek" knop die conversatie-history wist
- Optioneel: bestand-upload knop om document als context mee te sturen (tekst wordt aan het bericht toegevoegd)

**`frontend/components/admin-panel.js`**
- Alleen zichtbaar als nav-item als environment mode !== "production" OF als admin is ingelogd
- Login-scherm: token invoerveld
- Na login, tabbladen:
  1. **Modellen** — lijst geïnstalleerde modellen, pull/delete knoppen
  2. **Configuratie** — terms_version, onboarding_version, video_url bewerken
  3. **Audit log** — tabel met recente acties, paginatie
  4. **Systeem** — RAM, disk, GPU info, Ollama/Whisper status

**`frontend/js/api.js`**
```javascript
// Basisstructuur:
const API_BASE = '/api';

export async function post(endpoint, data) { /* fetch + error handling */ }
export async function get(endpoint) { /* fetch + error handling */ }
export async function upload(endpoint, formData) { /* fetch multipart */ }
export async function stream(endpoint, data, onToken) {
  // POST met streaming response
  // Parse SSE events
  // Roep onToken(text) aan per chunk
  // Return volledige tekst bij done
}
export function setAdminToken(token) { /* sla op voor Authorization header */ }
```

**`frontend/js/storage.js`**
```javascript
// Wrapper rond localStorage met versie-awareness
export function getTermsAccepted() → string|null  // versienummer of null
export function setTermsAccepted(version)
export function getOnboardingCompleted() → string|null
export function setOnboardingCompleted(version)
export function getPreferredQuality() → "fast"|"quality"
export function setPreferredQuality(mode)
export function getAdminToken() → string|null
export function setAdminToken(token)
export function clearAll()  // voor debugging/reset
```

### 1.3 Configuratiebestanden

**`.env.example`** (kopieer naar `.env`):
```
# AI Toolkit configuratie — geoptimaliseerd voor 16GB RAM / i5-1350P

OLLAMA_URL=http://localhost:11434
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
WHISPER_URL=http://localhost:8178
ADMIN_TOKEN=wijzig-dit-naar-een-sterk-token
ENVIRONMENT_MODE=development
TERMS_VERSION=v1
ONBOARDING_VERSION=v1
MAX_UPLOAD_SIZE_MB=50
RATE_LIMIT_PER_MINUTE=30
RAM_HEADROOM_GB=2.0
```

**`requirements.txt`**:
```
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
httpx>=0.27.0
aiosqlite>=0.20.0
python-multipart>=0.0.9
pydantic-settings>=2.5.0
psutil>=6.0.0
slowapi>=0.1.9
```

**`config/terms.md`** (voorwaarden-tekst):
```markdown
---
version: v1
---

## Gebruiksvoorwaarden AI Toolkit

### 🔒 Privacy & lokale verwerking
Alle AI-verwerking gebeurt lokaal op dit systeem. Er wordt geen data naar externe servers verstuurd. Desondanks: voer geen onnodige persoonsgegevens in.

### ⚠️ Gevoelige gegevens
Wees bewust van wat je invoert. Vermijd het invoeren van BSN-nummers, wachtwoorden, creditcardgegevens en medische gegevens tenzij strikt noodzakelijk voor je taak.

### 🤖 AI maakt fouten
Kunstmatige intelligentie kan onjuiste, onvolledige of misleidende resultaten geven. Controleer AI-output altijd zelf. Gebruik resultaten nooit als enige bron voor belangrijke beslissingen.

### 📋 Verantwoord gebruik
Gebruik deze tool professioneel en in lijn met het informatiebeveiligingsbeleid van de organisatie. Bij twijfel: raadpleeg je leidinggevende.
```

### 1.4 Docker Compose

**`docker-compose.yml`**:
```yaml
services:
  web:
    build: .
    ports:
      - "8080:8080"
    environment:
      - OLLAMA_URL=http://ollama:11434
      - WHISPER_URL=http://whisper:8178
    env_file:
      - .env
    volumes:
      - ./data:/app/data
      - ./config:/app/config
    depends_on:
      ollama:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 512M
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"]
      interval: 10s
      timeout: 5s
      retries: 5
    environment:
      - OLLAMA_NUM_PARALLEL=1        # voorkom meerdere gelijktijdige requests
      - OLLAMA_MAX_LOADED_MODELS=1   # max 1 model tegelijk in RAM
    deploy:
      resources:
        limits:
          memory: 8G                  # harde grens voor 16GB systeem
    # GEEN GPU reservatie — Intel Iris Xe wordt niet ondersteund door Ollama
    restart: unless-stopped

  whisper:
    image: ghcr.io/ggerganov/whisper.cpp:main-server
    ports:
      - "8178:8178"
    command: ["-m", "/models/ggml-base.bin", "--host", "0.0.0.0", "--port", "8178", "-t", "8"]
    # -t 8: gebruik 8 van de 12 CPU threads (laat ruimte voor Ollama en OS)
    volumes:
      - whisper_models:/models
    deploy:
      resources:
        limits:
          memory: 2G
    restart: unless-stopped

volumes:
  ollama_data:
  whisper_models:
```

**Docker vs. Native op deze hardware:**
Docker Desktop + WSL2 kost ~1-2 GB extra RAM overhead. Op een 16 GB systeem is dat significant. Voeg daarom ook een `scripts/start-native.ps1` toe als alternatief:
```powershell
# start-native.ps1 — Draai zonder Docker (vereist: Python 3.12+, Ollama geïnstalleerd)
Write-Host "=== AI Toolkit — Native modus ===" -ForegroundColor Cyan

# Check Ollama
try { Invoke-RestMethod http://localhost:11434/api/tags | Out-Null }
catch { Write-Host "FOUT: Start eerst Ollama Desktop" -ForegroundColor Red; exit 1 }

# Start backend
Write-Host "Starten op http://localhost:8080 ..."
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

**`Dockerfile`**:
```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ backend/
COPY frontend/ frontend/
COPY config/ config/
RUN mkdir -p data/uploads
EXPOSE 8080
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### 1.5 Setup scripts

**`scripts/setup.sh`**:
```bash
#!/bin/bash
# Eerste installatie — run na docker-compose up
# Geoptimaliseerd voor 16GB RAM systemen (HP EliteBook 640 G10)

# Wacht op Ollama
echo "Wachten op Ollama..."
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do sleep 2; done

echo "=== Modellen downloaden (16GB RAM profiel) ==="

# Fast modellen (altijd installeren, klein genoeg)
echo "[1/3] qwen2.5:1.5b (snel - samenvatten, vertalen)..."
docker exec ai-toolkit-ollama-1 ollama pull qwen2.5:1.5b

echo "[2/3] qwen2.5:3b (snel - chat)..."
docker exec ai-toolkit-ollama-1 ollama pull qwen2.5:3b

# Quality model (optioneel, past nét op 16GB)
echo "[3/3] qwen2.5:7b (kwaliteit - alle functies)..."
echo "  Let op: dit model gebruikt ~5GB RAM. Overslaan? (y/N)"
read -r skip
if [ "$skip" != "y" ]; then
    docker exec ai-toolkit-ollama-1 ollama pull qwen2.5:7b
else
    echo "  Overgeslagen. Kwaliteitsmodus niet beschikbaar."
fi

echo ""
echo "=== Whisper modellen ==="
echo "Download whisper-base.bin naar de whisper_models volume"
echo "Zie: https://huggingface.co/ggerganov/whisper.cpp/tree/main"

echo ""
echo "Setup voltooid. Open http://localhost:8080"
echo "Tip: Op 16GB systemen, gebruik vooral de snelle modus."
```

---

## FASE 2 — HARDENING & OMGEVINGSDETECTIE

Bouw fase 2 PAS nadat fase 1 volledig werkt en getest is.

### 2.1 Windows Sandbox detectie

**`backend/services/environment.py`**:
```python
import os, platform, subprocess

def detect_environment() -> str:
    """
    Detecteer of we in Windows Sandbox draaien.
    Returns: "sandbox" | "production" | "development"
    """
    # 1. Expliciete override via env var
    override = os.environ.get("ENVIRONMENT_MODE")
    if override in ("sandbox", "production", "development"):
        return override
    
    # 2. Niet-Windows = production
    if platform.system() != "Windows":
        return "production"
    
    # 3. Windows Sandbox signalen (check meerdere, wees robuust)
    sandbox_signals = 0
    
    # Signal A: WDAGUtilityAccount gebruiker
    if os.path.exists(r"C:\Users\WDAGUtilityAccount"):
        sandbox_signals += 2  # sterke indicator
    
    # Signal B: Registry key
    try:
        import winreg
        winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 
                       r"SOFTWARE\Microsoft\Windows\CurrentVersion\Sandbox")
        sandbox_signals += 2
    except (FileNotFoundError, OSError):
        pass
    
    # Signal C: Zeer weinig RAM (< 6GB typisch voor sandbox)
    import psutil
    if psutil.virtual_memory().total < 6 * 1024**3:
        sandbox_signals += 1
    
    # Signal D: Geen persistent storage indicatoren
    if not os.path.exists(r"C:\ProgramData"):
        sandbox_signals += 1
    
    return "sandbox" if sandbox_signals >= 2 else "production"
```

- Roep `detect_environment()` aan bij startup in `main.py`
- Sla resultaat op als `app.state.environment_mode`
- Log het resultaat
- Stuur mee in `/api/health` response

### 2.2 Productie-modus restricties

Voeg toe aan `backend/middleware/auth.py`:
```python
def require_admin_in_production(request, settings):
    """
    In production mode: blokkeer admin-acties zonder token.
    In sandbox/development: sta toe met warning.
    """
```

Restricties in production mode:
- `/api/admin/*` routes → vereisen admin token, ALTIJD
- Frontend verbergt admin-nav-item tenzij admin token is ingesteld
- `config/` bestanden zijn read-only (backend weigert writes zonder admin token)
- Model pull/delete → alleen via admin routes
- System prompt wijzigingen → alleen via admin routes

In sandbox mode:
- Alles is toegankelijk (development-achtig)
- Maar toon een banner: "⚠️ Sandbox modus — niet voor productiegebruik"

In development mode:
- Alles toegankelijk
- Extra debug info in health endpoint
- Geen rate limiting

### 2.3 Hardening

**Backend hardening** — voeg toe aan `middleware/security.py`:
```python
# Content Security Policy
CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)

# Voeg toe als middleware:
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
# Referrer-Policy: strict-origin-when-cross-origin
# Permissions-Policy: camera=(), microphone=(self), geolocation=()
```

**Input validatie**:
- Max tekstlengte per functie (afgestemd op context windows van 4K-32K tokens):
  - Samenvatten fast: 8.000 chars (~2K tokens), quality: 50.000 chars (~12K tokens)
  - Vertalen fast: 4.000 chars, quality: 20.000 chars
  - Chat per bericht fast: 2.000 chars, quality: 8.000 chars
- Max audio upload: 50MB (configureerbaar)
- Sanitize alle string-invoer (strip control characters behalve newlines)
- Weiger bestanden met verdachte MIME types
- **Token-schatter:** Implementeer een simpele chars-naar-tokens schatting (factor 0.25 voor NL/EN) en weiger input die >75% van het context window zou vullen (laat ruimte voor system prompt en output)

**Rate limiting**:
- Per IP: configureerbaar via RATE_LIMIT_PER_MINUTE
- Admin routes: apart limiet (10/min)
- Return 429 met `Retry-After` header

**Logging** (GEEN inhoud loggen):
- Log: timestamp, user_identifier, actie, model, quality_mode, input_length, output_length, processing_time, success/error
- Log NIET: de daadwerkelijke tekst-invoer of -output
- Rotatie: houd 30 dagen aan logs

---

## FASE 3 — PACKAGING & DEPLOYMENT

Bouw fase 3 PAS nadat fase 2 volledig werkt en getest is.

### 3.1 Docker packaging verbeteren

Update `Dockerfile` naar multi-stage build:
```dockerfile
# Stage 1: dependencies
FROM python:3.12-slim AS deps
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: runtime
FROM python:3.12-slim
WORKDIR /app
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY backend/ backend/
COPY frontend/ frontend/
COPY config/ config/

# Security: non-root user
RUN useradd -r -s /bin/false appuser && \
    mkdir -p data/uploads && \
    chown -R appuser:appuser /app/data
USER appuser

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/health')"
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "2"]
```

### 3.2 Portable .zip pakket

Maak een script `scripts/build-portable.sh` dat:
1. Een self-contained Python venv maakt
2. Alle bestanden kopieert
3. Een `start.bat` (Windows) en `start.sh` (Linux) toevoegt
4. Alles in een .zip pakt

**`start.bat`** (in portable pakket):
```bat
@echo off
echo ============================================
echo  AI Toolkit — Lokale taalverwerking
echo ============================================
echo.
echo Controleren of Ollama draait...
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
    echo ERROR: Ollama is niet gestart. Start eerst Ollama.
    echo Download: https://ollama.com/download
    pause
    exit /b 1
)
echo Ollama OK.
echo Starten van AI Toolkit op http://localhost:8080 ...
venv\Scripts\python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

### 3.3 OTAP-ondersteuning

Voeg toe aan `backend/config.py`:
```python
# Omgevingen en hun gedrag
ENVIRONMENT_PROFILES = {
    "development": {
        "debug": True,
        "rate_limiting": False,
        "admin_token_required": False,
        "cors_origins": ["*"],
        "log_level": "DEBUG"
    },
    "sandbox": {
        "debug": True,
        "rate_limiting": False,
        "admin_token_required": False,
        "cors_origins": ["*"],
        "log_level": "INFO",
        "show_sandbox_banner": True
    },
    "production": {
        "debug": False,
        "rate_limiting": True,
        "admin_token_required": True,
        "cors_origins": ["http://localhost:8080"],
        "log_level": "WARNING"
    }
}
```

### 3.4 Health check en monitoring

**`scripts/health-check.sh`**:
```bash
#!/bin/bash
# Gebruik als: ./health-check.sh [url]
URL="${1:-http://localhost:8080}"

response=$(curl -s -w "\n%{http_code}" "$URL/api/health")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | head -n -1)

if [ "$http_code" != "200" ]; then
    echo "UNHEALTHY: HTTP $http_code"
    exit 1
fi

status=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
echo "Status: $status"
echo "$body" | python3 -m json.tool

[ "$status" = "healthy" ] && exit 0 || exit 1
```

### 3.5 README.md

Genereer een complete `README.md` met:
- Project beschrijving
- Screenshot placeholder
- Systeemvereisten tabel
- Snelstart: 5 stappen (clone, .env, docker-compose up, setup.sh, open browser)
- Configuratie uitleg (.env variabelen)
- Admin-gids (token instellen, modellen beheren)
- OTAP uitleg
- Architectuur diagram (verwijs naar SVG)
- Troubleshooting sectie
- Licentie

---

## KWALITEITSEISEN

### Code stijl
- Python: type hints overal, docstrings op alle publieke functies
- JavaScript: JSDoc comments op exports, `use strict` impliciet via modules
- Consistente naamgeving: snake_case Python, camelCase JavaScript

### Error handling
- Backend: custom exception classes, global exception handler in FastAPI
- Frontend: try/catch op alle API calls, toon gebruikersvriendelijke foutmeldingen
- Nooit stacktraces aan gebruiker tonen (wel loggen)

### Testen
- Na elke fase: handmatig testen van alle endpoints via curl
- Health endpoint moet "healthy" teruggeven als alles draait
- Elke functie testen met zowel fast als quality mode

### Performance
- Streaming voor chat (geen wachten op volledige response)
- Frontend laadtijd < 1 seconde (geen externe resources)
- Backend start < 3 seconden
- Audio upload: toon progress indicator

### Toegankelijkheid
- Alle interactieve elementen hebben `aria-label`
- Keyboard navigatie werkt voor alle functies
- Focus management bij scherm-transities (terms → onboarding → app)
- Contrast ratio minimaal 4.5:1

---

## VOLGORDE VAN BOUWEN

1. `backend/config.py` + `.env` + `requirements.txt`
2. `backend/database.py`
3. `backend/schemas.py`
4. `backend/services/ollama_client.py`
5. `backend/services/whisper_client.py`
6. `backend/services/model_manager.py`
7. `backend/routers/health.py`
8. `backend/main.py` (minimaal, met health route)
9. **TEST:** `uvicorn backend.main:app` → check `/api/health`
10. `backend/middleware/security.py`
11. `backend/middleware/auth.py`
12. `backend/routers/summarize.py`
13. `backend/routers/translate.py`
14. `backend/routers/chat.py`
15. `backend/routers/transcribe.py`
16. `backend/routers/admin.py`
17. **TEST:** alle API endpoints via curl
18. `config/models.json` + `config/prompts/*.txt` + `config/terms.md`
19. `frontend/css/*.css`
20. `frontend/js/storage.js`
21. `frontend/js/api.js`
22. `frontend/js/app.js`
23. `frontend/components/terms.js`
24. `frontend/components/onboarding.js`
25. `frontend/components/model-toggle.js`
26. `frontend/components/transcribe.js`
27. `frontend/components/summarize.js`
28. `frontend/components/translate.js`
29. `frontend/components/chat.js`
30. `frontend/components/admin-panel.js`
31. `frontend/index.html`
32. **TEST:** volledig via browser
33. `Dockerfile` + `docker-compose.yml`
34. `scripts/setup.sh` + `scripts/setup.ps1`
35. **TEST:** docker-compose up → volledige flow
36. Fase 2: environment.py → hardening → restricties
37. **TEST:** sandbox detectie, admin restricties
38. Fase 3: multi-stage Dockerfile → portable zip → README
39. **TEST:** packaging, health checks
