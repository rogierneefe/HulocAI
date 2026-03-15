# setup.ps1 — Eerste installatie op Windows
# Geoptimaliseerd voor HP EliteBook 640 G10 (16GB RAM)

Write-Host "=== AI Toolkit Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check Ollama
Write-Host "Controleren of Ollama draait..." -ForegroundColor Yellow
try {
    Invoke-RestMethod http://localhost:11434/api/tags | Out-Null
    Write-Host "Ollama OK." -ForegroundColor Green
} catch {
    Write-Host "FOUT: Ollama niet bereikbaar. Start eerst Ollama Desktop." -ForegroundColor Red
    Write-Host "Download: https://ollama.com/download" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=== Modellen downloaden ===" -ForegroundColor Cyan

Write-Host "[1/3] qwen2.5:1.5b (snel - samenvatten, vertalen)..."
ollama pull qwen2.5:1.5b

Write-Host "[2/3] qwen2.5:3b (snel - chat)..."
ollama pull qwen2.5:3b

Write-Host ""
Write-Host "[3/3] qwen2.5:7b (kwaliteit, ~5GB RAM)" -ForegroundColor Yellow
$skip = Read-Host "Overslaan? (y/N)"
if ($skip -ne "y" -and $skip -ne "Y") {
    ollama pull qwen2.5:7b
} else {
    Write-Host "Overgeslagen. Kwaliteitsmodus niet beschikbaar." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Setup voltooid ===" -ForegroundColor Green
Write-Host "Start de app met: scripts\start-native.ps1"
Write-Host "Of via Docker: docker-compose up -d"
