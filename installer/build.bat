@echo off
title Lastbrowser - Launcher Build v2.0
cd /d "%~dp0"

set "ROOT=%~dp0.."
set "SCRIPT=launcher.py"

echo ============================================
echo   Lastbrowser Minimal Launcher v2.0
echo   140 Probleme gelost - Null Abhangigkeiten
echo ============================================
echo.

:: Python finden
set "PY_CMD=python"
if exist "%ROOT%\venv\Scripts\python.exe" set "PY_CMD=%ROOT%\venv\Scripts\python.exe"

echo [1/3] Pruefe Python ...
"%PY_CMD%" -c "import PyInstaller; print('PyInstaller', PyInstaller.__version__)" 2>nul
if %ERRORLEVEL% neq 0 (
    echo [WARN] PyInstaller nicht gefunden. Installiere ...
    "%PY_CMD%" -m pip install pyinstaller
)

:: Clean
echo [2/3] Saubere alte Builds ...
if exist "dist\Lastbrowser.exe" del "dist\Lastbrowser.exe" >nul 2>&1
if exist "build_dir" rmdir /s /q "build_dir" >nul 2>&1

:: Build
echo [3/3] Kompiliere ...
"%PY_CMD%" -m PyInstaller ^
    --onefile ^
    --console ^
    --clean ^
    --name "Lastbrowser" ^
    --distpath "dist" ^
    --workpath "build_dir" ^
    --specpath "build_dir" ^
    --hidden-import "http.client" ^
    --hidden-import "http.server" ^
    --hidden-import "urllib.request" ^
    --hidden-import "zipfile" ^
    "%SCRIPT%"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [FEHLER] Build fehlgeschlagen!
    pause
    exit /b 1
)

:: Cleanup
if exist "build_dir" rmdir /s /q "build_dir" >nul 2>&1

:: Ergebnis
echo.
echo ============================================
echo   Build erfolgreich!
echo.
call :size dist\Lastbrowser.exe
echo   EXE: %~dp0dist\Lastbrowser.exe
echo ============================================
echo.
echo   Test (--help-problems) ...
"dist\Lastbrowser.exe" --help-problems | find "140 Probleme"
if %ERRORLEVEL% equ 0 (
    echo   âœ… Test bestanden!
) else (
    echo   âš  Test nicht bestanden (trotzdem gebaut)
)
echo.
pause
goto :eof

:size
setlocal enabledelayedexpansion
for %%I in ("%~1") do set "SIZE=%%~zI"
set /a MB=SIZE/1048576
echo   Groesse: !MB! MB (!SIZE! Bytes)
endlocal
goto :eof
