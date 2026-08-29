@echo off
title Broker Platform - Start All Services
color 0A

echo.
echo  ============================================
echo   BROKER PLATFORM - Starting All Services
echo  ============================================
echo.

:: ─── Step 0: Environment Auto-Discovery ──────────────────────────────────────
echo Detecting environment variables...

:: Detect Java JDK 17
where java >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       Java not found in PATH. Searching in C:\Program Files\Eclipse Adoptium...
    for /d %%d in ("C:\Program Files\Eclipse Adoptium\jdk-17*") do (
        if exist "%%d\bin\java.exe" (
            set "JAVA_HOME=%%d"
            set "PATH=%%d\bin;%PATH%"
            echo       Found JDK at %%d, added to PATH.
        )
    )
)

:: Detect Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       Node not found in PATH. Searching in C:\Program Files\nodejs...
    if exist "C:\Program Files\nodejs\node.exe" (
        set "PATH=C:\Program Files\nodejs;%PATH%"
        echo       Found Node.js at C:\Program Files\nodejs, added to PATH.
    )
)
echo.

:: ─── Step 0.5: Free up ports from any previous run ───────────────────────────
echo Cleaning up leftover processes from previous runs...
call :free_port 8080 "Backend"
call :free_port 3001 "Frontend"
call :free_port 3005 "NN Server"
call :free_port 3008 "Coin Analyzer"
echo.

:: ─── Step 1: Start Docker (PostgreSQL) ───────────────────────────────────────
echo [1/3] Starting PostgreSQL (Docker Compose)...
cd /d "%~dp0backend"
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
cd /d "%~dp0backend"
start "Backend - Spring Boot" cmd /k "mvnw.cmd spring-boot:run -Dspring-boot.run.profiles=postgres & pause"
echo       Backend starting on http://localhost:8080
echo       (Wait ~15 seconds for Spring Boot to boot fully)
echo.

:: ─── Step 4: Start React Frontend ────────────────────────────────────────────
echo [4/6] Starting React Frontend (Vite)...
cd /d "%~dp0UI-react"
start "Frontend - React+Vite" cmd /k "npm run dev & pause"
echo       Frontend will open at http://localhost:3001
echo.

:: ─── Step 5: Start Neural Network Server ──────────────────────────────────────
echo [5/6] Starting Neural Network Server...
cd /d "%~dp0buysellmodel"
start "AI - Neural Network Server" cmd /k "node nn_server.js & pause"
echo       NN Server is up on port 3005.
echo.

:: ─── Step 6: Start Coin Analyzer Bot ──────────────────────────────────────────
echo [6/6] Starting Coin Analyzer Bot...
cd /d "%~dp0coin-analyzer"
start "AI - Coin Analyzer Bot" cmd /k "npm start & pause"
echo       Coin Analyzer is up on port 3008.
echo.

echo  ============================================
echo   All services started!
echo   - PostgreSQL    : localhost:5433
echo   - Backend       : http://localhost:8080
echo   - Frontend      : http://localhost:3001
echo   - AI Advisor    : http://localhost:3005
echo   - Coin Analyzer : http://localhost:3008
echo   - Admin page    : open-admin.bat
echo  ============================================
echo.
echo  To STOP everything, run: kill-server.bat
echo.
pause
goto :eof

:: ─── Subroutine: free_port <port> <label> ─────────────────────────────────────
:: Kills any process currently LISTENING on the given port so the next
:: service start doesn't fail with "port already in use".
:free_port
setlocal
set "PORT=%~1"
set "LABEL=%~2"
set "FOUND=0"
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo       Found existing %LABEL% process ^(PID %%p^) on port %PORT%. Stopping it...
    taskkill /PID %%p /T /F >nul 2>&1
    set "FOUND=1"
)
if "%FOUND%"=="0" (
    echo       Port %PORT% ^(%LABEL%^) is free.
)
endlocal
goto :eof
