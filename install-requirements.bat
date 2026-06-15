@echo off
title Install Project Requirements
color 0E

echo ============================================
echo  INSTALLING PROJECT REQUIREMENTS VIA WINGET
echo ============================================
echo.
echo  This script will install:
echo  1. Node.js (LTS) - For Frontend & AI Server
echo  2. Eclipse Temurin JDK 17 - For Java Backend
echo.
echo  * NOTE: You might see a Windows User Account Control (UAC) prompt.
echo    Please click "Yes" to allow the installation.
echo.
pause

echo.
echo [1/2] Installing Node.js LTS...
winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js installation failed or was cancelled.
) else (
    echo [SUCCESS] Node.js installed.
)

echo.
echo [2/2] Installing Java JDK 17 (Eclipse Temurin)...
winget install --id EclipseAdoptium.Temurin.17.JDK --exact --accept-package-agreements --accept-source-agreements
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Java JDK 17 installation failed or was cancelled.
) else (
    echo [SUCCESS] Java JDK 17 installed.
)

echo.
echo ============================================
echo  INSTALLATION COMPLETE!
echo  
echo  CRITICAL: You MUST CLOSE all current command prompt (CMD) 
echo  windows and open a new one for the changes to take effect.
echo  
echo  Once done, you can run 'start-project.bat' again.
echo ============================================
echo.
pause
