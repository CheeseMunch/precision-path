# Precision Path - PC Self-Host + Permanent Cloudflare Tunnel Launcher (precisionpath.pro)
Write-Host "Building production frontend..." -ForegroundColor Cyan
npm run build --prefix client

Write-Host "Starting dedicated game server on port 4000..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\server'; npm run dev"

Start-Sleep -Seconds 3

Write-Host "Starting permanent Cloudflare Tunnel for https://precisionpath.pro ..." -ForegroundColor Yellow
$cf = if (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
  "C:\Program Files (x86)\cloudflared\cloudflared.exe"
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
  "C:\Program Files\cloudflared\cloudflared.exe"
} else {
  "cloudflared"
}

& $cf tunnel run precision-path
