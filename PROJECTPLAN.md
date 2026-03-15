# AI Toolkit — Projectplan

## 1. Visie & Scope

**Wat:** Een lokale web-applicatie voor zakelijke medewerkers die AI-taalverwerking biedt zonder dat data de organisatie verlaat. Vier kernfuncties: transcriberen, samenvatten, vertalen en chatten.

**Waarom lokaal:** Gevoelige bedrijfsdocumenten, vergadernotities en interne communicatie mogen niet naar externe cloud-API's. Door lokale LLM's te draaien blijft alles binnen het netwerk.

**Doelgroep:** Interne medewerkers, niet-technisch. De interface moet zo simpel zijn als een webformulier.

**Fasering:**
- **Fase 1** — Werkende app met lokale modellen, onboarding, gebruiksvoorwaarden
- **Fase 2** — Sandbox-detectie, hardening, rolgebaseerde restricties
- **Fase 3** — Packaging, deployment, OTAP/LCM-beheer

---

## 2. Architectuur

### 2.1 Stack-overzicht

```
┌─────────────────────────────────────────────────┐
│  Browser (frontend)                             │
│  HTML/CSS/JS — Single Page Application          │
│  Geen framework-dependency (vanilla of Lit)     │
└──────────────────┬──────────────────────────────┘
                   │ HTTP/REST
┌──────────────────▼──────────────────────────────┐
│  Backend — Python (FastAPI)                     │
│  - API-routes per functie                       │
│  - Model-management & queueing                  │
│  - Configuratie & rechten                       │
│  - Streaming responses (SSE)                    │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  LLM Runtime — Ollama                           │
│  - Lokale modellen via REST API                 │
│  - Whisper.cpp voor transcriptie (apart proces) │
└─────────────────────────────────────────────────┘
```

### 2.2 Waarom deze keuzes

| Keuze | Reden |
|-------|-------|
| **FastAPI (Python)** | Async, SSE-streaming, eenvoudig te packagen, grote AI/ML ecosystem |
| **Ollama** | Eenvoudigste manier om lokale LLM's te draaien; REST API out-of-the-box; model-management ingebouwd |
| **Whisper.cpp** | Snelste lokale speech-to-text; draait op CPU, optioneel GPU |
| **Vanilla JS / Lit** | Geen build-stap nodig, lichtgewicht, makkelijk te onderhouden |
| **SQLite** | Lokale opslag voor configuratie, voorwaarden-acceptatie, versies |

### 2.3 Alternatief: llama.cpp direct (zonder Ollama)

Ollama is in feite een wrapper om llama.cpp. Voor maximale controle kun je ook llama.cpp direct aanspreken (via `llama-server`). Nadeel: je moet zelf modellen downloaden en beheren. Aanbeveling: start met Ollama, overweeg llama.cpp als je specifieke quantisatie-opties nodig hebt.

---

## 3. Functionaliteiten

### 3.1 Transcriberen (spraak → tekst)

| Aspect | Snel (⚡) | Kwaliteit (🎯) |
|--------|-----------|----------------|
| **Model** | `whisper-tiny` of `whisper-base` | `whisper-medium` of `whisper-large-v3` |
| **Snelheid** | ~10x realtime op CPU | ~1-2x realtime op CPU |
| **Nauwkeurigheid** | Goed voor duidelijke spraak | Goed voor accenten, ruis, jargon |
| **RAM** | ~1 GB | ~5-10 GB |

**Invoer:** Audio-upload (.wav, .mp3, .m4a, .ogg) of microfoon-opname in browser.
**Uitvoer:** Tekst met optionele timestamps en sprekerdetectie (diarization in quality-mode).
**Extra:** Taaldetectie automatisch; gebruiker kan taal ook handmatig kiezen.

### 3.2 Samenvatten

| Aspect | Snel (⚡) | Kwaliteit (🎯) |
|--------|-----------|----------------|
| **Model** | `qwen2.5:3b` of `phi3:mini` | `qwen2.5:14b` of `mistral:7b` |
| **Context** | ~4K tokens | ~32K tokens |
| **Geschikt voor** | Korte teksten, e-mails | Lange rapporten, notulen |
| **RAM** | ~3 GB | ~10-16 GB |

