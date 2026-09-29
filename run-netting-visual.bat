@echo off
title Netting Visual - Trader A vs Trader B vs Computer
color 0E
cd /d "%~dp0"

echo.
echo  ======================================================
echo   NETTING LIVE VISUALIZER
echo   Trader A + Trader B + the computer, every scenario
echo  ======================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js 18 or newer is required. Install it from https://nodejs.org
    pause
    exit /b 1
)

set "MODE="
netstat -aon | findstr ":8080" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  The backend is not running on port 8080.
    echo  [Y] run the OFFLINE simulation ^(in-memory, for presenting the idea^)
    echo  [N] stop, so you can run start-project.bat first ^(recommended - real test^)
    choice /C YN /M "Run OFFLINE"
    if errorlevel 2 exit /b 1
    set "MODE=--offline"
)

call :free_port 4010
echo  Starting the visualizer... press Play on the page.
start "Netting Visual" cmd /k node scripts\netting_visual_demo.js --no-open %MODE%
timeout /t 2 /nobreak >nul
start "" http://localhost:4010
exit /b 0

:free_port
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":%~1 " ^| findstr "LISTENING"') do taskkill /PID %%p /T /F >nul 2>&1
goto :eof
