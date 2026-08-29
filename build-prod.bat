@echo off
title Broker Platform - Production Build
color 0E

echo.
echo  ============================================
echo   BROKER PLATFORM - Production Build
echo  ============================================
echo.

:: ─── Step 1: Build React frontend ────────────────────────────────────────────
echo [1/2] Building React frontend...
cd /d "%~dp0UI-react"
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] React build failed.
    pause
    exit /b 1
)
echo       React built to UI-react\dist\
echo.

:: ─── Step 2: Build Spring Boot JAR (includes React dist/) ────────────────────
echo [2/2] Building Spring Boot JAR...
cd /d "%~dp0backend"
call mvnw.cmd package -DskipTests
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Maven build failed.
    pause
    exit /b 1
)
echo       JAR built to backend\target\
echo.

echo  ============================================
echo   Build complete!
echo   JAR: backend\target\backend-0.0.1-SNAPSHOT.jar
echo.
echo   To run in production:
echo   java -jar backend\backend\target\backend-0.0.1-SNAPSHOT.jar ^
echo        --spring.profiles.active=postgres
echo.
echo   Frontend served at: http://localhost:8080
echo   API available at:   http://localhost:8080/api
echo  ============================================
echo.
pause