**Invoer:** Plak tekst, upload .txt/.docx/.pdf, of gebruik output van transcriptie.
**Uitvoer:** Samenvatting met instelbare lengte (kort/middel/lang) en stijl (bullets/lopende tekst).
**Extra:** Optie om kernpunten/actiepunten te extraheren.

### 3.3 Vertalen

| Aspect | Snel (⚡) | Kwaliteit (🎯) |
|--------|-----------|----------------|
| **Model** | `qwen2.5:3b` (general purpose) | `qwen2.5:14b` of `mistral:7b` |
| **Snelheid** | ~50 tokens/sec | ~10-20 tokens/sec |
| **Geschikt voor** | Korte berichten, e-mails | Formele documenten, nuance |
| **RAM** | ~3 GB | ~10-16 GB |

**Talen:** NL↔EN als primair; FR, DE, ES als secundair; overige op verzoek.
**Invoer:** Tekstveld of document-upload.
**Uitvoer:** Vertaling met origineel ernaast (side-by-side view).
**Extra:** Taaldetectie op invoer; tone-of-voice optie (formeel/informeel).

### 3.4 Chat

| Aspect | Snel (⚡) | Kwaliteit (🎯) |
|--------|-----------|----------------|
| **Model** | `qwen2.5:3b` of `phi3:mini` | `qwen2.5:14b` of `llama3.1:8b` |
| **Context** | ~4K tokens | ~32K-128K tokens |
| **Geschikt voor** | Snelle vragen, brainstorm | Complexe analyse, advies |
| **RAM** | ~3 GB | ~10-16 GB |

**Features:** Conversatie-geheugen binnen sessie, system prompt instelbaar door beheerder, streaming responses.
**Invoer:** Tekst; optioneel document als context meegeven.
**Uitvoer:** Streaming tekst met Markdown-rendering.

### 3.5 Modelkeuze-UX: "Snel vs. Kwaliteit"

De gebruiker ziet **geen modelnamen** — alleen een simpele toggle:

```
┌─────────────────────────────────┐
│  ⚡ Snel          🎯 Kwaliteit  │
│  ◉───────────────○              │  ← slider of toggle
│  Sneller, minder nauwkeurig     │
└─────────────────────────────────┘
```

- De beheerder koppelt in de config welk model achter "snel" en "kwaliteit" zit
- Bij onvoldoende RAM/VRAM: kwaliteitsoptie grijs met tooltip "Onvoldoende systeembronnen"
- Standaard staat op "snel" om de laagste drempel te bieden

---

## 4. Onboarding & Gebruiksvoorwaarden

### 4.1 Gebruiksvoorwaarden (bij elke eerste keer / na update)

Bij het allereerste bezoek ziet de gebruiker een volledig scherm met:

**Inhoud (kort en begrijpelijk):**
1. **Privacy** — "Alle verwerking gebeurt lokaal. Geen data verlaat dit systeem. Toch: voer geen onnodige persoonsgegevens in."
2. **Gevoelige data** — "Wees bewust van wat je invoert. Vermijd BSN-nummers, wachtwoorden en medische gegevens tenzij strikt noodzakelijk."
3. **AI-disclaimer** — "AI maakt fouten. Controleer output altijd. Gebruik AI-resultaten nooit als enige bron voor belangrijke beslissingen."
4. **Verantwoord gebruik** — "Gebruik deze tool professioneel en in lijn met het informatiebeleid van de organisatie."

**Acceptatie:** Checkbox "Ik heb de voorwaarden gelezen en ga akkoord" + knop "Ga verder".

**Technisch:**
- Acceptatie wordt opgeslagen met een versienummer (bv. `terms_v1`)
- Bij update van voorwaarden (nieuw versienummer) → opnieuw tonen
- Opslag: localStorage + optioneel SQLite backend (voor audit)

### 4.2 Verplichte uitleg / introductievideo

