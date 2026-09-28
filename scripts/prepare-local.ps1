$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$envFile = Join-Path $root 'backend\.env'

if (!(Test-Path $envFile)) {
@"
DATABASE_URL=postgresql://depomtakip:depomtakip_local@127.0.0.1:55432/depomtakip
PORT=4000
NODE_ENV=development
APP_ORIGIN=http://localhost:5173
"@ | Set-Content -Encoding UTF8 $envFile
  Write-Host 'backend/.env oluşturuldu.' -ForegroundColor Green
} else {
  Write-Host 'backend/.env zaten mevcut; değiştirilmedi.' -ForegroundColor Yellow
}

& (Join-Path $PSScriptRoot 'start-db.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Yerel PostgreSQL başlatılamadı.' }

Write-Host 'DepomTakip yerel ortamı hazır.' -ForegroundColor Green
