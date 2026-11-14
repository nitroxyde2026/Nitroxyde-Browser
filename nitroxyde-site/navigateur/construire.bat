@echo off
chcp 65001 >nul
title Nitroxyde Navigation - construire l'installateur sur ce PC
cd /d "%~dp0"
REM Facultatif : la publication sur nitroxyde.fr se fait maintenant toute seule sur GitHub (onglet Actions).
REM Ce fichier sert seulement à fabriquer l'installateur sur ton PC pour le tester.
if not exist "package.json" (
  echo Ce fichier doit etre lance depuis le dossier du navigateur, une fois le zip EXTRAIT.
  echo Clic droit sur le zip ^> Extraire tout, puis relance ce fichier dans le dossier extrait.
  pause & exit /b 1
)
where node >nul 2>nul || (
  echo Node.js n'est pas installe. La page de telechargement va s'ouvrir : installe la version LTS puis relance ce fichier.
  start https://nodejs.org/fr
  pause & exit /b 1
)
echo === 1/2 Installation des dependances (quelques minutes la premiere fois) ===
call npm install --no-audit --no-fund --legacy-peer-deps || goto erreur
echo.
echo === 2/2 Construction de l'installateur Windows ===
if exist dist rmdir /s /q dist
call npx electron-builder --win --x64 --publish never || goto erreur
echo.
echo TERMINE : l'installateur est dans le dossier dist (il va s'ouvrir).
start "" "%~dp0dist"
pause
exit /b 0
:erreur
echo.
echo ECHEC : copie le message ci-dessus et envoie-le a Claude.
echo Si tu vois "Cannot create symbolic link", relance ce fichier en clic droit ^> Executer en tant qu'administrateur.
pause
exit /b 1
