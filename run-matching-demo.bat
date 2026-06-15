@echo off
title Broker Platform - Interactive Matching Demo
color 0B
echo.
echo  =============================================================
echo   INTERACTIVE ORDER MATCHING & AI ROUTING DEMO
echo  =============================================================
echo.
echo   This script runs the step-by-step match scenario tests 
echo   for Stocks, Forex, and Crypto on the active platform.
echo.
echo   Requirements:
echo   - Node.js installed on your machine.
echo   - Backend server active on http://localhost:8080
echo   - Database active on port 5433
echo.
echo  =============================================================
echo.

node "%~dp0demo_matching_cases.js"

echo.
echo Demo finished.
pause
