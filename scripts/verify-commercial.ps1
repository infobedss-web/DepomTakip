$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Step($name, $cmd) {
  Write-Host "`n============================================================" -ForegroundColor Cyan
  Write-Host " $name" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor Cyan
  & powershell -NoProfile -Command $cmd
  if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

Write-Host "BEDSS Commercial V1 - RC Verification" -ForegroundColor Green
Write-Host "Root: $root"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js not found. Install Node.js 22.12+ or 24 LTS on the developer/build PC.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm not found.' }

Write-Host "Node: $(node --version)"
Write-Host "npm : $(npm.cmd --version)"

Step '1/5 Clean dependency install' "Set-Location '$root'; npm.cmd ci --no-audit --no-fund"
Step '2/5 Production build' "Set-Location '$root'; npm.cmd run build"
Step '3/5 Database migrations' "Set-Location '$root'; npm.cmd run db:migrate"
Step '4/5 Demo seed' "Set-Location '$root'; npm.cmd run db:seed"
Step '5/5 Backend tests' "Set-Location '$root'; npm.cmd test"

Write-Host "`nALL AUTOMATED RC CHECKS PASSED." -ForegroundColor Green
Write-Host 'Next: Android/iPhone PWA + offline cut/reconnect manual test.' -ForegroundColor Yellow
