@echo off
chcp 65001 >nul
title DuDu Han Ngu - Full-Stack Server
if not exist "package.json" cd /d "%~dp0"

echo ===================================================
echo   DuDu Han Ngu - Khoi dong nhanh (API + Frontend)
echo ===================================================

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH. Please install Node.js 22.5+.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [1/2] Installing dependencies...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [Starting] Backend SQLite (127.0.0.1:3001) + Vite Frontend (127.0.0.1:5173)...
echo (Press Ctrl + C to stop server)
echo.
if "%~1"=="--no-open" (
    node scripts/dev.mjs
) else (
    node scripts/dev.mjs --open
)

if errorlevel 1 (
    echo.
    echo [ERROR] Server stopped unexpectedly.
    pause
)
