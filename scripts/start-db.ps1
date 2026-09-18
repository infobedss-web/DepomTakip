param([int]$Port = 55432)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataPath = Join-Path $projectRoot '.postgres'
$pgDirectory = 'C:\Program Files\PostgreSQL\17\bin'
if (!(Test-Path -LiteralPath (Join-Path $pgDirectory 'pg_ctl.exe'))) { throw 'PostgreSQL 17 bulunamadı. Docker Compose seçeneğini kullanın.' }
if (!(Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) {
  & (Join-Path $pgDirectory 'initdb.exe') -D $dataPath -U bedss --auth=trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL veri klasörü oluşturulamadı.' }
}
& (Join-Path $pgDirectory 'pg_ctl.exe') -D $dataPath status
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $pgDirectory 'pg_ctl.exe') -D $dataPath -l (Join-Path $projectRoot 'postgres.log') -o "-p $Port -h 127.0.0.1" start
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL başlatılamadı.' }
}
foreach ($databaseName in @('bedss','bedss_test')) {
  $exists = & (Join-Path $pgDirectory 'psql.exe') -h 127.0.0.1 -p $Port -U bedss -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$databaseName'"
  if ($LASTEXITCODE -ne 0) { throw 'BEDSS PostgreSQL bağlantısı kurulamadı.' }
  if ($exists -ne '1') {
    & (Join-Path $pgDirectory 'createdb.exe') -h 127.0.0.1 -p $Port -U bedss $databaseName
    if ($LASTEXITCODE -ne 0) { throw "$databaseName oluşturulamadı." }
  }
}
Write-Output "BEDSS yerel geliştirme PostgreSQL sunucusu 127.0.0.1:$Port adresinde hazır."
