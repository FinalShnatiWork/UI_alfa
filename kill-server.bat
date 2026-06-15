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

:: Kill React Vite frontend (runs on port 3001)
echo [2/4] Stopping React Frontend (port 3001)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo       Done.

:: Kill Neural Network Server (runs on port 3005)
echo [3/4] Stopping AI Neural Network Server (port 3005)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3005" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
echo       Done.

:: Stop Docker containers
echo [4/4] Stopping Docker (PostgreSQL)...
cd /d "%~dp0backend"
docker compose down
echo       Done.

echo.
echo  ============================================
echo   All services stopped.
echo  ============================================
echo.
pause
