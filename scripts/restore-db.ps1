param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [switch]$ConfirmRestore
)
$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore için -ConfirmRestore parametresi zorunlu." }
if (-not $env:DATABASE_URL) { throw "DATABASE_URL tanımlı değil." }
if (-not (Test-Path $BackupFile)) { throw "Backup dosyası bulunamadı: $BackupFile" }
$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) { throw "pg_restore bulunamadı. PostgreSQL bin klasörünü PATH'e ekleyin." }
Write-Host "UYARI: Hedef veritabanı içeriği temizlenip backup geri yüklenecek."
& $pgRestore.Source --clean --if-exists --no-owner --no-privileges --dbname $env:DATABASE_URL $BackupFile
if ($LASTEXITCODE -ne 0) { throw "Restore başarısız." }
Write-Host "PASS: Restore tamamlandı."
