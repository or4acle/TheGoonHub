@echo off
title R34 Media Hub Pro - Local Server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo.
  echo Option 1: Install Node.js from https://nodejs.org and run start-local.bat again.
  echo Option 2: If Python is installed, run:  python -m http.server 8080
  echo.
  pause
  exit /b 1
)

echo Starting local server on http://localhost:8080
echo Keep this window open. Press Ctrl+C to stop.
echo.
node server.js
pause