@echo off
REM Doppio clic su Windows: avvia l'interfaccia web di File Renamer.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installa la versione LTS da https://nodejs.org e riprova.
  pause
  exit /b 1
)

if not exist "dist\cli\main.js" (
  echo Prima esecuzione: installo e compilo ^(serve una connessione a Internet^)...
  call npm install
  if errorlevel 1 goto :fail
  call npm run build
  if errorlevel 1 goto :fail
)

node dist\cli\main.js ui
if errorlevel 1 pause
exit /b 0

:fail
echo Errore durante la preparazione.
pause
exit /b 1
