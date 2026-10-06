@echo off
title Deploy Broker Platform to GitHub Pages
color 0B

echo.
echo  ==============================================================
echo   BROKER PLATFORM  ^|  DEPLOY TO GITHUB PAGES
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
call npm.cmd run build
if %ERRORLEVEL% NEQ 0 (
    call npm run build
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] React build failed.
        pause
        exit /b 1
    )
)

:: Create 404 fallback for React Router and .nojekyll
powershell -Command "Copy-Item 'dist\index.html' 'dist\404.html' -Force; New-Item -ItemType File -Path 'dist\.nojekyll' -Force | Out-Null"
echo       Build successful!
echo.

:: Step 3: Publish to gh-pages branch on GitHub
echo [2/2] Publishing to GitHub Pages (branch gh-pages)...
call npx.cmd --yes gh-pages -d dist -m "Deploy to GitHub Pages"
if %ERRORLEVEL% NEQ 0 (
    call npx --yes gh-pages -d dist -m "Deploy to GitHub Pages"
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] Publishing to GitHub Pages failed.
        pause
        exit /b 1
    )
)

echo.
echo  ==============================================================
echo   DEPLOYMENT FINISHED!
echo   Your site is live on GitHub Pages:
echo   https://finalshnatiwork.github.io/UI_alfa/
echo  ==============================================================
echo.
pause
