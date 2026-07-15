@echo off
chcp 65001 >nul
title JARVIS-YK Sentinel
cd /d "%~dp0"

echo  Verification des dependances...
call npm install
if errorlevel 1 ( echo  [!] Echec de l'installation des dependances. pause & exit /b 1 )

if not exist "config.json" (
  echo.
  echo  Premiere configuration : reponds aux 3 questions.
  echo.
  node src/setup.js
  if errorlevel 1 ( echo  [!] Configuration interrompue. pause & exit /b 1 )
  if not exist "config.json" ( echo  [!] config.json non cree. pause & exit /b 1 )
)

echo.
echo  Demarrage... un QR code va s'afficher : scanne-le avec le telephone du compte.
echo  Ensuite ouvre http://localhost:8787/ dans ton navigateur.
echo.
node src/index.js
pause
