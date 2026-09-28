$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location $root

function Run-Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n============================================================" -ForegroundColor Cyan
  Write-Host " $Name" -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) { throw "$Name başarısız (exit $LASTEXITCODE)" }
}

Write-Host 'DepomTakip V2.5 - Tek Komut Doğrulama' -ForegroundColor Green
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22+ bulunamadı.' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm bulunamadı.' }

Run-Step '1/8 Statik production preflight' { node scripts/preflight.mjs }
Run-Step '2/8 PostgreSQL + local env hazırlığı' { & scripts/prepare-local.ps1 }
Run-Step '3/8 Temiz bağımlılık kurulumu' { npm.cmd ci --no-audit --no-fund }
Run-Step '4/8 Production build' { npm.cmd run build }
Run-Step '5/8 Migration' { npm.cmd run db:migrate }
Run-Step '6/8 Demo seed' { npm.cmd run db:seed }
Run-Step '7/8 Backend testleri' { npm.cmd test }

Write-Host "`nAPI kısa smoke testi için backend geçici başlatılıyor..." -ForegroundColor Cyan
$api = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','start','-w','backend') -PassThru -WindowStyle Hidden
try {
  $ready = $false
  foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/health' -TimeoutSec 2
      if ($health.status -eq 'ok' -and $health.application -eq 'DepomTakip' -and $health.database -eq 'PostgreSQL') { $ready = $true; break }
    } catch {}
  }
  if (-not $ready) { throw 'API health doğrulanamadı.' }
  Run-Step '8/8 Demo rol / erişim smoke testleri' { node scripts/verify-demo.mjs }
} finally {
  if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue }
}

Write-Host "`nTÜM OTOMATİK V2.5 KONTROLLERİ GEÇTİ." -ForegroundColor Green
Write-Host 'Sıradaki manuel saha testi: telefonda sayım -> interneti kapat -> kayıt ekle -> interneti aç -> otomatik senkronu doğrula.' -ForegroundColor Yellow
