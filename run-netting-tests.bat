@echo off
title Netting Tests
color 0B
cd /d "%~dp0"

echo.
echo  ======================================================
echo   NETTING TESTS  ^|  model + engine + end-to-end
echo  ======================================================
echo.

:: ─── Node 18+ is required (built-in fetch) ───────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"
)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=18?0:1)" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js 18 or newer is required. Install it from https://nodejs.org
    goto :fail
)

echo [1/3] Model + feature vectors + JS engine parity...
node buysellmodel\tests\model_check.js
if %ERRORLEVEL% NEQ 0 goto :fail
echo.

echo [2/3] Java netting engine unit tests (Maven)...
pushd backend
call mvnw.cmd -q "-Dtest=Netting*,Nbbo*,FeatureBuilder*,CancelFillRaceGuardTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
set "MVN_RESULT=%ERRORLEVEL%"
popd
if not "%MVN_RESULT%"=="0" goto :fail
echo       Java tests passed.
echo.

echo [3/3] End-to-end against the running backend...
netstat -aon | findstr ":8080" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       Backend is not running on port 8080 - end-to-end SKIPPED.
    echo       Run start-project.bat first, then run this file again for the full check.
    goto :ok
)
node scripts\netting_e2e.js
if %ERRORLEVEL% NEQ 0 goto :fail

:ok
echo.
echo  ======================================================
echo   ALL NETTING TESTS PASSED
echo   Reports: %~dp0reports
echo  ======================================================
pause
exit /b 0

:fail
echo.
echo  ======================================================
echo   NETTING TESTS FAILED - see the messages above
echo  ======================================================
pause
exit /b 1
