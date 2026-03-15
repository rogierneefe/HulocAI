#Requires -Version 5.1
<#
.SYNOPSIS
    AI Toolkit — automatische setup in Windows Sandbox.
    Wordt aangeroepen via LogonCommand in ai-toolkit.wsb.
.DESCRIPTION
    - Installeert Python 3.12 als dat er nog niet is
    - Installeert pip-packages
    - Detecteert het host-IP (Ollama draait op de host)
    - Schrijft een .env naar de data-map
    - Start de FastAPI backend
    - Opent de browser op http://localhost:8080
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$APP_DIR   = "C:\AI-Toolkit"
$DATA_DIR  = "C:\AI-Toolkit-Data"
$VENV_DIR  = "$DATA_DIR\.venv"
$LOG_FILE  = "$DATA_DIR\setup.log"
$PORT      = 8080

# ─── helpers ─────────────────────────────────────────────────────────────────

function Log {
    param([string]$Msg, [string]$Color = "Cyan")
    $line = "$(Get-Date -Format 'HH:mm:ss')  $Msg"
    Write-Host $line -ForegroundColor $Color
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
}

function LogError {
    param([string]$Msg)
    Log "FOUT: $Msg" -Color Red
}

# ─── mappen aanmaken ──────────────────────────────────────────────────────────

New-Item -ItemType Directory -Force -Path $DATA_DIR       | Out-Null
New-Item -ItemType Directory -Force -Path "$DATA_DIR\uploads" | Out-Null

Log "=== AI Toolkit — Sandbox Setup ===" -Color White
Log "App map : $APP_DIR"
Log "Data map: $DATA_DIR"

# ─── host-IP bepalen (Ollama draait op Windows host) ─────────────────────────

Log "Host-IP zoeken..."
$hostIP = $null

# Probeer de default gateway (meest betrouwbaar in Sandbox)
try {
    $gw = (Get-NetRoute | Where-Object {
        $_.DestinationPrefix -eq "0.0.0.0/0" -and $_.RouteMetric -lt 1000
    } | Sort-Object RouteMetric | Select-Object -First 1).NextHop
    if ($gw) { $hostIP = $gw }
} catch { }

# Fallback: probeer vEthernet adapter
if (-not $hostIP) {
    try {
        $addr = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                 Where-Object { $_.IPAddress -like "172.*" -or $_.IPAddress -like "10.*" } |
                 Select-Object -First 1).IPAddress
        if ($addr) {
            # Host is .1 in het sandbox-subnet
            $parts = $addr.Split(".")
            $parts[3] = "1"
            $hostIP = $parts -join "."
        }
    } catch { }
}

if (-not $hostIP) {
    $hostIP = "host.internal"
    Log "Host-IP niet gevonden, gebruik fallback: $hostIP" -Color Yellow
} else {
    Log "Host-IP gevonden: $hostIP" -Color Green
}

$OLLAMA_URL = "http://${hostIP}:11434"
Log "Ollama URL: $OLLAMA_URL"

# ─── Python controleren / installeren ────────────────────────────────────────

$pythonExe = $null

# Controleer of Python al beschikbaar is
try {
    $ver = & python --version 2>&1
    if ($ver -match "Python 3\.(1[2-9]|[2-9]\d)") {
        $pythonExe = "python"
        Log "Python gevonden: $ver" -Color Green
    }
} catch { }