Na acceptatie van voorwaarden:

1. **Eerste keer:** Toon een uitlegscherm (placeholder voor video + korte tekst-uitleg)
   - Knop: "Ik heb dit bekeken, ga verder"
   - Wordt opgeslagen als `onboarding_v1` (met versienummer)
2. **Video vernieuwd:** Als de beheerder het versienummer verhoogt (`onboarding_v2`), wordt het scherm opnieuw verplicht getoond
3. **Video nog niet beschikbaar:** Er wordt een placeholder getoond met tekst: "Introductievideo volgt — lees onderstaande instructies"

**Flow:**
```
Start → Voorwaarden geaccepteerd? 
         ├─ Nee → Toon voorwaarden → Accepteer → Check onboarding
         └─ Ja → Check onboarding
                   ├─ Niet gezien (of nieuwe versie) → Toon onboarding → Bevestig
                   └─ Al gezien → Ga naar app
```

---

## 5. Fase 2 — Omgevingsdetectie & Hardening

### 5.1 Windows Sandbox detectie

Windows Sandbox is een lichtgewicht, wegwerp-omgeving. Detectie via meerdere signalen:

**Backend-detectie (Python):**
```
1. Registry: HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Sandbox → bestaat = sandbox
2. Computernaam: begint typisch met "YOURPC-" + random
3. Bestandssysteem: C:\Users\WDAGUtilityAccount\ → sandbox-gebruiker
4. Hardware: Zeer weinig RAM (typisch 4GB), virtuele hardware-IDs
5. Process: LogonUI.exe draait niet in sandbox
```

**Resultaat:** Variabele `ENVIRONMENT_MODE` met waarden:
- `sandbox` — Windows Sandbox gedetecteerd
- `production` — Standaard (geen sandbox-signalen)
- `development` — Handmatig in te stellen via env-variabele

### 5.2 Productie-modus restricties

In `production` modus zijn de volgende zaken **geblokkeerd voor gewone gebruikers:**

| Actie | Gebruiker | Beheerder |
|-------|-----------|-----------|
| Modellen toevoegen/verwijderen | ❌ | ✅ |
| Configuratie wijzigen | ❌ | ✅ |
| API-endpoints toevoegen | ❌ | ✅ |
| System prompts aanpassen | ❌ | ✅ |
| Broncode inzien/wijzigen | ❌ | ✅ |
| Voorwaarden-tekst wijzigen | ❌ | ✅ |
| Logs inzien | ❌ | ✅ |
| App gebruiken | ✅ | ✅ |
| Snelheid-toggle gebruiken | ✅ | ✅ |

**Beheerder-authenticatie:**
- Simpel: Wachtwoord in environment variable (`ADMIN_PASSWORD`)
- Beter: Koppeling met Active Directory / LDAP (latere fase)
- Beheerder krijgt toegang tot `/admin` panel

### 5.3 Hardening-maatregelen

**Backend:**
- CSP-headers (Content Security Policy) — geen inline scripts in productie
- CORS beperkt tot localhost / intern netwerk
- Rate limiting op API-endpoints
- Input-sanitatie op alle invoer (max lengte, geen code-injectie)
- Geen shell-access via API
- Logging van alle API-calls (wie, wat, wanneer — zonder de inhoud)

**Frontend:**
- Geen eval(), geen dynamic imports
- Subresource Integrity (SRI) op alle scripts
- Geen externe CDN's (alles lokaal gebundeld)

**Infrastructuur:**
- App draait als non-root service
- Firewall: alleen poorten 8080 (web) en 11434 (Ollama, alleen lokaal)
- Ollama API niet extern bereikbaar
- Bestanden read-only behalve uploads-directory

---

## 6. Fase 3 — Packaging & OTAP/LCM

### 6.1 Packaging-opties

**Optie A: Docker Compose (aanbevolen)**
```yaml
services:
  web:        # FastAPI + frontend
  ollama:     # LLM runtime
  whisper:    # Whisper.cpp server
```
- Voordelen: reproduceerbaar, versiebeheer, eenvoudige updates
- Nadelen: vereist Docker Desktop (of Podman) op Windows

