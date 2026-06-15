@echo off
title Broker Platform - Dual Client Testing
color 0E

echo.
echo  ======================================================
echo   BROKER PLATFORM - DUAL CLIENT & ADMIN TESTING UTILITY
echo  ======================================================
echo.
echo   This script opens 3 concurrent views to test order matching
echo   and the AI Advisor (Neural Network) in real-time.
echo.
echo   * User 1: Opened in your Default Browser (Normal session)
echo   * User 2: Opened in Incognito/InPrivate mode (Separate session)
echo   * Admin : Opened directly in your Default Browser
echo.
echo   ------------------------------------------------------
echo   PRE-SEEDED DEMO CREDENTIALS:
echo   - User 1 (Trader A): demo@broker.local / password: demo1234
echo   - User 2 (Trader B): 7@gmail.com      / register/login as a demo user
echo   - Admin Panel      : admin@gmail.com   / password: admin1234
echo   ------------------------------------------------------
echo.

:: Check if services are running
netstat -aon | findstr ":8080" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Java Backend (port 8080) does not appear to be running.
    echo           Please make sure you ran 'start-project.bat' first!
    echo.
    choice /M "Do you want to proceed anyway"
    if errorlevel 2 exit /b 1
)

echo [1/3] Opening Admin Dashboard...
start "" "%~dp0AdminDashboard_Local.html"
timeout /t 2 >nul

echo [2/3] Opening User 1 (Trader A) - Normal Mode...
start http://localhost:3001/
timeout /t 2 >nul

echo [3/3] Opening User 2 (Trader B) - Private/Incognito Mode...
where chrome >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    start chrome --incognito http://localhost:3001/
) else (
    start msedge --inprivate http://localhost:3001/
)

echo.
echo  ======================================================
echo   TESTING STEPS:
echo   1. Log User 1 (Trader A) into http://localhost:3001
echo   2. Log User 2 (Trader B) in the Incognito window
echo   3. On the Admin Dashboard, click "Connect Admin Panel to Server"
echo   4. In User 1, place a BUY limit/market order on EURUSD.
echo   5. Notice the "AI Smart Routing Advisor" panel displays the live match probability!
echo   6. In User 2, place a matching SELL order.
echo   7. Check the Admin Dashboard under "Trades" to view:
echo      - The INTERNAL match execution tag.
echo      - The "Total Fees Saved" and "Internal Cross Rate" updates.
echo  ======================================================
echo.
pause
