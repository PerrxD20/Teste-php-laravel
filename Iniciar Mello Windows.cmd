@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 22 ou mais recente em nodejs.org e abra este arquivo novamente.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto failure
)
call npm run build
if errorlevel 1 goto failure
call npm run app
if errorlevel 1 goto failure
exit /b 0
:failure
echo Nao foi possivel iniciar o Mello. Confira a mensagem acima.
pause
exit /b 1
