# Arrête proprement le backend et le frontend de SmartMaint (évite les ports bloqués).
foreach ($port in 8001, 3000) {
    foreach ($c in (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
        taskkill /PID $c.OwningProcess /T /F 2>$null | Out-Null
        Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $c.OwningProcess } |
            ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null | Out-Null }
    }
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "⚠️  Port $port encore occupé : redémarrez l'ordinateur si le problème continue." -ForegroundColor Yellow
    } else {
        Write-Host "✅ Port $port libéré" -ForegroundColor Green
    }
}
