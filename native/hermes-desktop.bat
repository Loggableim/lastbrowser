@echo off
title Hermes Desktop
cd /d "%~dp0"

set ELECTRON_DEV=1

set "PATH=C:\Program Files\nodejs;%PATH%"
set "Path=C:\Program Files\nodejs;%Path%"

set "HERMES_LOG_FILE=%~dp0hermes-desktop.log"
echo [%date% %time%] Starting Hermes Desktop... > "%HERMES_LOG_FILE%"

if /I "%1"=="--restart" (
    echo [%date% %time%] Restart mode >> "%HERMES_LOG_FILE%"
    taskkill /F /FI "WINDOWTITLE eq Hermes*" /IM electron.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
)

set "ELECTRON_CMD=%~dp0node_modules\.bin\electron.cmd"
if not exist "%ELECTRON_CMD%" (
    echo [%date% %time%] ERROR: electron.cmd not found >> "%HERMES_LOG_FILE%"
    msg "%username%" "Hermes Desktop: Electron not found."
    exit /b 1
)

netstat -ano | find ":8787 " >nul 2>&1
if %errorlevel% equ 0 (
    echo [%date% %time%] Port 8787 in use >> "%HERMES_LOG_FILE%"
)

echo [%date% %time%] Starting: %ELECTRON_CMD% >> "%HERMES_LOG_FILE%"
start "" /B "%ELECTRON_CMD%" "%~dp0."

echo [%date% %time%] Launched >> "%HERMES_LOG_FILE%"
exit /b 0
