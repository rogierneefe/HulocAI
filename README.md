# HulocAI — AI Toolkit voor Hogeschool Utrecht

Lokale AI-taalverwerking voor zakelijke medewerkers. Alle verwerking vindt volledig lokaal plaats — geen data verlaat het netwerk.

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

## Vereisten

- Python 3.12+
- [Ollama](https://ollama.ai) **of** [LM Studio](https://lmstudio.ai)
- Aanbevolen model: `qwen2.5:7b` (Ollama) of een GGUF/MLX equivalent in LM Studio

## Installatie

```bash
# 1. Kloon de repository
git clone https://github.com/rogierneefe/HulocAI.git
cd HulocAI

# 2. Maak een virtuele omgeving aan
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Installeer afhankelijkheden
pip install -r requirements.txt

# 4. Kopieer en pas de omgevingsvariabelen aan
cp .env.example .env
# Bewerk .env naar eigen omgeving

# 5. Start de server
uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

Open vervolgens `http://localhost:8080` in de browser.

## Configuratie

### Ollama (standaard)
```env
LLM_BACKEND=ollama
WHISPER_BACKEND=whisper_cpp
```

### LM Studio (Mac / Apple Silicon)
```env
LLM_BACKEND=lmstudio
LMSTUDIO_URL=http://localhost:1234
WHISPER_BACKEND=local
MLX_WHISPER_MODEL=mlx-community/whisper-large-v3-turbo
```

Zie `config/models.json` voor modelconfiguratie per functie en kwaliteitsmodus.

## Doelomgeving

Primair ontwikkeld voor:
- **Windows** — HP EliteBook 640 G10 (Intel i5-1350P, 16 GB RAM) met Ollama
- **Mac** — Apple Silicon met LM Studio + mlx-whisper

## Versie

`0.1` — initiële release
