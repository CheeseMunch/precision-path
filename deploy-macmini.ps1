$ErrorActionPreference = "Stop"

Write-Host "==> Pushing local main to origin..." -ForegroundColor Cyan
git -C $PSScriptRoot push origin main

Write-Host "==> Deploying to macmini..." -ForegroundColor Cyan
ssh macmini @'
export PATH="/opt/homebrew/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
cd ~/precision-path
git pull --ff-only origin main
npm --prefix client install
npm --prefix client run build
npm --prefix server install
npm --prefix server run build
pm2 restart precision-path-server --update-env
pm2 save
'@

Write-Host "==> Checking https://precisionpath.pro/api/health ..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "https://precisionpath.pro/api/health" | ConvertTo-Json -Depth 3