if (-not $pythonExe) {
    Log "Python 3.12 downloaden en installeren..." -Color Yellow

    $installer = "$DATA_DIR\python-3.12-installer.exe"
    $url = "https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe"

    try {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($url, $installer)
        Log "Python installer gedownload."
    } catch {
        LogError "Kan Python niet downloaden: $_"
        Read-Host "Druk op Enter om af te sluiten"
        exit 1
    }

    Log "Python installeren (stille modus)..."
    $proc = Start-Process -FilePath $installer `
        -ArgumentList "/quiet", "InstallAllUsers=0", "PrependPath=1", `
                      "Include_pip=1", "Include_launcher=0" `
        -Wait -PassThru
    Remove-Item $installer -ErrorAction SilentlyContinue

    if ($proc.ExitCode -ne 0) {
        LogError "Python installatie mislukt (exitcode $($proc.ExitCode))"
        Read-Host "Druk op Enter om af te sluiten"
        exit 1
    }

    # Herlaad PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","User")

    $pythonExe = "python"
    Log "Python geinstalleerd." -Color Green
}

# ─── Virtuele omgeving aanmaken ───────────────────────────────────────────────

if (-not (Test-Path "$VENV_DIR\Scripts\python.exe")) {
    Log "Virtuele omgeving aanmaken..."
    & $pythonExe -m venv $VENV_DIR
}
$pip    = "$VENV_DIR\Scripts\pip.exe"
$python = "$VENV_DIR\Scripts\python.exe"

# ─── Dependencies installeren ────────────────────────────────────────────────

Log "Python-packages installeren..."
try {
    & $pip install --quiet -r "$APP_DIR\requirements.txt"
    Log "Packages geinstalleerd." -Color Green
} catch {
    LogError "pip install mislukt: $_"
    Read-Host "Druk op Enter om af te sluiten"
    exit 1
}

# ─── .env schrijven ───────────────────────────────────────────────────────────

$envFile = "$DATA_DIR\.env"
@"
OLLAMA_URL=$OLLAMA_URL
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
WHISPER_URL=http://${hostIP}:8178
ADMIN_TOKEN=sandbox-admin-token
ENVIRONMENT_MODE=sandbox
DB_PATH=$DATA_DIR\app.db
UPLOAD_DIR=$DATA_DIR\uploads
TERMS_VERSION=v1
ONBOARDING_VERSION=v1
MAX_UPLOAD_SIZE_MB=50
RATE_LIMIT_PER_MINUTE=30
RAM_HEADROOM_GB=1.5
"@ | Set-Content -Path $envFile -Encoding UTF8

Log ".env aangemaakt: $envFile"

# ─── Ollama bereikbaarheid testen ─────────────────────────────────────────────

Log "Ollama-verbinding testen op $OLLAMA_URL ..."
$ollamaOk = $false
for ($i = 1; $i -le 10; $i++) {
    try {
        $resp = Invoke-RestMethod "$OLLAMA_URL/api/tags" -TimeoutSec 3 -ErrorAction Stop
        $ollamaOk = $true
        Log "Ollama bereikbaar ($($resp.models.Count) modellen)." -Color Green
        break
    } catch {
        Log "Poging $i/10 — Ollama nog niet bereikbaar, wacht 2s..." -Color Yellow
        Start-Sleep 2
    }
}

if (-not $ollamaOk) {
    Log "Waarschuwing: Ollama niet bereikbaar op $OLLAMA_URL" -Color Yellow
    Log "Zorg dat Ollama draait op de host met: OLLAMA_HOST=0.0.0.0 ollama serve" -Color Yellow
    Log "De app start toch op maar transcriberen/samenvatten/vertalen/chat werken niet." -Color Yellow
}

# ─── FastAPI starten ──────────────────────────────────────────────────────────

Log "Backend starten op http://localhost:$PORT ..."

$uvicornArgs = @(
    "-m", "uvicorn",
    "backend.main:app",
    "--host", "0.0.0.0",
    "--port", "$PORT",
    "--env-file", $envFile
)

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName               = $python
$startInfo.Arguments              = $uvicornArgs -join " "
$startInfo.WorkingDirectory       = $APP_DIR
$startInfo.UseShellExecute        = $false
$startInfo.CreateNoWindow         = $false
$startInfo.RedirectStandardOutput = $false
$startInfo.RedirectStandardError  = $false

$env:PYTHONPATH = $APP_DIR

$proc = [System.Diagnostics.Process]::Start($startInfo)
Log "Backend PID: $($proc.Id)"

# Wacht tot de server luistert
Log "Wachten op server..."
$ready = $false
for ($i = 1; $i -le 20; $i++) {
    Start-Sleep 1
    try {
        $null = Invoke-WebRequest "http://localhost:$PORT/api/health" `
            -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        $ready = $true
        Log "Server klaar!" -Color Green
        break
    } catch { }
}

if (-not $ready) {
    Log "Server reageerde niet na 20 seconden. Controleer $LOG_FILE" -Color Yellow
}

# ─── Browser openen ───────────────────────────────────────────────────────────

Log "Browser openen..."
Start-Process "http://localhost:$PORT"

Log ""
Log "=== AI Toolkit draait op http://localhost:$PORT ===" -Color Green
Log "Sluit dit venster NIET — de server stopt dan ook." -Color Yellow
Log ""

# Houd het venster open zodat de server blijft draaien
Wait-Process -Id $proc.Id
