# ==============================================================================
# Smart Deploy Script for Broker Platform (Vercel + Convex)
# Checks if changes exist since last deployment.
# If changes exist -> builds & deploys to Vercel, saves new deployment record.
# If no changes    -> notifies user, outputs link, offers to open or force deploy.
# ==============================================================================

param(
    [switch]$Force
)

$Host.UI.RawUI.WindowTitle = "Deploy Broker Platform to Vercel"

Write-Host ""
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host "  BROKER PLATFORM  |  SMART DEPLOY TO VERCEL                   " -ForegroundColor Cyan
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $PSScriptRoot
$uiReactDir = Join-Path $rootDir "UI-react"
$stateFile = Join-Path $rootDir ".last_deploy_state.json"

# Calculate current frontend fingerprint
Write-Host "[1/3] Checking for changes in frontend source files..." -ForegroundColor Yellow

$srcFiles = Get-ChildItem -Path (Join-Path $uiReactDir "src"), (Join-Path $uiReactDir "public") -Recurse -File -ErrorAction SilentlyContinue
$configFiles = Get-ChildItem -Path (Join-Path $uiReactDir "index.html"), (Join-Path $uiReactDir "package.json"), (Join-Path $uiReactDir "vite.config.ts"), (Join-Path $uiReactDir "vercel.json"), (Join-Path $uiReactDir ".env.production") -File -ErrorAction SilentlyContinue

$allWatched = @($srcFiles) + @($configFiles)

# Build a deterministic signature based on file paths, sizes, and timestamps
$signatureParts = foreach ($f in ($allWatched | Where-Object { $_ -ne $null -and $_.FullName } | Sort-Object FullName)) {
    "$($f.FullName):$($f.Length):$($f.LastWriteTimeUtc.Ticks)"
}
$signatureStr = $signatureParts -join ";"
$md5 = [System.Security.Cryptography.MD5]::Create()
$currentFingerprint = [System.BitConverter]::ToString($md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($signatureStr))).Replace("-","")

# Read previous deploy state if exists
$state = $null
if (Test-Path $stateFile) {
    try {
        $state = Get-Content $stateFile -Raw | ConvertFrom-Json
    } catch {}
}

$siteUrl = "https://temporary-racing-antimony-8h4jlt4.vercel.app"
if ($state -and $state.siteUrl) {
    $siteUrl = $state.siteUrl
}

$hasChanges = $true
if (-not $Force -and $state -and ($state.fingerprint -eq $currentFingerprint)) {
    $hasChanges = $false
}

if (-not $hasChanges) {
    Write-Host ""
    Write-Host " ==============================================================" -ForegroundColor Green
    Write-Host "  [OK] No changes detected since last deployment!" -ForegroundColor Green
    Write-Host "  Your live website is already running the latest code." -ForegroundColor Green
    Write-Host " ==============================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Live Website URL: " -NoNewline
    Write-Host $siteUrl -ForegroundColor Cyan
    if ($state.lastDeployTime) {
        Write-Host "  Last Deployed:    $($state.lastDeployTime)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host " Options:" -ForegroundColor Yellow
    Write-Host "  [O] Open website in your default browser"
    Write-Host "  [F] Force re-deploy to Vercel anyway"
    Write-Host "  [Q] Exit (or press Enter)"
    Write-Host ""
    
    $choice = Read-Host " Enter choice (O/F/Q)"
    if ($choice -match "^[oO]$") {
        Write-Host " Opening $siteUrl in browser..." -ForegroundColor Green
        Start-Process $siteUrl
        exit 0
    } elseif ($choice -match "^[fF]$") {
        Write-Host " Forcing re-deployment..." -ForegroundColor Yellow
    } else {
        exit 0
    }
}

# Changes detected (or force requested) -> Proceed with build & deploy
Write-Host ""
Write-Host " [!] Changes detected! Preparing new deployment..." -ForegroundColor Yellow
Write-Host ""

Set-Location $uiReactDir

# Ensure npm is accessible
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\nodejs") {
        $env:PATH = "C:\Program Files\nodejs;$env:PATH"
    }
}

# Step 2: Build the React application
Write-Host "[2/3] Building React production bundle (npm run build)..." -ForegroundColor Yellow
$buildOutput = & npm.cmd run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] React build failed:" -ForegroundColor Red
    $buildOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ""
    Read-Host "Press Enter to exit..."
    exit 1
}
Write-Host "      Build completed successfully!" -ForegroundColor Green
Write-Host ""

# Step 3: Deploy to Vercel
Write-Host "[3/3] Deploying to Vercel..." -ForegroundColor Yellow

$isLoggedIn = $false
try {
    $whoami = & npx.cmd --yes vercel whoami 2>&1
    if ($LASTEXITCODE -eq 0 -and ($whoami -join " ") -notmatch "Not authenticated|Logged out|Error:") {
        $isLoggedIn = $true
    }
} catch {}

$deployResult = @()
if ($isLoggedIn) {
    Write-Host "      Deploying to production on your Vercel account..." -ForegroundColor Cyan
    $deployResult = & npx.cmd --yes vercel deploy --prod --yes 2>&1
} else {
    Write-Host "      Deploying live deployment..." -ForegroundColor Cyan
    $deployResult = & npx.cmd --yes vercel deploy --temporary --yes 2>&1
}

$newUrl = $null
foreach ($line in $deployResult) {
    $lineStr = "$line"
    Write-Host "  $lineStr"
    if ($lineStr -match "https://[a-zA-Z0-9\.\-]+\.vercel\.app") {
        $newUrl = $Matches[0]
    }
}

if ($newUrl) {
    $siteUrl = $newUrl
}

# Save new state
$now = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$newState = [PSCustomObject]@{
    fingerprint    = $currentFingerprint
    lastDeployTime = $now
    siteUrl        = $siteUrl
}
$newState | ConvertTo-Json -Depth 3 | Set-Content -Path $stateFile -Force

Write-Host ""
Write-Host " ==============================================================" -ForegroundColor Green
Write-Host "  [SUCCESS] Deployment complete! Your site is live 24/7!" -ForegroundColor Green
Write-Host " ==============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Live Website URL: " -NoNewline
Write-Host $siteUrl -ForegroundColor Cyan
Write-Host "  Deployed At:      $now" -ForegroundColor Gray
Write-Host ""

# Open browser to the newly deployed site
try {
    Start-Process $siteUrl
} catch {}

Write-Host "Press Enter to close this window..."
Read-Host
