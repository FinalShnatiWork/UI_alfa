@echo off
title Netting Show - automatic run of every scenario
color 0E
cd /d "%~dp0"
echo.
echo  ======================================================
echo   NETTING SHOW - Trader A (buyer) vs Trader B (seller)
echo   Runs every scenario by itself. No clicks needed.
echo  ======================================================
echo.
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
)
echo  Waiting for the backend on port 8080 (start-project.bat)...
set /a TRIES=0
:wait_backend
netstat -aon | findstr ":8080" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 goto backend_up
set /a TRIES+=1
if %TRIES% GEQ 90 (
    echo  [ERROR] Backend did not start within 3 minutes. Run start-project.bat first.
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_backend
:backend_up
echo  Backend is up. Giving Spring Boot a few seconds to finish...
timeout /t 8 /nobreak >nul
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":4010 " ^| findstr "LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
npx --yes tsx scripts\netting_visual_demo.ts --no-open --autoplay --speed 0.7
timeout /t 3 /nobreak >nul
start "" http://localhost:4010
exit /b 0
