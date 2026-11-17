$ErrorActionPreference = "Stop"

$bundlePath = Join-Path $env:TEMP "precision-path-deploy.bundle"
$localCampaignCfg = Join-Path $PSScriptRoot "server\campaign-config.json"

Write-Host "==> Checking macmini for live campaign-config.json edits..." -ForegroundColor Cyan
$remoteDirty = (ssh macmini 'cd ~/precision-path && git status --porcelain server/campaign-config.json') | Out-String
if ($remoteDirty.Trim()) {
    $localDirty = (git -C $PSScriptRoot status --porcelain server/campaign-config.json) | Out-String
    if ($localDirty.Trim()) {
        throw "Both Windows and macmini have uncommitted edits to server/campaign-config.json. Commit or discard one side before deploying."
    }
    Write-Host "==> Syncing modified campaign-config.json from macmini to Windows..." -ForegroundColor Yellow
    scp "macmini:~/precision-path/server/campaign-config.json" $localCampaignCfg
    git -C $PSScriptRoot add server/campaign-config.json
    git -C $PSScriptRoot -c user.name="CheeseMunch" -c user.email="20569884+CheeseMunch@users.noreply.github.com" commit -m "Sync campaign-config.json from macmini"
    ssh macmini 'cd ~/precision-path && git checkout -- server/campaign-config.json'
}

Write-Host "==> Pushing local main to origin..." -ForegroundColor Cyan
git -C $PSScriptRoot push origin main

Write-Host "==> Creating git bundle and copying to macmini..." -ForegroundColor Cyan
git -C $PSScriptRoot bundle create $bundlePath main
scp $bundlePath "macmini:~/precision-path-deploy.bundle"
Remove-Item $bundlePath -Force -ErrorAction SilentlyContinue

Write-Host "==> Building and restarting on macmini..." -ForegroundColor Cyan
ssh macmini 'export PATH="/opt/homebrew/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"; cd ~/precision-path && git pull --ff-only ~/precision-path-deploy.bundle main && rm -f ~/precision-path-deploy.bundle && npm --prefix client install && npm --prefix client run build && npm --prefix server install && npm --prefix server run build && pm2 restart precision-path-server --update-env && pm2 save'

Write-Host "==> Verifying https://precisionpath.pro/api/health ..." -ForegroundColor Cyan
Invoke-RestMethod -Uri "https://precisionpath.pro/api/health" | ConvertTo-Json -Depth 3
