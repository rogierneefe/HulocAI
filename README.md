# HulocAI — AI Toolkit voor Hogeschool Utrecht

Lokale AI-taalverwerking voor medewerkers. Alle verwerking vindt volledig lokaal plaats — geen data verlaat het netwerk.

## Functies

| Functie | Beschrijving |
|---|---|
| **Transcriberen** | Audio/video omzetten naar tekst via Whisper |
| **Samenvatten** | Tekst samenvatten in kort of uitgebreid formaat |
| **Vertalen** | Tekst vertalen tussen meerdere talen |
| **Chat** | Vrije vragen stellen aan de AI-assistent |

## Architectuur

- **Backend** — FastAPI (Python 3.12), poort 8080
- **Frontend** — Vanilla JS SPA, geen framework, geen build-stap
- **Database** — SQLite via `aiosqlite`
- **LLM** — Ollama of LM Studio (OpenAI-compatibele API)
- **Spraak** — Whisper.cpp of mlx-whisper (Apple Silicon)

---

## Installatie op Windows 11

### 1. Git installeren

1. Download Git voor Windows via [git-scm.com/download/win](https://git-scm.com/download/win)
2. Voer de `.exe` installer uit
3. Kies bij "Adjusting your PATH environment" de optie **"Git from the Windows Command Prompt"**
4. Volg de rest van de wizard met standaardinstellingen

Controleer in PowerShell:
```powershell
git --version
```

### 2. Repository klonen

Open PowerShell en voer uit:
```powershell
git clone https://github.com/rogierneefe/HulocAI.git
cd HulocAI
```

### 3. Python en virtuele omgeving

Controleer of Python 3.12+ beschikbaar is:
```powershell
python --version
# of:
py --version
```

Maak een virtuele omgeving aan en activeer deze:
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

> **Let op:** als PowerShell meldt dat scripts niet mogen worden uitgevoerd, voer dan eenmalig uit:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

Installeer afhankelijkheden:
```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. LM Studio installeren en configureren

1. Download LM Studio via [lmstudio.ai/download](https://lmstudio.ai/download) en installeer het
2. Open LM Studio en download een model (zie modeladvies hieronder)
3. Ga naar het **Developer** tabblad (`</>` icoon links)
4. Klik op **Start Server** — de server draait op `http://localhost:1234`

> De server moet actief zijn voordat je de AI Toolkit start. Schakel **"Start server on app startup"** in zodat dit automatisch gebeurt.

#### Aanbevolen modellen voor Windows (Intel i5-1350P, 16 GB RAM)

Zoek in LM Studio op `Qwen3` en kies een GGUF-variant:

| Model | Kwantisatie | RAM-gebruik | Advies |
|---|---|---|---|
| Qwen3.5-0.8B-GGUF | Q4_K_M of Q5_K_M | ~1 GB | Snel, licht |
| Qwen3.5-2B-GGUF | Q4_K_M of Q5_K_M | ~2 GB | Goede balans |
| Qwen3.5-4B-GGUF | Q4_K_M | ~3-4 GB | Nauwkeuriger |

Vermijd modellen van 9B en groter — deze vereisen meer RAM dan beschikbaar is op een 16 GB laptop.

### 5. Omgevingsvariabelen instellen

Kopieer het voorbeeldbestand:
```powershell
copy .env.example .env
```

Bewerk `.env` en stel in:
```env
LLM_BACKEND=lmstudio
LMSTUDIO_URL=http://localhost:1234
WHISPER_BACKEND=whisper_cpp
```

### 6. Server starten

```powershell
uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

Open vervolgens `http://localhost:8080` in de browser.

---

## Installatie op macOS (Apple Silicon)

### Vereisten

- Python 3.12+
- [LM Studio](https://lmstudio.ai) met een geladen MLX-model
- `mlx-whisper` voor lokale transcriptie

### Stappen

```bash
git clone https://github.com/rogierneefe/HulocAI.git
cd HulocAI

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Bewerk .env — zie configuratie hieronder
```

### Configuratie voor macOS

```env
LLM_BACKEND=lmstudio
LMSTUDIO_URL=http://localhost:1234
WHISPER_BACKEND=local
MLX_WHISPER_MODEL=mlx-community/whisper-large-v3-turbo
```

Aanbevolen model: `lmstudio-community/Qwen2.5-7B-Instruct-MLX-4bit`

Server starten:
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

---

## Configuratie

Zie `config/models.json` voor modelconfiguratie per functie en kwaliteitsmodus.
Zie `config/prompts/` voor aanpasbare systeemprompts per functie.
Zie `config/terms.md` voor de gebruiksvoorwaarden (Markdown met `version`-frontmatter).

---

## Versie

`0.11` — Windows 11-ondersteuning, HU-huisstijl, licht/donker modus, Kort/Uitgebreid toggle
