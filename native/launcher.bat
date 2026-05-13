@echo off
title LastBrowser
cd /d F:\lastbrowser\native

:: Kill alte Electron-Prozesse
taskkill /F /IM electron.exe >nul 2>&1

:: Environment
set ELECTRON_DEV=1

:: Start Electron direkt
start "" /B node_modules\.bin\electron.cmd .
exit /b 0
