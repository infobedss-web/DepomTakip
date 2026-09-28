$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js bulunamadı. Node.js 22+ kurun.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm bulunamadı.' }

& (Join-Path $PSScriptRoot 'prepare-local.ps1')

if (!(Test-Path (Join-Path $root 'node_modules'))) {
  Write-Host 'npm paketleri kuruluyor...' -ForegroundColor Cyan
  npm.cmd ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm ci başarısız.' }
}

Write-Host 'Veritabanı migration...' -ForegroundColor Cyan
npm.cmd run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration başarısız.' }

Write-Host 'Demo verileri...' -ForegroundColor Cyan
npm.cmd run db:seed
if ($LASTEXITCODE -ne 0) { throw 'Seed başarısız.' }

Write-Host ''
Write-Host 'DepomTakip başlatılıyor:' -ForegroundColor Green
Write-Host 'Web : http://127.0.0.1:5173'
Write-Host 'API : http://127.0.0.1:4000/api/health'
Write-Host 'Demo Bayi: bayi@depomtakip.local / DepomTakip!2026' -ForegroundColor Yellow
Write-Host 'Demo Sayım: sayim@depomtakip.local / DepomTakip!2026' -ForegroundColor Yellow
Write-Host ''
npm.cmd run dev
