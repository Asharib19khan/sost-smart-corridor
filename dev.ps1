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
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; pnpm dev --port 5173"
Write-Host "API  http://localhost:8000/health"
Write-Host "App  http://localhost:5173"
