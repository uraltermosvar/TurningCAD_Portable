@echo off
chcp 65001 >nul
title ICP Contour
cd /d "%~dp0"
if exist "%~dp0node\node.exe" set "PATH=%~dp0node;%PATH%"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found - https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo npm install...
  call npm install --no-audit --no-fund
)
echo http://127.0.0.1:8080
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://127.0.0.1:8080/"
node node_modules\vite\bin\vite.js dev --host 127.0.0.1 --port 8080
if errorlevel 1 pause
