# Starts the API (port 8000) and the web app (port 5173) for local demo use.
# Usage:  .\dev.ps1            -> run both
#         .\dev.ps1 -Seed      -> reset demo DB, seed, then run
param([switch]$Seed)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Seed) {
  Remove-Item -Force -ErrorAction SilentlyContinue "$root\backend\data\sost.db*"
  Push-Location "$root\backend"; uv run python -m app.seed; Pop-Location
}

$env:WATCHFILES_FORCE_POLLING = "true"   # Y: drive does not emit file events

# Phones on the same Wi-Fi can open the app at this address; QR codes are printed with it so they scan correctly.
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Wireless' -and $_.IPAddress -notmatch '^169\.254' } |
  Select-Object -First 1 -ExpandProperty IPAddress)
if ($ip) { $env:VITE_PUBLIC_ORIGIN = "http://${ip}:5173" }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; pnpm dev --port 5173"
Write-Host "API  http://localhost:8000/health"
Write-Host "App  http://localhost:5173"
if ($ip) { Write-Host "Phones on this Wi-Fi: http://${ip}:5173" }
