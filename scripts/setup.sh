#!/bin/bash
# Eerste installatie — run na docker-compose up
# Geoptimaliseerd voor 16GB RAM systemen (HP EliteBook 640 G10)

set -e

echo "=== AI Toolkit Setup ==="
echo ""

# Wacht op Ollama
echo "Wachten op Ollama..."
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
  echo "  Ollama nog niet beschikbaar, wacht 2 seconden..."
  sleep 2
done
echo "Ollama OK."
echo ""

echo "=== Modellen downloaden (16GB RAM profiel) ==="

# Fast modellen (altijd installeren, klein genoeg)
echo "[1/3] qwen2.5:1.5b (snel - samenvatten, vertalen)..."
docker exec ai-toolkit-ollama-1 ollama pull qwen2.5:1.5b

echo "[2/3] qwen2.5:3b (snel - chat)..."
docker exec ai-toolkit-ollama-1 ollama pull qwen2.5:3b

# Quality model (optioneel, past nét op 16GB)
echo ""
echo "[3/3] qwen2.5:7b (kwaliteit - alle functies)"
echo "  Let op: dit model gebruikt ~5GB RAM."
read -r -p "  Overslaan? (y/N) " skip
if [ "$skip" != "y" ] && [ "$skip" != "Y" ]; then
    docker exec ai-toolkit-ollama-1 ollama pull qwen2.5:7b
else
    echo "  Overgeslagen. Kwaliteitsmodus niet beschikbaar."
fi

echo ""
echo "=== Whisper modellen ==="
echo "Download ggml-base.bin naar de whisper_models volume."
echo "Zie: https://huggingface.co/ggerganov/whisper.cpp/tree/main"
echo ""
echo "Voorbeeld:"
echo "  docker run --rm -v ai-toolkit_whisper_models:/models \\"
echo "    curlimages/curl -L -o /models/ggml-base.bin \\"
echo "    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'"
echo ""
echo "=== Setup voltooid ==="
echo "Open http://localhost:8080"
echo "Tip: Op 16GB systemen, gebruik vooral de snelle modus."
