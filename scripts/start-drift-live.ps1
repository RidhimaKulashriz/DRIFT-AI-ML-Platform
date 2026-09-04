$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

if (-not (Get-Command mediamtx -ErrorAction SilentlyContinue)) {
  throw "MediaMTX is not installed or not in PATH. Install it with: winget install --id bluenviron.mediamtx -e"
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "FFmpeg is not installed or not in PATH. Install it with: winget install Gyan.FFmpeg.Shared"
}
if (-not (Test-Path ".env")) {
  throw "Missing .env in $repo. Create it first with DRIFT_BASE_URL, DRIFT_INGEST_TOKEN, DRIFT_MISSION_ID=83, DRIFT_ASSET_ID=4, and DRIFT_MEDIA_DIR=./drift-media-inbox."
}

$envLines = Get-Content ".env" | Where-Object { $_ -notmatch "^(MEDIA_X_HLS_URL|VITE_DRIFT_LIVE_STREAM_URL)=" }
$envLines += "MEDIA_X_HLS_URL=http://127.0.0.1:8888/mediax/index.m3u8"
$envLines += "VITE_DRIFT_LIVE_STREAM_URL=http://127.0.0.1:8888/mediax/index.m3u8"
$envLines | Set-Content -Encoding UTF8 ".env"
New-Item -ItemType Directory -Force ".\drift-media-inbox" | Out-Null

Write-Host "Starting MediaMTX, DRIFT bridge, HLS frame extractor, and frontend..." -ForegroundColor Cyan
Write-Host "Media X must publish the REAL camera stream to: rtmp://127.0.0.1:1935/mediax" -ForegroundColor Yellow
Write-Host "No synthetic test video is started by this script." -ForegroundColor Yellow

$processes = @()
$processes += Start-Process -FilePath "mediamtx" -WorkingDirectory $HOME -PassThru
Start-Sleep -Seconds 2
$processes += Start-Process -FilePath "node" -ArgumentList ".\scripts\drift-media-bridge.mjs" -WorkingDirectory $repo -PassThru
$processes += Start-Process -FilePath "pnpm.cmd" -ArgumentList "dev" -WorkingDirectory $repo -PassThru

Write-Host "Started process IDs: $($processes.Id -join ', ')" -ForegroundColor Green
Write-Host "Open http://localhost:3000/?workspace=operations" -ForegroundColor Green
Write-Host "Start Media X now and publish to rtmp://127.0.0.1:1935/mediax" -ForegroundColor Green
do {
  Start-Sleep -Seconds 2
  try { Invoke-WebRequest "http://127.0.0.1:8888/mediax/index.m3u8" -UseBasicParsing -TimeoutSec 3 | Out-Null; $streamReady = $true }
  catch { $streamReady = $false; Write-Host "Waiting for Media X stream at /mediax ..." -ForegroundColor DarkYellow }
} until ($streamReady)
$processes += Start-Process -FilePath "node" -ArgumentList ".\scripts\mediax-hls-frame-source.mjs" -WorkingDirectory $repo -PassThru
Write-Host "Media X stream detected; frame extraction started." -ForegroundColor Green
Write-Host "Press Ctrl+C here to stop all DRIFT processes." -ForegroundColor Cyan

try {
  while ($true) {
    $alive = $processes | Where-Object { -not $_.HasExited }
    if (-not $alive) { throw "All DRIFT processes stopped." }
    Start-Sleep -Seconds 2
  }
} finally {
  $processes | Where-Object { -not $_.HasExited } | Stop-Process -Force -ErrorAction SilentlyContinue
}
