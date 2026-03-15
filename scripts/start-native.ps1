# start-native.ps1 — Draai zonder Docker (vereist: Python 3.12+, Ollama geinstalleerd)
Write-Host "=== AI Toolkit — Native modus ===" -ForegroundColor Cyan

# Check Ollama
try { Invoke-RestMethod http://localhost:11434/api/tags | Out-Null }
catch { Write-Host "FOUT: Start eerst Ollama Desktop" -ForegroundColor Red; exit 1 }

# Start backend
Write-Host "Starten op http://localhost:8080 ..."
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
