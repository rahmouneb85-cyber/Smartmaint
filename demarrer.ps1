# Démarre SmartMaint : libère les ports, lance le backend (8001) et le frontend (3000), vérifie que tout répond.
# Utilisation : double-clic sur demarrer.bat (ou, dans PowerShell : .\demarrer.ps1)
$ErrorActionPreference = "Stop"
$racine   = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend  = Join-Path $racine "backend"
$frontend = Join-Path $racine "frontend"

function Liberer-Port([int]$port, [string]$nom) {
    $connexions = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $connexions) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        if ($p) {
            Write-Host "  Port $port occupé par $($p.ProcessName) (PID $($p.Id)) : arrêt" -ForegroundColor Yellow
            taskkill /PID $p.Id /T /F | Out-Null
        } else {
            # processus fantôme : on arrête ses éventuels processus enfants qui gardent le port
            $enfants = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $c.OwningProcess }
            foreach ($e in $enfants) { taskkill /PID $e.ProcessId /T /F | Out-Null }
        }
    }
    Start-Sleep -Milliseconds 800
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "  ❌ Le port $port ($nom) reste bloqué par un processus fantôme : redémarrez l'ordinateur." -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✅ Port $port libre ($nom)" -ForegroundColor Green
}

Write-Host "`n=== Démarrage de SmartMaint ===" -ForegroundColor Cyan

Write-Host "`n1. Vérifications"
if (-not (Test-Path (Join-Path $backend ".env"))) {
    Write-Host "  ❌ Fichier backend\.env absent : copiez .env.example en .env et remplissez-le." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Fichier .env présent" -ForegroundColor Green
$mysql = Get-Service -Name "MySQL*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mysql -and $mysql.Status -ne "Running") {
    Write-Host "  ⚠️  Le service $($mysql.Name) est arrêté : démarrage" -ForegroundColor Yellow
    try { Start-Service $mysql.Name } catch { Write-Host "  ❌ Impossible de démarrer MySQL (lancez ce script en administrateur)" -ForegroundColor Red; exit 1 }
}
if ($mysql) { Write-Host "  ✅ MySQL démarré ($($mysql.Name))" -ForegroundColor Green }
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "  ⚠️  frontend\node_modules absent : installation (quelques minutes)" -ForegroundColor Yellow
    Push-Location $frontend; npm install --legacy-peer-deps; Pop-Location
}

Write-Host "`n2. Libération des ports"
Liberer-Port 8001 "backend"
Liberer-Port 3000 "frontend"

Write-Host "`n3. Lancement"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='SmartMaint backend'; Set-Location '$backend'; python -m uvicorn app.main:app --reload --port 8001"
Write-Host "  Backend lancé dans une nouvelle fenêtre"

$pret = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://127.0.0.1:8001/health").StatusCode -eq 200) { $pret = $true; break } } catch {}
}
if (-not $pret) {
    Write-Host "  ❌ Le backend ne répond pas après 60 s : regardez la fenêtre « SmartMaint backend »." -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ Backend prêt : http://127.0.0.1:8001" -ForegroundColor Green

Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle='SmartMaint frontend'; Set-Location '$frontend'; npm start"
Write-Host "  ✅ Frontend lancé : il s'ouvrira dans le navigateur (http://localhost:3000)" -ForegroundColor Green

Write-Host "`nPour tout arrêter proprement : double-clic sur arreter.bat`n" -ForegroundColor Cyan
