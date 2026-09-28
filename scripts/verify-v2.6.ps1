$ErrorActionPreference = "Stop"
Write-Host "=== DepomTakip V2.6 doğrulama ==="
node scripts/preflight.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "PASS: preflight"

if (Test-Path package.json) {
  $pkg = Get-Content package.json -Raw | ConvertFrom-Json
  if ($pkg.version -ne "2.6.0") { throw "Beklenen sürüm 2.6.0, bulunan: $($pkg.version)" }
  Write-Host "PASS: version 2.6.0"
}

foreach ($f in @('BACKUP_DEPOMTAKIP.bat','VERIFY_PRODUCTION.bat','scripts/backup-db.ps1','scripts/restore-db.ps1','scripts/verify-production-env.mjs')) {
  if (-not (Test-Path $f)) { throw "Eksik production dosyası: $f" }
}
Write-Host "PASS: production backup/env dosyaları"
Write-Host "V2.6 statik doğrulama tamamlandı."