**Optie B: Standalone installer (MSI/NSIS)**
- Bundel Python + Ollama + Whisper in één installer
- Voordelen: geen Docker nodig, vertrouwd voor IT-beheerders
- Nadelen: complexer te bouwen en updaten

**Optie C: Portable pakket (.zip)**
- Embedded Python + alles in één map
- Voordelen: geen installatie, draait vanaf USB/netwerk
- Nadelen: minder beheerbaar, geen auto-updates

**Aanbeveling:** Start met **Docker Compose** voor beheersbaarheid. Maak daarnaast een **portable .zip** voor sandbox/demo-gebruik.

### 6.2 OTAP-omgevingen

| Omgeving | Doel | Infra |
|----------|------|-------|
| **O** (Ontwikkeling) | Nieuwe features bouwen | Lokale machine ontwikkelaar |
| **T** (Test) | Functioneel testen, regressie | Windows Sandbox of test-VM |
| **A** (Acceptatie) | Gebruikersacceptatie, beheerder-review | Staging-server (intern netwerk) |
| **P** (Productie) | Live gebruik door medewerkers | Productie-server of werkstations |

**Promotie-flow:**
```
O → T → A → P
     │        │
     └── Automatische tests (CI)
              └── Handmatige goedkeuring beheerder
```

### 6.3 LCM (Lifecycle Management)

**Versiebeheer:**
- Semantic versioning: `MAJOR.MINOR.PATCH` (bv. `1.2.3`)
- Git met tagged releases
- CHANGELOG.md bij elke release

**Modelversies apart beheren:**
- Modellen zijn groot (2-16 GB) en veranderen minder vaak
- Houd een `models.json` manifest bij met:
  - Modelnaam, versie, sha256-hash, minimale RAM-vereiste
  - Welk model aan "snel" / "kwaliteit" gekoppeld is per functie
- Model-updates apart van app-updates deployen

**Update-strategie:**
- **App-updates:** Nieuwe Docker image → pull → restart
- **Model-updates:** `ollama pull <model>` via admin-panel of script
- **Configuratie-updates:** Via admin-panel → opgeslagen in SQLite
- **Voorwaarden-updates:** Verhoog versienummer → gebruikers zien opnieuw

**Monitoring:**
- Health-endpoint: `/api/health` (check backend + Ollama + beschikbare modellen)
- Disk-space monitoring (modellen zijn groot)
- RAM/VRAM-gebruik per model

**Backup:**
- Configuratie + SQLite database (klein, dagelijks)
- Modellen hoeven niet gebackupt (opnieuw te downloaden)

---

## 7. Bestandsstructuur

```
ai-toolkit/
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── README.md
├── CHANGELOG.md
│
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── config.py               # Configuratie, env-detectie
│   ├── models.py               # Pydantic schemas
│   ├── database.py             # SQLite setup
│   │
│   ├── routers/
│   │   ├── transcribe.py       # /api/transcribe
│   │   ├── summarize.py        # /api/summarize
│   │   ├── translate.py        # /api/translate
│   │   ├── chat.py             # /api/chat
│   │   ├── admin.py            # /api/admin (beveiligd)
│   │   └── health.py           # /api/health
│   │
│   ├── services/
│   │   ├── ollama_client.py    # Ollama REST API wrapper
│   │   ├── whisper_client.py   # Whisper.cpp integratie
│   │   ├── model_manager.py    # Model selectie snel/kwaliteit
│   │   └── environment.py      # Sandbox/prod detectie
│   │
│   └── middleware/
│       ├── security.py         # CSP, CORS, rate limiting
│       └── auth.py             # Admin authenticatie
│
├── frontend/
│   ├── index.html
│   ├── css/
│   │   ├── variables.css       # Design tokens
│   │   ├── layout.css          # Shell, sidebar, grid
│   │   └── components.css      # Buttons, forms, cards
│   │
│   ├── js/
│   │   ├── app.js              # Router, state management
│   │   ├── api.js              # Backend API client
│   │   ├── storage.js          # LocalStorage helper
│   │   └── environment.js      # Env-badge, mode display
│   │
│   └── components/
│       ├── terms.js            # Voorwaarden-scherm
│       ├── onboarding.js       # Introductie/video-scherm
│       ├── transcribe.js       # Transcriptie-UI
│       ├── summarize.js        # Samenvatting-UI
│       ├── translate.js        # Vertaal-UI
│       ├── chat.js             # Chat-UI
│       ├── model-toggle.js     # Snel/kwaliteit toggle
│       └── admin-panel.js      # Beheerder-paneel
│
├── config/
│   ├── models.json             # Model-manifest
│   ├── terms.md                # Voorwaarden-tekst (versioned)
│   └── prompts/
│       ├── summarize.txt       # System prompt samenvatten
│       ├── translate.txt       # System prompt vertalen
│       └── chat.txt            # System prompt chat
│
├── scripts/
│   ├── setup.sh                # Eerste installatie
│   ├── update.sh               # Update script
│   └── health-check.sh         # Monitoring
│
└── data/                       # Persistent (volume mount)
    ├── app.db                  # SQLite database
    └── uploads/                # Tijdelijke uploads
```

