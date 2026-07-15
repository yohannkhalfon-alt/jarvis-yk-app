@echo off
chcp 65001 >nul
title JARVIS-YK Sentinel
cd /d "%~dp0"

if not exist "config.json" (
  echo.
  echo  [!] Fichier config.json manquant.
  echo      Copie config.example.json en config.json et remplis-le d'abord.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  Installation des dependances ^(1 seule fois, patiente^)...
  call npm install
  if errorlevel 1 ( echo  [!] Echec de l'installation. pause & exit /b 1 )
)

echo.
echo  Demarrage... un QR code va s'afficher : scanne-le avec le telephone du compte.
echo  Ensuite ouvre http://localhost:8787/ dans ton navigateur.
echo.
node src/index.js
pause
