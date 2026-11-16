# Starts the API (port 8000) and the web app (port 5173) for local demo use.
# Usage:  .\dev.ps1            -> run both
#         .\dev.ps1 -Seed      -> wipe the configured DB (SQLite or Supabase), seed, then run
#         .\dev.ps1 -Share     -> also open a free public https address (Cloudflare quick tunnel, no account)
param([switch]$Seed, [switch]$Share)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Seed) {
  Push-Location "$root\backend"; uv run python scripts/reset_db.py --yes; Pop-Location
}

$env:WATCHFILES_FORCE_POLLING = "true"   # Y: drive does not emit file events

# Phones on the same Wi-Fi can open the app at this address; QR codes are printed with it so they scan correctly.
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -match 'Wi-?Fi|Wireless' -and $_.IPAddress -notmatch '^169\.254' } |
  Select-Object -First 1 -ExpandProperty IPAddress)
if ($ip -and -not $Share) { $env:VITE_PUBLIC_ORIGIN = "http://${ip}:5173" }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; pnpm dev --port 5173"
Write-Host "API  http://localhost:8000/health"
Write-Host "App  http://localhost:5173"
if ($ip) { Write-Host "Phones on this Wi-Fi: http://${ip}:5173" }

if ($Share) {
  # A quick tunnel gives https (so phones allow GPS and the camera) with no domain or account. The address changes
  # each run. Open the app through it on this laptop too, so the QR codes and shared links it prints point there.
  $log = Join-Path $env:TEMP "sost-tunnel.log"
  Remove-Item -Force -ErrorAction SilentlyContinue $log
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cloudflared tunnel --no-autoupdate --url http://localhost:5173 2>&1 | Tee-Object -FilePath '$log'"
  $url = $null
  for ($i = 0; $i -lt 60 -and -not $url; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) { $url = (Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1).Matches.Value }
  }
  if ($url) {
    Write-Host ""
    Write-Host "Public https address (share this, or show it as a QR): $url" -ForegroundColor Green
    Start-Process $url
  } else {
    Write-Host "The tunnel did not report an address yet; check the cloudflared window." -ForegroundColor Yellow
  }
}
