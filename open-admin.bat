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
if "%FE_CODE%"=="200" (
    echo  [OK] Frontend running - opening via Vite dev server.
    echo.
    echo  Opening: http://localhost:3000/pages/admin.html
    echo.
    start "" "http://localhost:3000/pages/admin.html"
) else (
    echo  [INFO] Vite dev server not running.
    echo         Opening admin.html directly from the filesystem.
    echo         NOTE: API calls require the backend to be running.
    echo.
    set ADMIN_PATH=%~dp0UI\src\pages\admin.html
    echo  Opening: !ADMIN_PATH!
    start "" "%~dp0UI\src\pages\admin.html"
)

echo.
echo  ============================================
echo   SECURITY: Admin APIs are restricted to
echo   localhost only (127.0.0.1).
echo   Remote access is BLOCKED by the server.
echo  ============================================
echo.
timeout /t 4 /nobreak >nul
exit /b 0
