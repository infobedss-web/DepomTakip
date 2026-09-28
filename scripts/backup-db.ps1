param(
  [string]$OutputDir = ".\\backups"
)
$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) { throw "DATABASE_URL tanımlı değil." }
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) { throw "pg_dump bulunamadı. PostgreSQL bin klasörünü PATH'e ekleyin." }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $OutputDir "depomtakip-$stamp.dump"
& $pgDump.Source --format=custom --no-owner --no-privileges --file $file $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) { throw "Yedekleme başarısız." }
$hash = (Get-FileHash -Algorithm SHA256 $file).Hash
Set-Content -Encoding UTF8 "$file.sha256" "$hash  $(Split-Path $file -Leaf)"
Write-Host "PASS: Backup hazır: $file"
Write-Host "SHA256: $hash"