---

## 8. Doelhardware & Systeemvereisten

### Referentie-werkstation
| Component | Specificatie |
|-----------|-------------|
| Model | HP EliteBook 640 14 inch G10 |
| OS | Windows 11 Education (10.0.26100) |
| CPU | 13th Gen Intel i5-1350P, 12 cores, 1900 MHz |
| RAM | 16 GB fysiek |
| GPU | Intel Iris Xe (geïntegreerd) |
| Architectuur | x64 |

### RAM-budget
| Proces | RAM |
|--------|-----|
| Windows 11 + achtergrond | ~5 GB |
| Browser | ~0.5-1 GB |
| FastAPI backend | ~0.3 GB |
| Whisper.cpp | 0.5-1.5 GB |
| **Beschikbaar voor LLM** | **~8-9 GB** |

### Modelkeuze (aangepast aan 16 GB)
| Functie | Snel (⚡) | Kwaliteit (🎯) |
|---------|-----------|----------------|
| Samenvatten | qwen2.5:1.5b (~1.5 GB) | qwen2.5:7b (~5 GB) |
| Vertalen | qwen2.5:1.5b (~1.5 GB) | qwen2.5:7b (~5 GB) |
| Chat | qwen2.5:3b (~2.5 GB) | qwen2.5:7b (~5 GB) |
| Transcriptie | whisper-base (~0.5 GB) | whisper-small (~1.5 GB) |

**Let op:** 14B+ modellen passen NIET op deze hardware. Whisper large-v3 evenmin. Bij quality-modus: maximaal één zware taak tegelijk.

---

## 9. Open vragen & beslispunten

1. **Frontend framework:** Vanilla JS (simpelst) vs. Lit (web components, iets meer structuur) vs. React (meest features, maar build-stap nodig)?

2. **Multi-user:** Draait de app per werkstation, of centraal op een server voor meerdere gebruikers? Dit beïnvloedt GPU-sharing en queueing.

3. **Cloud API als latere fase:** Welke providers? OpenAI, Anthropic, Azure OpenAI? Dit bepaalt de abstractielaag die we nu al moeten bouwen.

4. **Authenticatie:** Simpel wachtwoord voor admin vs. Active Directory/LDAP integratie? Hebben gewone gebruikers ook een login nodig?

5. **Taalondersteuning UI:** Alleen Nederlands, of ook Engels?

6. **Audit logging:** Hoeveel detail? Alleen "gebruiker X deed actie Y" of ook metadata over invoerlengte, model, verwerkingstijd?

7. **Offline-first:** Moet de app volledig offline werken (geen internet nodig na installatie)?

---

## 10. Volgende stappen

1. **Nu:** Dit plan reviewen, open vragen beantwoorden
2. **Dan:** Fase 1 bouwen in Claude Code op basis van dit plan
3. **Itereren:** Fase 2 en 3 als het fundament staat
