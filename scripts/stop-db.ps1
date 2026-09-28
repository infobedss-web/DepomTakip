$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D (Join-Path $projectRoot '.postgres') stop -m fast
if ($LASTEXITCODE -ne 0) { throw 'DepomTakip PostgreSQL sunucusu durdurulamadı.' }
