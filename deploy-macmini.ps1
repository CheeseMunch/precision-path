$ErrorActionPreference = "Stop"

$bundlePath = Join-Path $env:TEMP "precision-path-deploy.bundle"

Write-Host "==> Pushing local main to origin..." -ForegroundColor Cyan
git -C $PSScriptRoot push origin main

Write-Host "==> Creating git bundle and copying to macmini..." -ForegroundColor Cyan
git -C $PSScriptRoot bundle create $bundlePath main
scp $bundlePath "macmini:~/precision-path-deploy.bundle"
Remove-Item $bundlePath -Force -ErrorAction SilentlyContinue

Write-Host "==> Building and restarting on macmini..." -ForegroundColor Cyan
ssh macmini 'export PATH="/opt/homebrew/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"; cd ~/precision-path && git pull ~/precision-path-deploy.bundle main && rm -f ~/precision-path-deploy.bundle && npm --prefix client install && npm --prefix client run build && npm --prefix server install && npm --prefix server run build && pm2 restart precision-path-server --update-env && pm2 save'

Write-Host "==> Verifying https://precisionpath.pro/api/health ..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "https://precisionpath.pro/api/health" | ConvertTo-Json -Depth 3
