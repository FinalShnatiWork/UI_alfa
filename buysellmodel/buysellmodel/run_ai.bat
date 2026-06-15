@echo off
title Netting Broker Launcher
color 0B
echo ====================================================
echo       Netting Broker System Startup Launcher
echo ====================================================
echo.
echo [1] Start All Services (Web Server + NN Server + Browser)
echo [2] Open Management CLI (Train Model / Prediction)
echo [3] Exit
echo.
set /p choice="Choose an option: "

if "%choice%"=="1" goto start_all
if "%choice%"=="2" goto cli
if "%choice%"=="3" exit

:start_all
echo.
echo Starting Neural Network Server in separate window...
start "Neural Network Server" cmd /k "node nn_server.js"

echo Starting Web Server in separate window...
start "Web Server" cmd /k "node web_server.js"

echo Opening Browser to http://localhost:3000...
timeout /t 2 >nul
start http://localhost:3000
exit

:cli
cls
node run.js
pause
exit
