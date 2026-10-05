@echo off
title Deploy Broker Platform to Vercel
color 0B

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-smart.ps1" %*
