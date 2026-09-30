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
powershell -NoProfile -Command ^
    "$conns = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue; " ^
    "if ($conns) { $conns | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 } | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"
:: Fallback in case PowerShell/Get-NetTCPConnection is unavailable
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r ":8080[^0-9]*LISTENING"') do (
    taskkill /PID %%a /T /F >nul 2>&1
)
:: Verify the port was actually released
powershell -NoProfile -Command ^
    "if (Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue) { Write-Host '      WARNING: Port 8080 still in use.' -ForegroundColor Yellow } else { Write-Host '      Port 8080 released.' -ForegroundColor Green }"
echo       Done.

:: Kill React Vite frontend (runs on port 3001)
echo [2/4] Stopping React Frontend (port 3001)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /T /F >nul 2>&1
)
echo       Done.

:: Kill Neural Network Server (runs on port 3005)
echo [3/5] Stopping AI Neural Network Server (port 3005)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3005" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /T /F >nul 2>&1
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
