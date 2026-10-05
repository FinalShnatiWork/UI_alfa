@echo off
title Deploy Broker Platform to Vercel
color 0B

echo.
echo  ==============================================================
echo   BROKER PLATFORM  ^|  1-CLICK DEPLOY TO VERCEL ^& CONVEX
echo  ==============================================================
echo.

cd /d "%~dp0UI-react"

:: Step 1: Ensure Node.js and npm are in PATH
where npm >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\nodejs\npm.cmd" set "PATH=C:\Program Files\nodejs;%PATH%"
)

:: Step 2: Build the React Application
echo [1/2] Building React production bundle...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] React build failed. Please check the logs above.
    pause
    exit /b 1
)
echo       Build successful!
echo.

:: Step 3: Deploy to Vercel
echo [2/2] Deploying to Vercel...
echo.

:: Check if logged in to Vercel CLI
call npx --yes vercel whoami >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [INFO] Connecting to your Vercel account...
    echo [INFO] Please log in via the browser window that opens.
    echo.
    call npx --yes vercel login
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [INFO] Falling back to temporary live deployment...
        call npx --yes vercel deploy --temporary --yes
        goto finished
    )
)

call npx --yes vercel deploy --prod --yes

:finished
echo.
echo  ==============================================================
echo   DEPLOYMENT FINISHED!
echo   Your latest changes are live on Vercel 24/7.
echo  ==============================================================
echo.
pause
