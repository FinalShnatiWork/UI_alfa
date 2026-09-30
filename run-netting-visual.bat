@echo off
title Netting console
color 0E
cd /d "%~dp0"

echo.
echo  Netting console is inside the React admin hub.
echo  Open: http://localhost:3001/admin/netting
echo  Live scenarios V01-V16: run-netting-tests.bat
echo.
start "" "http://localhost:3001/admin/netting"
exit /b 0
