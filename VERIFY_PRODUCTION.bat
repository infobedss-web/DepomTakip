@echo off
setlocal
cd /d "%~dp0"
set NODE_ENV=production
node scripts\verify-production-env.mjs
if errorlevel 1 (
  echo.
  echo Production ortam kontrolu BASARISIZ.
  pause
  exit /b 1
)
echo.
echo Production ortam kontrolu BASARILI.
pause
endlocal
