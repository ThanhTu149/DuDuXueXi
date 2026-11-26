@echo off
chcp 65001 >nul
title DuDu Hán Ngữ — Full-Stack Server
if not exist "package.json" cd /d "%~dp0"

echo ===================================================
echo   DuDu Hán Ngữ — Khởi động nhanh (API + Frontend)
echo ===================================================

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [LỖI] Không tìm thấy Node.js trong PATH. Vui lòng cài Node.js ^>= 22.5.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [1/2] Đang cài đặt thư viện lần đầu...
    call npm.cmd install
    if %ERRORLEVEL% neq 0 (
        echo [LỖI] npm install thất bại.
        pause
        exit /b 1
    )
)

echo [Chạy] Đang bật Backend SQLite (3001) + Vite Frontend (5173) và mở trình duyệt...
echo (Nhấn Ctrl + C để tắt server)
echo.
node scripts/dev.mjs --open

if %ERRORLEVEL% neq 0 (
    echo.
    echo [LỖI] Server dừng bất thường (mã lỗi %ERRORLEVEL%).
    pause
)
