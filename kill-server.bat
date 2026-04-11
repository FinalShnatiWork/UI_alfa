@echo off
title Broker Platform - Kill All Services
color 0C

echo.
echo  ============================================
echo   BROKER PLATFORM - Stopping All Services
echo  ============================================
echo.

:: Kill Java backend (runs on port 8080)
echo [1/3] Stopping Java Backend (port 8080)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo       Done.

:: Kill Vite frontend (runs on port 3000)
echo [2/3] Stopping Vite Frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo       Done.

:: Stop Docker containers
echo [3/3] Stopping Docker (PostgreSQL)...
cd /d "%~dp0UI"
docker compose down
echo       Done.

echo.
echo  ============================================
echo   All services stopped.
echo  ============================================
echo.
pause
