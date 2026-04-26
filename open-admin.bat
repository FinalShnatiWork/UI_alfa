@echo off
title Admin Dashboard - Local Access
color 0B

echo.
echo  ============================================
echo   ADMIN DASHBOARD  ^|  LOCAL ACCESS ONLY
echo  ============================================
echo.

:: ─── Check backend is alive ──────────────────────────────────────────────────
echo  Checking backend...
curl -s -o nul -w "%%{http_code}" http://localhost:8080/api/health > "%TEMP%\health_code.txt" 2>nul
set /p HEALTH_CODE=<"%TEMP%\health_code.txt"
del "%TEMP%\health_code.txt" 2>nul

if "%HEALTH_CODE%"=="200" (
    echo  [OK] Backend is running on port 8080.
) else (
    echo  [WARN] Backend not detected on port 8080.
    echo         Admin API calls will fail until the backend is started.
    echo         Run start-project.bat first if needed.
    echo.
)

:: ─── Check Vite frontend is alive ────────────────────────────────────────────
echo  Checking frontend...
curl -s -o nul -w "%%{http_code}" http://localhost:3000 > "%TEMP%\fe_code.txt" 2>nul
set /p FE_CODE=<"%TEMP%\fe_code.txt"
del "%TEMP%\fe_code.txt" 2>nul

:: ─── Open admin page ─────────────────────────────────────────────────────────
echo.
echo  Opening Centralized Local Admin Dashboard...
echo.
set ADMIN_FILE=%~dp0AdminDashboard_Local.html
echo  Target: %ADMIN_FILE%
echo.
start "" "%ADMIN_FILE%"

echo.
echo  ============================================
echo   SECURITY: Admin APIs are restricted to
echo   localhost only (127.0.0.1).
echo   Remote access is BLOCKED by the server.
echo  ============================================
echo.
timeout /t 4 /nobreak >nul
exit /b 0
