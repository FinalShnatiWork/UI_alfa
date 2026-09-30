@echo off
title Admin Dashboard - Local Access
color 0B

echo.
echo  ============================================
echo   ADMIN HUB  ^|  React  ^|  LOCALHOST ONLY
echo  ============================================
echo.

curl.exe -s -o nul -w "%%{http_code}" http://localhost:8080/api/health > "%TEMP%\health_code.txt" 2>nul
set /p HEALTH_CODE=<"%TEMP%\health_code.txt"
del "%TEMP%\health_code.txt" 2>nul

if "%HEALTH_CODE%"=="200" (
    echo  [OK] Backend is running on port 8080.
) else (
    echo  [WARN] Backend not detected on port 8080.
)

echo.
echo  Opening http://localhost:3001/admin
start "" "http://localhost:3001/admin"
echo.
echo  Admin APIs are restricted to 127.0.0.1.
timeout /t 3 /nobreak >nul
exit /b 0
