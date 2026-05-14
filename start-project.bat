@echo off
title Broker Platform - Start All Services
color 0A

echo.
echo  ============================================
echo   BROKER PLATFORM - Starting All Services
echo  ============================================
echo.

:: ─── Step 1: Start Docker (PostgreSQL) ───────────────────────────────────────
echo [1/3] Starting PostgreSQL (Docker Compose)...
cd /d "%~dp0UI"
docker compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker Compose failed. Make sure Docker Desktop is running.
    pause
    exit /b 1
)
echo       PostgreSQL is up on port 5433.
echo.

:: ─── Step 2: Wait for DB health ──────────────────────────────────────────────
echo [2/3] Waiting for DB to be ready...
:wait_loop
docker exec broker_ui_db pg_isready -U broker -d broker_ui >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    timeout /t 2 /nobreak >nul
    goto wait_loop
)
echo       Database is healthy.
echo.

:: ─── Step 3: Start Java Backend ──────────────────────────────────────────────
echo [3/3] Starting Java Backend (Spring Boot)...
cd /d "%~dp0UI\backend"
start "Backend - Spring Boot" cmd /k "mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=postgres & pause"
echo       Backend starting on http://localhost:8080
echo       (Wait ~15 seconds for Spring Boot to boot fully)
echo.

:: ─── Step 4: Start Vite Frontend ─────────────────────────────────────────────
echo [4/4] Starting Vite Frontend...
cd /d "%~dp0UI"
start "Frontend - Vite" cmd /k "npm run dev & pause"
echo       Frontend will open at http://localhost:3000
echo.

echo  ============================================
echo   All services started!
echo   - PostgreSQL : localhost:5433
echo   - Backend    : http://localhost:8080
echo   - Frontend   : http://localhost:3000
echo   - Admin page : http://localhost:3000/pages/admin.html
echo  ============================================
echo.
echo  To STOP everything, run: kill-server.bat
echo.
pause
