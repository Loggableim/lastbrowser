@echo off
title Hermes WebUI (auto-restart)
for %%I in ("%~dp0..") do set "ROOT=%%~fI"
cd /d "%ROOT%"

set HERMES_WEBUI_AGENT_DIR=%ROOT%\cids-hermes-agent
if not defined HERMES_WEBUI_STATE_DIR set "HERMES_WEBUI_STATE_DIR=%ROOT%\home\webui"
set HERMES_WEBUI_PORT=8787
if not defined HERMES_HOME set "HERMES_HOME=%ROOT%\home"
if not defined HERMES_WEBUI_PYTHON set "HERMES_WEBUI_PYTHON=%ROOT%\venv\Scripts\python.exe"
set LOGFILE=%HERMES_HOME%\webui.log
set MAX_RESTARTS=10
set RESTART_DELAY=3
set "CERT_BUNDLE=%ROOT%\venv\Lib\site-packages\certifi\cacert.pem"
if not exist "%CERT_BUNDLE%" set "CERT_BUNDLE=%ROOT%\python\Lib\site-packages\certifi\cacert.pem"
if exist "%CERT_BUNDLE%" (
    set "SSL_CERT_FILE=%CERT_BUNDLE%"
    set "REQUESTS_CA_BUNDLE=%CERT_BUNDLE%"
)

:: ── .env laden (falls vorhanden) ──
if exist "%ROOT%\.env" (
    echo [setup] Lade .env...
    for /f "tokens=1,* delims==" %%a in ('type "%ROOT%\.env" ^| findstr /v "^#"') do (
        if not "%%a"=="" set "%%a=%%b" >nul 2>&1
    )
)

:: ── Python finden ──
set PYTHON=%HERMES_WEBUI_PYTHON%

echo ============================================
echo   Hermes WebUI - Drei-Panel Codex-Ersatz
echo   Auto-Restart bei Absturz (max %MAX_RESTARTS%x)
echo ============================================
echo.
echo Python: %PYTHON%

:: ── Cleanup: alte Prozesse auf Port killen ──
echo [setup] Raeume Port %HERMES_WEBUI_PORT% auf...
:: Setze crash.log zurück für sauberen Neustart
if exist "%LOGFILE%" copy "%LOGFILE%" "%LOGFILE%.bak" >nul 2>&1
if exist "%LOGFILE%" del /f /q "%LOGFILE%" >nul 2>&1
echo [setup] Browser-Fix aktiv: Browser-Button in Rail + Proxy-Backend
:: WICHTIG: Keine runden Klammern im for-loop-Body!
:: Batch kann sie nicht von den do(...)-Klammern unterscheiden.
:: Deutscher Windows-Client: findstr LISTEN findet nichts (sondern "WARTEND").
:: Daher: suche ALLE Verbindungen auf dem Port und killen was PID != 0 hat.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%HERMES_WEBUI_PORT%') do (
    if not "%%p"=="0" (
        echo [setup]  Alten Server PID %%p beenden...
        taskkill /F /PID %%p >nul 2>&1
    )
)
timeout /t 2 /nobreak >nul

:: ── Cleanup: stale Python Cache-Dateien ──
echo [setup] Entferne __pycache__ Verzeichnisse...
for /d /r "%ROOT%\cids-hermes-webui\api" %%d in (__pycache__) do (
    if exist "%%d" rmdir /s /q "%%d" 2>nul
)
if exist "%ROOT%\cids-hermes-webui\__pycache__" (
    rmdir /s /q "%ROOT%\cids-hermes-webui\__pycache__" 2>nul
)

:: ── Restart-Loop ──
set restart_count=0
:restart
set /a restart_count+=1
if %restart_count% gtr %MAX_RESTARTS% (
    echo.
    echo [KRITISCH] WebUI ist %MAX_RESTARTS% Mal gecrasht.
    echo Starte nicht automatisch neu. Bitte Fehler in %LOGFILE% pruefen.
    echo Druecke eine Taste zum Beenden.
    pause >nul
    exit /b 1
)

if %restart_count% gtr 1 (
    echo.
    echo ============================================
    echo [NEUSTART %restart_count%/%MAX_RESTARTS%] %date% %time%
    echo ============================================
    echo [restart] Warte %RESTART_DELAY% Sekunden...
    timeout /t %RESTART_DELAY% /nobreak >nul
)

:: Browser/App nur beim ersten Start oeffnen.
:: Der Portable-Hauptlauncher setzt HERMES_WEBUI_NO_BROWSER=1 und startet
:: danach selbst das borderless Edge/Chrome --app Fenster, sobald /health ok ist.
if %restart_count% equ 1 (
    echo.
    echo Starte Server auf http://127.0.0.1:%HERMES_WEBUI_PORT% ...
    if "%HERMES_WEBUI_NO_BROWSER%"=="1" (
        echo App-Fenster wird vom Portable-Launcher gestartet.
    ) else (
        echo Browser oeffnet sich automatisch.
    )
    echo.
    echo Druecke Ctrl+C zum Beenden.
    echo.
    if not "%HERMES_WEBUI_NO_BROWSER%"=="1" start "" http://127.0.0.1:%HERMES_WEBUI_PORT%
) else (
    echo Starte Server neu auf http://127.0.0.1:%HERMES_WEBUI_PORT% ...
    echo.
)

:: ── Server starten ──
"%PYTHON%" "%ROOT%\cids-hermes-webui\server.py"

:: ── Wenn wir hier ankommen, ist der Server gecrasht/beendet ──
set exit_code=%errorlevel%
echo [crash] %date% %time% - Server beendet ^(Exit-Code: %exit_code%^) >> "%LOGFILE%"

if %exit_code% neq 0 (
    echo [!!] Server mit Fehler-Code %exit_code% beendet ^(siehe %LOGFILE%^)
) else (
    :: Bei Exit 0 ^(Ctrl+C^) nicht automatisch neustarten
    echo.
    echo Server wurde manuell beendet ^(Ctrl+C^).
    echo Druecke eine Taste zum Beenden oder starte das Script neu.
    pause >nul
    exit /b 0
)

goto restart
